"""claude.ai で公開するためのページ (dist/index.html) を index.html から作る。

公開時に <html>/<head>/<body> の骨組みが自動で付くため、
タイトル・スタイルシートの読み込み・<body> の中身だけを取り出す。
style.css / parser.js / script.js は dist/ にそのままコピーする。
"""
import pathlib
import re
import shutil

root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "index.html").read_text(encoding="utf-8")

title = re.search(r"<title>.*?</title>", src, re.S).group(0)
links = "\n".join(re.findall(r"<link [^>]*rel=\"stylesheet\"[^>]*>", src))
body = re.search(r"<body>(.*)</body>", src, re.S).group(1).strip()

dist = root / "dist"
dist.mkdir(exist_ok=True)
(dist / "index.html").write_text(f"{title}\n{links}\n{body}\n", encoding="utf-8")
for name in ("style.css", "parser.js", "script.js"):
    shutil.copy(root / name, dist / name)
print(f"built {dist / 'index.html'}")
