// 공용 함수: Google Vision 웹 검색, Gemini 정리, YouTube 검색

const GEMINI_KEY = () => process.env.GEMINI_API_KEY;
const VISION_KEY = () => process.env.GOOGLE_VISION_API_KEY || process.env.GEMINI_API_KEY;
const YOUTUBE_KEY = () => process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY;

// 무료 등급에서 이미지를 받는 모델부터 차례로 시도
const GEMINI_MODELS = () =>
  [process.env.GEMINI_MODEL, "gemini-3.8-flash", "gemini-3.6-flash", "gemini-flash-latest",
   "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"].filter(Boolean);

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
    // 표지 전체가 똑같이 일치하는 페이지(full)가 부분 일치(partial)보다 훨씬 강한 근거
    pages: (wd.pagesWithMatchingImages || [])
      .map(p => ({ title: stripTags(p.pageTitle), full: (p.fullMatchingImages || []).length > 0 }))
      .filter(p => p.title).slice(0, 30)
  };
}

// 2단계: 검색 결과에서 자주 나온 단어 묶음(1~3단어)을 세어 다수결 후보 만들기
const STOP = new Set(["lp", "vinyl", "레코드", "판매", "중고", "음반", "엘피", "앨범", "album", "record", "records", "the", "and", "of",
  "|", "-", "–", "·", ":", "번개장터", "당근", "중고나라", "ebay", "discogs", "youtube", "상품", "구매", "택배", "가격", "개봉", "미개봉", "상태"]);

export function vote(detect) {
  if (!detect?.ok) return [];
  const docs = [
    ...detect.pages.map(p => ({ text: p.title, w: p.full ? 3 : 1 })),
    ...detect.bestGuess.map(t => ({ text: t, w: 3 }))
  ];
  const counts = new Map();
  for (const { text: doc, w } of docs) {
    const words = doc.toLowerCase().split(/[\s\[\]()\/,|·:\-–—_"'「」『』<>]+/).filter(w => w && !STOP.has(w) && w.length > 1);
    const seen = new Set();
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const g = words.slice(i, i + n).join(" ");
        if (seen.has(g)) continue;
        seen.add(g);
        counts.set(g, (counts.get(g) || 0) + w);
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
  const full = detect?.ok ? detect.pages.filter(p => p.full) : [];
  const partial = detect?.ok ? detect.pages.filter(p => !p.full) : [];
  const evidence = detect?.ok
    ? `Google reverse image search results:
- Google best guess: ${detect.bestGuess.join(" / ") || "none"}
- Web entities (score): ${detect.entities.slice(0, 10).map(e => `${e.name}(${e.score})`).join(", ") || "none"}
- Pages showing an EXACT copy of this cover (strongest evidence):
${full.slice(0, 15).map(p => "  · " + p.title).join("\n") || "  none"}
- Pages showing a similar/partial image (weaker):
${partial.slice(0, 10).map(p => "  · " + p.title).join("\n") || "  none"}
- Weighted repeated phrases: ${votes.map(v => `${v.phrase}(${v.count})`).join(", ") || "none"}`
    : "No reverse image search results. Decide from the cover image alone.";

  const prompt = `The attached photo shows an LP or album cover (it may be a phone screenshot; ignore surrounding UI).
Identify the EXACT album, not just the artist. Work in this order:

1. Describe the cover artwork visually: main image or illustration, colors, layout, logo placement, and every piece of text you can read.
2. Identify the artist.
3. Recall that artist's albums and what each cover looks like. Compare each candidate's cover to your description and pick the one whose ARTWORK matches.

Important:
- A band or artist name printed on the cover (for example "BOSTON") appears on almost all of that artist's albums. It identifies the artist only, never the album. Do not default to the self-titled or debut album because the name matches.
- Album-specific evidence wins: an album title or number printed on the cover (e.g. "제3집", "Third Stage", "II"), a distinctive illustration, or page titles below that name a specific album, especially pages showing an EXACT copy of the cover.
- If the search results mostly repeat only the artist name, ignore them for choosing the album and rely on the artwork.
- If two albums remain plausible, choose the one whose artwork matches best and set confidence to "low".
Write artist, album and track names in their original form (Korean albums in Korean). tracks: 3-5 well-known songs from THAT album only.
source: "web" (search evidence named the album), "cover" (artwork/text on the cover), or "both".

${evidence}

Reply with JSON only:
{"cover_description":"","candidates":[{"album":"","match":"why it does or doesn't match the artwork"}],"artist":"","album":"","year":"","genre":"","top_track":"","tracks":[""],"confidence":"high|medium|low","source":"web|cover|both"}
If there is no album cover in the photo at all, set artist to "".`;

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
    // 없는 모델이거나 무료 한도가 찬 모델이면 다음 모델로
    if (r.status === 404 || r.status === 429 || (r.status === 400 && /not found|not supported/i.test(j.error?.message || ""))) {
      lastErr = `${model}: ${j.error?.message || r.status}`; continue;
    }
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
const sbHeaders = () => {
  const k = SB_KEY();
  // 예전 JWT 형식(eyJ…)만 Authorization에 넣고, 새 형식(sb_secret_…)은 apikey 헤더만 사용
  return k.startsWith("eyJ") ? { apikey: k, authorization: "Bearer " + k } : { apikey: k };
};
const normQ = q => String(q).toLowerCase().replace(/\s+/g, " ").trim();

async function cacheGet(q) {
  if (!SB_URL() || !SB_KEY()) return null;
  try {
    const since = new Date(Date.now() - CACHE_DAYS * 864e5).toISOString();
    const r = await fetch(`${SB_URL()}/rest/v1/yt_cache?select=videos&q=eq.${encodeURIComponent(q)}&created_at=gte.${since}&limit=1`, {
      headers: sbHeaders()
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
      headers: { ...sbHeaders(), "content-type": "application/json",
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

// 하루 실시간 검색 수(KST 기준). 한도를 넘으면 두 번째 접속 코드가 있어야 검색
const DAILY_FREE = () => Number(process.env.DAILY_SEARCH_LIMIT || 100);
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function usageGet() {
  if (!SB_URL() || !SB_KEY()) return 0;
  try {
    const r = await fetch(`${SB_URL()}/rest/v1/search_usage?select=searches&day=eq.${kstDay()}`, { headers: sbHeaders() });
    const rows = r.ok ? await r.json() : [];
    return rows[0]?.searches || 0;
  } catch { return 0; }
}
async function usageBump() {
  if (!SB_URL() || !SB_KEY()) return;
  try {
    await fetch(`${SB_URL()}/rest/v1/rpc/bump_search`, {
      method: "POST", headers: { ...sbHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ p_day: kstDay() })
    });
  } catch {}
}

export function hasSecondCode(req) {
  const code = process.env.SECOND_ACCESS_CODE;
  return !!code && req.headers["x-second-code"] === code;
}
const secondCodeError = () => Object.assign(new Error("Daily search limit reached. Enter the second access code to continue."), { secondCode: true });

export async function searchYouTube(rawQ, { second = false } = {}) {
  const q = normQ(rawQ);
  const cached = await cacheGet(q);
  if (cached) return cached;

  const gate = !!process.env.SECOND_ACCESS_CODE;
  if (gate && !second && (await usageGet()) >= DAILY_FREE()) throw secondCodeError();

  let videos, source = "youtube";
  try {
    videos = await youtubeOfficial(q);
  } catch (e) {
    if (!e.fallback) throw e;
    if (gate && !second) throw secondCodeError(); // 유료 백업 검색은 두 번째 코드가 있을 때만
    videos = await youtubeDataForSEO(q);
    source = "dataforseo";
  }
  await usageBump();
  await cacheSet(q, videos, source);
  return videos;
}
