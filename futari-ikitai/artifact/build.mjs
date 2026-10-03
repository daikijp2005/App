// claude.ai アーティファクト版（1ファイルのHTML）を組み立てる。
// 画面・解析・移動時間のコードはWebアプリと同じファイルをそのまま埋め込む。
//   node artifact/build.mjs [出力先]   （既定: artifact/futari-ikitai.html）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");
// import 行を消し、export を外して1つのスクリプトにつなげる（import は1行で書く決まり）
const flatten = (src) => src.replace(/^import .* from .*;$/gm, "").replace(/^export (?=(async )?function|const|let|class)/gm, "");

const bundle = [
  flatten(read("lib/analyze.js")),
  flatten(read("lib/prompts.js")),
  flatten(read("public/util.js")),
  flatten(read("public/smart.js")),
  flatten(read("public/core.js")),
  flatten(read("artifact/backend.js")),
].join("\n");
if (/^\s*(import|export) /m.test(bundle)) throw new Error("import/export が残っています");

const html = fs.readFileSync(path.join(here, "template.html"), "utf8")
  .replace("/*__CSS__*/", () => read("public/style.css"))
  .replace("/*__BUNDLE__*/", () => `(() => {\n"use strict";\n${bundle}\n})();`);

const out = process.argv[2] || path.join(here, "futari-ikitai.html");
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
