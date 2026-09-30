// 兩種連接模式（Direct API / Chat Agent）共用的掃描邏輯。
// Direct API 的 api/invoke.js 跟 Chat Agent 的 api/chat.js
// 都呼叫這裡的 scan()，避免同一套邏輯寫兩份、之後改一邊忘了改另一邊。

export function scan(code, language) {
  const lines = code.split("\n");
  const findings = [];

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const trimmed = line.trim();

    if (/console\.log\(/.test(line)) {
      findings.push({
        severity: "low",
        line: lineNo,
        issue: "遺留的 console.log 除錯輸出",
        suggestion: "上線前移除，或改用正式的 logging 機制",
      });
    }
    if (/\bTODO\b|\bFIXME\b/i.test(line)) {
      findings.push({
        severity: "medium",
        line: lineNo,
        issue: "未完成的 TODO/FIXME 標記",
        suggestion: "確認這個待辦是否還需要處理，處理完就移除註解",
      });
    }
    if (/\bvar\s/.test(line)) {
      findings.push({
        severity: "low",
        line: lineNo,
        issue: "使用了 var 宣告變數",
        suggestion: "改用 const 或 let，避免變數提升造成的意外行為",
      });
    }
    if (/[^=!<>]==[^=]/.test(line) && !/===|!==/.test(line)) {
      findings.push({
        severity: "medium",
        line: lineNo,
        issue: "使用了寬鬆相等 == 而非嚴格相等 ===",
        suggestion: "改用 === / !== 避免型別強制轉換造成的錯誤比對",
      });
    }
    if (trimmed.length > 120) {
      findings.push({
        severity: "low",
        line: lineNo,
        issue: "單行超過 120 字元，可讀性偏低",
        suggestion: "考慮拆成多行或抽出變數",
      });
    }
  });

  if (findings.length === 0) {
    findings.push({
      severity: "info",
      line: 0,
      issue: "未發現明顯問題",
      suggestion: "程式碼在本次掃描規則下沒有觸發任何警示",
    });
  }

  const summary = `掃描了 ${lines.length} 行${language ? ` ${language} ` : ""}程式碼，找到 ${
    findings.filter((f) => f.severity !== "info").length
  } 個可改善項目。`;

  return { summary, findings: findings.slice(0, 15) };
}

export function scanToText(result) {
  const lines = [result.summary, ""];
  result.findings.forEach((f, i) => {
    lines.push(`${i + 1}. [${f.severity}] 第 ${f.line} 行：${f.issue}`);
    lines.push(`   建議：${f.suggestion}`);
  });
  return lines.join("\n");
}

export function extractCodeFromText(text) {
  const fenced = text.match(/```(?:[a-zA-Z]*\n)?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}
