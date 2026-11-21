import { checkAccess, webDetect, vote, resolveAlbum, searchYouTube, hasSecondCode,
  decideByEvidence, albumDetails, logRecognition } from "./_lib.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  if (!checkAccess(req, res)) return;
  try {
    const image = String(req.body?.image || "").replace(/^data:image\/\w+;base64,/, "");
    if (image.length < 100) return res.status(400).json({ error: "The image is empty." });

    const detect = await webDetect(image).catch(e => ({ ok: false, reason: e.message }));
    const votes = vote(detect);
    const album = await resolveAlbum(image, detect, votes);
    const geminiAlbum = album?.album;

    let verdict = { decision: "none" };
    if (album?.artist) {
      verdict = decideByEvidence(album, detect);
      if (verdict.override) {
        const d = await albumDetails(album.artist, verdict.override).catch(() => null);
        Object.assign(album, { album: verdict.override, year: d?.year || "", genre: d?.genre || album.genre,
          top_track: d?.top_track || "", tracks: d?.tracks || [], source: "web" });
      }
    }

    await logRecognition({
      web_ok: !!detect.ok, web_reason: detect.ok ? null : String(detect.reason || ""),
      best_guess: detect.ok ? detect.bestGuess.join(" / ") : null,
      full_titles: detect.ok ? detect.pages.filter(p => p.full).map(p => p.title).slice(0, 15) : null,
      partial_titles: detect.ok ? detect.pages.filter(p => !p.full).map(p => p.title).slice(0, 10) : null,
      model: album?.model || null, gemini_album: geminiAlbum || null, final_album: album?.album || null,
      decision: verdict.decision, candidates: verdict.scores || album?.candidates || null
    });

    if (!album?.artist) return res.json({ found: false, web: detect.ok });

    const q = album.artist + " " + (album.top_track || album.album);
    let needSecond = false, secondMsg = "";
    const videos = await searchYouTube(q, { second: hasSecondCode(req) })
      .catch(e => { if (e.secondCode) { needSecond = true; secondMsg = e.message; } return []; });
    res.json({ found: true, needSecond, secondMsg, album, videos, web: detect.ok });
  } catch (e) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
}
