import { checkAccess, webDetect, vote, resolveAlbum, searchYouTube } from "./_lib.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  if (!checkAccess(req, res)) return;
  try {
    const image = String(req.body?.image || "").replace(/^data:image\/\w+;base64,/, "");
    if (image.length < 100) return res.status(400).json({ error: "The image is empty." });

    const detect = await webDetect(image).catch(e => ({ ok: false, reason: e.message }));
    const votes = vote(detect);
    const album = await resolveAlbum(image, detect, votes);

    if (!album?.artist) return res.json({ found: false, votes, web: detect.ok });

    const q = album.artist + " " + (album.top_track || album.album);
    const videos = await searchYouTube(q).catch(() => []);
    res.json({ found: true, album, videos, votes: votes.slice(0, 5), web: detect.ok, webReason: detect.ok ? undefined : detect.reason });
  } catch (e) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
}
