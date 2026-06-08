# 결과 기록 → Google Sheets 계획

> 상태: **계획안(미구현)**. 방식 확정 후 구현. 정적 사이트(Vercel, 백엔드 없음) 기준.

## 목표
참가자 테스트 결과 전반을 구글 스프레드시트에 자동 기록:
참가자 정보 · 트랙/시안 · 시나리오별 성공/실패 · 진행시간(반응시간) · 마우스 지표(경로·오버슈팅·Fitts) 등.

## 제약 & 방식 선택
- 백엔드가 없어 클라이언트가 Google Sheets API를 직접 쓰면 OAuth/서비스계정 키가 노출됨 → 불가.
- **표준 해법(추천 A안): Google Apps Script 웹앱**. 시트에 바인딩된 스크립트를 `doPost`로 배포 → 공개 append 엔드포인트. 브라우저는 POST만(쓰기 전용).

| 방식 | 설명 | 평가 |
|---|---|---|
| **A. Apps Script 웹앱 (추천)** | 브라우저 → POST → Apps Script → 시트 append | 실시간·무백엔드·간단. 엔드포인트 URL만 관리 |
| B. PostHog → 시트 | PostHog에 쌓고 CSV export 또는 통합으로 시트 동기화 | 이미 PostHog 있음. 실시간 아님·수작업/통합 필요 |
| C. 직접 Sheets API | 서비스계정 프록시(=백엔드) | 정적 사이트엔 과함, 비권장 |

**권장: A안 + PostHog 병행 유지.**
- **Sheet** = 사람이 보는 표 기록(운영/분석용, 시안·성공·시간·마우스지표).
- **PostHog** = 세션 리코딩(=마우스 *재생*)·분석 대시보드. (raw 마우스 궤적은 시트에 부적합 → 재생은 PostHog가 담당)

## 데이터 흐름 (A안)
```
entry.html(수집정보) ──identify──┐
trial 페이지(markResponse) ──────┤→  POST(JSON)  →  Apps Script doPost  →  Google Sheet
                                 │                    (payload.type로 탭 분기)   ├ participants 탭
neubie-ab.js (sheets sink)  ─────┘                                              └ trials 탭
```
- 전송은 `navigator.sendBeacon` 우선(페이지 이탈에도 안전), 실패 시 `fetch(..., {mode:'no-cors'})` 폴백.
- 모든 행에 `test_suite='remote-control-ab'`, `is_test=true` 포함(PostHog와 동일 분리표식).

## 시트 구조
### 탭1 `participants` (참가자당 1행)
`ts, participant_id, age_band, license, driving_1yr, ops_experience, ops_months, urban_delivery_exp, job_role, group, expert_level, track, order, ua, test_suite`

### 탭2 `trials` (트라이얼당 1행 = 참가자×시나리오)
`ts, participant_id, track, ui_variant, scenario, scenario_name, stimulus_video, sub_test, block_position, is_first_exposure, perception_ms, response_ms, total_ms, braking_latency_ms, anomaly_ms, movement_time_ms, fitts_id, overshoot_count, mouse_path_px, success, timeout, error, correct, test_suite`

### (옵션) 탭3 `mouse_paths` — 원하면
`ts, participant_id, scenario, ui_variant, samples_json` (간헐 샘플링된 [t,x,y] 좌표; 셀 1개에 JSON)
- 전체 재생이 필요하면 PostHog 세션 리코딩 권장. 시트엔 “샘플 궤적”만 옵션 저장.

## 마우스 움직임 처리
- **집계 지표**(이미 neubie-ab가 계산): 경로길이(px)·오버슈팅 횟수·Fitts ID·이동시간 → `trials` 탭 컬럼.
- **전체 궤적**: (1) 기본은 PostHog 세션 리코딩으로 재생, (2) 시트에도 원하면 `mouse_paths` 탭에 ~20–50ms 간격 샘플 좌표 JSON.
  → 셋 중 무엇까지 시트에 넣을지 결정 필요(아래 “결정사항”).

## 구현 단계 (확정 후)
1. **Google Sheet 생성** (탭 3개: participants/trials/mouse_paths) — 내가 헤더 구조 제공.
2. **Apps Script 작성·배포**: `doPost(e)`가 `JSON.parse(e.postData.contents)`의 `type`(participant|trial|mouse)로 탭 선택 → `appendRow`. 웹앱 배포(실행 주체=나, 액세스=전체) → **엔드포인트 URL** 획득.
3. **config.shared.js**: `sheets: { endpoint: '<APPS_SCRIPT_URL>', enabled: true }`.
4. **neubie-ab.js**: sheets sink 추가
   - `identify()` → `sheetSend('participant', props)`
   - `_capture('trial_result', ev)` → `sheetSend('trial', ev)` (PostHog와 동시 전송)
   - `sheetSend`는 sendBeacon/fetch(no-cors), 실패해도 테스트 진행에 지장 없게(파이어앤포겟).
5. (옵션) 마우스 샘플 궤적 수집 추가(trackPointer 확장).
6. **검증**: 한 참가자 흐름 1회 → 시트에 participants 1행 + trials 10행 들어오는지 확인.

## Apps Script 스켈레톤 (배포용 초안)
```javascript
function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = JSON.parse(e.postData.contents);
  var tab = { participant:'participants', trial:'trials', mouse:'mouse_paths' }[data.type] || 'trials';
  var sheet = ss.getSheetByName(tab);
  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h){ return data[h] != null ? data[h] : ''; });
  sheet.appendRow(row);
  return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
}
```
(헤더 행을 기준으로 매핑하므로, 시트 헤더만 맞춰두면 컬럼 추가/순서 변경에 강함.)

## 결정사항 (이걸 정해주면 구현 착수)
1. **방식**: A안(Apps Script 웹앱) 진행? (추천)
2. **PostHog 병행**: 유지(세션 리코딩=마우스 재생용)? (추천 유지)
3. **마우스 시트 기록 범위**: ⓐ 집계 지표만 / ⓑ 집계 + 샘플 궤적(mouse_paths 탭) / ⓒ 집계 + 전체 PostHog 재생
4. **시트 준비**: 내가 헤더 구조를 줄 테니 빈 시트 1개 생성 + Apps Script 배포 URL 전달 (또는 배포 절차를 더 상세히 안내할지)

## 개인정보/주의
- 시트는 사실상 공개 append URL이라 **민감정보 금지**(이름/연락처 등 안 받음 — 현재 수집정보는 비식별 속성뿐이라 OK).
- 행마다 test_suite/is_test 표식 → 운영 데이터와 구분.
