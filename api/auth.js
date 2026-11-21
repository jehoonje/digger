import { checkAccess } from "./_lib.js";

export default function handler(req, res) {
  if (!checkAccess(req, res)) return;
  res.json({ ok: true });
}
