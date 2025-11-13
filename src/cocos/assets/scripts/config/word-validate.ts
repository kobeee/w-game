export const DEFINITION_MAX_LEN = 25 as const;
export const HINT_FADE_IN_MS = 100 as const;
export const HINT_STAY_MS = 1400 as const;
export const HINT_FADE_OUT_MS = 200 as const;
export const HINT_MAX_CONCURRENT = 3 as const;
export const NETWORK_TIMEOUT_MS = 5000 as const;
export const NETWORK_MAX_RETRIES = 1 as const;

// L2 持久化缓存（localStorage）相关配置
export const PERSIST_TTL_VALID_DAYS = 7 as const;     // valid=true 的持久化天数
export const PERSIST_TTL_INVALID_DAYS = 3 as const;   // valid=false 的持久化天数
export const PERSIST_BATCH_THRESHOLD = 16 as const;   // 累计变更条数达到该阈值时批量落盘


// ==== 远端阶段治理与限流 ====
// 合并窗口（仅用于远端阶段触发，收敛输入抖动）
export const REMOTE_MERGE_WINDOW_MS = 220 as const;
// 远端并发与排队
export const REMOTE_CONCURRENCY = 1 as const;
export const REMOTE_QUEUE = 3 as const;
// 全局令牌桶（客户端侧）
export const RATE_CAPACITY = 6 as const;
export const RATE_REFILL_PER_SEC = 2 as const;
// 字典/维基超时
export const DICT_TIMEOUT_MS = 1200 as const;
export const WIKI_TIMEOUT_MS = 1200 as const;

// ==== 兜底（Gemini） ====
export const GEMINI_FALLBACK_ENABLED = true as const;
export const GEMINI_DAILY_BUDGET = 10 as const;           // 每客户端每日额度
export const GEMINI_MIN_INTERVAL_MS = 10_000 as const;    // 最小调用间隔

// ==== 缓存 ====
// 写透缓存的 TTL（毫秒）
export const CACHE_TTL_VALID_MS = 7 * 24 * 3600 * 1000;
export const CACHE_TTL_INVALID_MS = 3 * 24 * 3600 * 1000;
// L2 存储键名（localStorage）
export const WORD_CACHE_STORE_KEY = 'wgame_word_cache_v2';
// 边缘代理（Cloudflare Worker）
export const WIKI_WORKER_ENDPOINT = 'https://ai.elvis1949.cloudns.pro/wiktionary/zh' as const;

// ==== 布隆过滤器 ====
export const BLOOM_PATH = 'assets/bundle/words/english.bloom'; // 资源相对路径（若不存在则自动跳过）
export const BLOOM_FPR = 0.01 as const; // 目标误判率（构建时参考）
export const BLOOM_ASSET = 'english.bloom' as const; // 在 words Bundle 内的资源名（优先）
export const BLOOM_ASSET_TXT = 'english.bloom.txt' as const; // Base64 文本资产（编辑器/预览优先）

// ==== 调试开关（排查用，问题定位后请改回 false） ====
export const WORD_DEBUG = true as const;



