# -*- coding: utf-8 -*-
"""打包 Mine2Blend 安装 ZIP。

本仓库源码扁平放在仓库根；Blender add-on 安装包要求顶层是
``mcblock_mine2blend/`` 包目录（``__init__.py`` 的相对导入与注册都依赖它），
本脚本打包时自动加回这一层，并做结构自检。

用法::

    python build_zip.py

产物::

    dist/Mine2Blend.zip   （顶层 mcblock_mine2blend/，含转换器 runtime）

注意：转换器 runtime（node.exe + node_modules）不在 git 中。打出可用的
安装包前，需先在 ``resources/converter/win-x64/`` 下执行 ``npm ci`` 并放入
一个 Windows x64 的 ``node.exe``，否则打出的 zip 不含 runtime、插件虽可
安装但无法完成投影转换。
"""
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOP = "mcblock_mine2blend"
OUT_DIR = os.path.join(HERE, "dist")
OUT_ZIP = os.path.join(OUT_DIR, "Mine2Blend.zip")

# 仅这些是插件源码 / 资源，会被打进 zip；
# README / build_zip.py / .git / .gitignore 等仓库元文件不参与打包。
SOURCE_ITEMS = [
    "blender_manifest.toml",
    "__init__.py",
    "preferences.py",
    "properties.py",
    "core",
    "operators",
    "panels",
    "resources",
]


def _excluded(rel_path: str) -> bool:
    parts = rel_path.replace("\\", "/").split("/")
    if "__pycache__" in parts:
        return True
    if rel_path.endswith(".pyc") or rel_path.endswith(".zip"):
        return True
    return False


def read_version() -> str:
    manifest = os.path.join(HERE, "blender_manifest.toml")
    with open(manifest, "r", encoding="utf-8") as handle:
        text = handle.read()
    m = re.search(r'^version\s*=\s*"([^"]+)"', text, re.MULTILINE)
    return m.group(1) if m else "?"


def _add(zf: zipfile.ZipFile, abs_path: str, rel_from_root: str) -> int:
    if _excluded(rel_from_root):
        return 0
    arcname = TOP + "/" + rel_from_root.replace("\\", "/")
    zf.write(abs_path, arcname)
    return 1


def build() -> int:
    missing = [i for i in SOURCE_ITEMS if not os.path.exists(os.path.join(HERE, i))]
    if missing:
        print("缺少源码项:", missing)
        return 1

    runtime = os.path.join(HERE, "resources", "converter", "win-x64", "node.exe")
    if not os.path.exists(runtime):
        print("[警告] 未找到 resources/converter/win-x64/node.exe")
        print("    打出的 zip 将不含转换器 runtime（插件可安装但无法转换）。")
        print("    请先在该目录执行 `npm ci` 并放入 win-x64 node.exe 再打包。")

    version = read_version()
    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)
    if os.path.exists(OUT_ZIP):
        os.remove(OUT_ZIP)

    count = 0
    with zipfile.ZipFile(OUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in SOURCE_ITEMS:
            abs_item = os.path.join(HERE, item)
            if os.path.isfile(abs_item):
                count += _add(zf, abs_item, item)
                continue
            for root, dirs, files in os.walk(abs_item):
                dirs[:] = [d for d in dirs if d != "__pycache__"]
                for name in files:
                    abs_path = os.path.join(root, name)
                    rel = os.path.relpath(abs_path, HERE)
                    count += _add(zf, abs_path, rel)

    # ---- 结构自检 ----
    with zipfile.ZipFile(OUT_ZIP) as zf:
        names = zf.namelist()
    tops = sorted(set(n.split("/")[0] for n in names))
    problems = []
    if tops != [TOP]:
        problems.append("顶层目录异常: %s" % tops)
    if any("__pycache__" in n for n in names):
        problems.append("混入 __pycache__")
    if any(n.endswith(".pyc") for n in names):
        problems.append("混入 .pyc")
    if "%s/blender_manifest.toml" % TOP not in names:
        problems.append("缺 manifest")
    if "%s/__init__.py" % TOP not in names:
        problems.append("缺 __init__.py")

    print("ZIP:", OUT_ZIP)
    print("version:", version)
    print("entries:", len(names), "| files written:", count)
    print("size bytes:", os.path.getsize(OUT_ZIP))
    print("top-level:", tops)
    if problems:
        print("STRUCTURE CHECK: FAIL")
        for p in problems:
            print("  -", p)
        return 2
    print("STRUCTURE CHECK: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(build())
