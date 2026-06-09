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
      host: '/ingest', // 동일 출처 리버스 프록시(vercel.json). UI는 us.posthog.com. (실제 api_host는 HTML 스니펫이 구동)
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

    // ── 관심영역(AOI) 정의: 시나리오별 마우스 체류/클릭 분포 집계용 ──────
    //  variant별 화면 구조가 달라 선택자가 다름. 라벨은 A/B 공통으로 맞춰 집계 호환.
    //  (겹치는 오버레이는 먼저 매칭되도록 작은 영역을 앞에 배치 → getAOI는 first-match)
    aoi: {
      // A(control_A) — remote-control-A.html
      control_A: [
        { label: '헤더 (상태바)', selector: '.header' },
        { label: '알림 내역',    selector: '#alert-stack' },
        { label: '시나리오 패널', selector: '.stepper' },
        { label: '음성 송출',    selector: '.volume' },
        { label: '지도',        selector: '.panel-map' },
        { label: '로봇 제어 버튼', selector: '.panel-body' },
        { label: '좌측 네비',    selector: '.rail' },
        { label: '카메라 영상',   selector: '.cam-wrap' }
      ],
      // B1/B2 — public/index.html (기존 사용성 테스트(UT) AOI와 동일)
      B1: [
        { label: '헤더 (상태바)', selector: '#nrp-header' },
        { label: '카메라 영상',   selector: '#camera-section' },
        { label: '로봇 제어 버튼', selector: '#robot-controls-wrap' },
        { label: '시나리오 패널', selector: '#scenario-panel' },
        { label: '알림 내역',    selector: '#log-panel' },
        { label: '지도',        selector: '#map-section' },
        { label: '음성 송출',    selector: '#voice-panel' }
      ]
    },

    // ── 시나리오별 '주요 측정 지표'(테스트 계획) ──────────────────
    //  각 trial 행에 헤드라인 지표를 명시적으로 기록: primary_metric(이름)/primary_value(값)/
    //  primary_unit(단위)/primary_outcome(판정)/primary_pass(성공여부).
    //  value = 해당 시나리오의 핵심 시간지표 필드명(ms). 품질 판정은 시나리오별 success/correct/timeout/error로 산출.
    primaryMetrics: {
      1: { name: '판단 시간(정답 여부)', value: 'total_ms',           unit: 'ms' }, // 정답률(correct)이 핵심, 시간은 관찰+판단 포함
      2: { name: '신호 반응 시간',       value: 'response_ms',        unit: 'ms' }, // 점등 후 [횡단하기]까지 (제한 2초)
      3: { name: '비상제동 딜레이',      value: 'braking_latency_ms', unit: 'ms' }, // 돌출 시점→사이드브레이크 ON
      5: { name: '정밀제어 이동 시간',   value: 'movement_time_ms',   unit: 'ms' }, // +fitts_id/overshoot_count 동반
      6: { name: '도착 반응 시간',       value: 'response_ms',        unit: 'ms' }  // 도착알림→도착처리 (클릭창 0~2초)
    },

    // ── SUS (System Usability Scale) — 각 시안 전체 시나리오 종료 시 ──────
    //  5점 척도. positive(홀수) 문항 점수=답-1, negative(짝수)=5-답. 합×2.5 = 0~100점.
    sus: {
      scale: 5,
      anchorLow: '전혀 그렇지 않다',
      anchorHigh: '매우 그렇다',
      positive: [1, 3, 5, 7, 9], // 1-indexed 긍정 문항
      questions: [
        '나는 이 관제 UI를 자주 사용하고 싶다.',
        '이 UI는 불필요하게 복잡하다고 느꼈다.',
        '이 UI는 사용하기 쉬웠다.',
        '이 UI를 쓰려면 전문가의 도움이 필요할 것 같다.',
        '이 UI의 여러 기능이 잘 통합되어 있다고 느꼈다.',
        '이 UI는 일관성이 너무 없다고 느꼈다.',
        '대부분의 사람이 이 UI를 금방 익힐 것이라고 생각한다.',
        '이 UI는 사용하기에 매우 번거로웠다.',
        '이 UI를 사용하면서 자신감을 느꼈다.',
        '이 UI를 제대로 쓰기 전에 배워야 할 것이 많았다.'
      ]
    },

    // ── 참가자 닉네임 (seed 결정론적; entry·모듈 공용으로 동일 닉네임 보장) ──
    nicknameAdj: ['날쌘', '용감한', '꼼꼼한', '차분한', '명민한', '든든한', '상냥한', '재빠른', '늠름한', '다정한'],
    nicknameAni: ['너구리', '수달', '다람쥐', '고라니', '부엉이', '두더지', '오소리', '삵', '족제비', '담비'],
    makeNickname: function (s) {
      s = Number(s) || 0;
      var adj = this.nicknameAdj, ani = this.nicknameAni;
      return adj[s % adj.length] + ani[Math.floor(s / adj.length) % ani.length] + '-' + s.toString(36);
    },

    // ── Google Sheets 기록 (Apps Script 웹앱) ──
    // 빈 시트 + Apps Script doPost 배포 후 그 웹앱 URL을 endpoint에 넣으면 활성화. 그 전엔 no-op.
    sheets: {
      enabled: true,
      endpoint: 'https://script.google.com/macros/s/AKfycbzxNBl9pyTwGuLBFcUubuM1jAIz-kNvSeJMTp78WRv94KhF5lFYclhVzwp8A5PHzkLG/exec'
    },

    // 시나리오 미지정(?scenario 없음)일 때 카메라에 표시할 기본 피드 영상
    defaultVideo: '/scenario-videos/scenario3-1.mp4',

    // 흐름(flow) 안내 문구 — entry 방법설명 + 시나리오별 설명 오버레이
    methodIntro: '이 테스트는 로봇 원격관제 화면 두 가지(A·B)를 비교합니다. 총 10개의 짧은 시나리오를 진행합니다. ' +
      '각 시나리오는 설명을 읽고 [시작하기]를 누른 뒤, 화면 지시에 따라 조작하면 됩니다. 준비되면 시작해주세요.',
    scenarioIntros: {
      1: '로봇 화면에서 에러 상황이 있을 수 있습니다. 3초간 로봇 정보를 파악하고 어떤 문제가 있었는지 알려주세요.',
      2: "보행 신호가 켜진 후 안전하게 통과할 수 있는 시간 안에 '횡단하기' 버튼을 눌러 이동해주세요.",
      3: "로봇 카메라를 응시하다 돌발 상황이 발생하면 '사이드브레이크'를 ON으로 변경해 로봇을 멈춰주세요.",
      5: '안내에 따라 로봇을 조작해주세요.',
      6: '카메라를 보고 로봇이 목적지에 도착했다고 판단되면, 시나리오에서 직접 [도착 처리]를 해주세요.'
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
        { delay: 12000, level: 5, msg: '래미안 리더스원 공동현관에 곧 도착합니다.' },
        { trigger: 'arrival', level: 5, msg: '래미안 리더스원 공동현관에 도착하였습니다' }
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

      // S6 도착처리 (within) — '곧 도착합니다' 알림 = 영상 12초 (목적지 도착 영상 ~17초)
      6: {
        name: '도착처리', design: 'within',
        video: '/scenario-videos/scenario6.mp4', // 도착 영상(목적지 도착, ~17초)
        trigger: { type: 'video', triggerSec: 12 }, // '곧 도착합니다' 인지 시점 = T1
        expectedAction: '[도착 처리] 클릭',
        success: { kind: 'clickWindow', minMs: 0, maxMs: 8000 }, // 알림 후 8초 내 도착 처리 = 성공
        metrics: ['response_ms', 'overshoot_count', 'error'],
        firstExposureOnly: ['overshoot_count', 'error'] // 첫 노출만 분석
      }

      // 시나리오 4 (GPS이격, between) — 제외.
    }
  };

  return CONFIG;
});
