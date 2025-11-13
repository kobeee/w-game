import { LocalDictionary } from './LocalDictionary';
import { localLookupWithLemmatize } from './LocalLookup';
import { bloomMightContain, violatesLightRules, tryLoadBloom } from './FastNegative';
import { fetchDictionaryApi } from './RemoteDictionary';
import { TokenBucket } from './RateLimiter';
import { WordCache } from './WordCache';
import { ValidateResult } from '../types/words';
import { director } from 'cc';
import { RATE_CAPACITY, RATE_REFILL_PER_SEC, DICT_TIMEOUT_MS, GEMINI_FALLBACK_ENABLED } from '../config/word-validate';
import { NetworkService } from './NetworkService';
import { normalizeZh } from './ZhNormalize';

export class NewWordValidator {
    private dict = new LocalDictionary();
    private cache = new WordCache();
    private limiter = new TokenBucket(RATE_CAPACITY, RATE_REFILL_PER_SEC);
    private initialized = false;

    async initialize(): Promise<void> {
        if (this.initialized) return;
        await this.dict.load();
        await tryLoadBloom().catch(() => void 0);
        this.initialized = true;
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    async validate(word: string, abortSignal?: AbortSignal): Promise<ValidateResult> {
        const w = word.toUpperCase();
        if (!this.initialized) {
            await this.initialize();
        }
        // 0) 缓存命中
        const cached = this.cache.get(w);
        if (cached) return { ...cached, source: 'cache' };

        // 1) 本地词库 + 词形归一
        const local = await localLookupWithLemmatize(this.dict, w);
        if (local.hit) {
            const res: ValidateResult = {
                word: w,
                valid: true,
                definitionZh: local.zhDefinition,
                source: 'local'
            };
            this.cache.putValid(w, 'local', undefined, local.zhDefinition);
            // 若本地无中文且允许 Gemini，则同步尝试用 Gemini 补齐；失败则保留“暂无释义”
            if (!local.zhDefinition && GEMINI_FALLBACK_ENABLED) {
                try {
                    console.info('[WordValidator][gemini-after-local][start]', w);
                    const g = await NetworkService.validateWord(w);
                    if (g && g.valid && g.definition) {
                        const zh = normalizeZh(g.definition);
                        if (zh) {
                            res.definitionZh = zh;
                            res.source = 'gemini';
                            this.cache.putValid(w, 'gemini', undefined, zh);
                            console.info('[WordValidator][gemini-after-local][ok]', w, { zh });
                        } else {
                            console.info('[WordValidator][gemini-after-local][empty]', w);
                        }
                    } else {
                        console.info('[WordValidator][gemini-after-local][invalid]', w);
                    }
                } catch (e: any) { console.info('[WordValidator][gemini-after-local][ex]', w, e && (e.message || String(e))); }
            }
            return res;
        }

        // 2) 快速否定层（布隆 + 轻规则）
        if (!bloomMightContain(w) || violatesLightRules(w)) {
            const res: ValidateResult = {
                word: w,
                valid: false,
                source: 'local'
            };
            this.cache.putInvalid(w, 'local');
            return res;
        }

        // 3) dictionaryapi.dev 有效性验证
        if (!this.limiter.tryConsume()) {
            // 过载时直接返回未知/无效，不落盘
            return { word: w, valid: false, source: 'offline', error: 'RATE_LIMITED' };
        }

        const dict = await fetchDictionaryApi(w, { timeout: DICT_TIMEOUT_MS, signal: abortSignal });
        if (dict.status === 200) {
            const definitionEn = dict.firstDefinition;
            let result: ValidateResult = {
                word: w,
                valid: true,
                definitionEn,
                source: 'dict'
            };
            // 先写入英文定义
            this.cache.putValid(w, 'dict', definitionEn, undefined);

            // 若需要中文且允许 Gemini，则同步尝试用 Gemini 补齐中文（失败则忽略，UI 显示“暂无释义”）
            if (GEMINI_FALLBACK_ENABLED) {
                try {
                    console.info('[WordValidator][gemini-after-dict][start]', w);
                    const g = await NetworkService.validateWord(w);
                    if (g && g.valid && g.definition) {
                        const zh = normalizeZh(g.definition || '');
                        if (zh) {
                            result = { ...result, definitionZh: zh, source: 'gemini' };
                            this.cache.putValid(w, 'gemini', definitionEn, zh);
                            console.info('[WordValidator][gemini-after-dict][ok]', w, { zh });
                        } else {
                            console.info('[WordValidator][gemini-after-dict][empty]', w);
                        }
                    } else {
                        console.info('[WordValidator][gemini-after-dict][invalid]', w);
                    }
                } catch (e: any) { console.info('[WordValidator][gemini-after-dict][ex]', w, e && (e.message || String(e))); }
            }
            return result;
        }
        if (dict.status === 404) {
            const res: ValidateResult = { word: w, valid: false, source: 'dict' };
            this.cache.putInvalid(w, 'dict');
            return res;
        }

        // 5) 兜底（可选，默认关闭）
        if (GEMINI_FALLBACK_ENABLED) {
            try {
                const g = await NetworkService.validateWord(w);
                if (g && g.valid) {
                    const zh = normalizeZh(g.definition || '');
                    const res: ValidateResult = { word: w, valid: true, definitionZh: zh, source: 'gemini' };
                    this.cache.putValid(w, 'gemini', undefined, zh);
                    return res;
                }
            } catch {
                // ignore
            }
        }

        // 异常或未知：不落盘
        return { word: w, valid: false, source: 'offline' };
    }
}


