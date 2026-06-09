/**
 * neubie-ab → Google Sheets sink (Apps Script 웹앱)
 *
 * 설치:
 *  1) 결과 기록용 스프레드시트 열기
 *     (https://docs.google.com/spreadsheets/d/1jKEE0kr1ToITwKe6jmFWKcn_u_AcPZHpAVp2tFsN15Q/edit)
 *  2) 확장 프로그램 → Apps Script → 아래 코드 전체 붙여넣기(기존 코드 삭제) → 저장
 *  3) 배포 → 새 배포 → 유형: 웹 앱
 *       - 실행 주체: 나(본인)
 *       - 액세스 권한: 모든 사용자(Anyone)
 *     → 배포 → 권한 승인 → "웹 앱 URL"(끝이 /exec) 복사
 *  4) 그 /exec URL을 알려주면 config.sheets.endpoint 에 넣고 배포함.
 *
 * 탭(participants/trials)과 헤더 행은 첫 POST 때 자동 생성됨 — 시트는 비워둬도 됨.
 */

var HEADERS = {
  participants: ['type','ts','test_suite','is_test','environment','participant_id','nickname','track','order','ua',
    'age_band','license','driving_1yr','ops_experience','ops_months','urban_delivery_exp','job_role','group','expert_level'],
  trials: ['type','ts','test_suite','is_test','environment','participant_id','nickname','track','ui_variant','scenario','scenario_name',
    'stimulus_video','sub_test','block_position','is_first_exposure','perception_ms','response_ms','total_ms',
    'braking_latency_ms','anomaly_ms','movement_time_ms','fitts_id','overshoot_count','mouse_path_px',
    'success','timeout','error','correct','selected',
    'top_region','top_region_dwell_ms','mouse_samples','total_clicks','region_dwell_json','click_points_json',
    'primary_metric','primary_value','primary_unit','primary_outcome','primary_pass'],
  sus: ['type','ts','test_suite','is_test','environment','participant_id','nickname','track','ui_variant','sus_score','sus_answered',
    'sus_q1','sus_q2','sus_q3','sus_q4','sus_q5','sus_q6','sus_q7','sus_q8','sus_q9','sus_q10']
};

function tabFor(type) {
  if (type === 'participant') return 'participants';
  if (type === 'sus') return 'sus';
  return 'trials';
}

// 시트 헤더 행을 HEADERS 기준으로 보정:
//  - 빈 시트면 헤더 행 생성
//  - 이미 헤더가 있고 새 컬럼(HEADERS)이 추가됐으면 헤더 행을 끝에 자동 확장
function ensureHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) { sheet.appendRow(headers); return; }
  var lastCol = sheet.getLastColumn();
  var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.length > existing.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]); // 부족한 컬럼명 채움
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // 동시 append 충돌 방지
  try {
    var data = JSON.parse(e.postData.contents);
    var name = tabFor(data.type);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = HEADERS[name];
    ensureHeaders(sheet, headers);                              // 헤더 생성/확장
    var row = headers.map(function (h) { return data[h] != null ? data[h] : ''; });
    sheet.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// 배포 확인용 (브라우저로 /exec 열면 표시)
function doGet() {
  return ContentService.createTextOutput('neubie-ab sink ok');
}
