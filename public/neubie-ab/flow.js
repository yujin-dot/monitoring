/*
 * flow.js — 참가자 세션 흐름(오케스트레이션). window.NeubieFlow
 *
 * 흐름: entry.html(수집정보 → 방법설명) → start(pid) →
 *   각 트라이얼 페이지에서  [시나리오 설명 오버레이 → 시작하기] → 테스트 → [완료 오버레이 → 다음]
 *   → 다음 트라이얼 … → 마지막엔 종료 화면(entry.html?done=1).
 *
 * 시퀀스 = assign(pid).order(2시안) × within [1,2,3,5,6] = 10. URL 상대경로, 상태 localStorage.
 * 의존: window.NeubieConfig, window.NeubieAssign.
 *
 * 트라이얼 페이지는 flow.js만 로드하면 자동 동작(?scenario + 흐름 세션일 때).
 * 응답 버튼이 생기면: markResponse 후 NeubieFlow.complete(result) 호출 → 완료 오버레이 자동.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.NeubieFlow = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'neubie_flow';
  var WITHIN = [1, 2, 3, 5, 6]; // S4 제외
  var PRIMARY = '#00BA7C';

  function cfg() { return (typeof window !== 'undefined' && window.NeubieConfig) || null; }
  function assignMod() { return (typeof window !== 'undefined' && window.NeubieAssign) || null; }
  function param(n) { return new URLSearchParams(location.search).get(n); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  function trialUrl(variant, pid, sc) {
    var p = cfg().links[variant].url;
    var sep = p.indexOf('?') >= 0 ? '&' : '?';
    return p + sep + 'pid=' + pid + '&scenario=' + sc;
  }

  function buildSequence(pid) {
    var a = assignMod().assign(Number(pid));
    var seq = [];
    a.order.forEach(function (variant, oi) {
      WITHIN.forEach(function (sc) {
        seq.push({ variant: variant, scenario: sc, block_position: oi + 1, name: cfg().scenarios[sc].name, url: trialUrl(variant, pid, sc) });
      });
    });
    return seq;
  }

  function currentVariant() {
    if (location.pathname.indexOf('remote-control-A') >= 0) return 'control_A';
    var l = param('layout');
    return (cfg().variantByLayout && cfg().variantByLayout[l]) || null;
  }
  function currentIndex(pid, seq) {
    seq = seq || buildSequence(pid);
    var v = currentVariant(), sc = Number(param('scenario'));
    for (var i = 0; i < seq.length; i++) if (seq[i].variant === v && seq[i].scenario === sc) return i;
    return -1;
  }

  function start(pid, profile) {
    var seq = buildSequence(pid);
    save({ pid: String(pid), profile: profile || null, total: seq.length });
    location.href = seq[0].url;
  }
  function active(pid) { var f = load(); return !!(f && String(f.pid) === String(pid)); }

  function next() {
    var f = load(); if (!f) return;
    var pid = f.pid, seq = buildSequence(pid), i = currentIndex(pid, seq), ni = (i < 0 ? 0 : i) + 1;
    var go = function () {
      if (ni < seq.length) location.href = seq[ni].url;
      else location.href = '/entry.html?pid=' + pid + '&done=1';
    };
    // 시안 블록 경계(해당 시안의 마지막 시나리오 완료) → SUS 설문 후 진행
    var cur = seq[i];
    var boundary = cur && (ni >= seq.length || !seq[ni] || seq[ni].variant !== cur.variant);
    if (boundary) { showSus(cur.variant, go); return; }
    go();
  }

  // ── SUS 설문 오버레이 (시안별 전체 시나리오 종료 시) ──────────
  //  한 문항씩 순차 노출(응답하면 다음 문항 등장) · 중앙 정렬 · 전부 응답 시 하단 고정 [제출하고 계속]
  function showSus(variant, onDone) {
    var sus = cfg().sus || {}; var qs = sus.questions || [];
    if (!qs.length) { onDone(); return; }
    var scale = sus.scale || 5;
    var vLabel = variant === 'control_A' ? 'A' : variant === 'B1' ? 'B(세로)' : variant === 'B2' ? 'B(가로)' : (variant || '');
    var rows = qs.map(function (q, i) {
      var opts = '';
      for (var v = 1; v <= scale; v++) {
        var anchor = (v === 1) ? (sus.anchorLow || '전혀 그렇지 않다') : (v === scale) ? (sus.anchorHigh || '매우 그렇다') : '';
        opts += '<label style="display:inline-flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;flex:1;">'
          + '<input type="radio" name="sus' + i + '" value="' + v + '" style="width:24px;height:24px;accent-color:' + PRIMARY + ';">'
          + '<span style="font-size:14px;font-weight:700;color:#E9E9E9;">' + v + '</span>'
          + '<span style="font-size:11px;font-weight:600;line-height:1.25;text-align:center;min-height:28px;color:' + (anchor ? PRIMARY : 'transparent') + ';">' + (anchor || '·') + '</span>'
          + '</label>';
      }
      // 1번만 처음에 보이고, 응답하면 다음 문항이 등장
      return '<div class="sus-q" data-q="' + i + '" style="display:' + (i === 0 ? 'block' : 'none') + ';padding:22px 0;border-top:' + (i === 0 ? 'none' : '1px solid #23262B') + ';">'
        + '<div style="font-size:17px;font-weight:600;color:#F2F2F2;line-height:1.5;margin-bottom:16px;">' + (i + 1) + '. ' + q + '</div>'
        + '<div style="display:flex;gap:8px;max-width:360px;margin:0 auto;">' + opts + '</div></div>';
    }).join('');
    var o = document.createElement('div');
    o.id = 'neubie-flow-ovl';
    o.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#0E0F11;color:#fff;overflow-y:auto;text-align:center;'
      + 'font-family:Pretendard,-apple-system,system-ui,sans-serif;padding:48px 20px 120px;';
    o.innerHTML = '<div style="max-width:520px;margin:0 auto;">'
      + '<div style="font-size:13px;font-weight:700;color:' + PRIMARY + ';letter-spacing:.04em;">' + vLabel + ' 시안 사용성 평가</div>'
      + '<h2 style="font-size:24px;font-weight:800;margin:6px 0 4px;">방금 사용한 화면은 어땠나요?</h2>'
      + '<p style="font-size:14px;color:#9DA3AA;margin:0 0 8px;line-height:1.6;">1(' + (sus.anchorLow || '전혀 그렇지 않다') + ') ~ ' + scale + '(' + (sus.anchorHigh || '매우 그렇다') + ')로 응답해주세요.</p>'
      + '<div id="sus-progress" style="font-size:13px;color:#7B8088;margin-bottom:4px;">1 / ' + qs.length + '</div>'
      + '<div id="sus-rows">' + rows + '</div>'
      + '</div>'
      // 하단 고정 제출 바 (전부 응답 시 노출)
      + '<div id="sus-bar" style="display:none;position:fixed;left:0;right:0;bottom:0;padding:16px 20px;'
        + 'background:linear-gradient(180deg,rgba(14,15,17,0),#0E0F11 38%);">'
        + '<button id="sus-submit" style="display:block;width:100%;max-width:520px;margin:0 auto;height:54px;border:none;border-radius:12px;'
        + 'background:' + PRIMARY + ';color:#fff;font:800 17px Pretendard,system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.4);">제출하고 계속</button></div>';
    removeOverlay();
    (document.body || document.documentElement).appendChild(o);

    function answeredCount() { var c = 0; for (var i = 0; i < qs.length; i++) if (o.querySelector('input[name="sus' + i + '"]:checked')) c++; return c; }
    o.addEventListener('change', function (e) {
      var t = e.target; if (!t || !t.name || t.name.indexOf('sus') !== 0) return;
      var idx = parseInt(t.name.slice(3), 10);
      var nxt = o.querySelector('div[data-q="' + (idx + 1) + '"]');
      if (nxt && nxt.style.display === 'none') {
        nxt.style.display = 'block';
        if (nxt.scrollIntoView) { try { nxt.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e2) {} }
      }
      var done = answeredCount();
      var prog = document.getElementById('sus-progress'); if (prog) prog.textContent = done + ' / ' + qs.length;
      if (done === qs.length) {
        var bar = document.getElementById('sus-bar');
        if (bar && bar.style.display === 'none') { bar.style.display = 'block'; if (bar.scrollIntoView) { try { bar.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch (e3) {} } }
      }
    });
    document.getElementById('sus-submit').onclick = function () {
      var answers = [];
      for (var i = 0; i < qs.length; i++) { var sel = o.querySelector('input[name="sus' + i + '"]:checked'); answers.push(sel ? Number(sel.value) : null); }
      if (answers.some(function (a) { return !a; })) return; // 바는 전부 응답 시에만 보이지만 안전장치
      try { if (window.NeubieAB && NeubieAB.submitSus) NeubieAB.submitSus(answers, variant); } catch (e) {}
      removeOverlay();
      onDone();
    };
  }

  // ── 오버레이 UI ──────────────────────────────────────────────
  function camVideo() { return document.getElementById('cam-video'); }
  function removeOverlay() { var o = document.getElementById('neubie-flow-ovl'); if (o) o.remove(); }
  function overlay(innerHtml) {
    removeOverlay();
    var o = document.createElement('div');
    o.id = 'neubie-flow-ovl';
    o.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;'
      + 'background:rgba(0,0,0,.62);color:#fff;font-family:Pretendard,-apple-system,system-ui,sans-serif;padding:24px;';
    o.innerHTML = innerHtml;
    (document.body || document.documentElement).appendChild(o);
    return o;
  }
  function btnHtml(id, text) {
    return '<button id="' + id + '" style="margin-top:28px;border:none;border-radius:10px;background:' + PRIMARY + ';color:#fff;'
      + 'font:700 17px Pretendard,system-ui,sans-serif;padding:14px 40px;cursor:pointer;">' + text + '</button>';
  }

  // 시나리오 설명 오버레이 → [시작하기]에서 영상 재생 시작
  function showScenarioIntro() {
    var pid = param('pid'), sc = Number(param('scenario'));
    var seq = buildSequence(pid), i = currentIndex(pid, seq);
    var pos = (i < 0 ? 0 : i) + 1, total = seq.length;
    var desc = (cfg().scenarioIntros && cfg().scenarioIntros[sc]) || (cfg().scenarios[sc] && cfg().scenarios[sc].expectedAction) || '';
    var cam = camVideo();
    if (cam) { try { cam.pause(); cam.currentTime = 0; } catch (e) {} }

    overlay(
      '<div style="opacity:.7;font-size:14px;font-weight:600;letter-spacing:.04em;">' + pos + ' / ' + total + '</div>'
      + '<div style="font-size:34px;font-weight:800;margin-top:6px;">시나리오 ' + pos + '</div>'
      + '<div style="max-width:420px;margin-top:14px;font-size:16px;line-height:1.6;color:#E0E0E0;">' + desc + '</div>'
      + btnHtml('neubie-flow-startbtn', '시작하기')
    );
    document.getElementById('neubie-flow-startbtn').onclick = function () {
      removeOverlay();
      // 트라이얼이 시작 훅을 노출하면 그게 영상/시나리오 셋업을 담당(예: B는 S2 영상을 횡단하기까지 대기).
      if (typeof window.__neubieScenarioStart === 'function') {
        try { window.__neubieScenarioStart(sc); } catch (e) {}
      } else { // 훅 없으면(A 등) 영상 직접 재생 폴백
        var c = camVideo();
        if (c) { try { c.currentTime = 0; } catch (e) {} if (c.play) c.play().catch(function () {}); }
      }
      // (수동 '완료 →' 버튼은 제거 — 각 시나리오의 응답 액션으로만 완료)
    };
  }

  // 우측하단 "완료 →" (응답 버튼 생기기 전 수동 진행용)
  function mountFinishButton() {
    if (document.getElementById('neubie-flow-fin')) return;
    var b = document.createElement('button');
    b.id = 'neubie-flow-fin';
    b.textContent = '완료 →';
    b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;border:none;border-radius:10px;background:' + PRIMARY + ';color:#fff;'
      + 'font:700 14px Pretendard,system-ui,sans-serif;padding:11px 18px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);';
    b.onclick = function () { complete(); };
    (document.body || document.documentElement).appendChild(b);
  }

  // 완료 오버레이 → [다음]. result.success가 있으면 성공/실패 표시.
  function complete(result) {
    // 보기 전용(?preview=1): 완료 오버레이/진행 없이 화면 유지(영상 반복 관찰)
    if (typeof location !== 'undefined' && /[?&]preview=1\b/.test(location.search)) return;
    var fin = document.getElementById('neubie-flow-fin'); if (fin) fin.remove();
    var pid = param('pid'), seq = buildSequence(pid), i = currentIndex(pid, seq);
    var last = ((i < 0 ? 0 : i) + 1) >= seq.length;
    var mark = '✓', head = '시나리오 완료', color = PRIMARY;
    if (result && result.success === false) { mark = '✕'; head = '시나리오 종료'; color = '#FA5952'; }
    overlay(
      '<div style="font-size:54px;color:' + color + ';">' + mark + '</div>'
      + '<div style="font-size:26px;font-weight:800;margin-top:8px;">' + head + '</div>'
      + btnHtml('neubie-flow-nextbtn', last ? '테스트 종료 →' : '다음 시나리오 →')
    );
    document.getElementById('neubie-flow-nextbtn').onclick = function () { next(); };
  }

  // 트라이얼 페이지 진입 시 자동: 흐름 세션 + ?scenario면 시나리오 설명부터
  function mount() {
    if (typeof document === 'undefined') return;
    if (!param('scenario')) return;
    var pid = param('pid');
    if (!pid || !active(pid)) return;
    if (document.getElementById('neubie-flow-ovl')) return;
    showScenarioIntro();
  }

  // 보기 전용: ?sus=<variant> 가 있으면 SUS 설문을 바로 띄움(콘솔 없이 viewer에서 미리보기). preview에서만.
  function previewSus(variant) { showSus(variant, function () { removeOverlay(); }); }
  function maybePreviewSus() {
    var v = param('sus'); if (!v) return false;
    var pv = (window.NeubieAB && NeubieAB.isPreview && NeubieAB.isPreview()) || /[?&]preview=1\b/.test(location.search);
    if (!pv) return false;            // 실제 테스트 페이지에선 무시(오기록 방지)
    previewSus(v); return true;
  }
  function boot() { if (maybePreviewSus()) return; mount(); }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else setTimeout(boot, 0);
  }

  return {
    buildSequence: buildSequence,
    start: start,
    next: next,
    complete: complete,          // 응답 버튼에서 markResponse 후 호출 권장
    active: active,
    mount: mount,
    previewSus: previewSus,      // 미리보기용

    current: function (pid) { var s = buildSequence(pid); var i = currentIndex(pid, s); return { index: i, n: i + 1, total: s.length, trial: s[i] || null }; },
    clear: clear,
    _load: load
  };
});
