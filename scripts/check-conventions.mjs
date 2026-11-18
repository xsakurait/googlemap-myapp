// コーディング規約チェック（依存なし・Node標準のみ）
// 判定する規約は docs/12_コーディング規約とCIチェック.md に記述する。
// 違反があれば一覧を出して exit 1、なければ exit 0。
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const SRC = "src";
const violations = [];
const notes = [];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const files = walk(SRC).filter((f) => /\.tsx?$/.test(f));

// --- 1. 構成チェック ---
// 配置を許可するルート: src/app（画面・API）, src/lib（共通）, src/features（機能単位）
const allowedRoots = [/^src\/app\//, /^src\/lib\//, /^src\/features\//];
for (const f of files) {
  if (!allowedRoots.some((r) => r.test(f))) {
    violations.push(`構成: ${f} は許可された配置（app / lib / features）ではありません`);
  }
}
const hasFeatures = files.some((f) => f.startsWith("src/features/"));
notes.push(
  hasFeatures
    ? "構成の判定: feature ベース（src/features 配下に機能単位のコードがあります）"
    : "構成の判定: レイヤー型（src/lib 集約）。feature ベースではありません",
);

// --- 2. 命名規則 ---
const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const pascal = /^[A-Z][A-Za-z0-9]*$/;
const camel = /^[a-z][A-Za-z0-9]*$/;
const upperSnake = /^[A-Z][A-Z0-9_]*$/;
const httpHandlers = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

for (const f of files) {
  const base = basename(f).replace(/\.tsx?$/, "");
  if (!kebab.test(base)) {
    violations.push(`命名: ファイル名 ${f} は kebab-case ではありません`);
  }
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/export\s+(?:class|interface|type|enum)\s+([A-Za-z0-9_]+)/g)) {
    if (!pascal.test(m[1])) violations.push(`命名: 型・クラス名 ${m[1]}（${f}）は PascalCase ではありません`);
  }
  for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) {
    if (!camel.test(m[1]) && !httpHandlers.has(m[1])) {
      violations.push(`命名: 関数名 ${m[1]}（${f}）は camelCase ではありません`);
    }
  }
  for (const m of text.matchAll(/export\s+const\s+([A-Za-z0-9_]+)/g)) {
    if (!camel.test(m[1]) && !pascal.test(m[1]) && !upperSnake.test(m[1])) {
      violations.push(`命名: 定数名 ${m[1]}（${f}）は camelCase / PascalCase / UPPER_SNAKE_CASE のいずれでもありません`);
    }
  }
}

// --- 3. コメントの禁止語（個人名・AI名）と 4. メソッドコメント ---
const forbidden = ["Muse", "chatgpt", "gpt-", "copilot", "gemini", "ai生成", "生成ai", "土沼", "武広", "take2", "xsakurait"];
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) {
      const low = t.toLowerCase();
      for (const w of forbidden) {
        if (low.includes(w)) {
          violations.push(`コメント禁止語: ${f}:${i + 1} に「${w}」が含まれます（個人名・AI名は書かない）`);
        }
      }
    }
    if (/^export\s+(async\s+)?function\s|^export\s+class\s/.test(line)) {
      let j = i - 1;
      while (j >= 0 && lines[j].trim() === "") j--;
      const above = j >= 0 ? lines[j].trim() : "";
      if (!/^(\/\/|\/\*|\*)/.test(above)) {
        violations.push(`メソッドコメント: ${f}:${i + 1} の export 関数・クラスに直前コメントがありません`);
      }
    }
  });
}

for (const n of notes) console.log(n);
if (violations.length > 0) {
  console.error(`規約違反 ${violations.length} 件:`);
  for (const v of violations) console.error(" - " + v);
  process.exit(1);
}
console.log("規約チェック OK（命名・コメント・配置）");
