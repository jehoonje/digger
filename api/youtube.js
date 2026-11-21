import { checkAccess, searchYouTube } from "./_lib.js";

export default async function handler(req, res) {
  if (!checkAccess(req, res)) return;
  const q = String(req.query?.q || "").slice(0, 200);
  if (!q) return res.status(400).json({ error: "검색어가 없어요." });
  try {
    res.json({ videos: await searchYouTube(q) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
