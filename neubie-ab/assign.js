/*
 * assign.js — 결정론적 배정 로직 (뉴빌리티 원격제어 A/B 테스트)
 *
 * seed(= 마스터 시트의 1-based 행번호 N)를 받아 한 참가자의 2시안 세션 구성을
 * 결정론적으로 산출한다. 링크(neubie-ab.js)와 스케줄 생성기(generate-schedule.js)가
 * 동일하게 import 하여 "같은 seed → 항상 같은 배정"을 보장한다.
 *
 * 8행 마스터 블록 = 트랙 P 4행(A↔B1) + 트랙 Q 4행(A↔B2). 무한 반복.
 *
 *   pos   = (N - 1) % 8
 *   track = pos < 4 ? 'P' : 'Q'      // P = A↔B1, Q = A↔B2
 *   latin = pos % 4                  // 0~3 라틴스퀘어 인덱스
 *
 * 매핑: V1 = 'taxi'(돌출차량), V2 = 'bump'(단차) / sub1 = 1, sub2 = 2
 *   ※ S3-Test3(벽) 및 시나리오 4는 테스트에서 제외됨.
 *
 * UMD: Node(require) · 브라우저 전역(window.NeubieAssign) 양쪽에서 동작.
 * (ESM `import`가 필요하면 파일 하단의 export 블록 주석 참고)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.NeubieAssign = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 트랙 내 라틴스퀘어 (index = latin 0~3)
  //  order : 시안 제시 순서 ('AB' = A→B, 'BA' = B→A)
  //  aS3/bS3 : 각 시안의 S3(돌발상황) 영상  'taxi'(V1=돌출차량) | 'bump'(V2=단차)
  //  aS1/bS1 : 각 시안의 S1(수치측정) 서브   1(sub1=wifi500ms) | 2(sub2=battery17%)
  var LATIN = [
    { order: 'AB', aS3: 'taxi', bS3: 'bump', aS1: 1, bS1: 2 }, // 0
    { order: 'BA', aS3: 'bump', bS3: 'taxi', aS1: 2, bS1: 1 }, // 1
    { order: 'AB', aS3: 'bump', bS3: 'taxi', aS1: 2, bS1: 1 }, // 2
    { order: 'BA', aS3: 'taxi', bS3: 'bump', aS1: 1, bS1: 2 }  // 3
  ];

  /**
   * @param {number} N  1-based 행번호(= seed). 정수, 1 이상.
   * @returns {object}  배정 결과
   */
  function assign(N) {
    if (!Number.isInteger(N) || N < 1) {
      throw new Error('assign(N): N은 1 이상의 정수(1-based 행번호)여야 합니다. 받은 값: ' + N);
    }

    var pos = (N - 1) % 8;
    var track = pos < 4 ? 'P' : 'Q';
    var latin = pos % 4;
    var bVariant = track === 'P' ? 'B1' : 'B2';
    var L = LATIN[latin];

    var order = L.order === 'AB' ? ['control_A', bVariant] : [bVariant, 'control_A'];

    // block_position: 시안별 1 | 2 (순서효과 분석용)
    var blockPosition = {};
    blockPosition[order[0]] = 1;
    blockPosition[order[1]] = 2;

    // S3 영상: 시안별 'taxi' | 'wall' (한 참가자는 V1·V2를 하나씩만 봄)
    var s3Video = {};
    s3Video['control_A'] = L.aS3;
    s3Video[bVariant] = L.bS3;

    // S1 서브테스트: 시안별 1 | 2
    var s1Sub = {};
    s1Sub['control_A'] = L.aS1;
    s1Sub[bVariant] = L.bS1;

    return {
      seed: N,
      block: Math.floor((N - 1) / 8) + 1, // 1-based 블록 번호
      rowInBlock: pos + 1,                // 1~8
      track: track,                       // 'P' | 'Q'
      bVariant: bVariant,                 // 'B1' | 'B2'
      latin: latin,                       // 0~3
      order: order,                       // ['control_A','B1'] 등 (제시 순서)
      blockPosition: blockPosition,       // { control_A: 1|2, B1|B2: 1|2 }
      s3Video: s3Video,                   // { control_A:'taxi'|'bump', B1|B2:... }
      s1Sub: s1Sub                        // { control_A: 1|2, B1|B2: 1|2 }
    };
  }

  return { assign: assign, LATIN: LATIN };
});

/* ─ ESM 사용 시(프로토타입을 <script type="module">로 import) 아래 주석 해제 ─
   export const assign = (typeof window !== 'undefined' ? window.NeubieAssign : module.exports).assign;
   ※ 모듈 형태는 빌드 전 사용자 확인 필요(Q1). 확정되면 정식 export로 정리함.
*/
