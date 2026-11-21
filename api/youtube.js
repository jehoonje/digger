import { checkAccess, searchYouTube, hasSecondCode } from "./_lib.js";

export default async function handler(req, res) {
  if (!checkAccess(req, res)) return;
  const q = String(req.query?.q || "").slice(0, 200);
  if (!q) return res.status(400).json({ error: "Missing search query." });
  try {
    res.json({ videos: await searchYouTube(q, { second: hasSecondCode(req) }) });
  } catch (e) {
    res.status(e.secondCode ? 402 : 500).json({ error: e.message, code: e.secondCode ? "second_code_required" : undefined });
  }
}
