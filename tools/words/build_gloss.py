#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 words_core.json / words_extended.json 生成中文释义映射：
- 输出：zh_gloss.json / zh_gloss_extended.json
- 规范：值为简体中文（≤ 25 字），仅包含对应词库的词；键为全大写 A-Z
- 数据源：优先使用现有 gloss 中的合规释义；缺失/不合规则调用 Cloudflare Worker 的 Gemini 代理补齐
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Dict, List, Set, Tuple, Optional
from urllib import request, error

BASE_DIR = Path(__file__).resolve().parents[2]
WORDS_DIR = BASE_DIR / "src" / "cocos" / "assets" / "bundle" / "words"
CORE_WORDS_PATH = WORDS_DIR / "words_core.json"
EXT_WORDS_PATH = WORDS_DIR / "words_extended.json"
CORE_GLOSS_PATH = WORDS_DIR / "zh_gloss.json"
EXT_GLOSS_PATH = WORDS_DIR / "zh_gloss_extended.json"

CACHE_DIR = Path(__file__).resolve().parent / ".cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_FILE = CACHE_DIR / "gloss_cache.jsonl"

# 环境变量：自定义 Worker 入口与并发度
WORKER_URL = os.environ.get("WG_GEMINI_WORKER_URL", "https://ai.elvis1949.cloudns.pro/gemini/generate")
MAX_CONCURRENCY = int(os.environ.get("WG_MAX_CONCURRENCY", "5"))
TIMEOUT_SEC = int(os.environ.get("WG_TIMEOUT_SEC", "8"))
RETRY_TIMES = int(os.environ.get("WG_RETRY_TIMES", "2"))
DEFINITION_MAX_LEN = int(os.environ.get("WG_DEF_MAX_LEN", "25"))

WORD_PATTERN = re.compile(r"^[A-Z]+$")

def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)

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
    seen: Set[str] = set()
    deduped: List[str] = []
    for w in result:
        if w not in seen:
            seen.add(w)
            deduped.append(w)
    return deduped

def is_chinese_text(s: str) -> bool:
    # 只要包含中文且不包含英文字母视为中文文本（宽松）
    if not s:
        return False
    has_cjk = any('\u4e00' <= ch <= '\u9fff' for ch in s)
    has_ascii_alpha = any(('A' <= ch <= 'Z') or ('a' <= ch <= 'z') for ch in s)
    return has_cjk and not has_ascii_alpha

def normalize_definition(s: str) -> str:
    if not isinstance(s, str):
        return ""
    s = s.replace("\n", " ").replace("\r", " ").strip()
    # 去掉开头/结尾的中英文引号与句号等冗余
    s = s.strip('"\''"“”‘’· ").strip()
    # 限长
    if len(s) > DEFINITION_MAX_LEN:
        s = s[:DEFINITION_MAX_LEN]
    return s

def try_use_existing(gloss: Dict[str, str], word: str) -> Optional[str]:
    """
    若已有释义且合规（中文、≤25），直接使用。
    """
    v = gloss.get(word)
    if not v:
        return None
    nv = normalize_definition(v)
    if nv and is_chinese_text(nv):
        return nv
    return None

def gemini_prompt(word: str) -> dict:
    # 设计文档的中文提示词 + 结构化输出
    prompt = (
        "你是词典校验助手。请仅返回 JSON。\n"
        "任务：判断输入是否为有效的英语单词（包含俚语、专有名词）。\n"
        "若有效，请用简体中文在 20 字以内给出简明释义；若无效，释义用空字符串。\n"
        f'输入："{word}"\n'
        '输出 JSON 严格符合：\n'
        '{"valid": true/false, "definition": "中文释义或空字符串"}\n'
        "不得输出除 JSON 外的任何字符（禁止 Markdown、代码块、解释说明）。"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 64,
            "candidateCount": 1,
            "response_mime_type": "application/json",
            "response_schema": {
                "type": "OBJECT",
                "properties": {
                    "valid": {"type": "BOOLEAN"},
                    "definition": {"type": "STRING"},
                },
                "required": ["valid", "definition"],
            },
        },
    }
    return body

def http_post_json(url: str, payload: dict, timeout: int) -> Tuple[int, str]:
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            code = resp.getcode()
            text = resp.read().decode("utf-8", errors="replace")
            return code, text
    except error.HTTPError as e:
        try:
            text = e.read().decode("utf-8", errors="replace")
        except Exception:
            text = str(e)
        return e.code, text
    except Exception as e:
        return 0, str(e)

def extract_text_from_gemini(raw: dict) -> Optional[str]:
    # 优先 candidates[0].content.parts[0].text
    try:
        cands = raw.get("candidates")
        if isinstance(cands, list) and cands:
            parts = cands[0]["content"]["parts"]
            if isinstance(parts, list) and parts:
                return parts[0].get("text")
    except Exception:
        pass
    # 兼容少见直接对象
    if "valid" in raw and "definition" in raw:
        return json.dumps(raw, ensure_ascii=False)
    return None

def try_parse_json(s: str) -> Optional[dict]:
    if not s:
        return None
    # 容错剥离 ```json ... ```
    s2 = s.strip()
    s2 = re.sub(r"^```(json)?", "", s2, flags=re.IGNORECASE).strip()
    s2 = re.sub(r"```$", "", s2).strip()
    # 截取首尾花括号
    m = re.search(r"\{.*\}", s2, flags=re.DOTALL)
    if m:
        s2 = m.group(0)
    try:
        return json.loads(s2)
    except Exception:
        return None

def fetch_definition(word: str) -> Optional[str]:
    payload = gemini_prompt(word)
    for attempt in range(1 + RETRY_TIMES):
        code, text = http_post_json(WORKER_URL, payload, timeout=TIMEOUT_SEC)
        if code == 200 and text:
            try:
                raw = json.loads(text)
            except Exception:
                raw = try_parse_json(text)
            if isinstance(raw, dict):
                body_text = extract_text_from_gemini(raw)
                if body_text:
                    obj = try_parse_json(body_text)
                else:
                    obj = raw if ("valid" in raw and "definition" in raw) else None
                if isinstance(obj, dict):
                    valid = bool(obj.get("valid", False))
                    definition = normalize_definition(str(obj.get("definition", "")).strip())
                    if valid and is_chinese_text(definition):
                        return definition
                    # 无效或空释义：返回空，让上层决定是否接受空释义
                    return ""
        # 退避
        time.sleep(0.8 * (attempt + 1))
    return None

def load_cache() -> Dict[str, str]:
    cache: Dict[str, str] = {}
    if not CACHE_FILE.exists():
        return cache
    with CACHE_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                w = obj.get("word")
                d = obj.get("definition")
                if isinstance(w, str) and isinstance(d, str):
                    cache[w] = d
            except Exception:
                continue
    return cache

def append_cache(word: str, definition: str) -> None:
    with CACHE_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"word": word, "definition": definition}, ensure_ascii=False))
        f.write("\n")

def build_for_bucket(
    bucket_name: str,
    words: List[str],
    existing_gloss: Dict[str, str],
    target_path: Path,
    allow_empty_definition: bool = False,
) -> Tuple[int, int, int]:
    """
    返回 (total, reused, fetched)
    """
    # 仅保留本 bucket 的键
    output: Dict[str, str] = {}
    # 先尝试沿用合规释义
    for w in words:
        reuse = try_use_existing(existing_gloss, w)
        if reuse is not None:
            output[w] = reuse
    reused = len(output)

    # 找出待补齐的词
    missing_words = [w for w in words if w not in output]

    # 载入缓存
    cache = load_cache()
    # 先用缓存填
    still_missing: List[str] = []
    for w in missing_words:
        if w in cache:
            dv = normalize_definition(cache[w])
            # 接受空释义（扩展库极少数场景），否则要求中文
            if (allow_empty_definition and dv == "") or is_chinese_text(dv):
                output[w] = dv
            else:
                still_missing.append(w)
        else:
            still_missing.append(w)

    fetched = 0
    # 并发补齐
    def worker(word: str) -> Tuple[str, Optional[str]]:
        d = fetch_definition(word)
        return word, d

    if still_missing:
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_CONCURRENCY) as pool:
            for word, d in pool.map(worker, still_missing):
                if d is None:
                    # 网络失败，记录空定义（后续可人工二次补齐）
                    output[word] = ""
                    append_cache(word, "")
                else:
                    out = normalize_definition(d)
                    # 接受空释义（仅当 allow_empty_definition=True），否则要求中文
                    if (allow_empty_definition and out == "") or is_chinese_text(out):
                        output[word] = out
                        append_cache(word, out)
                    else:
                        # 模型返回不合规，置空
                        output[word] = ""
                        append_cache(word, "")
                fetched += 1

    # 最终强制仅包含本 bucket 的词
    result = {w: output.get(w, "") for w in words}
    save_json(target_path, result)
    return len(words), reused, fetched

def main():
    parser = argparse.ArgumentParser(description="构建中文释义词库（core/extended）")
    parser.add_argument("--bucket", choices=["core", "extended", "all"], default="all")
    parser.add_argument("--allow-empty-for-extended", action="store_true",
                        help="允许扩展词库个别词条为空释义（极少数无法释义的专有名词），默认不允许。")
    args = parser.parse_args()

    # 加载词库
    core_words = flatten_words(load_json(CORE_WORDS_PATH))
    ext_words = flatten_words(load_json(EXT_WORDS_PATH))

    # 加载现有 gloss（用于复用）
    core_gloss_existing = {}
    if CORE_GLOSS_PATH.exists():
        core_gloss_existing = load_json(CORE_GLOSS_PATH)
    # 扩展词库优先复用两处：zh_gloss_extended.json + zh_gloss.json（可能已有部分长词）
    ext_gloss_existing = {}
    if EXT_GLOSS_PATH.exists():
        ext_gloss_existing.update(load_json(EXT_GLOSS_PATH))
    if CORE_GLOSS_PATH.exists():
        # 合并核心 gloss 以复用其中的长词释义（只要合规则会被使用）
        ext_gloss_existing.update(load_json(CORE_GLOSS_PATH))

    summary: List[str] = []

    if args.bucket in ("core", "all"):
        total, reused, fetched = build_for_bucket(
            "core", core_words, core_gloss_existing, CORE_GLOSS_PATH, allow_empty_definition=False
        )
        summary.append(f"core: total={total}, reused={reused}, fetched={fetched}")

    if args.bucket in ("extended", "all"):
        total, reused, fetched = build_for_bucket(
            "extended", ext_words, ext_gloss_existing, EXT_GLOSS_PATH,
            allow_empty_definition=args.allow_empty_for_extended,
        )
        summary.append(f"extended: total={total}, reused={reused}, fetched={fetched}")

    print("\n".join(summary))

if __name__ == "__main__":
    sys.exit(main())


