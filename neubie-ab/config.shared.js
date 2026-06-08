/*
 * config.shared.js — 3개 링크(control_A / B1 / B2)가 동일하게 import 하는 공유 설정
 *
 * 영상 트리거 타임스탬프 · 성공 임계값 · 시나리오 정의 · 로봇 상태 수치를 한 곳에 모은다.
 * 세 링크가 같은 값을 쓰므로 T1(영상시간 기준)이 자동으로 동일·정밀하게 맞는다.
 *
 * 값 출처: 테스트 수치 스프레드시트(2026-06-08 수신).
 *   - 시나리오 4(GPS이격) 및 S3-Test3(벽)은 테스트에서 제외.
 *   - 남은 TODO: PostHog 키/host, S3/S2/S6 영상 src 파일명.
 *
 * ⚠️ 영상시간 표기: 시트의 S3 "6:00 / 4:00 / 3:00"은 "초"로 해석함(예 6:00 → 6초).
 *    S2 "4초" · S6 "2초"와 동일 단위. 만약 분:초였다면 알려주세요(triggerSec만 수정).
 *
 * UMD: Node(require) · 브라우저 전역(window.NeubieConfig).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.NeubieConfig = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONFIG = {
    // ── PostHog (env로 주입; 빌드 후 사용자 값으로 교체) ─────────
    posthog: {
      // PostHog 공식 스니펫이 HTML에서 self-init (key/host/defaults/person_profiles).
      // 모듈은 testMarker 등록 + 세션리코딩만 담당. 아래 key/host는 참고용(HTML과 동일 유지).
      apiKey: 'phc_gJCAuVDZUnrhDdm4bZ7RwgWOIQ4JEOE2urE77sKd7qT',
      host: 'https://us.i.posthog.com',
      sessionRecording: true,
      // ── 테스트 데이터 식별 표식 ──
      // 단일 프로젝트에 기존 운영 데이터와 섞이므로, 모든 이벤트/사람/세션에 표식을 붙여 분리.
      // PostHog에서 test_suite='remote-control-ab' 로 필터/코호트 구성.
      testMarker: {
        test_suite: 'remote-control-ab',
        environment: 'usability-test',
        is_test: true
      }
    },

    // ── 프로토타입 링크 & variant 매핑 (확정) ───────────────────
    //  A = 별도 파일. B1/B2 = 동일 파일(public/index.html)이 ?layout으로 분기.
    //  vertical(=b) → B1 (layout-b, "Option B") / horizontal(=a) → B2 ("Option A")
    links: {
      baseUrl: 'https://monitoring-nine-rho.vercel.app',
      control_A: { url: '/remote-control-A.html' },
      B1: { url: '/?layout=vertical' },
      B2: { url: '/?layout=horizontal' }
    },
    variantByLayout: { vertical: 'B1', b: 'B1', horizontal: 'B2', a: 'B2' },

    // 시나리오 미지정(?scenario 없음)일 때 카메라에 표시할 기본 피드 영상
    defaultVideo: '/scenario-videos/scenario3-1.mp4',

    // 흐름(flow) 안내 문구 — entry 방법설명 + 시나리오별 설명 오버레이
    methodIntro: '이 테스트는 로봇 원격관제 화면 두 가지(A·B)를 비교합니다. 총 10개의 짧은 시나리오를 진행합니다. ' +
      '각 시나리오는 설명을 읽고 [시작하기]를 누른 뒤, 화면 지시에 따라 조작하면 됩니다. 준비되면 시작해주세요.',
    scenarioIntros: {
      1: '로봇 상태 수치를 확인하세요. 비정상이라고 판단되면 [주행 불가능] 버튼을 누르세요.',
      2: '신호등이 녹색으로 바뀌면 최대한 빠르게 [횡단하기] 버튼을 누르세요.',
      3: '주행 중 전방에 위험이 나타나면 즉시 [사이드브레이크 ON] 버튼을 누르세요.',
      5: '음량 슬라이더를 드래그해 정확히 0.2에 맞춘 뒤 손을 떼세요.',
      6: "'도착하였습니다' 알림이 뜨면 [도착 처리] 버튼을 누르세요."
    },

    // 시나리오별 알림(로그) — delay(ms, 0=즉시) / level(5~2, null) / msg. trigger='xwalk'|'arrival'은 버튼 클릭 시.
    // (스프레드시트 기준. 화면멈춤/재생 등 '화면 변화'는 횡단보도 시스템이 처리하므로 여기선 로그 내용만)
    scenarioAlerts: {
      1: [
        { delay: 0,     level: 5, msg: '디저트39-강남테헤란로점으로 이동합니다' },
        { delay: 3000,  level: 4, msg: '[자비에 송수신 네트워크 최대 속도 1Gbps 미만]' },
        { delay: 5000,  level: 4, msg: '보행자가 인접하여 천천히 주행합니다.' }
      ],
      2: [
        { delay: 0,     level: 2, msg: '건널목 앞 정지하였습니다. 화면을 확인하고 주행을 재개해주세요.' },
        { delay: 8000,  level: 3, msg: '[3D 장애물 메세지 유실] 주행 상태를 즉시 확인해주세요.' },
        { delay: 8000,  level: 3, msg: '[3D 장애물 메세지 유실] 주행 상태를 즉시 확인해주세요.' },
        { delay: 10000, level: null, msg: '[자비에 송수신 네트워크 최대 속도 1Gbps 미만]' },
        { trigger: 'xwalk', level: 2, msg: '건널목 횡단을 시작합니다.' }
      ],
      3: [
        { delay: 2000,  level: 3, msg: '[3D 장애물 메세지 유실] 주행 상태를 즉시 확인해주세요.' },
        { delay: 2000,  level: 3, msg: '[3D 장애물 메세지 유실] 주행 상태를 즉시 확인해주세요.' },
        { delay: 10000, level: null, msg: '[자비에 송수신 네트워크 최대 속도 1Gbps 미만]' }
      ],
      5: [
        { delay: 0, level: 2, msg: '전방에 주행 가능한 영역이 없습니다' },
        { delay: 0, level: null, msg: '[자비에 송수신 네트워크 최대 속도 1Gbps 미만]' }
      ],
      6: [
        { delay: 1000, level: 5, msg: '강남구 강남대로 468 충림빌딩에 곧 도착합니다.' },
        { trigger: 'arrival', level: 5, msg: '강남구 강남대로 468 충림빌딩에 도착했습니다' }
      ]
    },

    // ── group / expert_level 파생 규칙 (확정) ───────────────────
    //  group        : ops_experience === 'Y' → 'expert', else 'novice'
    //  expert_level : expert일 때만. ops_months 기준
    //                 {'3mo','3-6mo'}    → 'junior'
    //                 {'6mo-1yr','1yr+'} → 'senior'   (novice는 null)
    groupRule: {
      expertIf: { ops_experience: 'Y' },
      expertLevel: {
        junior: ['3mo', '3-6mo'],
        senior: ['6mo-1yr', '1yr+']
      }
    },

    // ── 로봇 상태 공통 기본값 (시트 공통 컬럼) ──────────────────
    //  시나리오/서브별 override는 각 scenario.state / video.state 에서.
    robotStateDefault: {
      wifi_ms: 100.8, speed: 2, battery_pct: 60, gps: 34,
      pitch_deg: 1.12, roll_deg: 0.02,
      cargo: '닫힘', headlamp: 'OFF', gamepad: 'OFF', autostop: 'ON', sidebrake: 'OFF'
    },

    // ── S3 돌발상황 영상 (시안별로 assign이 taxi/bump 배정) ─────
    //  triggerSec      : 돌출물 최초 출현 = T1 (video.currentTime, 초)
    //  successEndSec   : 성공창 종료(이 시점 이후 ON이면 실패)
    //  successWindowMs : (successEndSec - triggerSec) * 1000 = brake 유효구간
    //  state           : 해당 자극에서의 로봇 상태 override
    videos: {
      taxi: { // V1 = 돌출 차량 (S3-Test1)
        label: '돌출 차량', src: '/scenario-videos/scenario3-1.mp4', route: '목적지 이동',
        triggerSec: 6, successEndSec: 9, successWindowMs: 3000,
        state: { wifi_ms: 300.8, autostop: 'OFF' }
      },
      bump: { // V2 = 단차 (S3-Test2)
        label: '단차', src: '/scenario-videos/scenario3-2.mp4', route: '목적지 이동',
        triggerSec: 4, successEndSec: 6, successWindowMs: 2000,
        state: { wifi_ms: 100.8, autostop: 'ON' }
      }
      // 벽(S3-Test3)은 제외 — trigger 3s / window 3~4s 였음.
    },

    // ── 시나리오 정의 (S1·S2·S3·S5·S6 / S4 제외) ────────────────
    //  trigger.type : 'render' → 프로토타입이 자극을 그릴 때 markStimulus() 호출
    //                 'video'  → bindVideo()가 currentTime ≥ triggerSec 에서 자동 markStimulus()
    scenarios: {
      // S1 수치측정 (within, 서브 2개: sub1=wifi500ms / sub2=battery17%)
      1: {
        name: '수치측정', design: 'within', route: '출발지 이동',
        video: '/scenario-videos/scenario1.mp4', // 카메라 피드(앰비언트). 트리거는 상태 렌더
        trigger: { type: 'render' },           // 비정상 상태 카드 렌더 시점
        expectedAction: '[주행 불가능] 클릭',
        success: { kind: 'correctness' },       // 정/오판 → correct(bool)
        metrics: ['total_ms', 'correct', 'sub_test'],
        subTests: {
          1: { key: 'wifi_500ms', label: '와이파이 지연 500ms',
               state: { wifi_ms: 500, battery_pct: 60, pitch_deg: 1.12, roll_deg: 0.02 } },
          2: { key: 'battery_17', label: '배터리 17%',
               state: { wifi_ms: 100.8, battery_pct: 17 } }
          // (Pitch12°/Roll6.8° 서브 = S1-Test3, 미사용)
        }
      },

      // S2 신호대기 (within) — 신호등 녹색 점등 = 영상 4초
      2: {
        name: '신호대기', design: 'within', route: '출발지 이동',
        video: '/scenario-videos/scenario2.mp4', // 신호등 영상(녹색 점등 4초)
        trigger: { type: 'video', triggerSec: 4 }, // 녹색 점등 시점
        expectedAction: '[횡단하기] 클릭',
        success: { kind: 'deadline', limitMs: 2000 }, // 점등 후 2초 내 → 아니면 timeout
        metrics: ['response_ms', 'timeout'],
        state: { pitch_deg: 12, roll_deg: 6.8 } // ⚠️ 시트값(경사). S1-Test3와 동일 — 의도 맞는지 확인 권장
      },

      // S3 돌발상황 (within, 영상 2개 taxi/bump)
      3: {
        name: '돌발상황', design: 'within', route: '목적지 이동',
        trigger: { type: 'video' }, // videos[stimulus_video].triggerSec 에서 자동 마킹
        expectedAction: '[사이드브레이크 ON]',
        success: { kind: 'videoWindow' }, // videos[v].successWindowMs 내 ON → success
        metrics: ['braking_latency_ms', 'stimulus_video', 'success'] // braking_latency = T3 - T1
      },

      // S5 정밀제어 (within, Fitts) — 빌딩 진입 가이드 팝업
      5: {
        name: '정밀제어', design: 'within', route: '목적지 이동',
        video: '/scenario-videos/scenario5.mp4', // 빌딩 진입 영상(앰비언트)
        trigger: { type: 'render' }, // 가이드 팝업 렌더 (EV 버튼 클릭 태스크 선행)
        expectedAction: '음량 슬라이더 0.2 도달 후 마우스 릴리즈',
        success: { kind: 'fitts', target: 0.2, tolerance: 0.02 },
        // fitts_id = log2(2D / W). D=시작 포인터↔슬라이더 거리, W=목표 0.2 영역 픽셀폭(런타임 측정)
        metrics: ['movement_time_ms', 'fitts_id', 'overshoot_count'],
        state: { gps: 305 }
      },

      // S6 도착처리 (within) — '도착하였습니다' 알림 = 영상 2초
      6: {
        name: '도착처리', design: 'within',
        video: '/scenario-videos/scenario6.mp4', // 도착 영상(알림 2초)
        trigger: { type: 'video', triggerSec: 2 }, // 알림 카드 출현 시점
        expectedAction: '[도착 처리] 클릭',
        success: { kind: 'clickWindow', minMs: 0, maxMs: 2000 }, // 알림 후 2초(영상 2~4초) 내 정확 클릭
        metrics: ['response_ms', 'overshoot_count', 'error'],
        firstExposureOnly: ['overshoot_count', 'error'] // 첫 노출만 분석
      }

      // 시나리오 4 (GPS이격, between) — 제외.
    }
  };

  return CONFIG;
});
