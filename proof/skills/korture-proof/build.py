# Korture Proof: put one korture-part JSON into the page. Python twin of build.mjs,
# for AI apps whose sandbox runs Python. Usage: python3 build.py part.json korture-proof.html
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
src, out = sys.argv[1], sys.argv[2]
page = open(os.path.join(here, "page.html"), encoding="utf-8").read()
data = json.dumps(json.load(open(src, encoding="utf-8")), ensure_ascii=False).replace("<", "\\u003c")
open(out, "w", encoding="utf-8").write(page.replace("/*DATA*/", data, 1))
print("wrote", out)
