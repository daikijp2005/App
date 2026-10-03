// claude.ai アーティファクト版（1ファイルのHTML）を組み立てる。
// 解析・移動時間のロジックはアプリ本体と同じファイルをそのまま埋め込む。
//   node artifact/build.mjs [出力先]   （既定: artifact/futari-ikitai.html）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");
const unexport = (src) => src.replace(/^export /gm, "");
const pickFunction = (src, name) => {
  const start = src.indexOf(`export function ${name}(`);
  const end = src.indexOf("\n}\n", start);
  if (start < 0 || end < 0) throw new Error(`${name} が見つかりません`);
  return unexport(src.slice(start, end + 3));
};

const preview = read("lib/preview.js");
const html = fs.readFileSync(path.join(here, "template.html"), "utf8")
  .replace("/*__ANALYZE__*/", unexport(read("lib/analyze.js")) + "\n" + pickFunction(preview, "detectPlatform") + pickFunction(preview, "normalizeUrl"))
  .replace("/*__UTIL__*/", unexport(read("public/util.js")));

const out = process.argv[2] || path.join(here, "futari-ikitai.html");
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
