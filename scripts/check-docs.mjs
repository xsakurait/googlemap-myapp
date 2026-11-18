// check-docs.mjs - 設計書フォーマットチェック
// docs/ 配下の Markdown が「決まったフォーマット」で作られているかを確認する。
// チェック内容:
//   1. ファイル名が NN_名前.md（2桁連番 + アンダースコア）形式
//   2. BOM なし（UTF-8）
//   3. 先頭行が H1（# ）で始まる
//   4. H1 が文書内に1つだけ
//   5. 見出しレベルが飛ばない（# の次に ### が来る等はNG）
//   6. ファイル末尾が改行で終わる
// README.md については 2,3,6 のみ確認する。
// 違反があれば内容を表示して exit 1。

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const root = process.cwd();
const errors = [];

function checkCommon(file, content) {
  if (content.charCodeAt(0) === 0xfeff) errors.push(`${file}: BOM が付いています（UTF-8・BOMなしにしてください）`);
  if (!content.endsWith("\n")) errors.push(`${file}: 末尾が改行で終わっていません`);
  const lines = content.split(/\r?\n/);
  const first = lines.find((l) => l.trim() !== "");
  if (!first || !first.startsWith("# ")) errors.push(`${file}: 先頭行は H1（# タイトル）にしてください`);
  return lines;
}

function checkDesignDoc(file, content) {
  const name = basename(file);
  if (!/^\d{2}_.+\.md$/.test(name)) {
    errors.push(`${file}: ファイル名は「NN_名前.md」（2桁連番）形式にしてください`);
  }
  const lines = checkCommon(file, content);
  let prevLevel = 0;
  let h1Count = 0;
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith("```")) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s/);
    if (!m) continue;
    const level = m[1].length;
    if (level === 1) h1Count++;
    if (prevLevel > 0 && level > prevLevel + 1) {
      errors.push(`${file}: 見出しレベルが飛んでいます（H${prevLevel} の次に H${level}）: ${line}`);
    }
    prevLevel = level;
  }
  if (h1Count !== 1) errors.push(`${file}: H1 は文書内に1つだけにしてください（現在 ${h1Count} 個）`);
}

const docsDir = join(root, "docs");
if (existsSync(docsDir)) {
  for (const name of readdirSync(docsDir).filter((f) => f.endsWith(".md")).sort()) {
    const file = join("docs", name);
    checkDesignDoc(file, readFileSync(join(root, file), "utf8"));
  }
} else {
  console.log("docs/ がないため設計書チェックをスキップしました");
}

const readme = join(root, "README.md");
if (existsSync(readme)) checkCommon("README.md", readFileSync(readme, "utf8"));

if (errors.length > 0) {
  console.error("フォーマットチェック NG:");
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
}
console.log("フォーマットチェック OK（docs/*.md, README.md）");
