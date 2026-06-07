/*
 * generate-schedule.js — assign.js로 운영용 마스터 시트(schedule.csv)를 펼친다.
 *
 *   node neubie-ab/generate-schedule.js [블록수=5]
 *
 * 8행 블록을 무한 반복하는 구조이므로 필요 시 블록수만 늘려 재생성하면 된다.
 * 참가자는 세션 완료 시 '상태'가 빈 다음 행의 seed를 ?pid= 로 가져간다.
 * (중도이탈 행은 상태를 비워두고 재사용)
 *
 * V1=돌출차량(taxi), V2=단차(bump) / sub1=와이파이500ms, sub2=배터리17%
 * (S3-Test3 벽 및 시나리오 4는 테스트 제외)
 */
var fs = require('fs');
var path = require('path');
var assign = require('./assign.js').assign;
var CFG = require('./config.shared.js');

// variant + seed → 참가자 진입 URL (?pid 부착)
function urlFor(variant, seed) {
  var p = CFG.links[variant].url;
  var sep = p.indexOf('?') >= 0 ? '&' : '?';
  return CFG.links.baseUrl + p + sep + 'pid=' + seed;
}
// + 시나리오 부착 (트라이얼별 진입 URL)
function trialUrl(variant, seed, scenario) {
  return urlFor(variant, seed) + '&scenario=' + scenario;
}

// within 시나리오 진행 순서 (S4 GPS이격 제외)
var WITHIN = [1, 2, 3, 5, 6];

var blocks = parseInt(process.argv[2], 10);
if (!Number.isInteger(blocks) || blocks < 1) blocks = 5;

var SUB_LABEL = { 1: 'wifi500ms', 2: 'battery17%' };

var header = [
  'seed', 'participant_id', 'block', 'row_in_block', 'track',
  '첫시안', '둘째시안', '시안1_URL', '시안2_URL',
  'A_S3영상', 'B_S3영상', 'A_S1서브', 'B_S1서브',
  '상태', '진행자', '비고'
];

var lines = [header.join(',')];

for (var N = 1; N <= 8 * blocks; N++) {
  var a = assign(N);
  var bV = a.bVariant;
  var row = [
    a.seed,
    'p' + a.seed,
    a.block,
    a.rowInBlock,
    a.track,
    a.order[0],
    a.order[1],
    urlFor(a.order[0], a.seed),
    urlFor(a.order[1], a.seed),
    a.s3Video['control_A'],
    a.s3Video[bV],
    SUB_LABEL[a.s1Sub['control_A']],
    SUB_LABEL[a.s1Sub[bV]],
    '',  // 상태 (빈칸 = 미배정; 완료 시 'done', 이탈 시 비워둠)
    '',  // 진행자
    ''   // 비고
  ];
  lines.push(row.join(','));
}

var out = path.join(__dirname, 'schedule.csv');
fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log('✓ ' + (8 * blocks) + '행(' + blocks + '블록) → ' + out);

// ── 트라이얼별 long-format: 참가자당 2시안 × 5 within = 10행, 시나리오 URL 포함 ──
var tHeader = [
  'seed', 'participant_id', 'trial_no', 'block_position',
  'ui_variant', 'scenario', 'scenario_name', 'stimulus', 'url', '상태'
];
var tLines = [tHeader.join(',')];

for (var M = 1; M <= 8 * blocks; M++) {
  var t = assign(M);
  var trialNo = 0;
  t.order.forEach(function (variant, oi) {
    var blockPos = oi + 1;
    WITHIN.forEach(function (sc) {
      trialNo++;
      var stim = '';
      if (sc === 3) stim = t.s3Video[variant];               // taxi | bump
      else if (sc === 1) stim = SUB_LABEL[t.s1Sub[variant]];  // wifi500ms | battery17%
      tLines.push([
        t.seed, 'p' + t.seed, trialNo, blockPos,
        variant, sc, CFG.scenarios[sc].name, stim,
        trialUrl(variant, t.seed, sc), ''
      ].join(','));
    });
  });
}

var outT = path.join(__dirname, 'schedule-trials.csv');
fs.writeFileSync(outT, tLines.join('\n') + '\n', 'utf8');
console.log('✓ ' + (8 * blocks * 10) + '행(트라이얼) → ' + outT);
