# Digger — App Store 제출 자료

## 앱 정보 (App Store Connect → 앱 정보)
- 이름: Digger (이미 사용 중이면 `Digger: Record Scanner`)
- 부제(30자): Scan a record sleeve, hear it
- 번들 ID: com.jehoonje.digger
- SKU: digger-ios-001
- 기본 언어: English (U.S.)
- 카테고리: Music (보조: Utilities)
- 연령 등급: 설문 전부 "없음" → 4+  (웹 접근 무제한 항목도 "아니요": 앱 안에서 임의 웹 탐색 불가)
- 개인정보처리방침 URL: https://digger-eight.vercel.app/privacy.html
- 지원 URL: https://digger-eight.vercel.app/support.html
- 저작권: 2026 Jehoon (본인 이름)
- 가격: 무료

## 설명 (Description)
Point your camera at a record and hear it.

Digger identifies a vinyl record from a photo of its sleeve, then plays a matching track right away. Browse the album's best-known songs, switch versions, and keep a list of what you've scanned.

- Take a photo or choose one from your library
- Recognizes the exact album, not just the artist
- Plays songs instantly in an embedded YouTube player
- Recent scans saved on your device
- No account, no ads

## 키워드 (100자)
vinyl,record,LP,album,scanner,crate digging,music,identify,cover,turntable

## 홍보 문구 (선택)
Dig through crates faster: scan a sleeve, hear the record.

## 심사 메모 (App Review Information → Notes)
Digger identifies a vinyl record from a photo of its sleeve and plays a matching song through YouTube's official embedded IFrame player (no downloading, no background playback, ads and attribution untouched).

How to test:
1. Open the app and tap "Agree and continue" (one-time notice that photos are sent to Google Cloud Vision and Gemini for recognition).
2. Tap "Take photo", point the camera at any album cover (a cover shown on another screen works), then tap "Capture". Or tap "Upload" and choose a photo of an album cover.
3. The album, year and genre appear and a song starts playing. Tap any track to play it, or another video below.
4. Recent scans appear at the bottom and can be reopened.

No sign-in is required. Native features: camera capture, photo library, haptic feedback on recognition, on-device recent scans.

- 로그인 필요: 아니요 (데모 계정 칸 비움)
- 연락처: 본인 이름 / 전화번호 / limjhoon8@gmail.com

## 앱 개인정보 (App Privacy) 답안
- 데이터 수집 여부: 예
- 수집 항목: **사진 또는 동영상 (Photos or Videos)**
  - 용도: 앱 기능 (App Functionality)
  - 사용자 신원과 연결: 아니요
  - 추적에 사용: 아니요
- 그 외 항목: 수집 안 함
- 추적(Tracking): 아니요

## 수출 규정 (암호화)
Info.plist에 `ITSAppUsesNonExemptEncryption = NO` 를 넣어 두어 업로드 후 별도 질문이 나오지 않아요.

## 스크린샷
- 필수: iPhone 6.9" (1320×2868) 또는 6.5" (1284×2778) 최소 1장, 최대 10장
- Xcode 시뮬레이터 iPhone 16 Pro Max에서 앱을 실행하고 Cmd+S 로 저장하면 규격이 맞음
- 추천 3장: ① 시작 화면 ② 카메라로 표지를 비추는 화면 ③ 결과와 재생 화면

## Vercel 환경 변수 (앱 출시 전 필수)
- `ALLOW_IOS_APP` = `1`  → 앱은 접속 코드 없이 사용 가능 (비용은 하루 검색 한도와 두 번째 코드로 보호)
