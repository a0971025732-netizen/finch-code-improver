// Finch Direct API (P4) Invocation endpoint.
// 輸入 schema： { "code": string (必填), "language": string (選填) }
// 輸出 schema： { "summary": string, "findings": [{severity, line, issue, suggestion}] }
//
// P4 沒有任何簽章機制，是三種連接模式裡最簡單的一種。
// 真正的掃描邏輯在 api/_lib/scan.js，這裡只負責處理 HTTP 請求/回應。

import { scan } from "./_lib/scan.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  let body = req.body;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "invalid_request", message: "Missing JSON body" });
    return;
  }

  const { code, language } = body;
  if (typeof code !== "string" || code.trim().length === 0) {
    res.status(400).json({ error: "invalid_request", message: "`code` must be a non-empty string" });
    return;
  }

  const result = scan(code, typeof language === "string" ? language : undefined);
  res.status(200).json(result);
}
