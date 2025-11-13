#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建英语词表布隆过滤器（离线）

输入：
  - 词表（每行一个单词，大写或小写均可）

输出：
  - english.bloom 二进制文件（默认写入 src/cocos/assets/bundle/words/english.bloom）

说明：
  - 为简化依赖，该脚本仅示例生成一个简单的位数组（k=7 哈希）
  - 运行示例：
      python3 tools/words/build_bloom.py --vocab data/english_words.txt --out src/cocos/assets/bundle/words/english.bloom --bits 10000000 --k 7
"""
import argparse
import hashlib
import math
import os
import struct

def fnv1a_64(data: bytes) -> int:
    h = 0xcbf29ce484222325
    for b in data:
        h ^= b
        h = (h * 0x100000001b3) & 0xffffffffffffffff
    return h

def hash_k(word: str, k: int, m: int):
    w = word.strip().upper().encode('utf-8')
    h1 = fnv1a_64(w)
    h2 = int(hashlib.sha256(w).hexdigest()[:16], 16)
    for i in range(k):
        yield (h1 + i * h2) % m

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--vocab', required=True, help='词表文件（每行一个词）')
    ap.add_argument('--out', default='src/cocos/assets/bundle/words/english.bloom', help='输出 bloom 文件路径')
    ap.add_argument('--bits', type=int, default=12000000, help='位数组大小（建议≈ n*10）')
    ap.add_argument('--k', type=int, default=7, help='哈希次数（k）')
    args = ap.parse_args()

    m = args.bits
    bit_array = bytearray(math.ceil(m / 8))
    total = 0

    with open(args.vocab, 'r', encoding='utf-8') as f:
        for line in f:
            word = line.strip()
            if not word:
                continue
            total += 1
            for pos in hash_k(word, args.k, m):
                idx = pos // 8
                off = pos % 8
                bit_array[idx] |= (1 << off)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'wb') as out:
        # 简单头部：magic + m + k
        out.write(b'BLOM')  # magic
        out.write(struct.pack('>I', m))
        out.write(struct.pack('>I', args.k))
        out.write(bit_array)

    print(f'OK: wrote bloom with {total} words, bits={m}, k={args.k} → {args.out}')

if __name__ == '__main__':
    main()


