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

  function init() {
    if (sc === 1) {
      // T1: 비정상 카드 인지 시점 = 흐름 인트로(시작하기)가 닫힌 직후
      var ovl = document.getElementById('neubie-flow-ovl');
      if (ovl && window.MutationObserver) {
        var mo = new MutationObserver(function () { if (!document.getElementById('neubie-flow-ovl')) { mo.disconnect(); markStim(); } });
        mo.observe(document.body, { childList: true, subtree: true });
      } else { markStim(); }
      // [주행 불가능] 버튼 (없으면 주입)
      var b = q('#drive-impossible-btn');
      if (!b) {
        b = document.createElement('button'); b.id = 'drive-impossible-btn'; b.textContent = '주행 불가능';
        b.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:90000;border:none;border-radius:10px;'
          + 'background:#FA5952;color:#fff;font:700 16px Pretendard,system-ui,sans-serif;padding:14px 32px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);';
        document.body.appendChild(b);
      }
      once(b, function () { b.disabled = true; b.style.opacity = '.55'; done({ correct: true }); });

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
