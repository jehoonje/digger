import { usageReport } from "./_lib.js";

// 브라우저 링크로 열 수 있게 ?code=접속코드 도 허용
export default async function handler(req, res) {
  const code = process.env.ACCESS_CODE;
  const given = req.headers["x-access-code"] || req.query?.code;
  if (code && given !== code) return res.status(401).json({ error: "Add ?code=YOUR_ACCESS_CODE to the link." });
  res.setHeader("cache-control", "no-store");
  res.json(await usageReport());
}
