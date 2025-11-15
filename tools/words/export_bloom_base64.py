#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 english.bloom 二进制文件转为 Base64 文本形式 english.bloom.txt，
方便 Cocos 在编辑器 / 预览环境下以 TextAsset 方式稳定加载。

用法示例：
  cd /Users/elvis/Documents/codes/一个月一个AI项目挑战/2025/9月/w-game
  python3 tools/words/export_bloom_base64.py \
      --in  src/cocos/assets/bundle/words/english.bloom \
      --out src/cocos/assets/bundle/words/english.bloom.txt
"""

import argparse
import base64
import os


def main() -> None:
    ap = argparse.ArgumentParser(description="将 Bloom 二进制转换为 Base64 文本资产")
    ap.add_argument(
        "--in",
        dest="in_path",
        required=True,
        help="输入 Bloom 二进制路径，例如 src/cocos/assets/bundle/words/english.bloom",
    )
    ap.add_argument(
        "--out",
        dest="out_path",
        required=True,
        help="输出 Base64 文本路径，例如 src/cocos/assets/bundle/words/english.bloom.txt",
    )
    args = ap.parse_args()

    with open(args.in_path, "rb") as f:
        data = f.read()

    b64 = base64.b64encode(data).decode("ascii")

    os.makedirs(os.path.dirname(args.out_path), exist_ok=True)
    with open(args.out_path, "w", encoding="utf-8") as f:
        # 去掉换行，避免在 Cocos 里被额外 trim 造成解析问题
        f.write(b64.strip())
        f.write("\n")

    print(
        f"OK: exported base64 bloom ({len(data)} bytes → {len(b64)} chars) "
        f"→ {args.out_path}"
    )


if __name__ == "__main__":
    main()


