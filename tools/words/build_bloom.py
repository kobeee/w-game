#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建英语词表布隆过滤器（离线）

输入：
  - 词表（每行一个单词，大写或小写均可）

输出：
  - english.bloom 二进制文件（默认写入 src/cocos/assets/bundle/words/english.bloom）

说明：
  - 使用与 JavaScript 客户端兼容的哈希函数
  - FNV1a 64位实现与 JS 版本一致
  - Murmurhash3 作为第二个 hash 函数（与 JS sha256hiSimple 对标）
  - 运行示例：
      python3 tools/words/build_bloom.py --vocab data/english_words.txt --out src/cocos/assets/bundle/words/english.bloom --bits 12000000 --k 7
"""
import argparse
import math
import os
import struct

def simple_hash_64(data: bytes) -> int:
    """简单的 64 位哈希，易于在 JavaScript 中复现"""
    # 使用两个 32 位 hash 组合成 64 位
    h1 = 5381  # DJB2 初值
    h2 = 2166136261  # FNV32 初值

    for b in data:
        # DJB2 hash
        h1 = ((h1 << 5) + h1) ^ b
        h1 &= 0xffffffff

        # FNV-1a 32-bit
        h2 ^= b
        h2 = (h2 * 16777619) & 0xffffffff

    return ((h2 & 0xffffffff) << 32) | (h1 & 0xffffffff)

def murmurhash3_32(data: bytes) -> int:
    """快速 32 位 hash，与 JavaScript 版本对标"""
    h = 0

    for b in data:
        h ^= b
        h = (h * 0x85ebca6b) & 0xffffffff

    h ^= len(data)
    h ^= (h >> 16)
    h = (h * 0x85ebca6b) & 0xffffffff

    return h & 0xffffffff

def hash_k(word: str, k: int, m: int):
    w = word.strip().upper().encode('utf-8')
    h1_full = simple_hash_64(w)
    h1 = h1_full & 0xffffffff  # 仅使用低 32 位，与 JavaScript 保持一致
    h2 = murmurhash3_32(w)
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


