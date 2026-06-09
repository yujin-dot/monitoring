/*
 * s5-guide.js — 시나리오 5(정밀제어) 가이드 인터랙션 (A·B 공통)
 *
 * ?scenario=5 일 때만 동작:
 *  1) 시작 시 영상/미니맵/속도 정지(호출 전까지)
 *  2) 미니맵 좌측 하단에 EV(엘리베이터) 버튼 + 초록(Primary-800) 툴팁 "EV 버튼을 눌러주세요"
 *  3) EV 클릭 → 툴팁 제거 + 엘리베이터 호출 드로워 오픈
 *  4) "호출 버튼을 눌러주세요" 툴팁
 *  5) 호출 클릭 → 영상 재생 + 미니맵/속도 재개 + 3초 뒤 "음량 볼륨을 0.2로 낮춰주세요" 가이드
 *  6) 볼륨 가이드 = S5 자극(markStimulus) + 슬라이더(0.2) trackSlider → 안착 시 markResponse + NeubieFlow.complete
 *
 * 의존: NeubieAB(계측), (선택)NeubieFlow, #cam-video, 맵 컨테이너(#map-section | .map | .panel-map).
 * 주: 기능 위주 구현 — 드로워/툴팁은 디자인시스템 톤으로, Figma 픽셀 일치는 후속 조정.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  if (new URLSearchParams(location.search).get('scenario') !== '5') return;

  var GREEN = '#00BA7C', GREEN800 = '#00684A', RADIUS = '10px';
  var Z = 90000;
  var cam = null, allowPlay = false, started = false, freezeTimer = null;

  function $(sel) { return document.querySelector(sel); }
  function mapContainer() { return document.getElementById('map-section') || $('.map') || $('.panel-map') || document.body; }
  function freezeMap(on) { try { if (typeof state !== 'undefined') { state.paused = !!on; if (on) { state.autoAdvance = false; state.speed = 0; state.speedTarget = 0; } } } catch (e) {} }

  // ── 영상 정지 가드 (호출 전까지 재생 차단) ───────────────────
  function guard() { if (!allowPlay && cam && !cam.paused) { try { cam.pause(); } catch (e) {} } }

  // ── 작은 UI 헬퍼 ─────────────────────────────────────────────
  function tooltip(text, anchorRect, id) {
    var t = document.createElement('div'); t.id = id || 'ev-tip';
    t.textContent = text;
    t.style.cssText = 'position:fixed;z-index:' + (Z + 5) + ';background:' + GREEN800 + ';color:#fff;'
      + 'font:600 13px Pretendard,system-ui,sans-serif;padding:10px 14px;border-radius:8px;max-width:240px;'
      + 'box-shadow:0 4px 16px rgba(0,0,0,.3);';
    document.body.appendChild(t);
    var tr = t.getBoundingClientRect();
    // 앵커 위쪽 중앙에 배치(공간 없으면 아래)
    var top = anchorRect.top - tr.height - 10;
    if (top < 8) top = anchorRect.bottom + 10;
    var left = Math.max(8, Math.min(window.innerWidth - tr.width - 8, anchorRect.left + anchorRect.width / 2 - tr.width / 2));
    t.style.top = top + 'px'; t.style.left = left + 'px';
    return t;
  }
  function removeEl(id) { var e = document.getElementById(id); if (e) e.remove(); }

  // ── 2. EV 버튼 + 툴팁 ────────────────────────────────────────
  function showEV() {
    var map = mapContainer();
    if (getComputedStyle(map).position === 'static') map.style.position = 'relative';
    var ev = document.createElement('button');
    ev.id = 'ev-btn';
    ev.innerHTML = '<span style="font-weight:800;letter-spacing:.02em;">EV</span>';
    ev.title = '엘리베이터';
    ev.style.cssText = 'position:absolute;left:12px;bottom:12px;z-index:' + Z + ';width:48px;height:48px;border-radius:50%;'
      + 'border:none;background:' + GREEN + ';color:#fff;font:800 15px Pretendard,system-ui,sans-serif;cursor:pointer;'
      + 'box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;';
    map.appendChild(ev);
    var tip = tooltip('엘리베이터(EV) 버튼을 눌러주세요', ev.getBoundingClientRect(), 'ev-tip');
    ev.addEventListener('click', function () {
      removeEl('ev-tip'); ev.remove();
      openDrawer();
    }, { once: true });
  }

  // ── 4. 엘리베이터 호출 드로워 + 5. 호출 툴팁 ──────────────────
  function openDrawer() {
    var d = document.createElement('div');
    d.id = 'ev-drawer';
    d.style.cssText = 'position:fixed;top:0;right:0;bottom:0;z-index:' + (Z + 2) + ';width:320px;max-width:92vw;background:#fff;'
      + 'box-shadow:-4px 0 24px rgba(0,0,0,.25);display:flex;flex-direction:column;font-family:Pretendard,system-ui,sans-serif;'
      + 'transform:translateX(100%);transition:transform .22s ease;';
    d.innerHTML =
      '<div style="padding:18px 20px;border-bottom:1px solid #E9E9E9;display:flex;align-items:center;justify-content:space-between;">'
        + '<b style="font-size:17px;color:#1A1A1A;">엘리베이터 호출</b>'
        + '<button id="ev-drawer-x" style="border:none;background:none;font-size:20px;color:#7B7B7B;cursor:pointer;">×</button></div>'
      + '<div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px;flex:1;">'
        + '<div style="display:flex;justify-content:space-between;font-size:14px;color:#434343;"><span>현재 층</span><b>1F</b></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:14px;color:#434343;"><span>목적 층</span><b>3F</b></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:14px;color:#434343;"><span>호출 방식</span><b>자동 탑승</b></div>'
      + '</div>'
      + '<div style="padding:16px 20px;border-top:1px solid #E9E9E9;">'
        + '<button id="ev-call-btn" style="width:100%;height:52px;border:none;border-radius:' + RADIUS + ';background:' + GREEN + ';color:#fff;font:700 16px Pretendard,system-ui,sans-serif;cursor:pointer;">호출</button>'
      + '</div>';
    document.body.appendChild(d);
    requestAnimationFrame(function () { d.style.transform = 'translateX(0)'; });
    document.getElementById('ev-drawer-x').addEventListener('click', function () { d.remove(); showEV(); /* 다시 안내 */ });
    var call = document.getElementById('ev-call-btn');
    var tip = tooltip('호출 버튼을 눌러주세요', call.getBoundingClientRect(), 'call-tip');
    call.addEventListener('click', function () {
      removeEl('call-tip'); d.remove();
      onCall();
    }, { once: true });
  }

  // ── 6. 호출 → 영상 재생 + 재개 → 3초 후 볼륨 가이드 ──────────
  function onCall() {
    allowPlay = true;
    if (freezeTimer) { clearInterval(freezeTimer); freezeTimer = null; }
    freezeMap(false);
    if (cam) { try { cam.currentTime = 0; } catch (e) {} if (cam.play) cam.play().catch(function () {}); }
    setTimeout(showVolumeGuide, 3000);
  }

  // ── 7. 음량 0.2 가이드 + 계측 ────────────────────────────────
  function showVolumeGuide() {
    var panel = document.createElement('div');
    panel.id = 'ev-vol';
    panel.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:' + (Z + 6) + ';'
      + 'background:#fff;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.25);padding:18px 22px;width:360px;max-width:92vw;'
      + 'font-family:Pretendard,system-ui,sans-serif;';
    panel.innerHTML =
      '<div style="font-size:15px;font-weight:700;color:#1A1A1A;">음량 볼륨을 <span style="color:' + GREEN + '">0.2</span>로 낮춰주세요</div>'
      + '<div style="display:flex;align-items:center;gap:10px;margin-top:14px;">'
        + '<span style="font-size:13px;color:#7B7B7B;">음량</span>'
        + '<input id="ev-vol-slider" type="range" min="0" max="1" step="0.01" value="0.8" style="flex:1;accent-color:' + GREEN + ';">'
        + '<b id="ev-vol-val" style="font-size:14px;color:#1A1A1A;width:34px;text-align:right;">0.80</b>'
      + '</div>';
    document.body.appendChild(panel);
    var slider = document.getElementById('ev-vol-slider');
    var valEl = document.getElementById('ev-vol-val');
    slider.addEventListener('input', function () { valEl.textContent = parseFloat(slider.value).toFixed(2); });

    // 계측: 가이드 표시 = T1, 슬라이더 추적, 안착(릴리즈) 시 응답
    try {
      if (window.NeubieAB) {
        NeubieAB.markStimulus();
        NeubieAB.trackSlider(slider, { target: 0.2, tolerance: 0.02 });
      }
    } catch (e) {}
    function release() {
      var ok = Math.abs(parseFloat(slider.value) - 0.2) <= 0.02;
      try { if (window.NeubieAB) NeubieAB.markResponse({ success: ok }); } catch (e) {}
      if (ok) {
        valEl.textContent = '0.20';
        setTimeout(function () { if (window.NeubieFlow) NeubieFlow.complete({ success: true }); }, 400);
        slider.removeEventListener('mouseup', release); slider.removeEventListener('touchend', release);
      }
    }
    slider.addEventListener('mouseup', release);
    slider.addEventListener('touchend', release);
  }

  // ── init ─────────────────────────────────────────────────────
  function init() {
    if (started) return; started = true;
    cam = document.getElementById('cam-video');
    if (cam) { cam.addEventListener('play', guard); try { cam.pause(); } catch (e) {} }
    freezeMap(true);
    // 호출 전까지 정지 계속 강제 (loadScenarioTest 등이 paused=false로 풀어도 재차 정지)
    freezeTimer = setInterval(function () { if (!allowPlay) { freezeMap(true); guard(); } }, 200);
    showEV();
  }
  // 흐름 인트로([시작하기]) 뒤에 보이도록 — DOM 준비되면 EV 노출(인트로 오버레이가 위를 덮고 있다가 사라지면 보임)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 60); });
  else setTimeout(init, 60);
})();
