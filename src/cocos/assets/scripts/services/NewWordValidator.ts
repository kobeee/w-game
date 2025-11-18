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
        if (cached) {
            return { ...cached, source: 'cache' };
        }

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
            // 若本地无中文且允许 Gemini，则同步尝试用 Gemini 补齐；失败则保留"暂无释义"
            if (!local.zhDefinition && GEMINI_FALLBACK_ENABLED) {
                try {
                    const g = await NetworkService.validateWord(w);
                    if (g && g.valid && g.definition) {
                        const zh = normalizeZh(g.definition);
                        if (zh) {
                            res.definitionZh = zh;
                            res.source = 'gemini';
                            this.cache.putValid(w, 'gemini', undefined, zh);
                        }
                    }
                } catch (e: any) { /* ignore */ }
            }
            return res;
        }

        // 2) 快速否定层（布隆 + 轻规则）
        const bloomCheck = bloomMightContain(w);
        const lightRuleCheck = violatesLightRules(w);

        console.log(`[NewWordValidator] ${w} → bloom=${bloomCheck} lightRules=${!lightRuleCheck}`);

        if (!bloomCheck || lightRuleCheck) {
            const res: ValidateResult = {
                word: w,
                valid: false,
                source: 'local'
            };
            this.cache.putInvalid(w, 'local');
            console.log(`[NewWordValidator] ${w} → 快速否定: bloom=${bloomCheck}, lightRules=${lightRuleCheck}`);
            return res;
        }

        // 3) dictionaryapi.dev 有效性验证
        if (!this.limiter.tryConsume()) {
            // 过载时直接返回未知/无效，不落盘
            console.log(`[NewWordValidator] ${w} → 限流，跳过 dictionaryapi.dev`);
            return { word: w, valid: false, source: 'offline', error: 'RATE_LIMITED' };
        }

        console.log(`[NewWordValidator] ${w} → 调用 dictionaryapi.dev...`);

        const dict = await fetchDictionaryApi(w, { timeout: DICT_TIMEOUT_MS, signal: abortSignal });
        console.log(`[NewWordValidator] ${w} → dictionaryapi.dev 响应: status=${dict.status}`);
        
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

            // 若需要中文且允许 Gemini，则同步尝试用 Gemini 补齐中文（失败则忽略，UI 显示"暂无释义"）
            if (GEMINI_FALLBACK_ENABLED) {
                try {
                    console.log(`[NewWordValidator] ${w} → 调用 Gemini 补充中文释义...`);
                    const g = await NetworkService.validateWord(w);
                    if (g && g.valid && g.definition) {
                        const zh = normalizeZh(g.definition || '');
                        if (zh) {
                            result = { ...result, definitionZh: zh, source: 'gemini' };
                            this.cache.putValid(w, 'gemini', definitionEn, zh);
                        }
                    }
                } catch (e: any) { 
                    console.log(`[NewWordValidator] ${w} → Gemini 调用失败，继续使用英文释义`);
                }
            }
            console.log(`[NewWordValidator] ${w} → 最终结果: valid=true, source=${result.source}, en=${!!result.definitionEn}, zh=${!!result.definitionZh}`);
            return result;
        }
        if (dict.status === 404) {
            const res: ValidateResult = { word: w, valid: false, source: 'dict' };
            this.cache.putInvalid(w, 'dict');
            console.log(`[NewWordValidator] ${w} → dictionaryapi.dev: 单词不存在 (404)`);
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
            } catch (e) {
                /* ignore */
            }
        }

        // 异常或未知：不落盘
        return { word: w, valid: false, source: 'offline' };
    }
}


