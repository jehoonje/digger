// 공용 함수: Google Vision 웹 검색, Gemini 정리, YouTube 검색

const GEMINI_KEY = () => process.env.GEMINI_API_KEY;
const VISION_KEY = () => process.env.GOOGLE_VISION_API_KEY || process.env.GEMINI_API_KEY;
const YOUTUBE_KEY = () => process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY;

// 무료 등급에서 이미지를 받는 모델부터 차례로 시도
const GEMINI_MODELS = () =>
  [process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"].filter(Boolean);

export function checkAccess(req, res) {
  const code = process.env.ACCESS_CODE;
  if (code && req.headers["x-access-code"] !== code) {
    res.status(401).json({ error: "Incorrect access code." });
    return false;
  }
  return true;
}

const stripTags = s => String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

// 1단계: 구글 이미지 웹 검색(Vision Web Detection)
export async function webDetect(base64) {
  const key = VISION_KEY();
  if (!key) return { ok: false, reason: "no_key" };
  const r = await fetch("https://vision.googleapis.com/v1/images:annotate?key=" + encodeURIComponent(key), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requests: [{ image: { content: base64 }, features: [{ type: "WEB_DETECTION", maxResults: 30 }] }]
    })
  });
  const j = await r.json().catch(() => ({}));
  const wd = j.responses?.[0]?.webDetection;
  if (!r.ok || !wd) return { ok: false, reason: j.error?.message || j.responses?.[0]?.error?.message || "vision_failed" };
  return {
    ok: true,
    bestGuess: (wd.bestGuessLabels || []).map(l => l.label).filter(Boolean),
    entities: (wd.webEntities || []).filter(e => e.description).map(e => ({ name: e.description, score: +(e.score || 0).toFixed(2) })),
    titles: (wd.pagesWithMatchingImages || []).map(p => stripTags(p.pageTitle)).filter(Boolean).slice(0, 30)
  };
}

// 2단계: 검색 결과에서 자주 나온 단어 묶음(1~3단어)을 세어 다수결 후보 만들기
const STOP = new Set(["lp", "vinyl", "레코드", "판매", "중고", "음반", "엘피", "앨범", "album", "record", "records", "the", "and", "of",
  "|", "-", "–", "·", ":", "번개장터", "당근", "중고나라", "ebay", "discogs", "youtube", "상품", "구매", "택배", "가격", "개봉", "미개봉", "상태"]);

export function vote(detect) {
  if (!detect?.ok) return [];
  const docs = [...detect.titles, ...detect.bestGuess, ...detect.bestGuess];
  const counts = new Map();
  for (const doc of docs) {
    const words = doc.toLowerCase().split(/[\s\[\]()\/,|·:\-–—_"'「」『』<>]+/).filter(w => w && !STOP.has(w) && w.length > 1);
    const seen = new Set();
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const g = words.slice(i, i + n).join(" ");
        if (seen.has(g)) continue;
        seen.add(g);
        counts.set(g, (counts.get(g) || 0) + 1);
      }
    }
  }
  for (const e of detect.entities) {
    const k = e.name.toLowerCase();
    counts.set(k, (counts.get(k) || 0) + Math.round(e.score * 3));
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 15)
    .map(([phrase, count]) => ({ phrase, count }));
}

// 3단계: Gemini가 다수결 결과 + 표지 사진으로 최종 앨범 정리
export async function resolveAlbum(base64, detect, votes) {
  const key = GEMINI_KEY();
  if (!key) throw new Error("GEMINI_API_KEY is not set.");
  const evidence = detect?.ok
    ? `구글 이미지 웹 검색 결과:
- 구글 추정 이름: ${detect.bestGuess.join(" / ") || "없음"}
- 관련 키워드(점수): ${detect.entities.slice(0, 10).map(e => `${e.name}(${e.score})`).join(", ") || "없음"}
- 같은 이미지가 실린 페이지 제목들:
${detect.titles.slice(0, 20).map(t => "  · " + t).join("\n") || "  없음"}
- 여러 결과에 반복해서 나온 표현(다수결 횟수): ${votes.map(v => `${v.phrase}(${v.count})`).join(", ") || "없음"}`
    : "구글 이미지 웹 검색 결과 없음. 표지 사진만 보고 판단하세요.";

  const prompt = `첨부 사진은 LP 레코드나 앨범 표지입니다(휴대폰 화면 캡처일 수 있으니 주변 화면은 무시).
아래 구글 이미지 웹 검색 결과에서 여러 페이지에 반복해서 나온 아티스트명·앨범명을 우선 근거로 삼고(다수결), 표지에 적힌 글자와 그림으로 검증해 어떤 앨범인지 정하세요.
검색 결과가 빈약하거나 서로 엇갈리면 표지 사진을 직접 읽어 판단하고 confidence를 낮추세요.
아티스트·앨범·곡명은 원래 표기(한국 앨범이면 한글)로 쓰세요. tracks에는 그 앨범의 대표 곡 3~5개.
source는 판단 근거: "web"(검색 다수결), "cover"(표지 직접 판독), "both".

${evidence}

JSON만 답하세요:
{"artist":"","album":"","year":"","genre":"","top_track":"","tracks":[""],"confidence":"high|medium|low","source":"web|cover|both"}
사진에 앨범 표지가 전혀 없으면 artist를 빈 문자열로.`;

  let lastErr = "";
  for (const model of GEMINI_MODELS()) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: base64 } }, { text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      })
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) { lastErr = `model ${model} not found`; continue; }
    if (!r.ok) throw new Error("Gemini error: " + (j.error?.message || r.status));
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    try { return { ...JSON.parse(text.slice(s, e + 1)), model }; } catch { throw new Error("Could not read the recognition result. Try again."); }
  }
  throw new Error("No available Gemini model: " + lastErr);
}

// 4단계: 영상 검색 — 저장된 결과(Supabase) → YouTube 공식 API → 한도 초과 시 DataForSEO
const SB_URL = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const CACHE_DAYS = 30;
const normQ = q => String(q).toLowerCase().replace(/\s+/g, " ").trim();

async function cacheGet(q) {
  if (!SB_URL() || !SB_KEY()) return null;
  try {
    const since = new Date(Date.now() - CACHE_DAYS * 864e5).toISOString();
    const r = await fetch(`${SB_URL()}/rest/v1/yt_cache?select=videos&q=eq.${encodeURIComponent(q)}&created_at=gte.${since}&limit=1`, {
      headers: { apikey: SB_KEY(), authorization: "Bearer " + SB_KEY() }
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0]?.videos?.length ? rows[0].videos : null;
  } catch { return null; }
}

async function cacheSet(q, videos, source) {
  if (!SB_URL() || !SB_KEY() || !videos.length) return;
  try {
    await fetch(`${SB_URL()}/rest/v1/yt_cache?on_conflict=q`, {
      method: "POST",
      headers: { apikey: SB_KEY(), authorization: "Bearer " + SB_KEY(), "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ q, videos, source, created_at: new Date().toISOString() })
    });
  } catch {}
}

async function youtubeOfficial(q) {
  const key = YOUTUBE_KEY();
  if (!key) throw Object.assign(new Error("YOUTUBE_API_KEY is not set."), { fallback: true });
  const u = "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=5&regionCode=KR&q="
    + encodeURIComponent(q) + "&key=" + encodeURIComponent(key);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = j.error?.errors?.[0]?.reason || "";
    throw Object.assign(new Error("YouTube error: " + (j.error?.message || r.status)),
      { fallback: r.status === 403 || r.status === 429 || /quota|rateLimit/i.test(reason) });
  }
  return (j.items || []).map(i => ({ id: i.id.videoId, title: stripTags(i.snippet.title), channel: stripTags(i.snippet.channelTitle) }));
}

async function youtubeDataForSEO(q) {
  const login = process.env.DATAFORSEO_LOGIN, pass = process.env.DATAFORSEO_PASSWORD;
  if (!login || !pass) throw new Error("Daily YouTube search limit reached.");
  const r = await fetch("https://api.dataforseo.com/v3/serp/youtube/organic/live/advanced", {
    method: "POST",
    headers: { authorization: "Basic " + Buffer.from(login + ":" + pass).toString("base64"), "content-type": "application/json" },
    body: JSON.stringify([{ keyword: q, location_name: "South Korea", language_code: "ko", device: "desktop", block_depth: 20 }])
  });
  const j = await r.json().catch(() => ({}));
  const task = j.tasks?.[0];
  if (!r.ok || (task && task.status_code >= 40000)) throw new Error("Backup search error: " + (task?.status_message || j.status_message || r.status));
  const items = (task?.result || []).flatMap(res => res.items || []);
  const idFrom = it => it.video_id || (String(it.url || "").match(/[?&]v=([\w-]{11})/) || [])[1];
  return items
    .filter(it => it.type === "youtube_video" && !it.is_shorts && idFrom(it))
    .slice(0, 5)
    .map(it => ({ id: idFrom(it), title: stripTags(it.title), channel: stripTags(it.channel_name || it.channel_title || "") }));
}

export async function searchYouTube(rawQ) {
  const q = normQ(rawQ);
  const cached = await cacheGet(q);
  if (cached) return cached;
  let videos, source = "youtube";
  try {
    videos = await youtubeOfficial(q);
  } catch (e) {
    if (!e.fallback) throw e;
    videos = await youtubeDataForSEO(q);
    source = "dataforseo";
  }
  await cacheSet(q, videos, source);
  return videos;
}
