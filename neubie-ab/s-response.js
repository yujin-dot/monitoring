/*
 * s-response.js — 시나리오 응답(T3) 계측 연결 (A·B 공통). S5는 s5-guide.js가 담당.
 *
 * 각 시나리오 액션 버튼 클릭 → NeubieAB.markResponse(...) + NeubieFlow.complete(...)
 *  S1 수치측정 : 비정상 카드 = T1(흐름 인트로 닫힐 때 markStimulus) / [주행 불가능] 클릭 = T3 (버튼 없으면 주입)
 *  S2 신호대기 : 신호 영상 녹색(≈4s)=T1 / [횡단하기] 클릭 = T3
 *  S3 돌발상황 : 영상 트리거=T1(setup의 bindVideo) / [사이드브레이크 ON] 클릭 = T3
 *  S6 도착처리 : 도착 알림 영상(2s)=T1(bindVideo) / [도착 처리] 클릭 = T3
 *
 * 버튼 id 레이아웃 차이: 횡단 B#xwalk-btn/A#xwalkBtn · 도착 B#btn-arrival/A#btnArrive
 *                      사이드브레이크 B#btn-sb / A .seg[data-ctl=sidebrake] ON버튼
 * (A는 시나리오 셋업이 로드 시 실행돼 T1이 다소 이르게 찍힐 수 있음 — 캡처(T3)는 정상.)
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var sc = parseInt(new URLSearchParams(location.search).get('scenario'), 10);
  if (!sc || sc === 5) return;

  function done(r) {
    r = r || {};
    try { if (window.NeubieAB) NeubieAB.markResponse(r); } catch (e) {}
    try { if (window.NeubieFlow) NeubieFlow.complete(r); } catch (e) {}
  }
  function q() { for (var i = 0; i < arguments.length; i++) { var e = document.querySelector(arguments[i]); if (e) return e; } return null; }
  function once(el, cb) { if (!el) return false; var f = false; el.addEventListener('click', function () { if (f) return; f = true; cb(); }); return true; }
  function markStim() { try { if (window.NeubieAB) NeubieAB.markStimulus(); } catch (e) {} }

  // S1: 현재 서브테스트의 비정상 항목 집합 (config 상태 vs 기본값 비교)
  function s1Abnormal() {
    var out = [];
    try {
      var C = window.NeubieConfig, d = C.robotStateDefault;
      var asg = window.NeubieAB && NeubieAB.getAssignment && NeubieAB.getAssignment();
      var variant = (window.NeubieAB && NeubieAB.getContext) ? NeubieAB.getContext().ui_variant : null;
      var subNo = (asg && variant && asg.s1Sub) ? asg.s1Sub[variant] : 1;
      var st = (C.scenarios[1].subTests[subNo] && C.scenarios[1].subTests[subNo].state) || {};
      if (st.wifi_ms != null && st.wifi_ms !== d.wifi_ms) out.push('와이파이');
      if (st.gps != null && st.gps !== d.gps) out.push('GPS');
      if (st.battery_pct != null && st.battery_pct !== d.battery_pct) out.push('배터리');
      if (st.cargo === '열림') out.push('적재함 열림');
    } catch (e) {}
    return out;
  }
  // S1: 10초 카운트다운 후 콜백
  function runCountdown(sec, cb) {
    var t = document.createElement('div'); t.id = 's1-countdown';
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:90000;background:#00684A;color:#fff;'
      + 'font:700 15px Pretendard,system-ui,sans-serif;padding:12px 18px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.3);';
    var n = sec; t.textContent = '로봇 정보를 확인하세요 · ' + n + '초';
    document.body.appendChild(t);
    var iv = setInterval(function () { n--; if (n > 0) { t.textContent = '로봇 정보를 확인하세요 · ' + n + '초'; } else { clearInterval(iv); t.remove(); cb(); } }, 1000);
  }
  // S1: 에러 케이스 선택 UI (정답 여부 미안내)
  function showS1Select() {
    var opts = ['와이파이', 'GPS', '배터리', '적재함 열림'];
    var panel = document.createElement('div'); panel.id = 's1-select';
    panel.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:90001;background:#fff;border-radius:14px;'
      + 'box-shadow:0 6px 24px rgba(0,0,0,.25);padding:18px 22px;width:380px;max-width:92vw;font-family:Pretendard,system-ui,sans-serif;';
    var html = '<div style="font-size:15px;font-weight:700;color:#1A1A1A;margin-bottom:12px;">어떤 항목에 문제가 있었나요? (해당 항목 모두 선택)</div>';
    opts.forEach(function (o) { html += '<label style="display:flex;align-items:center;gap:8px;padding:8px 0;font-size:14px;color:#434343;cursor:pointer;"><input type="checkbox" value="' + o + '" style="width:18px;height:18px;accent-color:#00BA7C;">' + o + '</label>'; });
    html += '<button id="s1-submit" style="width:100%;height:48px;margin-top:12px;border:none;border-radius:10px;background:#00BA7C;color:#fff;font:700 15px Pretendard,system-ui,sans-serif;cursor:pointer;">제출</button>';
    panel.innerHTML = html; document.body.appendChild(panel);
    document.getElementById('s1-submit').addEventListener('click', function () {
      var sel = []; panel.querySelectorAll('input:checked').forEach(function (c) { sel.push(c.value); });
      var ab = s1Abnormal();
      var correct = ab.length > 0 && ab.length === sel.length && ab.every(function (x) { return sel.indexOf(x) >= 0; });
      panel.remove();
      done({ correct: correct, selected: sel.join('|') });   // 정답 여부는 화면에 안내하지 않음
    }, { once: true });
  }

  function init() {
    if (sc === 1) {
      // 시작(인트로 닫힘) → T1 + 10초 카운트다운 → 에러 케이스 선택
      function startS1() { markStim(); runCountdown(10, showS1Select); }
      var ovl = document.getElementById('neubie-flow-ovl');
      if (ovl && window.MutationObserver) {
        var mo = new MutationObserver(function () { if (!document.getElementById('neubie-flow-ovl')) { mo.disconnect(); startS1(); } });
        mo.observe(document.body, { childList: true, subtree: true });
      } else { startS1(); }

    } else if (sc === 2) {
      // T1: 신호 영상 녹색(≈4s)
      var sig = document.getElementById('xwalk-video');
      if (sig) { var h = function () { if (sig.currentTime >= 4) { markStim(); sig.removeEventListener('timeupdate', h); } }; sig.addEventListener('timeupdate', h); }
      once(q('#xwalk-btn', '#xwalkBtn'), function () { done({}); });

    } else if (sc === 3) {
      // T1: 영상 트리거(setup bindVideo). T3: 사이드브레이크 ON
      var sb = q('#btn-sb') || document.querySelector('.seg[data-ctl="sidebrake"] button:last-child');
      once(sb, function () { done({}); });

    } else if (sc === 6) {
      // T1: 도착 알림 영상(2s, setup bindVideo). T3: 도착 처리
      once(q('#btn-arrival', '#btnArrive'), function () { done({}); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 80); });
  else setTimeout(init, 80);
})();
