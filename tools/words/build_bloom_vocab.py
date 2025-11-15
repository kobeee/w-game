#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 SCOWL 词表构建 Bloom 过滤器专用词表

目标：
- 生成约 100 万规模的英语词表，供 build_bloom.py 使用
- 优先覆盖长度 3~7 的单词，其次再补充更长的单词

用法示例：
  cd /Users/elvis/Documents/codes/一个月一个AI项目挑战/2025/9月/w-game
  python3 tools/words/build_bloom_vocab.py \
      --scowl tools/words/scowl-2020.12.07.tar.gz \
      --out   tools/words/english_bloom_vocab.txt \
      --max-words 1000000

然后再用生成的 english_bloom_vocab.txt 构建 Bloom：
  python3 tools/words/build_bloom.py \
      --vocab tools/words/english_bloom_vocab.txt \
      --out   src/cocos/assets/bundle/words/english.bloom \
      --bits  12000000 \
      --k     7
"""

import argparse
import io
import os
import re
import tarfile
from typing import Iterable, Set, List

WORD_RE = re.compile(r"^[A-Za-z]+$")


def iter_scowl_words(scowl_tar_path: str) -> Iterable[str]:
    """
    从 SCOWL 的 tar.gz 中遍历所有看起来像单词列表的文件，解析出单词。

    由于具体目录结构可能有所差异，这里采用“尽量宽松”的策略：
    - 只读取普通文件（regular file）
    - 文件名以 .txt 结尾，或没有扩展名
    - 行内容满足 [A-Za-z]+ 视为一个单词
    """
    with tarfile.open(scowl_tar_path, "r:gz") as tf:
        for member in tf.getmembers():
            if not member.isreg():
                continue

            name = member.name
            base = os.path.basename(name)
            root, ext = os.path.splitext(base)

            # 只关心看起来像词表的文件
            if ext not in ("", ".txt"):
                continue
            if not root:
                continue

            f = tf.extractfile(member)
            if not f:
                continue

            # SCOWL 默认是 ASCII 文本，这里使用 latin-1 容错读取
            for raw_line in io.TextIOWrapper(f, encoding="latin-1"):
                line = raw_line.strip()
                if not line:
                    continue
                if not WORD_RE.match(line):
                    continue
                yield line.upper()


def build_vocab(
    scowl_tar_path: str,
    max_words: int,
    min_len: int = 3,
    max_len: int = 32,
) -> List[str]:
    """
    从 SCOWL 生成去重后的单词列表，并按长度优先级裁剪到 max_words。
    优先级规则：
      1. 先收集长度在 [min_len, 7] 的单词
      2. 再收集长度在 [8, max_len] 的单词
      3. 总量不超过 max_words
    """
    seen: Set[str] = set()
    bucket_short: Set[str] = set()   # len 3~7
    bucket_long: Set[str] = set()    # len >=8

    for w in iter_scowl_words(scowl_tar_path):
        if w in seen:
            continue
        seen.add(w)

        if not (min_len <= len(w) <= max_len):
            continue

        if len(w) <= 7:
            bucket_short.add(w)
        else:
            bucket_long.add(w)

    # 排序：先短再长，内部按字典序
    short_list = sorted(bucket_short)
    long_list = sorted(bucket_long)

    ordered: List[str] = []
    ordered.extend(short_list)
    ordered.extend(long_list)

    if len(ordered) > max_words:
        ordered = ordered[:max_words]

    return ordered


def main() -> None:
    ap = argparse.ArgumentParser(description="从 SCOWL 构建 Bloom 用词表（优先覆盖 3~7 字母）")
    ap.add_argument(
        "--scowl",
        required=True,
        help="SCOWL tar.gz 路径，例如 tools/words/scowl-2020.12.07.tar.gz",
    )
    ap.add_argument(
        "--out",
        required=True,
        help="输出词表文件路径，例如 tools/words/english_bloom_vocab.txt",
    )
    ap.add_argument(
        "--max-words",
        type=int,
        default=1_000_000,
        help="词表上限（默认 1,000,000）",
    )
    ap.add_argument(
        "--min-len",
        type=int,
        default=3,
        help="单词最小长度（默认 3）",
    )
    ap.add_argument(
        "--max-len",
        type=int,
        default=32,
        help="单词最大长度（默认 32）",
    )
    args = ap.parse_args()

    vocab = build_vocab(
        scowl_tar_path=args.scowl,
        max_words=args.max_words,
        min_len=args.min_len,
        max_len=args.max_len,
    )

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        for w in vocab:
            f.write(w)
            f.write("\n")

    print(
        f"OK: built vocab with {len(vocab)} words "
        f"(3~7 letters prioritized) → {args.out}"
    )


if __name__ == "__main__":
    main()


