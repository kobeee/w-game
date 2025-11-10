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




