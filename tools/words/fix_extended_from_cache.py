#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
使用本地缓存与核心词库为 zh_gloss_extended.json 补齐简体中文释义（≤25 字）。
策略（按优先级）：
1) 复用当前 zh_gloss_extended.json 中已合规的释义
2) 使用缓存 .cache/gloss_cache.jsonl 中的最后一次非空且合规释义
3) 回退使用 zh_gloss.json（核心词库）中的合规释义（若存在同词）

合规判定：
- 仅简体中文（含 CJK，且不含英文字母）
- 去除首尾空白与中英引号、句点等冗余符号；长度截断至 ≤ 25
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict

BASE_DIR = Path(__file__).resolve().parents[2]
WORDS_DIR = BASE_DIR / "src" / "cocos" / "assets" / "bundle" / "words"
EXT_GLOSS_PATH = WORDS_DIR / "zh_gloss_extended.json"
CORE_GLOSS_PATH = WORDS_DIR / "zh_gloss.json"
CACHE_FILE = Path(__file__).resolve().parent / ".cache" / "gloss_cache.jsonl"

DEFINITION_MAX_LEN = 25
WORD_PATTERN = re.compile(r"^[A-Z]+$")

def is_chinese_text(s: str) -> bool:
    if not s:
        return False
    has_cjk = any("\u4e00" <= ch <= "\u9fff" for ch in s)
    has_ascii_alpha = any(("A" <= ch <= "Z") or ("a" <= ch <= "z") for ch in s)
    return has_cjk and not has_ascii_alpha

def normalize_definition(s: str) -> str:
    if not isinstance(s, str):
        return ""
    s = s.replace("\n", " ").replace("\r", " ").strip()
    s = s.strip("'\"“”‘’· 。，,.;；：:!！?？").strip()
    if len(s) > DEFINITION_MAX_LEN:
        s = s[:DEFINITION_MAX_LEN]
    return s

def load_json(path: Path) -> Dict[str, str]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path: Path, data: Dict[str, str]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)

def load_cache_latest() -> Dict[str, str]:
    """将缓存中每个词的最后一次记录作为最新值返回（非空且合规时使用）。"""
    latest: Dict[str, str] = {}
    if not CACHE_FILE.exists():
        return latest
    with CACHE_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            w = obj.get("word")
            d = obj.get("definition")
            if isinstance(w, str) and isinstance(d, str) and WORD_PATTERN.fullmatch(w):
                nv = normalize_definition(d)
                # 仅在不存在非空合规则候选时，才允许被空值覆盖；
                # 优先保留“非空且合规”的最新记录
                if w not in latest:
                    latest[w] = nv
                else:
                    # 若已有非空且合规，且这次是空或不合规，则跳过
                    if is_chinese_text(latest[w]):
                        if not (nv and is_chinese_text(nv)):
                            continue
                    # 否则用本次值更新（包含从空→非空）
                    latest[w] = nv
    return latest

def try_morphology(word: str, base_defs: Dict[str, str]) -> str:
    """
    基于简单词形还原，用已有 base 释义生成简短中文释义（≤25）：
    - 复数：…（复数）
    - 过去：…（过去）
    - 进行：…（进行）
    - 比较：…（比较）
    - 最高：…（最高）
    """
    w = word
    # ING（prefer base+E, then base）
    if w.endswith("ING") and len(w) > 4:
        base = w[:-3]
        cand = None
        if base + "E" in base_defs and base_defs[base + "E"]:
            cand = base_defs[base + "E"]
        elif base in base_defs and base_defs[base]:
            cand = base_defs[base]
        if cand:
            cand = normalize_definition(cand)
            if cand and is_chinese_text(cand):
                out = f"{cand}（进行）"
                return out[:DEFINITION_MAX_LEN]
    # ED（过去）
    if w.endswith("ED") and len(w) > 3:
        base1 = w[:-2]
        base2 = w[:-1]
        for b in (base1, base2):
            if b in base_defs and base_defs[b]:
                cand = normalize_definition(base_defs[b])
                if cand and is_chinese_text(cand):
                    out = f"{cand}（过去）"
                    return out[:DEFINITION_MAX_LEN]
        # 规则：Y→IED
        if w.endswith("IED") and len(w) > 4:
            b = w[:-3] + "Y"
            if b in base_defs and base_defs[b]:
                cand = normalize_definition(base_defs[b])
                if cand and is_chinese_text(cand):
                    out = f"{cand}（过去）"
                    return out[:DEFINITION_MAX_LEN]
    # 名词/一般复数：…S/…ES → 复数
    if w.endswith("IES") and len(w) > 4:
        b = w[:-3] + "Y"
        if b in base_defs and base_defs[b]:
            cand = normalize_definition(base_defs[b])
            if cand and is_chinese_text(cand):
                out = f"{cand}（复数）"
                return out[:DEFINITION_MAX_LEN]
    if w.endswith("ES") and len(w) > 3:
        b = w[:-2]
        if b in base_defs and base_defs[b]:
            cand = normalize_definition(base_defs[b])
            if cand and is_chinese_text(cand):
                out = f"{cand}（复数）"
                return out[:DEFINITION_MAX_LEN]
    if w.endswith("S") and len(w) > 2:
        b = w[:-1]
        if b in base_defs and base_defs[b]:
            cand = normalize_definition(base_defs[b])
            if cand and is_chinese_text(cand):
                out = f"{cand}（复数）"
                return out[:DEFINITION_MAX_LEN]
    # 形容词比较/最高：…ER/…EST
    if w.endswith("IER") and len(w) > 3:
        b = w[:-3] + "Y"
        if b in base_defs and base_defs[b]:
            cand = normalize_definition(base_defs[b])
            if cand and is_chinese_text(cand):
                out = f"{cand}（比较）"
                return out[:DEFINITION_MAX_LEN]
    if w.endswith("ER") and len(w) > 2:
        b = w[:-2]
        if b in base_defs and base_defs[b]:
            cand = normalize_definition(base_defs[b])
            if cand and is_chinese_text(cand):
                out = f"{cand}（比较）"
                return out[:DEFINITION_MAX_LEN]
    if w.endswith("IEST") and len(w) > 4:
        b = w[:-4] + "Y"
        if b in base_defs and base_defs[b]:
            cand = normalize_definition(base_defs[b])
            if cand and is_chinese_text(cand):
                out = f"{cand}（最高）"
                return out[:DEFINITION_MAX_LEN]
    if w.endswith("EST") and len(w) > 3:
        b = w[:-3]
        if b in base_defs and base_defs[b]:
            cand = normalize_definition(base_defs[b])
            if cand and is_chinese_text(cand):
                out = f"{cand}（最高）"
                return out[:DEFINITION_MAX_LEN]
    return ""

def main():
    ext_gloss = load_json(EXT_GLOSS_PATH)
    core_gloss = load_json(CORE_GLOSS_PATH) if CORE_GLOSS_PATH.exists() else {}
    cache_latest = load_cache_latest()

    fixed: Dict[str, str] = {}
    changed = 0
    invalid_before = 0

    for w, v in ext_gloss.items():
        # 先尝试保留已合规的
        nv = normalize_definition(v)
        if nv and is_chinese_text(nv):
            fixed[w] = nv
            continue
        invalid_before += 1

        # 尝试缓存（优先使用非空且合规）
        cv = cache_latest.get(w, "")
        cvn = normalize_definition(cv)
        if cvn and is_chinese_text(cvn):
            fixed[w] = cvn
            changed += 1
            continue

        # 回退核心词库的释义（若存在且合规）
        kv = core_gloss.get(w, "")
        kvn = normalize_definition(kv)
        if kvn and is_chinese_text(kvn):
            fixed[w] = kvn
            changed += 1
            continue

        # 先占位为空，后续再做词形回补
        fixed[w] = ""

    # 第二轮：基于词形规则进行回补
    # 构建可用 base 释义表（合并 core 与已修复的 extended）
    base_defs: Dict[str, str] = {}
    for k, v in {**core_gloss, **fixed}.items():
        nv = normalize_definition(v)
        if nv and is_chinese_text(nv):
            base_defs[k] = nv
    second_changed = 0
    for w, v in list(fixed.items()):
        if v:
            continue
        mv = try_morphology(w, base_defs)
        if mv:
            fixed[w] = mv
            second_changed += 1
    # 第三轮：兜底填充（确保非空、合规且简短）
    fallback_filled = 0
    for w, v in list(fixed.items()):
        if not v:
            fixed[w] = "英语词汇"
            fallback_filled += 1

    save_json(EXT_GLOSS_PATH, fixed)

    print(f"完成：修复 {changed} 项；词形回补 {second_changed} 项；兜底填充 {fallback_filled} 项；原无效 {invalid_before} 项；总计 {len(fixed)} 项。")

if __name__ == "__main__":
    main()


