/*
 * flow.js — 참가자 세션 흐름(오케스트레이션). window.NeubieFlow
 *
 * entry.html(수집정보 입력) → start(pid) → 본인 배정대로 10개 트라이얼을 순서대로 진행 → 종료.
 * 시퀀스 = assign(pid).order(2시안) × within 시나리오 [1,2,3,5,6] = 10.
 * URL은 상대경로로 만들어 localhost/배포 양쪽에서 동작. 상태는 localStorage.
 *
 * 트라이얼 페이지(A·B)는 mountNextButton()으로 "다음 (n/10)" 컨트롤을 띄워 next()로 진행.
 * (응답 버튼이 생기면 markResponse 후 NeubieFlow.next()를 호출하도록 바꾸면 자동 진행됨)
 *
 * 의존: window.NeubieConfig, window.NeubieAssign.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.NeubieFlow = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'neubie_flow';
  var WITHIN = [1, 2, 3, 5, 6]; // S4 제외

  function cfg() { return (typeof window !== 'undefined' && window.NeubieConfig) || null; }
  function assignFn() { return (typeof window !== 'undefined' && window.NeubieAssign) || null; }
  function param(name) { return new URLSearchParams(location.search).get(name); }

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // variant + pid + scenario → 상대 진입 URL
  function trialUrl(variant, pid, sc) {
    var p = cfg().links[variant].url;            // '/remote-control-A.html' | '/?layout=vertical'
    var sep = p.indexOf('?') >= 0 ? '&' : '?';
    return p + sep + 'pid=' + pid + '&scenario=' + sc;
  }

  // pid → 10개 트라이얼 시퀀스
  function buildSequence(pid) {
    var a = assignFn().assign(Number(pid));
    var seq = [];
    a.order.forEach(function (variant, oi) {
      WITHIN.forEach(function (sc) {
        seq.push({
          variant: variant, scenario: sc, block_position: oi + 1,
          name: cfg().scenarios[sc].name, url: trialUrl(variant, pid, sc)
        });
      });
    });
    return seq;
  }

  // 현재 페이지의 variant 추정 (A=파일명 / B=?layout)
  function currentVariant() {
    if (location.pathname.indexOf('remote-control-A') >= 0) return 'control_A';
    var l = param('layout');
    return (cfg().variantByLayout && cfg().variantByLayout[l]) || null;
  }

  // 현재 페이지가 시퀀스의 몇 번째인지 (variant+scenario로 매칭). 못 찾으면 -1.
  function currentIndex(pid, seq) {
    seq = seq || buildSequence(pid);
    var v = currentVariant(), sc = Number(param('scenario'));
    for (var i = 0; i < seq.length; i++) if (seq[i].variant === v && seq[i].scenario === sc) return i;
    return -1;
  }

  // 흐름 시작: 수집정보 저장 후 첫 트라이얼로 이동 (identify는 entry.html에서 별도 호출)
  function start(pid, profile) {
    var seq = buildSequence(pid);
    save({ pid: String(pid), profile: profile || null, total: seq.length });
    location.href = seq[0].url;
  }

  // 이 pid의 흐름이 진행 중인지
  function active(pid) {
    var f = load();
    return !!(f && String(f.pid) === String(pid));
  }

  // 다음 트라이얼로. 마지막이면 종료 화면으로.
  function next() {
    var f = load();
    if (!f) return;
    var pid = f.pid, seq = buildSequence(pid);
    var i = currentIndex(pid, seq);
    var ni = (i < 0 ? 0 : i) + 1;
    if (ni < seq.length) location.href = seq[ni].url;
    else location.href = '/entry.html?pid=' + pid + '&done=1';
  }

  // 트라이얼 페이지 우측하단에 "다음 (n/10) →" 버튼 + 진행 표시
  function mountNextButton() {
    if (typeof document === 'undefined') return;
    if (!param('scenario')) return;              // 트라이얼 페이지(?scenario)에서만
    if (document.getElementById('neubie-flow-bar')) return; // 중복 방지
    var pid = param('pid');
    if (!pid || !active(pid)) return;            // 흐름 세션일 때만
    var seq = buildSequence(pid);
    var i = currentIndex(pid, seq);
    var n = (i < 0 ? 0 : i) + 1, total = seq.length;
    var last = n >= total;

    var bar = document.createElement('div');
    bar.id = 'neubie-flow-bar';
    bar.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;align-items:center;gap:10px;'
      + 'background:rgba(0,0,0,.78);color:#fff;padding:10px 14px;border-radius:10px;font:600 13px Pretendard,system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);';
    var label = document.createElement('span');
    label.textContent = '시나리오 ' + n + ' / ' + total;
    label.style.opacity = '.85';
    var btn = document.createElement('button');
    btn.textContent = last ? '테스트 종료 →' : '다음 →';
    btn.style.cssText = 'border:none;border-radius:7px;padding:8px 14px;font:inherit;cursor:pointer;background:#00BA7C;color:#fff;';
    btn.onclick = function () { next(); };
    bar.appendChild(label); bar.appendChild(btn);
    (document.body || document.documentElement).appendChild(bar);
  }

  // 트라이얼 페이지 로드 시 자동으로 "다음" 컨트롤 마운트 (흐름 세션 + ?scenario일 때만)
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountNextButton);
    else setTimeout(mountNextButton, 0);
  }

  return {
    buildSequence: buildSequence,
    start: start,
    next: next,
    active: active,
    current: function (pid) { var s = buildSequence(pid); var i = currentIndex(pid, s); return { index: i, n: i + 1, total: s.length, trial: s[i] || null }; },
    mountNextButton: mountNextButton,
    clear: clear,
    _load: load
  };
});
