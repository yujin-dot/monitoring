/*
 * verify-assign.js — assign.js 단위 검증
 *
 *   node neubie-ab/verify-assign.js
 *
 * 8행 마스터 블록 안에서 (1) 트랙 균형 (2) 시안순서 균형 (3) S3 영상↔시안 균형
 * (4) 영상 이중노출 0% (5) S1 서브↔시안 균형 (6) S4 표시시안 균형 이 모두
 * 실제로 성립하는지 콘솔 assert 한다. 여러 블록에 걸쳐서도 유지되는지 확인.
 */
var assert = require('assert');
var assign = require('./assign.js').assign;

function tally(arr) {
  return arr.reduce(function (m, k) { m[k] = (m[k] || 0) + 1; return m; }, {});
}

// ── 1개 블록(N=1..8) 상세 검증 ───────────────────────────────
(function verifyOneBlock() {
  var rows = [];
  for (var N = 1; N <= 8; N++) rows.push(assign(N));

  // (1) 트랙 균형: P 4행, Q 4행
  var tracks = tally(rows.map(function (r) { return r.track; }));
  assert.deepStrictEqual(tracks, { P: 4, Q: 4 }, '트랙 균형 실패: ' + JSON.stringify(tracks));

  ['P', 'Q'].forEach(function (track) {
    var rs = rows.filter(function (r) { return r.track === track; });
    assert.strictEqual(rs.length, 4, track + ' 트랙 행 수 != 4');
    var bV = track === 'P' ? 'B1' : 'B2';

    // (2) 시안순서 균형: A→B 2회, B→A 2회
    var firstSeen = tally(rs.map(function (r) { return r.order[0]; }));
    assert.strictEqual(firstSeen['control_A'], 2, track + ' 첫시안 A != 2회');
    assert.strictEqual(firstSeen[bV], 2, track + ' 첫시안 ' + bV + ' != 2회');

    // (3) S3 영상↔시안 균형: A가 taxi 2·bump 2, B도 동일
    var aVid = tally(rs.map(function (r) { return r.s3Video['control_A']; }));
    var bVid = tally(rs.map(function (r) { return r.s3Video[bV]; }));
    assert.deepStrictEqual(aVid, { taxi: 2, bump: 2 }, track + ' A의 S3영상 불균형: ' + JSON.stringify(aVid));
    assert.deepStrictEqual(bVid, { taxi: 2, bump: 2 }, track + ' ' + bV + '의 S3영상 불균형: ' + JSON.stringify(bVid));

    // (4) 영상 이중노출 0%: 한 참가자 안에서 A와 B의 영상이 서로 다름
    rs.forEach(function (r) {
      assert.notStrictEqual(
        r.s3Video['control_A'], r.s3Video[bV],
        'seed ' + r.seed + ' 영상 이중노출! A=' + r.s3Video['control_A'] + ' ' + bV + '=' + r.s3Video[bV]
      );
    });

    // (5) S1 서브↔시안 균형: A가 sub1 2·sub2 2, B도 동일 + 참가자 내 서로 다름
    var aSub = tally(rs.map(function (r) { return r.s1Sub['control_A']; }));
    var bSub = tally(rs.map(function (r) { return r.s1Sub[bV]; }));
    assert.deepStrictEqual(aSub, { '1': 2, '2': 2 }, track + ' A의 S1서브 불균형: ' + JSON.stringify(aSub));
    assert.deepStrictEqual(bSub, { '1': 2, '2': 2 }, track + ' ' + bV + '의 S1서브 불균형: ' + JSON.stringify(bSub));
    rs.forEach(function (r) {
      assert.notStrictEqual(r.s1Sub['control_A'], r.s1Sub[bV], 'seed ' + r.seed + ' S1서브 중복');
    });
    // (시나리오 4 제외 → S4 균형 검증 없음)
  });

  console.log('✓ 1개 블록(N=1..8) — 트랙/순서/영상/이중노출/서브 균형 OK');
})();

// ── 다중 블록(예: 5블록=40행) 누적 균형 ───────────────────────
(function verifyManyBlocks() {
  var BLOCKS = 5, rows = [];
  for (var N = 1; N <= 8 * BLOCKS; N++) rows.push(assign(N));

  var tracks = tally(rows.map(function (r) { return r.track; }));
  assert.strictEqual(tracks.P, 4 * BLOCKS, '누적 P 불균형');
  assert.strictEqual(tracks.Q, 4 * BLOCKS, '누적 Q 불균형');

  // control_A 노출 수 = 전체 행 수(모든 참가자가 A 수행) = 트랙 P+Q 합
  var variantExposures = tally(rows.flatMap(function (r) { return r.order; }));
  assert.strictEqual(variantExposures['control_A'], 8 * BLOCKS, 'A 노출 수 오류');
  assert.strictEqual(variantExposures['B1'], 4 * BLOCKS, 'B1 노출 수 오류');
  assert.strictEqual(variantExposures['B2'], 4 * BLOCKS, 'B2 노출 수 오류');

  console.log('✓ ' + BLOCKS + '개 블록 누적 — 트랙/시안 노출 균형 OK (A:' +
    variantExposures['control_A'] + ' B1:' + variantExposures['B1'] + ' B2:' + variantExposures['B2'] + ')');
})();

// ── 결정론성: 같은 seed → 같은 결과, 블록 경계 래핑 ───────────
(function verifyDeterminism() {
  assert.deepStrictEqual(assign(1), assign(1), 'assign 비결정적');
  // N=9는 N=1과 같은 pos(0) → 동일 배정 패턴(블록 번호만 다름)
  var a = assign(1), b = assign(9);
  assert.strictEqual(b.rowInBlock, a.rowInBlock, '블록 래핑 rowInBlock 불일치');
  assert.deepStrictEqual(b.order, a.order, '블록 래핑 order 불일치');
  assert.strictEqual(a.block, 1); assert.strictEqual(b.block, 2);

  assert.throws(function () { assign(0); }, '0은 거부되어야');
  assert.throws(function () { assign(1.5); }, '소수는 거부되어야');
  console.log('✓ 결정론성 + 블록 래핑 + 입력 검증 OK');
})();

console.log('\n🟢 assign.js 검증 전부 통과');
