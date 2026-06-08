# 통합 계약 (시나리오 세부 디자인 작업자용 핸드오프)

이 문서 하나면 **다른 Claude Code 세션/방**에서 각 URL의 시나리오 세부 디자인을 이어서 할 수 있다.
같은 레포(`~/Projects/monitoring`)이므로 파일은 공유된다. (동시에 같은 파일 양쪽 편집만 피할 것.)

## 역할 경계

| 공통 레이어 (여기서 관리, 건드리지 말 것) | 시나리오 방 (여기서 작업) |
|---|---|
| `neubie-ab/{config.shared,assign,neubie-ab}.js` | 각 화면의 시나리오별 **UI 요소** ([횡단하기]·[주행 불가능] 버튼, 0.2 슬라이더, 비정상 상태 카드 등) |
| `schedule*.csv`, `posthog-dashboard.md` | 그 UI 요소에 **계측 훅 연결**(아래 패턴) |
| `sync-public.js`, `b-instrumentation.html` | 레이아웃/스타일/인터랙션 세부 |

화면은 계측 모듈을 **호출만** 한다. 모듈 내부(집계·전송·배정)는 공통 레이어가 책임진다.

## 파일이 어디에 있나 (중요)

- **A 화면 소스** = 레포 루트 `remote-control-A.html` → 편집 후 `public/`로 복사 필요.
- **B 화면 소스** = `public/index.html` (TOBE, B1·B2 공용, `?layout`으로 분기). **재export하면 계측 주입이 사라짐.**
- 배포 루트 = `public/`. 레포 루트 밖 파일은 라이브에서 404.

### 작업 후 항상 ① 동기화 ② 배포
```
node neubie-ab/sync-public.js     # 모듈→public, A→public, B에 계측 블록 주입/교체(멱등)
git add -A && git commit -m "..." && git push origin main   # Vercel 자동 배포
```
- B(index.html)를 새로 export했다면 위 sync가 계측을 **재주입**한다(반드시 실행).
- 계측 블록은 `<!-- NEUBIE-AB:BEGIN -->`~`<!-- NEUBIE-AB:END -->` sentinel로 감싸 교체된다. 이 사이는 손대지 말 것.

## URL 파라미터

- `?pid=<N>` — 참가자(배정 seed). `schedule-trials.csv`의 완성 URL 사용.
- `?layout=vertical|horizontal` — B1 | B2 (B 화면만).
- `?scenario=<1|2|3|5|6>` — 어떤 시나리오를 띄울지. 없으면 `config.defaultVideo` 기본 피드.
- 예: `/remote-control-A.html?pid=1&scenario=3` · `/?layout=vertical&pid=2&scenario=3`

## 계측 모듈 API (`window.NeubieAB`)

`init`, `identify`, `startTrial(n)`, `markStimulus()`, `markCognition()`, `markResponse(result)`,
`bindVideo(videoEl, n)`, `loadScenarioVideo(videoEl, n)`, `trackClickTarget(el)`, `trackSlider(el, opts)`.

`init`/영상 로드/엔진정지는 **이미 두 화면 부트스트랩에 연결돼 있다**(A=`remote-control-A.html` 끝, B=`b-instrumentation.html`).
시나리오 방은 보통 **응답(T3) 훅만** 추가하면 된다.

## 시나리오별 연결 패턴 (응답 훅)

`startTrial`+영상은 부트스트랩이 `?scenario`로 자동 호출. 각 시나리오의 **액션 UI가 생기면** 아래를 연결:

```js
// S1 수치측정 — 비정상 상태 카드 렌더 시 markStimulus, [주행 불가능] 클릭
NeubieAB.markStimulus();                                  // 카드 렌더 직후
disableBtn.onclick = () => NeubieAB.markResponse({ correct: true /*정판*/ });

// S2 신호대기 — 영상 4초 자동 markStimulus(bindVideo). [횡단하기] 클릭
crossBtn.onclick = () => NeubieAB.markResponse({});       // timeout은 config(2초)로 자동 판정

// S3 돌발상황 — 영상 트리거 자동 markStimulus. [사이드브레이크 ON]
NeubieAB.trackClickTarget(brakeBtn);
brakeBtn.onclick = () => NeubieAB.markResponse({});       // success는 영상 성공창으로 자동 판정

// S5 정밀제어 — 팝업 렌더 시 markStimulus. 0.2 슬라이더
NeubieAB.markStimulus();
NeubieAB.trackSlider(volumeSlider);                       // target 0.2 ±0.02 (config)
volumeSlider.addEventListener('mouseup', () => NeubieAB.markResponse({}));

// S6 도착처리 — 영상 2초 자동 markStimulus. [도착 처리] 클릭
NeubieAB.trackClickTarget(arriveBtn);
arriveBtn.onclick = () => NeubieAB.markResponse({});
```

- 시간(t1/t2/t3)·성공/timeout/error·오버슈팅·Fitts는 모듈이 자동 집계해 `trial_result` 1건으로 PostHog 전송.
- 성공기준 임계값(제한시간·성공창·Fitts 목표)은 전부 `config.shared.js`에 있음 — 화면 코드에 숫자 박지 말 것.

## 자세한 규약
- 전체 설계/필드/시나리오 스펙: `README.md`
- PostHog 대시보드(미생성): `posthog-dashboard.md`
