import { checkAccess, hasSecondCode } from "./_lib.js";

export default function handler(req, res) {
  if (!checkAccess(req, res)) return;
  if (req.query?.second) return hasSecondCode(req) ? res.json({ ok: true }) : res.status(401).json({ error: "Incorrect code." });
  res.json({ ok: true });
}
