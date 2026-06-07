# neubie-ab — 원격제어 UI A/B 테스트 계측

로봇 원격관제 UI **A/B 사용성 테스트**용 계측 시스템. 프로토타입 화면 3개(`control_A` / `B1` / `B2`)는
별도 정적 HTML이고, 이 폴더는 **공유 config + 결정론적 배정 + 계측 모듈 + 운영 시트**만 담당한다.

## 파일

| 파일 | 역할 |
|---|---|
| `assign.js` | `seed`(=마스터 행번호 N) → `{track, order, S3영상, S1서브}` 결정론적 배정. UMD. |
| `verify-assign.js` | 배정 균형 단위검증 — `node neubie-ab/verify-assign.js` |
| `verify-instrumentation.js` | 성공판정/파생 단위검증 — `node neubie-ab/verify-instrumentation.js` |
| `config.shared.js` | 영상·시나리오 트리거·성공임계값·로봇수치·group규칙. 수치 채워짐, **PostHog 키·영상 src만 TODO.** |
| `neubie-ab.js` | 계측 모듈 `window.NeubieAB`. T1 마킹·t2/t3 델타·오버슈팅·Fitts·성공판정·`trial_result` 전송. |
| `generate-schedule.js` | `node neubie-ab/generate-schedule.js [블록수]` → `schedule.csv` |
| `schedule.csv` | 운영용 마스터 시트(8행 블록 무한 반복) |

## 배정 규칙 (확정)

- **8행 블록** = 트랙 P(A↔B1) 4행 + 트랙 Q(A↔B2) 4행, 무한 반복.
- 한 참가자는 V1(taxi=돌출차량)·V2(bump=단차)를 **하나씩만** 봄 → 영상 이중노출 0%.
- 블록마다 트랙/시안순서/영상↔시안/S1서브 **완전 균형** (verify로 보증).
- **S1 서브 2개:** sub1=`와이파이500ms`, sub2=`배터리17%` (Pitch/Roll = S1-Test3, 미사용).
- **트라이얼 10개** = within 5개(S1·S2·S3·S5·S6) × 2시안. (시나리오 4 GPS이격 및 S3-Test3 벽은 제외)

## 실제 링크 구조 (배포)

| variant | 링크 | 비고 |
|---|---|---|
| `control_A` | `/remote-control-A.html` | 별도 파일(AS-IS) |
| `B1` | `/?layout=vertical` | TOBE Option B (layout-b) |
| `B2` | `/?layout=horizontal` | TOBE Option A |

B1·B2는 **같은 파일**(`public/index.html`)이 `?layout`으로 분기 → `init()`이 `?layout`을 읽어 자동 판별.
base: `https://monitoring-nine-rho.vercel.app` (config.links).

### ⚠️ 배포 시 모듈 위치

배포 루트 = `public/` (레포 루트 밖 파일은 404). 배포 대상은 모두 `public/` 아래 복사본.

**모든 동기화는 한 명령으로 (멱등):**
```
node neubie-ab/sync-public.js
```
→ ① 모듈 → `public/neubie-ab/` ② `remote-control-A.html` → `public/` ③ B(`public/index.html`) `</body>` 직전에 `b-instrumentation.html` 주입(이미 있으면 skip).

> ⚠️ **B(index.html)를 다시 export 하면 인라인 계측이 사라진다.** export 후 위 스크립트를 다시 돌리면 재주입된다. (B 계측 원본 = `b-instrumentation.html`)

## 현재 배선 상태

- ✅ **부트스트랩** (A·B `</body>` 직전): 모듈 로드 + `init` + posthog + identify 자리.
- ✅ **영상 적용 (`?scenario=N` 구동)**:
  - **A**: 6분할 카메라 → **단일 `<video id="cam-video">`** 로 통일. `?scenario=N` 읽어 `loadScenarioVideo`+`bindVideo`+`startTrial`.
  - **B**: `?scenario=N` 일 때 **기존 12스텝 여정 엔진 정지**(`state.paused/autoAdvance=false`) + 테스트 영상으로 교체. 파라미터 없으면 기존 데모 그대로(비파괴적).
  - 운영 URL 예: `/remote-control-A.html?pid=1&scenario=3` · `/?layout=vertical&pid=2&scenario=3`
  - S3는 배정된 taxi/bump, 그 외는 `config.scenarios[n].video`. video-trigger(S2·S3·S6)는 자동 `markStimulus`.
  - **B 레거시 여정 UI 숨김**(테스트 모드): `#scenario-panel`(미션 시퀀스 카드)·`#left-alert-toast`·`#cam-alert` → `display:none`.
- ⬜ **응답(T3) 훅 대기**: [횡단하기](S2)·[주행 불가능](S1) 버튼, 0.2 드래그 슬라이더(S5) 등 액션 UI 미구현 → `markResponse` 연결 대기.

### 운영 시트
- `schedule.csv` — 참가자당 1행(배정·시안 URL).
- `schedule-trials.csv` — **트라이얼당 1행**(참가자 × 2시안 × 5 within = 10행). 시나리오별 완성 URL(`&scenario=N`) 포함 → 진행자가 위→아래로 진행.

### 영상 (Chrome 대응)
모두 `.mp4`(H.264). `.mov` → `.mp4` 변환 완료: `scenario2`(신호), `scenario3-2`(단차). S3: taxi=`scenario3-1.mp4`, bump=`scenario3-2.mp4`.

## 링크 통합 방법

두 파일에 동일 스크립트를 넣고, **A 페이지만 variant 명시**(B는 자동):

```html
<script src="/neubie-ab/assign.js"></script>
<script src="/neubie-ab/config.shared.js"></script>
<script src="/neubie-ab/neubie-ab.js"></script>
<script src="https://us-assets.i.posthog.com/static/array.js"></script>
<script>
  // remote-control-A.html → 'control_A' 명시
  // public/index.html(B)  → 생략하면 ?layout=vertical|horizontal 로 자동 B1/B2
  NeubieAB.init({ variant: 'control_A' }); // A 페이지. B 페이지는 NeubieAB.init();

  // 참가자 식별(세션 시작, 3개 링크 동일 seed → 동일 id)
  NeubieAB.identify({
    age_band: '30s', license: 'Y', driving_1yr: 'Y',
    ops_experience: 'Y', ops_months: '6mo-1yr', urban_delivery_exp: 'N',
    job_role: 'OP'          // group/expert_level은 자동 파생
  });
</script>
```

참가자는 `?pid=<N>` 으로 진입한다 (N = `schedule.csv`의 빈 다음 행 seed). B 링크는 `?layout=...&pid=<N>`.
3개 링크가 같은 seed를 받으면 `participant_id = p<N>` 로 짝비교가 묶인다.
`schedule.csv`의 `시안1_URL`·`시안2_URL` 에 참가자가 열 완성된 URL이 들어있다.

### 시나리오별 계측 호출

```js
// S3 돌발차량 — 영상시간 트리거 자동 마킹
NeubieAB.startTrial(3);
NeubieAB.bindVideo(document.querySelector('#cam'), 3);
NeubieAB.trackClickTarget(document.querySelector('#brakeBtn'));
brakeBtn.onclick = () => NeubieAB.markResponse({ success: true });

// S1 수치측정 — 비정상 상태 카드를 그릴 때 직접 마킹
NeubieAB.startTrial(1);
renderAbnormalCard();  NeubieAB.markStimulus();
disableBtn.onclick = () => NeubieAB.markResponse({ correct: true });

// S5 정밀제어 — 슬라이더(Fitts)
NeubieAB.startTrial(5);  NeubieAB.markStimulus();
NeubieAB.trackSlider(document.querySelector('#volume')); // target 0.2 ±0.02
volume.addEventListener('mouseup', () => NeubieAB.markResponse({}));
```

- `markStimulus()` = T1, `markCognition()` = T2(선택), `markResponse()` = T3 + 전송.
- 반응시간은 `performance.now()` 델타로만 산출(네트워크 지터 영향 0).
- raw mousemove는 전송하지 않음 — 경로/오버슈팅/Fitts만 집계. 재생은 세션 리코딩.

## `trial_result` 이벤트 속성

`participant_id, track, ui_variant, scenario, stimulus_video, sub_test, block_position,
is_first_exposure, perception_ms, response_ms, total_ms, braking_latency_ms, anomaly_ms,
movement_time_ms, fitts_id, overshoot_count, success, timeout, error, correct`
(해당 시나리오에 의미 있는 필드만 채워짐. S6 `overshoot_count`/`error`는 첫 노출만.)

## 채워진 값 (스프레드시트 2026-06-08)

- 영상 트리거/성공창: S2 점등 4초·제한 2초 / S3 taxi 6→9초·bump 4→6초 / S6 알림 2초·클릭창 2~4초.
- 로봇 상태 수치: `robotStateDefault` + 시나리오·서브별 `state` override.
- ⚠️ S3 "6:00/4:00/3:00"은 **초**로 해석함(S2 4초·S6 2초와 동일 단위). 분:초였다면 알려주세요.
- ⚠️ S2 `state` Pitch12°/Roll6.8°는 시트값 그대로 — S1-Test3와 동일해 의도 확인 권장.

## PostHog & 테스트 데이터 분리

- HTML 두 화면이 **공식 스니펫으로 self-init** (key `phc_gJCAuVD…`, host `us`, `person_profiles: identified_only`).
- 모듈이 **모든 이벤트/사람/세션에 `test_suite='remote-control-ab'`**(+`is_test:true`, `environment:'usability-test'`)를 붙임
  (`posthog.register` + `trial_result`·`identify` props + 세션리코딩 ON). 단일 프로젝트의 기존 운영 데이터와 섞이지 않게 분리.
- **PostHog에서 분석 시 반드시 `test_suite = 'remote-control-ab'` 필터/코호트로 한정.** 대시보드 이름도 `[TEST]` 프리픽스 권장.

## config 완료 ✅

`config.shared.js` TODO 0건. S3 영상: taxi=`/scenario-videos/scenario3-1.mp4`, bump=`/scenario-videos/scenario3-2.mov`.
(⚠️ bump는 `.mov` — Safari는 OK, Chrome은 코덱에 따라 재생 안 될 수 있음. 테스트 브라우저에서 한 번 확인 권장.)

## 남은 작업

- **시나리오 훅 연결** — [횡단하기](S2)·[주행 불가능](S1) 버튼, S3 영상 재생+[사이드브레이크 ON], 0.2 드래그 슬라이더(S5), 도착 알림(S6) 등 화면 기능 구현 후 `startTrial→(bindVideo/markStimulus)→markResponse` 연결.
