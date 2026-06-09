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
  // 상태 버튼 (active=초록 외곽선 / 그 외=비활성 회색). 첨부 Figma 디자인 기준.
  function sbtn(label, active, id) {
    var base = 'flex:1;height:46px;border-radius:8px;font:700 14px Pretendard,system-ui,sans-serif;';
    var look = active
      ? 'border:1.5px solid ' + GREEN + ';background:#fff;color:' + GREEN + ';cursor:pointer;'
      : 'border:1px solid #E9E9E9;background:#F5F5F5;color:#C4C4C4;cursor:default;';
    return '<button ' + (id ? 'id="' + id + '" ' : '') + (active ? '' : 'disabled ') + 'style="' + base + look + '">' + label + '</button>';
  }
  function srow(label, b1, b2) {
    return '<div style="display:flex;align-items:center;gap:10px;">'
      + '<span style="width:36px;font-size:14px;color:#434343;flex-shrink:0;">' + label + '</span>'
      + '<div style="flex:1;display:flex;gap:10px;">' + b1 + b2 + '</div></div>';
  }
  function drawerContent() {
    return '<div style="padding:20px 20px 14px;display:flex;align-items:center;justify-content:space-between;">'
        + '<b style="font-size:18px;color:#1A1A1A;">엘리베이터</b>'
        + '<button id="ev-drawer-x" style="border:none;background:none;font-size:22px;color:#262626;cursor:pointer;line-height:1;">×</button></div>'
      + '<div style="padding:0 20px;display:flex;flex-direction:column;gap:16px;">'
        + '<div style="font-size:15px;color:#434343;line-height:1.5;">서초 래미안 리더스원 112동 1-2</div>'
        + '<div style="display:flex;align-items:center;justify-content:center;gap:14px;border:1px solid #E9E9E9;border-radius:10px;padding:12px;background:#fff;font-size:14px;font-weight:700;color:#1A1A1A;">탑승층 1층 <span style="color:#9D9D9D;">▸</span> 목적층 5층</div>'
        + srow('전체', sbtn('호출', true, 'ev-call-btn'), sbtn('취소', false, 'ev-cancel-btn'))
        + srow('탑승', sbtn('탑승중', false), sbtn('탑승완료', false))
        + srow('하차', sbtn('하차중', false), sbtn('하차완료', false))
        + '<div style="height:1px;background:#E9E9E9;margin-top:4px;"></div>'
        + '<div id="ev-call-status"></div>'
      + '</div>';
  }
  function closeDrawer(d, isA) {
    if (!d) return;
    if (isA) { d.style.transform = 'translateX(100%)'; setTimeout(function () { if (d.parentNode) d.remove(); }, 240); }
    else { d.style.width = '0'; d.style.minWidth = '0'; setTimeout(function () { if (d.parentNode) d.remove(); }, 280); }
  }
  function openDrawer() {
    var isA = location.pathname.indexOf('remote-control-A') >= 0;
    var d = document.createElement('div'); d.id = 'ev-drawer';
    if (isA) {
      // A: 우측 패널을 덮는 오버레이 드로워 (배경 Mono50)
      d.style.cssText = 'position:fixed;top:0;right:0;bottom:0;z-index:' + (Z + 2) + ';width:330px;max-width:92vw;background:#F5F5F5;'
        + 'box-shadow:-4px 0 24px rgba(0,0,0,.18);display:flex;flex-direction:column;font-family:Pretendard,system-ui,sans-serif;'
        + 'transform:translateX(100%);transition:transform .22s ease;';
      d.innerHTML = drawerContent();
      document.body.appendChild(d);
      setTimeout(function () { d.style.transform = 'translateX(0)'; }, 20);
    } else {
      // B(B1/B2): 레이아웃을 밀면서 나오는 플렉스 드로워, width 240px 고정 (배경 Mono50)
      var sd = document.getElementById('settings-drawer');
      var parent = sd ? sd.parentNode : document.body;
      d.style.cssText = 'width:0;min-width:0;overflow:hidden;background:#F5F5F5;display:flex;flex-direction:column;flex-shrink:0;align-self:stretch;'
        + 'box-shadow:-2px 0 4px rgba(0,0,0,.12);transition:width .25s ease,min-width .25s ease;font-family:Pretendard,system-ui,sans-serif;';
      d.innerHTML = '<div style="width:240px;max-width:92vw;height:100%;display:flex;flex-direction:column;overflow-y:auto;">' + drawerContent() + '</div>';
      parent.appendChild(d);
      setTimeout(function () { d.style.width = '240px'; d.style.minWidth = '240px'; }, 20);
    }
    document.getElementById('ev-drawer-x').addEventListener('click', function () { closeDrawer(d, isA); showEV(); });
    var call = document.getElementById('ev-call-btn');
    if (call) call.addEventListener('click', function () {
      removeEl('call-tip');
      // 호출 비활성화 + 취소 활성화 + '엘리베이터 호출' 상태 노출 (Figma 46444-46722)
      call.disabled = true;
      call.style.cssText = 'flex:1;height:46px;border-radius:8px;font:700 14px Pretendard,system-ui,sans-serif;border:1px solid #E9E9E9;background:#F5F5F5;color:#C4C4C4;cursor:default;';
      var cancel = document.getElementById('ev-cancel-btn');
      if (cancel) { cancel.disabled = false; cancel.style.cssText = 'flex:1;height:46px;border-radius:8px;font:700 14px Pretendard,system-ui,sans-serif;border:1.5px solid #1A1A1A;background:#fff;color:#1A1A1A;cursor:pointer;'; }
      var st = document.getElementById('ev-call-status');
      if (st) st.innerHTML = '<div style="display:flex;align-items:center;gap:8px;font-size:14px;color:#434343;"><span style="width:8px;height:8px;border-radius:50%;background:' + GREEN + ';display:inline-block;"></span>엘리베이터 호출</div>';
      onCall(); /* 드로워 유지 */
    }, { once: true });
    // 드로워 슬라이드 완료 후 위치 정확히 잡아 툴팁 표시
    setTimeout(function () { var c = document.getElementById('ev-call-btn'); if (c) tooltip('호출 버튼을 눌러주세요', c.getBoundingClientRect(), 'call-tip'); }, 300);
  }

  // ── 6. 호출 → 영상 재생 + 재개 → 3초 후 볼륨 가이드 ──────────
  function onCall() {
    allowPlay = true;
    if (freezeTimer) { clearInterval(freezeTimer); freezeTimer = null; }
    freezeMap(false);
    if (cam) { try { cam.currentTime = 0; } catch (e) {} if (cam.play) cam.play().catch(function () {}); }
    setTimeout(showVolumeGuide, 3000);
  }

  // ── 7. 음량 0.2 가이드(텍스트만, 좌측 상단) + 실제 음량 컨트롤 추적 ──
  function showVolumeGuide() {
    var g = document.createElement('div');
    g.id = 'ev-vol-guide';
    g.innerHTML = '음량 볼륨을 <span style="color:#7CF0C4">0.2</span>로 낮춰주세요';
    g.style.cssText = 'position:fixed;top:16px;left:16px;z-index:' + (Z + 6) + ';background:' + GREEN800 + ';color:#fff;'
      + 'font:700 14px Pretendard,system-ui,sans-serif;padding:12px 16px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.3);';
    document.body.appendChild(g);
    try { if (window.NeubieAB) NeubieAB.markStimulus(); } catch (e) {} // 가이드 표시 = T1

    function done() {
      try { if (window.NeubieAB) NeubieAB.markResponse({ success: true }); } catch (e) {}
      g.remove();
      // 가이드 동작 종료 → 남은 툴팁/드로워 정리
      removeEl('ev-tip'); removeEl('call-tip');
      var dr = document.getElementById('ev-drawer'); if (dr) dr.remove();
      // 완료는 2초 뒤
      setTimeout(function () { if (window.NeubieFlow) NeubieFlow.complete({ success: true }); }, 2000);
    }
    trackRealVolume(done);
  }

  // 원격제어의 실제 음량 컨트롤을 추적 (B: range 슬라이더 / A: +/- 버튼 #volVal). 가이드는 슬라이더 안 만듦.
  // 음량은 A/B 공통 14단계: 0.2/0.4/0.6/0.8/1/2/3/4/5/6/7/8/9/10 → 목표 0.2(최솟값, 슬라이더 인덱스 0)
  function trackRealVolume(onDone) {
    function isPoint2(n) { return !isNaN(n) && Math.abs(n - 0.2) < 1e-6; }
    var slider = document.getElementById('voice-vol-slider') || document.querySelector('#voice-panel input[type="range"]');
    if (slider) { // B 슬라이더: Fitts 측정 (인덱스 0 = 음량 0.2)
      try { if (window.NeubieAB) NeubieAB.trackSlider(slider, { target: 0, tolerance: 0 }); } catch (e) {}
      var fired = false;
      function chk() { if (!fired && parseInt(slider.value, 10) === 0) { fired = true; onDone(); } }
      slider.addEventListener('mouseup', chk); slider.addEventListener('change', chk); slider.addEventListener('input', chk);
      return;
    }
    // A: +/- 버튼 → 값 표시(#volVal) 폴링, 0.2 도달 시 응답
    var valEl = document.getElementById('volVal') || document.getElementById('vol-val');
    if (valEl) {
      var fired2 = false;
      var iv = setInterval(function () {
        var n = parseFloat((valEl.textContent || '').replace(/[^0-9.]/g, ''));
        if (isPoint2(n) && !fired2) { fired2 = true; clearInterval(iv); onDone(); }
      }, 250);
    }
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
