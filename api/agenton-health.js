// Chat Agent（finch_v2 / AgentOn 協議）專用的 Health 端點。
// 跟 Direct API 的 /api/health 不一樣：這個要驗證 Finch 送來的簽名，
// 回應時也要自己簽名，兩邊都要帶 HMAC，這是 P1-P3 的規格。

import { verifyIncomingSignature, signOutgoingResponse, readRawBody } from "./_lib/hmac.js";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }

  const requestSecretBytes = Buffer.from(process.env.FINCH_V2_REQUEST_SECRET, "base64url");
  const keyId = process.env.FINCH_V2_KEY_ID;

  if (!process.env.FINCH_V2_REQUEST_SECRET || !keyId) {
    res.status(500).json({ error: "server_misconfigured" });
    return;
  }

  const rawBody = await readRawBody(req);

  const verification = verifyIncomingSignature({
    method: "GET",
    pathWithQuery: req.url,
    rawBody,
    headers: req.headers,
    requestSecretBytes,
  });

  if (!verification.ok) {
    res.status(401).json({ error: "invalid_signature", reason: verification.reason });
    return;
  }

  const responseBody = Buffer.from(JSON.stringify({ status: "ready" }));
  const signedHeaders = signOutgoingResponse({
    method: "GET",
    pathWithQuery: req.url,
    responseBodyBytes: responseBody,
    requestSecretBytes,
    keyId,
  });

  res.writeHead(200, {
    "Content-Type": "application/json",
    ...signedHeaders,
  });
  res.end(responseBody);
}
