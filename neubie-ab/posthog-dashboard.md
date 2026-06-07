# PostHog 대시보드 설계 — `[TEST] 원격제어 A/B 사용성`

> **상태: 설계만 (미생성).** 승인 시 이 명세대로 MCP(`insight-create`+`dashboard-create`)로 생성.
> 프로젝트: **NCC** (id 141014, TZ Asia/Seoul). 헤드라인 = **A 기준선 대비 B1·B2의 Δ**.

## 공통 규약

- 모든 타일 필터: `event = 'trial_result'` AND `properties.test_suite = 'remote-control-ab'` (운영 데이터 분리).
- **이벤트 속성**(trial_result에 stamp): `ui_variant, track, scenario, stimulus_video, sub_test, block_position, is_first_exposure, total_ms, perception_ms, response_ms, braking_latency_ms, movement_time_ms, fitts_id, overshoot_count, success, timeout, error, correct, test_suite, is_test, environment`.
- **사람(person) 속성**(identify로 set): `group(expert/novice), expert_level(junior/senior), age_band, license, driving_1yr, ops_experience, ops_months, urban_delivery_exp, job_role`. → HogQL에서 `person.properties.group` 으로 접근.
- 숫자 집계는 `toFloat(properties.x)`, 시나리오 필터는 `toInt(properties.scenario)=N`.
- ⚠️ **불리언 표기 확인 필요**: 첫 실데이터에서 `success`가 `true`(bool)로 저장되는지 `'true'`(string)인지 확인 후, `=true` ↔ `='true'` 통일. 아래는 bool 가정.
- ⚠️ **한계**: PostHog는 기술통계(중앙값·비율·분포)까지. n이 작은 **짝비교 유의성검정(Wilcoxon)은 CSV export 후 별도 분석**. 본 대시보드 = 실시간 모니터링 + 효과크기 가시화.

---

## A. 진행 현황

### A1 · 완료 트라이얼 수 / 시안 (Trends 또는 SQL)
```sql
SELECT properties.ui_variant AS variant, count() AS trials
FROM events
WHERE event='trial_result' AND properties.test_suite='remote-control-ab'
GROUP BY variant ORDER BY variant
```

### A2 · 참가자 수 / 트랙
```sql
SELECT properties.track AS track, count(DISTINCT properties.participant_id) AS participants
FROM events
WHERE event='trial_result' AND properties.test_suite='remote-control-ab'
GROUP BY track ORDER BY track
```

### A3 · 데이터 품질 (T1 누락 / timeout / error)
```sql
SELECT
  count() AS total,
  countIf(properties.total_ms IS NULL) AS missing_t1,
  countIf(properties.timeout = true) AS timeouts,
  countIf(properties.error = true) AS errors
FROM events
WHERE event='trial_result' AND properties.test_suite='remote-control-ab'
```

---

## B. 시나리오별 성과 — A 대비 Δ (핵심)

### B4 · S3 비상제동 딜레이 (헤드라인) — by variant × video
```sql
SELECT properties.ui_variant AS variant, properties.stimulus_video AS video,
  count() AS n,
  median(toFloat(properties.braking_latency_ms)) AS median_ms,
  quantile(0.9)(toFloat(properties.braking_latency_ms)) AS p90_ms
FROM events
WHERE event='trial_result' AND properties.test_suite='remote-control-ab' AND toInt(properties.scenario)=3
GROUP BY variant, video ORDER BY variant, video
```

### B5 · S3 성공률
```sql
SELECT properties.ui_variant AS variant, count() AS n,
  round(100*countIf(properties.success=true)/count(), 1) AS success_pct
FROM events
WHERE event='trial_result' AND properties.test_suite='remote-control-ab' AND toInt(properties.scenario)=3
GROUP BY variant ORDER BY variant
```

### B6 · S2 신호반응 + timeout율
```sql
SELECT properties.ui_variant AS variant, count() AS n,
  median(toFloat(properties.response_ms)) AS median_ms,
  round(100*countIf(properties.timeout=true)/count(), 1) AS timeout_pct
FROM events
WHERE event='trial_result' AND properties.test_suite='remote-control-ab' AND toInt(properties.scenario)=2
GROUP BY variant ORDER BY variant
```

### B7 · S1 인지시간 + 정답률 — by variant × sub_test
```sql
SELECT properties.ui_variant AS variant, properties.sub_test AS sub, count() AS n,
  median(toFloat(properties.total_ms)) AS median_ms,
  round(100*countIf(properties.correct=true)/count(), 1) AS correct_pct
FROM events
WHERE event='trial_result' AND properties.test_suite='remote-control-ab' AND toInt(properties.scenario)=1
GROUP BY variant, sub ORDER BY variant, sub
```

### B8 · S5 정밀제어 (Fitts)
```sql
SELECT properties.ui_variant AS variant, count() AS n,
  median(toFloat(properties.movement_time_ms)) AS median_mt_ms,
  avg(toFloat(properties.overshoot_count)) AS avg_overshoot,
  avg(toFloat(properties.fitts_id)) AS avg_fitts_id
FROM events
WHERE event='trial_result' AND properties.test_suite='remote-control-ab' AND toInt(properties.scenario)=5
GROUP BY variant ORDER BY variant
```

### B9 · S6 도착처리 + 오류율(첫 노출만)
```sql
SELECT properties.ui_variant AS variant, count() AS n,
  median(toFloat(properties.response_ms)) AS median_ms,
  round(100*countIf(properties.is_first_exposure=true AND properties.error=true)
        / nullIf(countIf(properties.is_first_exposure=true), 0), 1) AS first_error_pct
FROM events
WHERE event='trial_result' AND properties.test_suite='remote-control-ab' AND toInt(properties.scenario)=6
GROUP BY variant ORDER BY variant
```

---

## C. 세그먼트 / 타당성 검증

### C10 · 숙련도별 핵심지표 (S3 예) — person.properties 사용
```sql
SELECT person.properties.group AS skill, person.properties.expert_level AS level,
  properties.ui_variant AS variant, count() AS n,
  median(toFloat(properties.braking_latency_ms)) AS median_ms
FROM events
WHERE event='trial_result' AND properties.test_suite='remote-control-ab' AND toInt(properties.scenario)=3
GROUP BY skill, level, variant ORDER BY skill, variant
```

### C11 · 순서효과 (block_position 1 vs 2)
```sql
SELECT toInt(properties.block_position) AS block_pos, properties.ui_variant AS variant,
  count() AS n, median(toFloat(properties.braking_latency_ms)) AS median_ms
FROM events
WHERE event='trial_result' AND properties.test_suite='remote-control-ab' AND toInt(properties.scenario)=3
GROUP BY block_pos, variant ORDER BY block_pos, variant
```

### C12 · 짝비교 Δ (트랙 내 동일 참가자 A vs B, S3 예)
```sql
WITH per AS (
  SELECT properties.participant_id AS pid, properties.track AS track,
    avgIf(toFloat(properties.braking_latency_ms), properties.ui_variant='control_A') AS a_ms,
    avgIf(toFloat(properties.braking_latency_ms), properties.ui_variant!='control_A') AS b_ms,
    anyIf(properties.ui_variant, properties.ui_variant!='control_A') AS b_variant
  FROM events
  WHERE event='trial_result' AND properties.test_suite='remote-control-ab' AND toInt(properties.scenario)=3
  GROUP BY pid, track
)
SELECT track, b_variant, count() AS pairs,
  median(a_ms) AS median_A, median(b_ms) AS median_B,
  median(b_ms - a_ms) AS median_delta_ms   -- 음수 = B가 더 빠름(개선)
FROM per
WHERE a_ms IS NOT NULL AND b_ms IS NOT NULL
GROUP BY track, b_variant ORDER BY track
```
> 같은 패턴을 시나리오별(metric 교체)로 복제하면 전 시나리오 짝 Δ 표 완성.
> 시간계 지표는 **Δ<0 = 개선(B가 빠름)**, 성공/정답률은 **Δ>0 = 개선**.

---

## 추가 권장 (생성 시 함께)

- **코호트** `test participants`: person `is_test = true` → 분석 범위 고정·운영 대시보드에서 제외.
- 대시보드 이름 `[TEST]` 프리픽스 + 설명에 "사용성 테스트 데이터(remote-control-ab), 운영 데이터 아님" 명시.
- 세션 리코딩 플레이리스트: `test_suite = 'remote-control-ab'` 필터 — 정성 관찰용.
- **세그먼트/순서효과(C10·C11)는 데이터가 충분히 쌓인 뒤** 추가(초기엔 n부족으로 노이즈).

## 생성 절차 (승인 시)
1. `insight-create` (HogQLQuery, 위 쿼리) × 타일 수
2. `dashboard-create` → 각 insight를 타일로 추가
3. 코호트/플레이리스트 생성
4. 첫 실데이터 1건으로 불리언 표기(`true` vs `'true'`)·scenario 타입 검증 후 쿼리 일괄 보정
