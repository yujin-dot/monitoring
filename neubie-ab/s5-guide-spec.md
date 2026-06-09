# S5 정밀제어 — 가이드 인터랙션 명세 (EV/엘리베이터)

> 시나리오 5에 "사용자 가이드" 인터랙션 추가. 화면(A/B1/B2) 구현은 시나리오 방 영역.
> 계측/흐름 연결점은 공통 레이어(neubie-ab)와 맞물리므로 아래 훅을 그대로 쓰면 됨.
> 영상(scenario5.mp4)은 새 가이드 영상으로 이미 교체됨(A/B 공통).

## 인터랙션 순서
1. **시작 시 정지**: S5 진입(시작하기) → cam-video **일시정지** + 미니맵 이동/속도 등 **정지**(state.paused=true, speed 0). 영상은 호출 전까지 멈춤.
2. **EV(엘리베이터) 버튼**을 미니맵 **좌측 하단**에 추가.
   - A: Figma `46444-48467` / B1: `46444-52299` / B2: `46444-52223`
3. **초록 툴팁(Primary-800)** 으로 "EV 버튼을 누르세요" 지시(테스트 안내용). **버튼 클릭 시 툴팁 사라짐.**
4. EV 클릭 → **엘리베이터 설정 네비게이션 드로워** 오픈.
   - A: `46444-49363` (우측 패널을 **덮는** 드로워)
   - B1·B2: `46444-53315` (로봇설정 드로워처럼 **레이아웃 영역을 차지**하는 방식)
5. **툴팁으로 "호출 버튼을 누르세요"** 유도.
6. 호출 클릭 → ① 멈췄던 **cam-video 재생** + 미니맵/속도 **재개**, ② 엘리베이터 설정 정책대로 동작(`46444-54287`).
7. 호출 클릭 **3초 뒤** "음량 볼륨을 0.2로 낮춰주세요" 가이드 제시.

## 계측/흐름 연결 (neubie-ab 훅) — 중요
S5는 정밀제어(Fitts) 트라이얼. 측정 = 음량 슬라이더를 0.2에 맞추는 동작.
- 흐름 진입 시 NeubieFlow가 S5 설명 오버레이("안내에 따라 로봇을 조작해주세요")를 띄우고 [시작하기] → setupScenario(5) 호출. **여기서 1번(정지) 셋업.**
- **7번 가이드("음량 0.2")가 뜨는 순간** = S5 자극(T1):
  ```js
  NeubieAB.markStimulus();                 // 가이드 표시 시점 = T1
  NeubieAB.trackSlider(volumeSliderEl);    // config.scenarios[5].success: target 0.2, tol 0.02
  volumeSliderEl.addEventListener('mouseup', function(){
    NeubieAB.markResponse({});             // settle 여부로 success 자동판정 (movement_time/fitts_id/overshoot)
    NeubieFlow.complete({});               // 완료 오버레이 → 다음
  });
  ```
- EV/호출/드로워는 가이드 진행용 UI라 계측 이벤트는 아님(원하면 보조 이벤트로 capture 가능).

## 스타일 토큰
- 초록 툴팁: **Primary-800**(디자인 시스템 다크 그린). 클릭 시 dismiss.
- 기존 B 주입 CSS(b-instrumentation)와 충돌 없게, A/B 각 소스에 컴포넌트 추가.

## 레이아웃별 주의
- A: 우측 패널 덮는 드로워(absolute overlay over .panel).
- B(layout-b/기본): 로봇설정 드로워와 동일 메커니즘(레이아웃 영역 차지). B는 재export 시 사라지므로, 영구화하려면 b-instrumentation 주입 또는 B 소스에 반영 후 `sync-public.js`.

## 남은 결정
- 구현 위치: 시나리오 방(권장, 화면 도메인) vs 여기서 청크 구현.
- 엘리베이터 설정 정책(`46444-54287`)의 구체 동작(층 선택·도착 등) 상세.
