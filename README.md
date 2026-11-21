# LP 스캐너

LP 표지를 찍거나 올리면 구글 이미지 웹 검색 결과를 다수결로 모아 앨범을 알아내고, 페이지 안의 유튜브 플레이어에서 바로 재생합니다.

## 동작 순서
1. **Google Vision Web Detection**: 사진과 같은 이미지가 실린 웹페이지 제목, 키워드, 구글 추정 이름을 가져옵니다.
2. **다수결**: 결과에 반복해서 나온 표현(1~3단어)을 세어 후보를 만듭니다. (`api/_lib.js`의 `vote`)
3. **Gemini**: 다수결 후보와 표지 사진을 함께 보고 아티스트, 앨범, 대표 곡을 정리합니다. 검색 결과가 빈약하면 표지를 직접 읽습니다.
4. **YouTube Data API**: 대표 곡 영상을 찾아 페이지 안에서 재생합니다.

## Vercel 환경 변수
| 이름 | 필수 | 설명 |
|---|---|---|
| `GEMINI_API_KEY` | 예 | Google AI Studio에서 받은 키 |
| `YOUTUBE_API_KEY` | 예* | YouTube Data API v3를 켠 프로젝트의 키 |
| `GOOGLE_VISION_API_KEY` | 권장* | Cloud Vision API를 켠 프로젝트의 키. 없으면 표지 판독만 사용 |
| `ACCESS_CODE` | 권장 | 정하면 이 코드를 아는 사람만 사용 가능 (무료 한도 보호) |
| `GEMINI_MODEL` | 아니요 | 기본값 `gemini-3.5-flash-lite` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 권장 | 영상 검색 결과 30일 저장(같은 검색은 한도 안 씀). 테이블은 `supabase.sql` |
| `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | 아니요 | 유튜브 하루 한도 초과 시 유료 백업 검색(1,000건당 약 2달러) |

\* 세 API를 Gemini 키와 같은 Google Cloud 프로젝트에서 켜면 `GEMINI_API_KEY` 하나로 대신할 수 있습니다.

## 무료 한도
- Vision Web Detection: 월 1,000건 무료 (Google Cloud 결제 계정 필요)
- YouTube 검색: 하루 약 100회
- Gemini 무료 등급: 분당·일일 요청 한도 있음
