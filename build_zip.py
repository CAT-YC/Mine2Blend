# -*- coding: utf-8 -*-
"""打包 Mine2Blend 内测 ZIP（包裹结构 mcblock_mine2blend/ + 结构自检）。

用法：
  python build_zip.py
产物：
  D:\\MYM_BuildCraft\\blender-addon\\Mine2Blend.zip
"""
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(HERE, "mcblock_mine2blend")
OUT_ZIP = os.path.join(HERE, "Mine2Blend.zip")
TOP = "mcblock_mine2blend"

# 备份 / 合并冲突残留：xxx.bak、xxx.bak.<时间戳>、xxx.bak-<日期>、xxx.orig、xxx.rej、xxx~。
# 只认文件名末尾，所以 sprite.orig.png / texture.bakery.png 这类正常命名不会被误杀；
# 但 xxx.bak.png 会被挡掉（带 .bak 中缀的基本只可能是备份）。
_BACKUP_RE = re.compile(r"(?:\.bak(?:[.\-][^\\/]*)?|\.orig|\.rej|~)$", re.IGNORECASE)


def _excluded(rel_path: str) -> bool:
    parts = rel_path.replace("\\", "/").split("/")
    if "__pycache__" in parts:
        return True
    if rel_path.endswith(".pyc"):
        return True
    if rel_path.endswith(".zip"):
        return True
    if _BACKUP_RE.search(parts[-1]):
        return True
    return False


def read_version() -> str:
    manifest = os.path.join(SRC_DIR, "blender_manifest.toml")
    with open(manifest, "r", encoding="utf-8") as handle:
        text = handle.read()
    m = re.search(r'^version\s*=\s*"([^"]+)"', text, re.MULTILINE)
    return m.group(1) if m else "?"


def build() -> int:
    if not os.path.isdir(SRC_DIR):
        print("源目录不存在:", SRC_DIR)
        return 1
    version = read_version()
    if os.path.exists(OUT_ZIP):
        os.remove(OUT_ZIP)

    count = 0
    with zipfile.ZipFile(OUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(SRC_DIR):
            dirs[:] = [d for d in dirs if d != "__pycache__"]
            for name in files:
                abs_path = os.path.join(root, name)
                rel = os.path.relpath(abs_path, SRC_DIR)
                if _excluded(rel):
                    continue
                arcname = TOP + "/" + rel.replace("\\", "/")
                zf.write(abs_path, arcname)
                count += 1

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
    if any(n.endswith(".zip") for n in names):
        problems.append("混入 .zip")
    bak_hits = [n for n in names if _BACKUP_RE.search(n.split("/")[-1])]
    if bak_hits:
        problems.append("混入备份/冲突残留 %d 个: %s" % (len(bak_hits), bak_hits[:3]))
    if "%s/blender_manifest.toml" % TOP not in names:
        problems.append("缺 manifest")
    if "%s/__init__.py" % TOP not in names:
        problems.append("缺 __init__.py")

    size = os.path.getsize(OUT_ZIP)
    print("ZIP:", OUT_ZIP)
    print("version:", version)
    print("entries:", len(names), "| files written:", count)
    print("size bytes:", size)
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
