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
    // 시나리오 완료(응답) 후 2초 뒤에 '시나리오 완료'로 넘어감
    setTimeout(function () { try { if (window.NeubieFlow) NeubieFlow.complete(r); } catch (e) {} }, 2000);
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
  // S1: 3초 카운트다운 후 → 검정 전체화면으로 전환 + 에러 케이스 선택 (정답 여부 미안내)
  function showS1Select() {
    var opts = ['와이파이', 'GPS', '배터리', '적재함 열림', '문제 없음', '보지 못함'];
    var ovl = document.createElement('div'); ovl.id = 's1-select';
    ovl.style.cssText = 'position:fixed;inset:0;z-index:90001;background:#0E0F11;display:flex;align-items:center;justify-content:center;'
      + 'font-family:Pretendard,system-ui,sans-serif;';
    var html = '<div style="width:420px;max-width:90vw;">'
      + '<div style="font-size:22px;font-weight:800;color:#fff;text-align:center;margin-bottom:6px;">어떤 항목에 문제가 있었나요?</div>'
      + '<div style="font-size:14px;color:#9DA3AA;text-align:center;margin-bottom:22px;">해당 항목을 모두 선택해주세요</div>';
    opts.forEach(function (o) {
      html += '<label style="display:flex;align-items:center;gap:12px;padding:14px 16px;margin-bottom:10px;border:1px solid #2A2D31;'
        + 'border-radius:12px;font-size:16px;color:#E9E9E9;cursor:pointer;background:#17191C;">'
        + '<input type="checkbox" value="' + o + '" style="width:20px;height:20px;accent-color:#00BA7C;">' + o + '</label>';
    });
    html += '<button id="s1-submit" style="width:100%;height:52px;margin-top:14px;border:none;border-radius:12px;background:#00BA7C;color:#fff;'
      + 'font:800 16px Pretendard,system-ui,sans-serif;cursor:pointer;">제출</button></div>';
    ovl.innerHTML = html; document.body.appendChild(ovl);
    document.getElementById('s1-submit').addEventListener('click', function () {
      var sel = []; ovl.querySelectorAll('input:checked').forEach(function (c) { sel.push(c.value); });
      var ab = s1Abnormal();
      var correct = ab.length > 0 && ab.length === sel.length && ab.every(function (x) { return sel.indexOf(x) >= 0; });
      ovl.remove();
      done({ correct: correct, selected: sel.join('|') });   // 정답 여부는 화면에 안내하지 않음
    }, { once: true });
  }

  function init() {
    if (sc === 1) {
      // 시작(인트로 닫힘) → T1 + 4초 카운트다운 → 에러 케이스 선택
      function startS1() { markStim(); runCountdown(4, showS1Select); }
      var ovl = document.getElementById('neubie-flow-ovl');
      if (ovl && window.MutationObserver) {
        var mo = new MutationObserver(function () { if (!document.getElementById('neubie-flow-ovl')) { mo.disconnect(); startS1(); } });
        mo.observe(document.body, { childList: true, subtree: true });
      } else { startS1(); }

    } else if (sc === 2) {
      // [횡단하기] 영역은 '시나리오 시작 후 2초 뒤'에 노출 (A/B 동일)
      function hideX() {
        try { if (window.setCrosswalk) window.setCrosswalk(false); } catch (e) {}
        try { if (window.setCrosswalkOverlay) window.setCrosswalkOverlay(false); } catch (e) {}
      }
      function showX() {
        try { if (window.setCrosswalk) window.setCrosswalk(true); } catch (e) {}
        try { if (window.setCrosswalkOverlay) window.setCrosswalkOverlay(true); } catch (e) {}
      }
      function startS2() {
        hideX(); requestAnimationFrame(hideX); setTimeout(hideX, 100); // setup이 켜둔 횡단보도 숨김(보정 포함)
        setTimeout(function () {
          showX();
          // T1: 신호 영상 녹색(≈4s) — 노출 후 바인딩
          var sig = document.getElementById('xwalk-video');
          if (sig) { var h = function () { if (sig.currentTime >= 4) { markStim(); sig.removeEventListener('timeupdate', h); } }; sig.addEventListener('timeupdate', h); }
        }, 2000);
      }
      hideX();
      var ovl2 = document.getElementById('neubie-flow-ovl');
      if (ovl2 && window.MutationObserver) {
        var mo2 = new MutationObserver(function () { if (!document.getElementById('neubie-flow-ovl')) { mo2.disconnect(); startS2(); } });
        mo2.observe(document.body, { childList: true, subtree: true });
      } else { startS2(); }
      once(q('#xwalk-btn', '#xwalkBtn'), function () { done({}); });

    } else if (sc === 3) {
      // T1: 영상 트리거(setup bindVideo). T3: 사이드브레이크 ON
      var sb = q('#btn-sb') || document.querySelector('.seg[data-ctl="sidebrake"] button:last-child');
      // 미조작 대비: 영상 재생 후 60초 지나면 타임아웃 기록 + 다음 시나리오 자동 진행
      var s3to = null;
      function s3start() {
        if (s3to) return;
        s3to = setTimeout(function () {
          s3to = null;
          try { if (window.NeubieAB) NeubieAB.markResponse({ success: false, timeout: true }); } catch (e) {}
          try { if (window.NeubieFlow) NeubieFlow.next(); } catch (e) {} // 완료 오버레이 없이 다음 시나리오로
        }, 60000);
      }
      once(sb, function () { if (s3to) { clearTimeout(s3to); s3to = null; } done({}); });
      var cam3 = document.getElementById('cam-video');
      if (cam3) { cam3.addEventListener('play', s3start, { once: true }); if (!cam3.paused) s3start(); }
      else s3start();

    } else if (sc === 6) {
      // T1: 도착 알림 영상(2s, setup bindVideo).
      // T3: [도착 처리] → 모달 [확인]까지 눌러야 성공. 페이지(A: dlgConfirm / B: showScModal 래퍼)가
      //     'Lv5 도착하였습니다' 알림을 띄운 뒤 이 훅을 호출 → 응답 기록 + (2초 뒤) 완료.
      window.__neubieArrivalConfirmed = function () { done({ success: true }); };
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 80); });
  else setTimeout(init, 80);
})();
