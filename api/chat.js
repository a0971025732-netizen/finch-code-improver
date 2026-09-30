// Chat Agent（finch_v2 協議）的 P1 同步對話端點。
// 這是 Finch 的 invocationUrl 打進來的地方，一次對話回合 = 一次 HTTP 請求。

import { verifyIncomingSignature, signOutgoingResponse, readRawBody } from "./_lib/hmac.js";
import { scan, scanToText, extractCodeFromText } from "./_lib/scan.js";

export const config = {
  api: { bodyParser: false },
};

function buildFailedResponse(invocationId, message) {
  return {
    protocol_version: "2.0",
    invocation_id: invocationId,
    status: "failed",
    error: { code: "invalid_input", message },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
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
    method: "POST",
    pathWithQuery: req.url,
    rawBody,
    headers: req.headers,
    requestSecretBytes,
  });

  if (!verification.ok) {
    res.status(401).json({ error: "invalid_signature", reason: verification.reason });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "invalid_json" });
    return;
  }

  const invocationId = payload.invocation_id;

  const contentParts = payload?.input?.content;
  const text = Array.isArray(contentParts)
    ? contentParts
        .filter((p) => p?.type === "text")
        .map((p) => p.text)
        .join("\n")
    : "";

  let responsePayload;

  if (!text.trim()) {
    responsePayload = buildFailedResponse(invocationId, "No text content found in this turn");
  } else {
    const code = extractCodeFromText(text);
    const result = scan(code);
    responsePayload = {
      protocol_version: "2.0",
      invocation_id: invocationId,
      status: "completed",
      message: {
        role: "agent",
        content: [{ type: "text", text: scanToText(result) }],
      },
      artifacts: [],
      completed_at: new Date().toISOString(),
    };
  }

  const responseBody = Buffer.from(JSON.stringify(responsePayload));
  const signedHeaders = signOutgoingResponse({
    method: "POST",
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
