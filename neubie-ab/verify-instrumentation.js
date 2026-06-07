/*
 * verify-instrumentation.js — neubie-ab.js 성공판정/파생 로직 단위검증
 *   node neubie-ab/verify-instrumentation.js
 * (DOM 불필요한 deriveOutcome / deriveGroup 만 검증. 포인터/Fitts/영상바인딩은 브라우저 수동확인.)
 */
var assert = require('assert');
var config = require('./config.shared.js');
var AB = require('./neubie-ab.js');

AB.init({ variant: 'control_A', config: config, seed: 1, initPosthog: false });

function outcome(scenario, ev, ctx, result) {
  var sc = config.scenarios[scenario];
  return AB._deriveOutcome(sc, ev, ctx || {}, result || {});
}

// ── S2 deadline (limit 2000ms) ──────────────────────────────
(function () {
  assert.strictEqual(outcome(2, { response_ms: 1500 }).timeout, false, 'S2 1.5s는 timeout 아님');
  assert.strictEqual(outcome(2, { response_ms: 1500 }).success, true);
  assert.strictEqual(outcome(2, { response_ms: 2500 }).timeout, true, 'S2 2.5s는 timeout');
  assert.strictEqual(outcome(2, { response_ms: 2500 }).success, false);
  console.log('✓ S2 신호대기 deadline 판정 OK');
})();

// ── S3 videoWindow (taxi 3000ms / bump 2000ms) ──────────────
(function () {
  assert.strictEqual(outcome(3, { braking_latency_ms: 2000 }, { stimulus_video: 'taxi' }).success, true, 'taxi 2s ≤ 3s');
  assert.strictEqual(outcome(3, { braking_latency_ms: 3500 }, { stimulus_video: 'taxi' }).success, false, 'taxi 3.5s > 3s');
  assert.strictEqual(outcome(3, { braking_latency_ms: 1500 }, { stimulus_video: 'bump' }).success, true, 'bump 1.5s ≤ 2s');
  assert.strictEqual(outcome(3, { braking_latency_ms: 2500 }, { stimulus_video: 'bump' }).success, false, 'bump 2.5s > 2s');
  console.log('✓ S3 돌발상황 videoWindow 판정 OK (taxi 3s / bump 2s)');
})();

// ── S6 clickWindow (0~2000ms) ───────────────────────────────
(function () {
  assert.strictEqual(outcome(6, { response_ms: 1200 }).error, false, 'S6 1.2s 정상');
  assert.strictEqual(outcome(6, { response_ms: 1200 }).success, true);
  assert.strictEqual(outcome(6, { response_ms: 2300 }).error, true, 'S6 2.3s 오류(창 초과)');
  console.log('✓ S6 도착처리 clickWindow 판정 OK');
})();

// ── S1 correctness ──────────────────────────────────────────
(function () {
  assert.strictEqual(outcome(1, {}, {}, { correct: true }).success, true, 'S1 정판→success');
  assert.strictEqual(outcome(1, {}, {}, { correct: false }).success, false, 'S1 오판→fail');
  console.log('✓ S1 수치측정 correctness 판정 OK');
})();

// ── group/expert_level 파생 (재확인) ────────────────────────
(function () {
  assert.deepStrictEqual(AB._deriveGroup({ ops_experience: 'Y', ops_months: '3mo' }), { group: 'expert', expert_level: 'junior' });
  assert.deepStrictEqual(AB._deriveGroup({ ops_experience: 'Y', ops_months: '1yr+' }), { group: 'expert', expert_level: 'senior' });
  assert.deepStrictEqual(AB._deriveGroup({ ops_experience: 'N', ops_months: '1yr+' }), { group: 'novice', expert_level: null });
  console.log('✓ group/expert_level 파생 OK');
})();

console.log('\n🟢 neubie-ab.js 계측 판정 검증 전부 통과');
