// 模擬 Finch 平台打一次帶簽章的請求過來，讓你在正式送 Finch 連線測試前，
// 自己先驗證整條 HMAC 簽章鏈路是不是真的通。
//
// 用法：
//   FINCH_V2_KEY_ID=finch.agenton.xxx \
//   FINCH_V2_REQUEST_SECRET=xxxxxxxx \
//   BASE_URL=https://finch-code-improver.vercel.app \
//   node scripts/test-chat.mjs

import crypto from "node:crypto";

const keyId = process.env.FINCH_V2_KEY_ID;
const displayedSecret = process.env.FINCH_V2_REQUEST_SECRET;
const baseUrl = process.env.BASE_URL || "http://localhost:3000";

if (!keyId || !displayedSecret) {
  console.error("請先設定 FINCH_V2_KEY_ID 和 FINCH_V2_REQUEST_SECRET 環境變數再執行");
  process.exit(1);
}

const secretBytes = Buffer.from(displayedSecret, "base64url");
if (secretBytes.length !== 32) {
  console.error(`密鑰解碼後長度是 ${secretBytes.length} bytes，應該要是 32 bytes，請確認貼對了密鑰`);
  process.exit(1);
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sign(method, pathWithQuery, bodyBuf, timestamp, nonce) {
  const canonical = [method, pathWithQuery, timestamp, nonce, sha256Hex(bodyBuf)].join("\n");
  return "v1=" + crypto.createHmac("sha256", secretBytes).update(canonical).digest("hex");
}

async function main() {
  const path = "/api/chat";
  const body = {
    protocol_version: "2.0",
    invocation_id: crypto.randomUUID(),
    dispatch_id: crypto.randomUUID(),
    service_version_id: crypto.randomUUID(),
    offer_id: crypto.randomUUID(),
    offer_revision: 1,
    interaction_mode: "conversation_turn",
    quantity: 1,
    terms_hash: "0x" + "00".repeat(32),
    request_hash: "0x" + "00".repeat(32),
    conversation: {
      conversation_id: crypto.randomUUID(),
      turn_id: crypto.randomUUID(),
      context_mode: "platform_managed",
      messages: [],
    },
    input: {
      content: [
        {
          type: "text",
          text: "```js\nvar x = 1\nif (x == 1) { console.log(x) }\n```",
        },
      ],
      parameters: {},
    },
    task_completed: false,
  };

  const bodyBuf = Buffer.from(JSON.stringify(body));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString("hex");
  const signature = sign("POST", path, bodyBuf, timestamp, nonce);

  console.log("→ 送出模擬的 Finch 簽名請求到", baseUrl + path);

  const resp = await fetch(baseUrl + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Platform-Key-Id": keyId,
      "X-Platform-Timestamp": timestamp,
      "X-Platform-Nonce": nonce,
      "X-Platform-Signature": signature,
    },
    body: bodyBuf,
  });

  const respBodyText = await resp.text();

  console.log("\n--- 回應狀態 ---");
  console.log("HTTP status:", resp.status);

  console.log("\n--- 回應簽章 headers ---");
  ["x-agent-key-id", "x-agent-timestamp", "x-agent-nonce", "x-agent-signature"].forEach((h) => {
    console.log(`${h}:`, resp.headers.get(h) || "(missing)");
  });

  const respTimestamp = resp.headers.get("x-agent-timestamp");
  const respNonce = resp.headers.get("x-agent-nonce");
  const respSignature = resp.headers.get("x-agent-signature");

  if (respTimestamp && respNonce && respSignature) {
    const expected = sign("POST", path, Buffer.from(respBodyText), respTimestamp, respNonce);
    console.log(
      "\n回應簽章驗證：",
      expected === respSignature ? "✅ 通過，簽章正確" : "❌ 失敗，簽章對不上"
    );
  } else {
    console.log("\n⚠️ 回應缺少簽章 headers，可能是驗證失敗時的錯誤回應（正常會沒簽章）");
  }

  console.log("\n--- 回應內容 ---");
  try {
    console.log(JSON.stringify(JSON.parse(respBodyText), null, 2));
  } catch {
    console.log(respBodyText);
  }
}

main().catch((err) => {
  console.error("測試腳本執行失敗：", err);
  process.exit(1);
});
