/*
 * neubie-ab.js — 뉴빌리티 원격제어 A/B 테스트 계측 모듈 (프레임워크 무관 드롭인)
 *
 * 사용 (3개 링크 공통, variant만 다르게):
 *   <script src="assign.js"></script>
 *   <script src="config.shared.js"></script>
 *   <script src="neubie-ab.js"></script>
 *   <script src="https://us-assets.i.posthog.com/static/array.js"></script>  // posthog-js
 *   <script>
 *     NeubieAB.init({ variant: 'control_A' });   // 또는 'B1' | 'B2'
 *     NeubieAB.identify({ age_band:'30s', license:'Y', ... });
 *   </script>
 *
 * 트라이얼 흐름:
 *   NeubieAB.startTrial(3);                 // 시나리오 시작 (assign 배정으로 자극 셋업)
 *   NeubieAB.bindVideo(videoEl, 3);         // 영상 트리거 → 자동 markStimulus (S3)
 *   // 또는 자극을 직접 그릴 때:  NeubieAB.markStimulus();
 *   NeubieAB.markCognition();               // (선택) 인지 시점 t2
 *   NeubieAB.markResponse({ success: true });  // 응답 t3 → trial_result 전송
 *
 * 계측 규약(절대 준수):
 *  - T1은 벽시계가 아니라 영상시간(video.currentTime) 또는 자극 렌더 시점.
 *  - 반응시간은 performance.now() 델타로만. 이벤트 도착시각으로 빼지 않음.
 *  - raw mousemove를 전송하지 않음. 로컬 누적 → 경로/오버슈팅/Fitts만 속성으로.
 *  - 세션 리코딩으로 재생.
 *
 * UMD 전역: window.NeubieAB
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.NeubieAB = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getDep(name, globalName) {
    if (typeof window !== 'undefined' && window[globalName]) return window[globalName];
    if (typeof require === 'function') {
      try { return require(name); } catch (e) { /* noop */ }
    }
    return null;
  }
  var now = function () {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  };

  // ── 내부 상태 ────────────────────────────────────────────────
  var S = {
    config: null,
    assignment: null,   // assign(seed) 결과
    variant: null,      // 'control_A' | 'B1' | 'B2'
    participantId: null,
    ph: null,           // posthog
    exposures: {},      // scenario별 노출 횟수 (is_first_exposure 판정)
    trial: null,        // 현재 트라이얼 상태
    _videoBound: null,  // 중복 bindVideo 방지
    mouse: null,        // 현재 트라이얼의 마우스 체류/클릭 트래커
    nickname: null,     // seed 결정론적 닉네임 (참가자 식별 표시용)
    preview: false      // 보기 전용 모드(?preview=1): 어떤 기록도 전송하지 않음
  };

  // ── init ─────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    S.config = opts.config || getDep('./config.shared.js', 'NeubieConfig');
    var assignMod = opts.assign || getDep('./assign.js', 'NeubieAssign');
    if (!S.config) throw new Error('NeubieAB.init: config.shared.js(NeubieConfig)를 먼저 로드하세요.');
    if (!assignMod) throw new Error('NeubieAB.init: assign.js(NeubieAssign)를 먼저 로드하세요.');

    // intake 모드(entry.html): variant 없이 식별/흐름만. 그 외엔 variant 결정 필수.
    if (opts.intake) {
      S.variant = null;
    } else {
      var variant = opts.variant;
      if (!variant && typeof location !== 'undefined' && S.config.variantByLayout) {
        var layoutParam = new URLSearchParams(location.search).get('layout');
        if (layoutParam) variant = S.config.variantByLayout[layoutParam];
      }
      S.variant = variant;
      if (['control_A', 'B1', 'B2'].indexOf(S.variant) < 0) {
        throw new Error("NeubieAB.init: variant를 결정할 수 없습니다. " +
          "A 페이지는 init({variant:'control_A'}), B 페이지는 ?layout=vertical|horizontal 필요. 받은 값: " + S.variant);
      }
    }

    // seed: ?pid=<N> 우선, 없으면 opts.seed
    var seed = opts.seed;
    if (seed == null && typeof location !== 'undefined') {
      var m = /[?&]pid=(\d+)/.exec(location.search);
      if (m) seed = parseInt(m[1], 10);
    }
    if (seed == null) {
      console.warn('[NeubieAB] seed(?pid=)가 없습니다. 배정 없이 진행 — 영상/서브 자극이 셋업되지 않습니다.');
    } else {
      S.assignment = assignMod.assign(seed);
      S.participantId = 'p' + seed; // 짝비교 키 (3개 링크 동일 seed → 동일 id)
      // 닉네임은 seed 결정론적 — 모든 트라이얼 페이지(?pid=seed)에서 동일하게 재생성
      if (typeof S.config.makeNickname === 'function') S.nickname = S.config.makeNickname(seed);
      // 이 링크의 variant가 배정 order에 포함되는지 검증
      if (S.variant && S.assignment.order.indexOf(S.variant) < 0) {
        console.warn('[NeubieAB] seed ' + seed + ' 배정(' + S.assignment.order.join(',') +
          ')에 이 링크 variant(' + S.variant + ')가 없습니다. 링크/순서를 확인하세요.');
      }
    }

    // 보기 전용 모드: ?preview=1 또는 opts.preview → PostHog/Sheets/identify 전부 no-op(테스트 데이터 미포함)
    S.preview = !!opts.preview || (typeof location !== 'undefined' && /[?&]preview=1\b/.test(location.search));
    if (S.preview) {
      try { window.__neubiePreview = true; } catch (e) {}
      console.info('[NeubieAB] preview 모드 — 어떤 데이터도 기록하지 않습니다(보기 전용).');
      // 보기 편하도록 카메라 영상 루프
      try { var _cv = document.getElementById('cam-video'); if (_cv) _cv.loop = true; } catch (e) {}
    }

    // posthog: HTML의 공식 스니펫이 self-init. 모듈은 이를 사용 + 테스트 표식/세션리코딩만.
    S.ph = opts.posthog || getDep('posthog-js', 'posthog');
    var phCfg = S.config.posthog || {};
    if (S.ph && typeof S.ph.register === 'function') {
      try {
        if (phCfg.testMarker) S.ph.register(phCfg.testMarker);   // 모든 이벤트에 테스트 표식(슈퍼프로퍼티)
        if (phCfg.sessionRecording && S.ph.startSessionRecording) S.ph.startSessionRecording();
      } catch (e) { console.warn('[NeubieAB] posthog 설정 실패:', e); }
    } else {
      console.info('[NeubieAB] posthog 미감지 — capture는 콘솔 폴백(HTML posthog 스니펫 확인).');
      S.ph = null;
    }

    return sessionContext();
  }

  function sessionContext() {
    return {
      participant_id: S.participantId,
      ui_variant: S.variant,
      track: S.assignment && S.assignment.track,
      assignment: S.assignment
    };
  }

  // ── identify (group / expert_level 파생) ─────────────────────
  function deriveGroup(profile) {
    var rule = S.config.groupRule;
    var isExpert = profile.ops_experience === (rule.expertIf.ops_experience);
    var group = isExpert ? 'expert' : 'novice';
    var expertLevel = null;
    if (isExpert) {
      var lv = rule.expertLevel;
      if (lv.junior.indexOf(profile.ops_months) >= 0) expertLevel = 'junior';
      else if (lv.senior.indexOf(profile.ops_months) >= 0) expertLevel = 'senior';
    }
    return { group: group, expert_level: expertLevel };
  }

  function identify(profile) {
    if (S.preview) { console.log('[NeubieAB][preview] identify 생략'); return; }
    profile = profile || {};
    if (!S.participantId) {
      console.warn('[NeubieAB] identify: participant_id 없음(seed 미설정). identify 생략.');
      return;
    }
    var derived = deriveGroup(profile);
    var marker = (S.config.posthog && S.config.posthog.testMarker) || {};
    var props = Object.assign({}, marker, profile, derived); // 사람(person)에도 테스트 표식
    var p = _ph();
    if (p && p.identify) p.identify(S.participantId, props);
    else console.log('[NeubieAB] identify(폴백):', S.participantId, props);
    // Google Sheets(participants 탭)에도 기록
    sheetSend('participant', Object.assign({
      participant_id: S.participantId,
      track: S.assignment && S.assignment.track,
      order: S.assignment && S.assignment.order.join('>'),
      ua: (typeof navigator !== 'undefined' ? navigator.userAgent : '')
    }, props));
    return props;
  }

  // ── 트라이얼 ─────────────────────────────────────────────────
  function startTrial(scenario, override) {
    scenario = Number(scenario);
    var sc = S.config.scenarios[scenario];
    if (!sc) throw new Error('[NeubieAB] 알 수 없는 시나리오: ' + scenario);

    S.exposures[scenario] = (S.exposures[scenario] || 0) + 1;
    var a = S.assignment;

    var ctx = {
      scenario: scenario,
      participant_id: S.participantId,
      nickname: S.nickname,
      track: a ? a.track : null,          // 짝비교(A↔B, 트랙 내 동일 참가자) 키
      ui_variant: S.variant,
      stimulus_video: (scenario === 3 && a) ? a.s3Video[S.variant] : null,
      sub_test: (scenario === 1 && a) ? a.s1Sub[S.variant] : null,
      block_position: a ? a.blockPosition[S.variant] : null,
      is_first_exposure: S.exposures[scenario] === 1,
      scenario_name: sc.name
    };
    if (override) Object.assign(ctx, override);

    S.trial = {
      ctx: ctx,
      sc: sc,
      t1: null, t2: null, t3: null,
      pointer: null,   // 포인터 트래커 핸들
      done: false
    };
    startMouseTracking();   // 시나리오 마우스 체류/클릭 집계 시작
    return ctx;
  }

  function _requireTrial(fn) {
    if (!S.trial) throw new Error('[NeubieAB] ' + fn + ': startTrial()를 먼저 호출하세요.');
    return S.trial;
  }

  function markStimulus() { var t = _requireTrial('markStimulus'); if (t.t1 == null) t.t1 = now(); return t.t1; }
  function markCognition() { var t = _requireTrial('markCognition'); t.t2 = now(); return t.t2; }

  // 영상시간 트리거 → 자동 markStimulus (S3 등)
  function bindVideo(videoEl, scenario) {
    var t = _requireTrial('bindVideo');
    scenario = Number(scenario);
    var triggerSec = null;
    if (scenario === 3) {
      var v = t.ctx.stimulus_video; // 'taxi' | 'wall'
      triggerSec = v && S.config.videos[v] ? S.config.videos[v].triggerSec : null;
    } else {
      var sc = S.config.scenarios[scenario];
      triggerSec = sc && sc.trigger ? sc.trigger.triggerSec : null;
    }
    if (triggerSec == null) {
      console.warn('[NeubieAB] bindVideo: 시나리오 ' + scenario + ' triggerSec 미설정(config TODO). ' +
        '영상이 준비되면 config를 채우거나 markStimulus()를 수동 호출하세요.');
      return;
    }
    var handler = function () {
      if (t.t1 == null && videoEl.currentTime >= triggerSec) {
        markStimulus();
        videoEl.removeEventListener('timeupdate', handler);
      }
    };
    videoEl.addEventListener('timeupdate', handler);
    S._videoBound = handler;
  }

  // 시나리오 영상 src를 <video> 요소에 적용. S3는 배정된 taxi/bump, 나머지는 config.scenarios[n].video.
  // 반환: 적용된 src(없으면 null). 보통 loadScenarioVideo → bindVideo → (재생) 순서.
  function loadScenarioVideo(videoEl, scenario) {
    scenario = Number(scenario);
    var src = null;
    if (scenario === 3) {
      var t = S.trial;
      var v = (t && t.ctx && t.ctx.stimulus_video) || (S.assignment && S.assignment.s3Video[S.variant]);
      // 배정 없을 때(보기 전용 등) ?video=taxi|bump 로 자극 영상 직접 선택
      if (!v && typeof location !== 'undefined') { var pv = new URLSearchParams(location.search).get('video'); if (pv) v = pv; }
      src = (v && S.config.videos[v]) ? S.config.videos[v].src : null;
    } else {
      var sc = S.config.scenarios[scenario];
      src = sc ? sc.video : null;
    }
    if (!src) { console.warn('[NeubieAB] loadScenarioVideo: scenario ' + scenario + ' 영상 src 없음'); return null; }
    videoEl.src = src;
    videoEl.loop = !!S.preview && Number(scenario) !== 6;   // 보기 전용 반복(단, S6 도착영상은 끝에서 정지)
    return src;
  }

  // ── 포인터 / 오버슈팅 / Fitts ────────────────────────────────
  // 클릭 타깃 추적: 최종 클릭 전 타깃 박스에 들어왔다 나간 횟수 = overshoot_count
  function trackClickTarget(targetEl) {
    var t = _requireTrial('trackClickTarget');
    var state = { pathLen: 0, last: null, enters: 0, inside: false, overshoot: 0 };
    function inBox(x, y) {
      var r = targetEl.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }
    function onMove(e) {
      if (state.last) {
        var dx = e.clientX - state.last.x, dy = e.clientY - state.last.y;
        state.pathLen += Math.sqrt(dx * dx + dy * dy);
      }
      state.last = { x: e.clientX, y: e.clientY };
      var now_inside = inBox(e.clientX, e.clientY);
      if (now_inside && !state.inside) state.enters++;
      if (!now_inside && state.inside) state.overshoot++; // 들어왔다 다시 나감
      state.inside = now_inside;
    }
    window.addEventListener('mousemove', onMove, true);
    t.pointer = {
      state: state,
      stop: function () { window.removeEventListener('mousemove', onMove, true); }
    };
    return t.pointer;
  }

  // 슬라이더 추적(S5): movement_time_ms, fitts_id, overshoot_count
  //  sliderEl: <input type=range>. opts: {target, tolerance} (config.scenarios[5].success에서 기본)
  function trackSlider(sliderEl, opts) {
    var t = _requireTrial('trackSlider');
    var sc = S.config.scenarios[5].success;
    var target = (opts && opts.target != null) ? opts.target : sc.target;
    var tol = (opts && opts.tolerance != null) ? opts.tolerance : sc.tolerance;
    var min = parseFloat(sliderEl.min || 0), max = parseFloat(sliderEl.max || 1);
    var span = (max - min) || 1;
    var width = sliderEl.getBoundingClientRect().width || 1;

    var st = { pressT: null, startVal: null, lastVal: null, crossings: 0, settled: false };
    function val() { return parseFloat(sliderEl.value); }
    function onDown() { if (st.pressT == null) { st.pressT = now(); st.startVal = val(); st.lastVal = val(); } }
    function onInput() {
      var v = val();
      if (st.lastVal != null) {
        // target을 사이에 두고 값이 넘나든 횟수 = overshoot
        if ((st.lastVal - target) * (v - target) < 0) st.crossings++;
      }
      st.lastVal = v;
    }
    sliderEl.addEventListener('mousedown', onDown, true);
    sliderEl.addEventListener('touchstart', onDown, true);
    sliderEl.addEventListener('input', onInput, true);

    t.pointer = {
      state: st,
      finalize: function () {
        var endT = now();
        var movement_time_ms = (st.pressT != null) ? Math.round(endT - st.pressT) : null;
        // Fitts: D = 시작값→타깃 픽셀거리, W = 허용폭(±tol) 픽셀
        var D = Math.abs((target - (st.startVal != null ? st.startVal : min)) / span) * width;
        var W = (2 * tol / span) * width;
        var fitts_id = (D > 0 && W > 0) ? Math.log2((2 * D) / W) : null;
        var settled = Math.abs(val() - target) <= tol;
        return {
          movement_time_ms: movement_time_ms,
          fitts_id: fitts_id != null ? Number(fitts_id.toFixed(3)) : null,
          overshoot_count: st.crossings,
          settled: settled
        };
      },
      stop: function () {
        sliderEl.removeEventListener('mousedown', onDown, true);
        sliderEl.removeEventListener('touchstart', onDown, true);
        sliderEl.removeEventListener('input', onInput, true);
      }
    };
    return t.pointer;
  }

  // ── 마우스 체류(AOI)/클릭 트래킹 ─────────────────────────────
  // 시나리오별로 "마우스가 가장 오래 머문 영역 / 체류시간 / 클릭 수 / 클릭 좌표"를 집계.
  // startTrial에서 시작, markResponse에서 종료 → trial_result 속성 + Sheets 컬럼으로 기록.
  var MOUSE_SAMPLE_MS = 80;
  function _aoiDefs() {
    var a = S.config && S.config.aoi; if (!a) return [];
    if (a[S.variant]) return a[S.variant];
    if (S.variant && S.variant.charAt(0) === 'B' && a.B1) return a.B1; // B2 → B1과 동일 구조
    return a.default || [];
  }
  function _aoiAt(defs, x, y) {
    for (var i = 0; i < defs.length; i++) {
      var el = document.querySelector(defs[i].selector);
      if (!el) continue;
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return defs[i].label;
    }
    return '기타';
  }
  function startMouseTracking() {
    if (typeof document === 'undefined') return;
    stopMouseTracking();
    var defs = _aoiDefs();
    var m = { defs: defs, dwell: {}, clicks: {}, clickPts: [], samples: 0, last: 0, t0: now(), tracking: true, onMove: null, onClick: null };
    m.onMove = function (e) {
      if (!m.tracking) return;
      var t = now(); if (t - m.last < MOUSE_SAMPLE_MS) return; m.last = t;
      var a = _aoiAt(defs, e.clientX, e.clientY);
      m.dwell[a] = (m.dwell[a] || 0) + 1; m.samples++;
    };
    m.onClick = function (e) {
      if (!m.tracking) return;
      var a = _aoiAt(defs, e.clientX, e.clientY);
      m.clicks[a] = (m.clicks[a] || 0) + 1;
      if (m.clickPts.length < 200) m.clickPts.push({ x: Math.round(e.clientX), y: Math.round(e.clientY), r: a, t: Math.round(now() - m.t0) });
    };
    document.addEventListener('mousemove', m.onMove, true);
    document.addEventListener('click', m.onClick, true);
    S.mouse = m;
  }
  function stopMouseTracking() {
    var m = S.mouse; if (!m) return;
    m.tracking = false;
    try { document.removeEventListener('mousemove', m.onMove, true); document.removeEventListener('click', m.onClick, true); } catch (e) {}
  }
  function mouseSummary() {
    var m = S.mouse; if (!m) return null;
    var total = m.samples || 0;
    var keys = {}; Object.keys(m.dwell).forEach(function (k) { keys[k] = 1; }); Object.keys(m.clicks).forEach(function (k) { keys[k] = 1; });
    var rows = Object.keys(keys).map(function (k) {
      var cnt = m.dwell[k] || 0;
      return { region: k, dwell_ms: cnt * MOUSE_SAMPLE_MS, pct: total ? Number((cnt / total * 100).toFixed(1)) : 0, clicks: m.clicks[k] || 0 };
    });
    rows.sort(function (a, b) { return b.dwell_ms - a.dwell_ms; });
    var top = rows[0] || null;
    var totalClicks = 0; Object.keys(m.clicks).forEach(function (k) { totalClicks += m.clicks[k]; });
    return {
      top_region: top ? top.region : '',
      top_region_dwell_ms: top ? top.dwell_ms : 0,
      mouse_samples: total,
      total_clicks: totalClicks,
      region_dwell_json: JSON.stringify(rows),
      click_points_json: JSON.stringify(m.clickPts)
    };
  }

  // ── markResponse → trial_result 전송 ─────────────────────────
  function markResponse(result) {
    var t = _requireTrial('markResponse');
    result = result || {};
    if (t.done) { console.warn('[NeubieAB] 이미 종료된 트라이얼'); return; }
    t.t3 = now();
    t.done = true;

    var ev = Object.assign({}, t.ctx);

    // 시간 델타 (performance.now 차이값만)
    if (t.t1 != null) {
      var total = Math.round(t.t3 - t.t1);
      ev.total_ms = total;
      if (t.t2 != null) {
        ev.perception_ms = Math.round(t.t2 - t.t1);
        ev.response_ms = Math.round(t.t3 - t.t2);
      } else {
        ev.response_ms = total;
      }
      if (t.ctx.scenario === 3) ev.braking_latency_ms = total; // T3 - T1
    } else {
      console.warn('[NeubieAB] markStimulus가 호출되지 않아 시간 델타가 비어있습니다 (scenario ' + t.ctx.scenario + ').');
    }

    // 포인터/Fitts/오버슈팅 집계
    if (t.pointer) {
      if (t.pointer.finalize) {            // 슬라이더(S5)
        var f = t.pointer.finalize();
        ev.movement_time_ms = f.movement_time_ms;
        ev.fitts_id = f.fitts_id;
        ev.overshoot_count = f.overshoot_count;
        if (result.success == null) result.success = f.settled;
      } else if (t.pointer.state) {        // 클릭 타깃(S6 등)
        ev.overshoot_count = t.pointer.state.overshoot;
        if (t.pointer.state.pathLen != null) ev.mouse_path_px = Math.round(t.pointer.state.pathLen);
      }
      if (t.pointer.stop) t.pointer.stop();
    }

    // 결과 플래그: config 성공기준으로 자동 판정하되, result로 명시하면 그 값이 우선
    var sc = t.sc;
    var out = deriveOutcome(sc, ev, t.ctx, result);
    ev.success = result.success != null ? !!result.success : !!out.success;
    ev.timeout = result.timeout != null ? !!result.timeout : !!out.timeout;
    ev.error   = result.error   != null ? !!result.error   : !!out.error;
    if (result.correct != null) ev.correct = !!result.correct;        // S1 정/오판
    else if (out.correct != null) ev.correct = !!out.correct;
    if (result.selected != null) ev.selected = result.selected;       // S1 선택 항목(기록용)

    // 첫 노출만 분석하는 필드 정리 (S6 overshoot/error 등)
    if (sc.firstExposureOnly && !t.ctx.is_first_exposure) {
      sc.firstExposureOnly.forEach(function (k) { delete ev[k]; });
    }

    // 주요 측정 지표(테스트 계획) — 시나리오별 헤드라인 지표를 행마다 명시
    //  primary_metric(이름)·primary_value(값)·primary_unit(단위)·primary_outcome(판정)·primary_pass(성공)
    var pmCfg = S.config.primaryMetrics && S.config.primaryMetrics[t.ctx.scenario];
    if (pmCfg) {
      ev.primary_metric = pmCfg.name;
      ev.primary_value = (ev[pmCfg.value] != null) ? ev[pmCfg.value] : null;
      ev.primary_unit = pmCfg.unit;
      ev.primary_pass = (ev.success === true);
      ev.primary_outcome = (t.ctx.scenario === 1)
        ? (ev.correct === true ? '정답' : (ev.correct === false ? '오답' : '미상'))
        : (ev.timeout === true ? '시간초과'
          : (ev.error === true ? '오류'
          : (ev.success === true ? '성공' : (ev.success === false ? '실패' : '미상'))));
    }

    // 마우스 체류(AOI)/클릭 집계 종료 → 결과 병합 (PostHog 속성 + Sheets 컬럼)
    stopMouseTracking();
    var ms = mouseSummary();
    if (ms) Object.assign(ev, ms);

    _capture('trial_result', ev);
    sheetSend('trial', ev);          // Google Sheets(trials 탭)에도 기록
    S.trial = null;
    S.mouse = null;
    return ev;
  }

  // config 성공기준(success.kind)으로 success/timeout/error/correct 자동 판정
  function deriveOutcome(sc, ev, ctx, result) {
    var o = { success: undefined, timeout: false, error: false, correct: undefined };
    var spec = sc.success || {};
    switch (spec.kind) {
      case 'deadline': // S2: 제한시간 내 응답
        if (ev.response_ms != null) { o.timeout = ev.response_ms > spec.limitMs; o.success = !o.timeout; }
        break;
      case 'videoWindow': // S3: brake 유효구간 내 ON
        var v = ctx.stimulus_video;
        var win = (v && S.config.videos[v]) ? S.config.videos[v].successWindowMs : null;
        if (ev.braking_latency_ms != null && win != null) o.success = ev.braking_latency_ms <= win;
        break;
      case 'clickWindow': // S6: 알림 후 허용창 내 클릭
        if (ev.response_ms != null) {
          var bad = ev.response_ms < spec.minMs || ev.response_ms > spec.maxMs;
          o.error = bad; o.success = !bad;
        }
        break;
      case 'fitts': // S5: 슬라이더 0.2 안착 (trackSlider.finalize가 result.success로 주입)
        if (result.success != null) o.success = result.success;
        break;
      case 'correctness': // S1: 정/오판
        if (result.correct != null) { o.correct = result.correct; o.success = result.correct; }
        break;
    }
    return o;
  }

  // Google Sheets(Apps Script 웹앱)로 행 전송. endpoint 미설정(TODO)이면 no-op.
  function sheetSend(type, props) {
    if (S.preview) return;   // 보기 전용 — 시트 기록 안 함
    var sh = S.config && S.config.sheets;
    if (!sh || !sh.enabled || !sh.endpoint || /TODO/.test(sh.endpoint)) return;
    var marker = (S.config.posthog && S.config.posthog.testMarker) || {};
    var payload = Object.assign({ type: type, ts: new Date().toISOString() }, marker, props);
    try {
      var body = JSON.stringify(payload);
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(sh.endpoint, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
      } else if (typeof fetch === 'function') {
        fetch(sh.endpoint, { method: 'POST', mode: 'no-cors', keepalive: true,
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: body });
      }
    } catch (e) { console.warn('[NeubieAB] sheetSend 실패:', e); }
  }

  // posthog 인스턴스를 매번 '현재'로 재해석.
  // (공식 스니펫은 array.js 로드 후 window.posthog를 실제 인스턴스로 '교체'한다.
  //  init 시점의 스텁을 캐시해두면 로드 이후 호출이 죽은 큐로 빠져 전송되지 않음 → 항상 live 참조)
  function _ph() {
    if (typeof window !== 'undefined' && window.posthog) return window.posthog;
    return S.ph;
  }

  function _capture(eventName, props) {
    if (S.preview) { console.log('[NeubieAB][preview] capture 생략:', eventName); return; }
    var marker = (S.config && S.config.posthog && S.config.posthog.testMarker) || {};
    var payload = Object.assign({}, marker, props); // 모든 이벤트에 테스트 표식 명시
    var p = _ph();
    if (p && p.capture) p.capture(eventName, payload);
    else console.log('[NeubieAB] capture(폴백):', eventName, payload);
  }

  // ── 공개 API ─────────────────────────────────────────────────
  return {
    init: init,
    identify: identify,
    startTrial: startTrial,
    markStimulus: markStimulus,
    markCognition: markCognition,
    markResponse: markResponse,
    bindVideo: bindVideo,
    loadScenarioVideo: loadScenarioVideo,
    trackClickTarget: trackClickTarget,
    trackSlider: trackSlider,
    capture: _capture,
    _deriveGroup: deriveGroup,     // 테스트용
    _deriveOutcome: deriveOutcome, // 테스트용
    getContext: sessionContext,
    getAssignment: function () { return S.assignment; },
    isPreview: function () { return !!S.preview; }
  };
});
