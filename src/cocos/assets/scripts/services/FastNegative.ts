import { loadBloomFromBundle, bloomMightContain as bloomCheck } from './BloomFilter';

// 轻规则黑名单 bigrams（示例，极小集）
const ILLEGAL_BIGRAMS: Set<string> = new Set([
    'QQ', 'VV', 'JJ', 'ZZQ', 'QZ', 'ZXQ'
]);

export async function tryLoadBloom(): Promise<void> {
    await loadBloomFromBundle().catch(() => void 0);
}

export function bloomMightContain(_wordUpper: string): boolean {
    return bloomCheck(_wordUpper);
}

export function violatesLightRules(wordUpper: string): boolean {
    const w = wordUpper.toUpperCase();
    // 必须包含元音或 Y
    if (!/[AEIOUY]/.test(w)) return true;
    // 禁止 3 连同字母
    if (/(.)\1\1/.test(w)) return true;
    // q 后必须跟 u
    if (/Q(?!U)/.test(w)) return true;
    // 简单非法 bigram
    for (let i = 0; i < w.length - 1; i++) {
        const bg = w.slice(i, i + 2);
        if (ILLEGAL_BIGRAMS.has(bg)) return true;
    }
    return false;
}


