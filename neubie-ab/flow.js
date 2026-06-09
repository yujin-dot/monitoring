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
    if (ni < seq.length) location.href = seq[ni].url;
    else location.href = '/entry.html?pid=' + pid + '&done=1';
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

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else setTimeout(mount, 0);
  }

  return {
    buildSequence: buildSequence,
    start: start,
    next: next,
    complete: complete,          // 응답 버튼에서 markResponse 후 호출 권장
    active: active,
    mount: mount,
    current: function (pid) { var s = buildSequence(pid); var i = currentIndex(pid, s); return { index: i, n: i + 1, total: s.length, trial: s[i] || null }; },
    clear: clear,
    _load: load
  };
});
