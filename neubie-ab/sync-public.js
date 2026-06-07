/*
 * sync-public.js — 배포 디렉터리(public/)를 계측 적용 상태로 동기화한다. 멱등.
 *
 *   node neubie-ab/sync-public.js
 *
 * 하는 일:
 *  1) 런타임 모듈 → public/neubie-ab/  (assign/config.shared/neubie-ab.js)
 *  2) remote-control-A.html → public/remote-control-A.html  (A 소스 복사본)
 *  3) public/index.html(B) </body> 직전에 b-instrumentation.html 주입 (이미 있으면 skip)
 *
 * ⚠️ B(index.html)를 다시 export 하면 인라인 계측이 사라진다. export 후 이 스크립트를 돌리면 재주입된다.
 */
var fs = require('fs');
var path = require('path');
var DIR = __dirname;                       // neubie-ab/
var ROOT = path.join(DIR, '..');           // repo root
var PUB = path.join(ROOT, 'public');
var START = '<!-- ── A/B 테스트 계측 (neubie-ab)'; // 주입 블록 시작 마커(교체 기준)

function cp(src, dst) { fs.copyFileSync(src, dst); console.log('  cp', path.relative(ROOT, src), '→', path.relative(ROOT, dst)); }

// 1) 런타임 모듈
fs.mkdirSync(path.join(PUB, 'neubie-ab'), { recursive: true });
['assign.js', 'config.shared.js', 'neubie-ab.js'].forEach(function (f) {
  cp(path.join(DIR, f), path.join(PUB, 'neubie-ab', f));
});

// 2) A 페이지
var aSrc = path.join(ROOT, 'remote-control-A.html');
if (fs.existsSync(aSrc)) cp(aSrc, path.join(PUB, 'remote-control-A.html'));
else console.log('  (skip) remote-control-A.html 없음');

// 3) B 페이지 계측 주입 (멱등)
var bPath = path.join(PUB, 'index.html');
if (!fs.existsSync(bPath)) {
  console.log('  (skip) public/index.html 없음');
} else {
  var html = fs.readFileSync(bPath, 'utf8');
  var inject = fs.readFileSync(path.join(DIR, 'b-instrumentation.html'), 'utf8');
  var replaced = false;
  // 기존 주입 블록이 있으면 제거(START~</body>) 후 최신 블록으로 교체
  var sidx = html.indexOf(START);
  if (sidx >= 0) {
    var bend = html.indexOf('</body>', sidx);
    if (bend >= 0) { html = html.slice(0, sidx) + html.slice(bend); replaced = true; }
  }
  var idx = html.lastIndexOf('</body>');
  if (idx < 0) { console.error('  B: </body> 없음 — 주입 실패'); process.exit(1); }
  fs.writeFileSync(bPath, html.slice(0, idx) + inject + '\n' + html.slice(idx), 'utf8');
  console.log('  B: 계측 ' + (replaced ? '갱신' : '주입') + ' 완료 (</body> 직전)');
}

console.log('✓ sync-public 완료');
