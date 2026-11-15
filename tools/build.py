"""Сборка живого макета, чтобы он открывался и двойным кликом по index.html (file:///), и на GitHub Pages.

Браузер не запускает модули (<script type="module">) и не даёт fetch() с адресов file:///, поэтому:
  - data/data.js  – data/geo.json и data/stations.json в виде window.TKP_DATA (вместо fetch);
  - js/bundle.js (ТКП) и js/rm-bundle.js (РМ) – модули js/*.js одним обычным скриптом: каждый модуль в своей функции,
                    import/export заменены общим объектом.
Исходники остаются модулями в js/, после правки в них запустить:  python tools/build.py
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
# зависимости раньше тех, кто их импортирует
BUNDLES = {
    "js/bundle.js": ["labels", "geo", "data", "board", "shift", "app"],               # табло ТКП, index.html
    "js/rm-bundle.js": ["labels", "geo", "data", "board", "shift", "rmdata", "rm"],   # РМ мониторинга, rm.html
}

# 1. данные
geo = json.loads((ROOT / "data/geo.json").read_text(encoding="utf-8"))
stations = json.loads((ROOT / "data/stations.json").read_text(encoding="utf-8"))
(ROOT / "data/data.js").write_text(
    "// Сгенерировано tools/build.py из data/geo.json и data/stations.json – не править вручную.\n"
    "window.TKP_DATA = " + json.dumps({"geo": geo, "stations": stations}, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8", newline="\n")

# 2. скрипты
IMPORT = re.compile(r'^import\s*\{([^}]*)\}\s*from\s*"\./([a-z]+)\.js";\s*$', re.M)
EXPORT = re.compile(r'^export\s+((?:async\s+)?function\s+(\w+)|const\s+(\w+))', re.M)
def bundle(out, order):
    parts = ["// Сгенерировано tools/build.py из js/*.js – не править вручную, правки вносить в исходники.\n"
             "(function () {\n\"use strict\";\nconst __M = {};\n"]
    for name in order:
        src = (ROOT / f"js/{name}.js").read_text(encoding="utf-8")

        def imp(m):
            names = [n.strip() for n in m.group(1).split(",") if n.strip()]
            names = [re.sub(r"\s+as\s+", ": ", n) for n in names]
            return "const { " + ", ".join(names) + " } = __M;"

        src, n_imp = IMPORT.subn(imp, src)
        exported = []

        def exp(m):
            exported.append(m.group(2) or m.group(3))
            return m.group(1)

        src = EXPORT.sub(exp, src)
        if re.search(r'^\s*(import|export)\b', src, re.M):
            raise SystemExit(f"{name}.js: осталась конструкция import/export, сборщик её не понимает")
        parts.append(f"\n// ---- {name}.js ----\n(function () {{\n{src}\nObject.assign(__M, {{ {', '.join(exported)} }});\n}})();\n")
    parts.append("})();\n")
    (ROOT / out).write_text("".join(parts), encoding="utf-8", newline="\n")


for out, order in BUNDLES.items():
    bundle(out, order)
print("собраны: data/data.js, " + ", ".join(BUNDLES))
