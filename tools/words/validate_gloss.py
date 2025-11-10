#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
校验 zh_gloss.json / zh_gloss_extended.json 的覆盖率与合规性：
- 仅包含对应词库的词
- 键：全大写 A-Z
- 值：简体中文，长度 ≤ 25（可配置）
输出统计：总词数、已覆盖、缺失、违规样本（前若干条）
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

BASE_DIR = Path(__file__).resolve().parents[2]
WORDS_DIR = BASE_DIR / "src" / "cocos" / "assets" / "bundle" / "words"
CORE_WORDS_PATH = WORDS_DIR / "words_core.json"
EXT_WORDS_PATH = WORDS_DIR / "words_extended.json"
CORE_GLOSS_PATH = WORDS_DIR / "zh_gloss.json"
EXT_GLOSS_PATH = WORDS_DIR / "zh_gloss_extended.json"

DEFINITION_MAX_LEN = 25
WORD_PATTERN = re.compile(r"^[A-Z]+$")

def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

def flatten_words(words_json: dict) -> List[str]:
    by_len = words_json.get("by_len", {})
    result: List[str] = []
    for k in sorted(by_len.keys(), key=lambda x: int(x) if x.isdigit() else 0):
        for w in by_len[k]:
            if isinstance(w, str):
                wu = w.strip().upper()
                if WORD_PATTERN.fullmatch(wu):
                    result.append(wu)
    # 去重保持顺序
    seen = set()
    deduped = []
    for w in result:
        if w not in seen:
            seen.add(w)
            deduped.append(w)
    return deduped

def is_chinese_text(s: str) -> bool:
    if not s:
        return False
    has_cjk = any('\u4e00' <= ch <= '\u9fff' for ch in s)
    has_ascii_alpha = any(('A' <= ch <= 'Z') or ('a' <= ch <= 'z') for ch in s)
    return has_cjk and not has_ascii_alpha

def validate_bucket(bucket_name: str, words_path: Path, gloss_path: Path) -> None:
    words = flatten_words(load_json(words_path))
    gloss: Dict[str, str] = {}
    if gloss_path.exists():
        gloss = load_json(gloss_path)

    set_words = set(words)
    set_gloss_keys = set(gloss.keys())

    # 覆盖率
    missing = [w for w in words if w not in set_gloss_keys]
    extra = [k for k in set_gloss_keys if k not in set_words]

    # 违规值
    invalid_defs: List[Tuple[str, str, str]] = []
    for k in (set_gloss_keys & set_words):
        v = gloss.get(k, "")
        if not isinstance(v, str):
            invalid_defs.append((k, str(v), "非字符串"))
            continue
        vv = v.strip()
        if len(vv) == 0:
            invalid_defs.append((k, vv, "空释义"))
            continue
        if len(vv) > DEFINITION_MAX_LEN:
            invalid_defs.append((k, vv[:40], f"超长({len(vv)})"))
            continue
        if not is_chinese_text(vv):
            invalid_defs.append((k, vv[:40], "非纯中文"))

    print(f"[{bucket_name}] 总词数={len(words)} 覆盖={len(set_gloss_keys & set_words)} 缺失={len(missing)} 额外键={len(extra)} 违规值={len(invalid_defs)}")
    if missing:
        print(f"  缺失样本(≤10)：{missing[:10]}")
    if extra:
        print(f"  额外键样本(≤10)：{extra[:10]}")
    if invalid_defs:
        print(f"  违规样本(≤10)：{invalid_defs[:10]}")

def main():
    print("校验开始...")
    validate_bucket("core", CORE_WORDS_PATH, CORE_GLOSS_PATH)
    validate_bucket("extended", EXT_WORDS_PATH, EXT_GLOSS_PATH)
    print("校验结束")

if __name__ == "__main__":
    main()


