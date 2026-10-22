# CHZZK Brave 1080p

치지직(`chzzk.naver.com`) 라이브 방송을 Brave/Chromium에서 볼 때, 네이버 동영상
플러그인(그리드/네이버 라이브 스트리밍 커넥터)을 설치하지 않아도 **가능한 최고
화질(1080p 우선)** 을 자동으로 선택하도록 돕는 비공식 Manifest V3 확장
프로그램입니다.

> **경고**
> 이 프로젝트는 네이버/치지직과 **공식적인 제휴 관계가 없는 비공식 도구**입니다.
> 네이버/치지직 이용약관, 운영 정책, 계정 이용 정책에 위배될 수 있으며, 서비스
> 구조 변경 시 예고 없이 동작이 중단될 수 있습니다. 결제·로그인·광고·보안
> 관련 요소는 조작하지 않지만, 사용에 따른 책임은 전적으로 사용자에게 있습니다.
> DRM을 해제하거나 유료 콘텐츠를 무단으로 이용하기 위한 도구가 아닙니다.

---

## 1. 기능

- 치지직 **라이브 페이지(`/live/...`)에서만** 동작합니다.
- 페이지 로드, 새로고침, SPA 라우팅, 다른 방송으로 이동한 뒤에도 자동으로
  가능한 최고 화질을 다시 선택합니다.
- 실제 `1080p`/`원본` 항목이 있으면 먼저 선택합니다.
- 1080p 항목이 없거나 그리드 설치 안내가 뜨면, 480p 항목을
  **`1080p with FUCK GRID`** 로 표시하고 선택한 뒤 HLS 요청을 1080p로
  리다이렉트합니다. 설정 버튼의 화질 요약도 **`1080p (CDN)`** 으로 표시해
  실제 재생 해상도와 UI를 일치시킵니다. 재생 후
  `video.videoWidth`/`videoHeight`로 실제 해상도를 검증합니다.
- Brave에서만 노출되는 `navigator.brave`를 **chzzk.naver.com 도메인에 한해서만**
  숨깁니다. 전역 User-Agent/UA-CH 스푸핑은 하지 않습니다.
- 네이버 라이브 스트리밍 커넥터/그리드 설치 안내가 반복되지 않도록, 해당
  안내의 **`설치 없이 일반 화질 시청`** 버튼만 자동으로 누릅니다.
- 실패하면 사이트를 깨뜨리지 않고 원래 화질/동작을 유지합니다.
- 외부 CDN, 원격 코드, 난독화, 쿠키/토큰 수집이 없습니다.

---

## 2. Brave 설치 방법

1. 이 저장소를 내려받거나 `git clone` 합니다.
   ```powershell
   git clone <repository-url>
   ```
2. Brave 주소창에 `brave://extensions` 를 입력합니다.
3. 오른쪽 위 **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다** 버튼을 누르고,
   `manifest.json` 이 있는 폴더(예: `chzzk-brave-1080p`)를 선택합니다.
5. 툴바의 **CHZZK Brave 1080p** 아이콘을 고정합니다.
6. `https://chzzk.naver.com/live/<방송ID>` 로 접속합니다.

코드를 수정한 뒤에는 `brave://extensions` 에서 확장의 **새로고침** 버튼을 누르고
치지직 탭을 새로고침하세요.

> Chrome/Chromium도 동일한 방법으로 로드할 수 있습니다
> (`chrome://extensions`).

### 설치 시 표시되는 권한

| 권한 | 이유 |
| --- | --- |
| `storage` | 자동 화질, Brave 차단, 디버그 로그 설정 저장 |
| `declarativeNetRequest` | 480p HLS 요청을 1080p로 리다이렉트 |
| `https://chzzk.naver.com/*` | content script 실행 및 화질 UI 조작 |
| `https://*.navercdn.com/*`, `https://*.pstatic.net/*`, `https://*.akamaized.net/*` | HLS 리다이렉트 대상 CDN 요청에만 접근 |

CDN 호스트 권한은 **다른 사이트의 content script 실행에는 사용되지 않습니다.**
`declarativeNetRequest` 규칙은 `*.m3u8` URL 중 `480p`가 포함된 요청만, 아래
호스트에 대해서만 처리합니다.

---

## 3. 사용법

1. 치지직 라이브에 접속하면 자동으로 화질이 적용됩니다.
2. 플레이어 설정 → 화질 메뉴를 열면 480p 항목이
   **`1080p with FUCK GRID`** 로 표시되어 있을 수 있습니다. 설정 버튼의
   화질 요약은 **`1080p (CDN)`** 으로 표시됩니다. 이 항목은 내부적으로 480p
   트랙을 선택하지만, 확장이 HLS 요청을 1080p로 바꾸고 실제 해상도를
   검증합니다.
3. 실제 1080p 항목이 노출되는 방송에서는 그 항목을 우선 선택합니다.
4. 툴바 아이콘 또는 `brave://extensions` → **확장 프로그램 옵션**에서 설정을
   바꿀 수 있습니다.

### 옵션

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| 자동 최고 화질 | 켜짐 | 라이브 진입/새로고침/SPA 이동 후 자동 적용 |
| Brave 감지 차단 | 켜짐 | chzzk 도메인에서 `navigator.brave`만 숨김 |
| CDN 1080p 폴백 | 켜짐 | 480p HLS → 1080p 리다이렉트 및 해상도 검증 |
| 그리드 안내 자동 닫기 | 켜짐 | 커넥터 안내의 안전한 거절 버튼만 클릭 |
| 디버그 로그 | 꺼짐 | 콘솔에 판단 과정 기록 |

설정은 `chrome.storage.sync`에 저장되며, 이미 열려 있는 치지직 탭에도
`chrome.storage.onChanged` 로 즉시 반영됩니다. Brave 차단 옵션을 나중에 켠
경우에는 페이지 스크립트가 이미 실행됐을 수 있으므로 **새로고침 후** 확실히
적용됩니다.

---

## 4. 동작 원리

### 4.1 화질 UI 자동 선택

`content.js`(ISOLATED world)가 `PZP` 플레이어의 설정 버튼과 화질 목록을 찾아
다음 순서로 선택합니다.

1. `1080p with FUCK GRID` 로 표시한 CDN 항목
2. 실제 `1080p`/`원본` 항목
3. 480p CDN 폴백
4. 720p/360p (안전한 마지막 후보)

선택 후 1.2초 뒤 `video.videoWidth`/`videoHeight` 를 확인하고, 1920×1080 이상이면
성공으로 기록합니다. 실패하면 백오프 후 다시 시도하며, 반복 실패 시 사이트를
건드리지 않고 대기합니다.

### 4.2 480p → 1080p CDN 폴백

`rules/quality.json` 의 `declarativeNetRequest` 규칙이 아래 조건에서만 동작합니다.

- 요청 URL에 `480p` 와 `.m3u8` 이 모두 포함됨
- 요청 도메인이 `navercdn.com`, `pstatic.net`, `akamaized.net` 중 하나
- 리소스 타입이 `xmlhttprequest`, `media`, `other`

일치하면 URL의 `480p` 를 `1080p` 로 바꿉니다. 480p 항목을 선택하므로 그리드
설치 안내가 뜨지 않고, 실제 CDN에서 1080p 트랙을 받아오는 방식입니다.

> 이 방식은 2026-10-22 기준 공개된 치지직 HLS URL 패턴과 오픈소스 구현을
> 참고했습니다. CDN URL 규칙이 바뀌면 리다이렉트가 적용되지 않을 수 있으며,
> 이때는 480p로 조용히 남습니다.

### 4.3 Brave 감지 차단

`page-main.js`(MAIN world, `document_start`)가 `chzzk.naver.com` 에서만
`navigator.brave` 속성을 찾아 제거합니다. 속성이 non-configurable이면
`navigator` 인스턴스에 `undefined` 를 반환하는 own property를 정의합니다.
`navigator.userAgent`, `navigator.userAgentData`, `navigator.platform`,
쿠키 등은 **전혀 수정하지 않습니다.**

### 4.4 그리드 안내 자동 닫기

`MutationObserver`와 1.5초 주기 스캔으로 `role="dialog"`, `_layer_`, `_dimmed_`,
modal/popup 후보를 찾습니다. 다음 조건을 **모두** 만족할 때만 동작합니다.

- 텍스트에 `네이버 라이브 스트리밍`/`커넥터`/`그리드`/`GRID` 와
  `설치`, `고화질`/`1080p`/`화질`이 포함됨
- 또는 `브라우저 확장 프로그램` + `고화질 시청` + `설치` 안내 문구
- `로그인`, `결제`, `구매`, `비밀번호`, `인증`, `보안`, `카드`, `포인트`,
  `후원`, `광고`, `쿠폰`, `환불`, `계정`, `신고` 가 **포함되지 않음**
- 버튼 텍스트가 `설치 없이 일반 화질 시청`, `설치 없이 시청`,
  `일반 화질로 시청`, `나중에 시청`, `다음에`, `닫기` 중 하나

`설치하고 고화질 시청`, `확장 프로그램 설치`, 결제/로그인/보안 버튼은 절대
클릭하지 않습니다.

### 4.5 SPA·새로고침·전체화면 대응

- `popstate`, `hashchange`, `pageshow`, `visibilitychange` 이벤트
- 1.5초 주기 라우트/비디오 상태 확인
- `MutationObserver` 로 플레이어/설정/팝업 노드 추가 감지
- `video` 의 `loadedmetadata`, `playing`, `resize`, `emptied`, `canplay` 이벤트
- `video.currentSrc` 변경 시 실패 상태 초기화 후 재적용

---

## 5. 테스트

### 자동 테스트

Node.js 20+ 에서 실행합니다. 별도 의존성은 없습니다.

```powershell
node --test test/*.test.mjs
```

- `test/core.test.mjs` — 설정 정규화, 라이브 경로, 그리드 문구 판별,
  안전한 거절 라벨, 화질 라벨 파싱, 해상도 판정, 화질 선택 우선순위
- `test/page-main.test.mjs` — `navigator.brave` 제거/복원, 옵션 비활성화,
  다른 출처 메시지 무시
- `test/manifest.test.mjs` — MV3, 권한 최소화, content script world, 로컬
  스크립트만 사용, DNR 규칙, 라이선스/README 존재

선택 사항: Chrome/Chromium이 설치되어 있으면 실제 확장 로드 스모크 테스트를
실행할 수 있습니다.

```powershell
node test/smoke-extension.mjs
```

이 스모크 테스트는 headless Chromium 계열 브라우저에 확장을 로드하고,
CDP(Chrome DevTools Protocol)로 MV3 service worker가 실행되는지, 매니페스트가
읽히는지, `quality_redirect` DNR 규칙이 활성화되는지 확인합니다. 이어서
`https://chzzk.naver.com/` 을 열어 MAIN world 주입, ISOLATED world 준비,
설정 미러링까지 확인합니다. 이어서 가짜 PZP 화질 메뉴를 주입해 480p 항목과
설정 요약이 각각 `1080p with FUCK GRID`, `1080p (CDN)` 로 바뀌는지
검증합니다. headless 브라우저가 확장 로드를 지원하지 않는 환경에서는
`SKIP`으로 종료합니다.

### 이 저장소에서 확인한 결과 (2026-10-22)

- Node.js `v24.16.0`, Windows
- `node --test test/*.test.mjs` → **21 passed / 0 failed**
- `node test/smoke-extension.mjs` → **PASS**
  - Brave `1.97.59` (Chromium 155) headless
  - service worker `src/background.js` 로드 확인
  - manifest name/version/content script 수 확인
  - DNR ruleset `quality_redirect` 활성화 확인
  - 실제 치지직 페이지에서 MAIN world 주입 및 `navigator.brave` 제거 확인
  - ISOLATED world content script 준비 및 설정 미러링 확인
  - 가짜 PZP 화질 메뉴에서 `1080p with FUCK GRID` / `1080p (CDN)` 라벨 확인
- Brave 1.97.59 headed + 실제 라이브 (`/live/7ce8032370ac5121dcabce7bad375ced`)
  수동 E2E:
  - CDN 폴백 켜짐: `video.videoWidth/videoHeight = 1920/1080`, 설정 요약
    `1080p (CDN)`, 선택 항목 `1080p with FUCK GRID`
  - CDN 폴백 꺼짐: `853/480`, 설정 요약 `480p` — 리다이렉트가 실제 1080p
    재생을 만든다는 대조 확인
  - PZP의 실제 `1080p(원본)` 항목은 JS 클릭과 CDP 신뢰 클릭 모두 선택이
    유지되지 않아, 480p 트랙 + DNR 리다이렉트 폴백을 사용합니다.
- headless Brave는 UA의 `HeadlessChrome` 때문에 치지직이 고화질 라이브를
  차단하므로, 실제 라이브 화질 E2E는 headed Brave로 확인했습니다.
- Google Chrome 브랜드 빌드는 최근 버전에서 headless `--load-extension`을
  무시하므로, 위 스모크 테스트는 Brave를 우선 사용합니다. 일반 설치(개발자
  모드에서 로드)는 Chrome에서도 동일하게 동작합니다.

### 수동 테스트 (Brave)

자세한 체크리스트는 [`TESTING.md`](./TESTING.md) 를 참고하세요. 핵심 항목:

1. 네이버 동영상 플러그인/그리드가 설치되지 않은 Brave 프로필 사용
2. 라이브 진입 시 자동으로 1080p 재생
3. 새로고침, 다른 방송 이동, 전체화면 전환 후에도 유지
4. 개발자 도구 → Network에서 `1080p` 가 포함된 `.m3u8` 요청 확인
5. 콘솔에 치명적 에러 없음 (`디버그 로그`를 켜면 판단 과정 확인 가능)
6. 확장 비활성화 후 새로고침하면 원래 사이트 동작으로 복귀
7. 결제/로그인/광고/보안 팝업이 뜨는 상황에서 확장이 아무 것도 클릭하지 않음

---

## 6. 한계와 가정

- 치지직은 비공개 DOM 구조를 자주 변경합니다. 이 확장은 2026-10-22 기준
  공개된 `pzp-*` 클래스/오픈소스 셀렉터를 사용하며, 구조가 바뀌면 화질
  자동 선택이 동작하지 않을 수 있습니다. 이때도 페이지를 깨뜨리지는 않습니다.
- 2026-10-22 headed Brave 실제 라이브에서 `pzp-setting-*`, `pzp-ui-setting-*`
  마크업을 확인했습니다. 다만 headless 브라우저는 치지직의 고화질 차단
  팝업 때문에 전체 플레이어 흐름을 재현하지 못하므로,
  [FUCK-CHZZK-GRID](https://github.com/bass9030/FUCK-CHZZK-GRID) 및 Chrome
  포팅版의 공개 셀렉터를 함께 참고했고 여러 fallback 셀렉터를 두었습니다.
- `480p` → `1080p` CDN 리다이렉트는 해당 방송에 1080p HLS 변형이 존재하고
  CDN URL에 `480p` 문자열이 있을 때만 동작합니다. URL 규칙이 바뀌거나 방송이
  1080p를 제공하지 않으면 720p/480p로 남습니다.
- Windows/Chrome 환경에서 알려진 URL 패턴을 기준으로 했습니다. macOS/Linux의
  CDN 경로가 다르면 CDN 폴백이 동작하지 않을 수 있습니다.
- 네이버 동영상 플러그인이 필요한 **DRM/유료/서명 스트림**을 해제하지 않습니다.
  단순히 플레이어의 화질 선택과 공개 HLS 경로를 활용하는 비공식 도구입니다.
- 1080p CDN 재생은 480p보다 많은 대역폭을 사용할 수 있습니다.
- Brave Shields, fingerprinting protection, UA-CH 정책은 변경하지 않습니다.
- 확장을 끄거나 제거하면 content script와 DNR 규칙이 사라지고, 새로고침 시
  원래 사이트 동작으로 돌아갑니다.

---

## 7. 개인정보와 보안

- 쿠키, 세션, 토큰, 시청 기록, 채팅, 계정 정보를 수집하거나 전송하지 않습니다.
- 네트워크 요청/응답을 가로채 자격증명을 읽지 않습니다. `declarativeNetRequest`
  는 위에 명시한 CDN의 `480p` HLS URL 리다이렉트에만 사용합니다.
- 원격 코드, 외부 CDN, 폰트, 이미지 로딩이 없습니다. 모든 파일이 확장에
  포함되어 있습니다.
- 설정은 `chrome.storage.sync`에 저장되며, Brave 프로필 동기화가 켜져 있으면
  브라우저 계정으로 동기화될 수 있습니다. 민감 정보는 저장하지 않습니다.
- Brave 차단 옵션은 `chzzk.naver.com` 페이지의 `localStorage`에 설정 사본을
  두어 MAIN world가 `document_start`에 동기적으로 읽을 수 있게 합니다.
  이 값은 불리언 설정뿐입니다.

---

## 8. 출처와 라이선스

이 프로젝트는 MIT License로 배포됩니다. 자세한 내용은
[`LICENSE`](./LICENSE), [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)를
참고하세요.

- 아이디어, `pzp-setting-*` 셀렉터 계열, 480p HLS 리다이렉트 방식 참고:
  [bass9030/FUCK-CHZZK-GRID](https://github.com/bass9030/FUCK-CHZZK-GRID)
  (MIT), [refracta/FUCK-CHZZK-GRID-CHROME](https://github.com/refracta/FUCK-CHZZK-GRID-CHROME)
  (MIT)
- 해당 저장소의 코드를 그대로 복사하지 않았으며, Manifest V3/Brave 환경에 맞게
  독립적으로 작성했습니다.

---

## 9. 변경 이력

### 1.0.0 (2026-10-22)

- 최초 구현: MV3, 자동 화질, CDN 1080p 폴백, Brave 감지 차단, 그리드 안내
  자동 닫기, SPA/새로고침 대응, 옵션/팝업 UI, 자동 테스트
