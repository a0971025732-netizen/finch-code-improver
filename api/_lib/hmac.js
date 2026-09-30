// 共用的 HMAC 簽章邏輯，給 finch_v2 協議用。
// 依照 Finch 文件「06 Mutual HMAC signing」那節的規格實作：
//
//   canonical_string = METHOD \n PATH_WITH_QUERY \n TIMESTAMP \n NONCE \n SHA256(raw_body)
//   signature        = v1=<hex HMAC-SHA256(canonical_string, secret)>
//
// finch_v2 的密鑰是 43 字元的 Base64URL 字串，解碼後必須剛好是 32 bytes。
// 這跟 Direct API 完全不同——Direct API 沒有任何簽章機制。

import crypto from "node:crypto";

export function decodeFinchV2Secret(displayedSecret) {
  const bytes = Buffer.from(displayedSecret, "base64url");
  if (bytes.length !== 32) {
    throw new Error("Invalid Finch v2 secret: decoded length must be 32 bytes");
  }
  return bytes;
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function canonicalString({ method, pathWithQuery, timestamp, nonce, rawBody }) {
  return [method, pathWithQuery, timestamp, nonce, sha256Hex(rawBody)].join("\n");
}

function hmacHex(secretBytes, message) {
  return crypto.createHmac("sha256", secretBytes).update(message).digest("hex");
}

export function verifyIncomingSignature({
  method,
  pathWithQuery,
  rawBody,
  headers,
  requestSecretBytes,
  maxSkewSeconds = 300,
}) {
  const keyId = headers["x-platform-key-id"];
  const timestamp = headers["x-platform-timestamp"];
  const nonce = headers["x-platform-nonce"];
  const signature = headers["x-platform-signature"];

  if (!keyId || !timestamp || !nonce || !signature) {
    return { ok: false, reason: "missing_signature_headers" };
  }

  const now = Math.floor(Date.now() / 1000);
  const skew = Math.abs(now - Number(timestamp));
  if (!Number.isFinite(skew) || skew > maxSkewSeconds) {
    return { ok: false, reason: "clock_skew_too_large" };
  }

  const expected =
    "v1=" +
    hmacHex(
      requestSecretBytes,
      canonicalString({ method, pathWithQuery, timestamp, nonce, rawBody })
    );

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

  return valid ? { ok: true, keyId } : { ok: false, reason: "signature_mismatch" };
}

export function signOutgoingResponse({
  method,
  pathWithQuery,
  responseBodyBytes,
  requestSecretBytes,
  keyId,
}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString("hex");
  const signature =
    "v1=" +
    hmacHex(
      requestSecretBytes,
      canonicalString({
        method,
        pathWithQuery,
        timestamp,
        nonce,
        rawBody: responseBodyBytes,
      })
    );

  return {
    "X-Agent-Key-Id": keyId,
    "X-Agent-Timestamp": timestamp,
    "X-Agent-Nonce": nonce,
    "X-Agent-Signature": signature,
  };
}

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
