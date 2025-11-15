import { sys } from 'cc';
import { WORD_CACHE_STORE_KEY, CACHE_TTL_VALID_MS, CACHE_TTL_INVALID_MS } from '../config/word-validate';
import { ValidateResult } from '../types/words';

type CacheEntry = {
    v: boolean;
    de?: string; // definitionEn
    dz?: string; // definitionZh
    s: ValidateResult['source'];
    t: number;   // ts
    e: number;   // expireAt
};

export class WordCache {
    private l1: Map<string, CacheEntry> = new Map();
    private l2: Record<string, CacheEntry> = this.loadL2();
    private dirty = 0;

    constructor() {
        // 无需清理缓存
    }

    private loadL2(): Record<string, CacheEntry> {
        try {
            const raw = sys.localStorage.getItem(WORD_CACHE_STORE_KEY);
            if (!raw) return {};
            const obj = JSON.parse(raw);
            if (obj && typeof obj === 'object') return obj as Record<string, CacheEntry>;
            return {};
        } catch {
            return {};
        }
    }

    private flush(force = false): void {
        if (!force && this.dirty < 8) return;
        try {
            sys.localStorage.setItem(WORD_CACHE_STORE_KEY, JSON.stringify(this.l2));
            this.dirty = 0;
        } catch {
            // ignore
        }
    }

    get(wordUpper: string): ValidateResult | null {
        const now = Date.now();
        const k = wordUpper.toUpperCase();
        const l1e = this.l1.get(k);
        if (l1e && l1e.e > now) {
            return this.entryToResult(k, l1e, 'cache');
        }
        const l2e = this.l2[k];
        if (l2e && l2e.e > now) {
            this.l1.set(k, l2e);
            return this.entryToResult(k, l2e, 'cache');
        }
        return null;
    }

    putValid(wordUpper: string, source: ValidateResult['source'], definitionEn?: string, definitionZh?: string): void {
        const now = Date.now();
        const k = wordUpper.toUpperCase();
        const entry: CacheEntry = {
            v: true,
            de: definitionEn,
            dz: definitionZh,
            s: source,
            t: now,
            e: now + CACHE_TTL_VALID_MS
        };
        this.l1.set(k, entry);
        this.l2[k] = entry;
        this.dirty++;
        this.flush(false);
    }

    putInvalid(wordUpper: string, source: ValidateResult['source']): void {
        const now = Date.now();
        const k = wordUpper.toUpperCase();
        const entry: CacheEntry = {
            v: false,
            s: source,
            t: now,
            e: now + CACHE_TTL_INVALID_MS
        };
        this.l1.set(k, entry);
        this.l2[k] = entry;
        this.dirty++;
        this.flush(false);
    }

    private entryToResult(wordUpper: string, e: CacheEntry, overrideSource?: ValidateResult['source']): ValidateResult {
        return {
            word: wordUpper,
            valid: !!e.v,
            definitionEn: e.de,
            definitionZh: e.dz,
            source: overrideSource || e.s || 'cache'
        };
    }
}


