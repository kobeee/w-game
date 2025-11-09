/**
 * 网络服务（微信小游戏 + Cocos Creator）
 *
 * 功能：
 * 1. 双平台支持（微信小游戏 + 浏览器预览）
 * 2. 客户端 RSA-OAEP 加密（替代 HMAC 签名）
 * 3. Nonce 防重放攻击
 * 4. 超时保护
 * 5. 错误处理
 *
 * 使用方式：
 * ```typescript
 * const result = await NetworkService.post<ValidateResponse>(
 *   '/api/validate-word',
 *   { word: 'CAT' }
 * );
 * ```
 */

import { sys } from 'cc';
// WeChat Mini Game global (type hint only; no runtime impact)
declare const wx: any;

/**
 * 网络服务配置
 */
interface NetworkConfig {
    baseUrl: string;
    timeout: number;
    retries: number;
}

/**
 * 网络错误类型
 */
enum NetworkErrorType {
    TIMEOUT = 'TIMEOUT',
    NETWORK = 'NETWORK',
    HTTP_ERROR = 'HTTP_ERROR',
    PARSE_ERROR = 'PARSE_ERROR',
    RATE_LIMIT = 'RATE_LIMIT',
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
    UNKNOWN = 'UNKNOWN'
}

/**
 * 网络错误
 */
class NetworkError extends Error {
    constructor(
        public type: NetworkErrorType,
        public statusCode?: number,
        message?: string
    ) {
        super(message || type);
        this.name = 'NetworkError';
    }
}

/**
 * 网络服务单例
 */
export class NetworkService {
    // Cloudflare Worker 直连 Gemini 代理（客户端无需感知模型）
    // 统一调用 /gemini/generate，由 Worker 选择默认/指定模型并转发到官方
    private static readonly BASE_URL = 'https://ai.elvis1949.cloudns.pro/gemini';
    private static readonly GENERATE_PATH = '/generate';
    private static readonly DEFAULT_TIMEOUT = 5000; // 5秒，提高容错
    private static readonly MAX_RETRIES = 1; // 最多重试 1 次
    private static readonly WORD_CACHE_TTL_MS = 60 * 60 * 1000; // 1小时

    // 会话内结果缓存（避免重复相同单词验证）
    private static wordCache: Map<string, { value: { valid: boolean; definition?: string; source: 'cache' | 'gemini' }, expireAt: number }> = new Map();
    // 单飞：相同单词的并发请求共用同一个Promise
    private static inflight: Map<string, Promise<{ request_id?: string; valid: boolean; definition?: string; source?: string; word?: string; latency_ms?: number; checked_at?: string; error_code?: number; message?: string }>> = new Map();

    /**
     * POST 请求（统一走 Cloudflare Worker，明文 JSON；Worker 加密后转发后端）
     */
    static async post<T>(
        endpoint: string,
        data: any,
        timeout: number = NetworkService.DEFAULT_TIMEOUT
    ): Promise<T> {
        // 1. 构造请求头（明文 JSON 给 Cloudflare Worker，Worker 负责加密后转发后端）
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Client-Version': '1.0.0',
        };

        // 2. 平台分发（请求体为明文 JSON）
        const bodyStr = JSON.stringify(data);
        if (sys.platform === sys.Platform.WECHAT_GAME) {
            return NetworkService.postWeChatGame<T>(
                endpoint,
                bodyStr,
                headers,
                timeout
            );
        } else {
            return NetworkService.postBrowser<T>(
                endpoint,
                bodyStr,
                headers,
                timeout
            );
        }
    }

    /**
     * 微信小游戏平台 POST 请求
     */
    private static postWeChatGame<T>(
        endpoint: string,
        dataStr: string,
        headers: Record<string, string>,
        timeout: number
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => {
                    console.error(`[NetworkService] ❌ 请求超时 (${timeout}ms): ${endpoint}`);
                    reject(new NetworkError(NetworkErrorType.TIMEOUT));
                },
                timeout
            );

            wx.request({
                url: `${NetworkService.BASE_URL}${endpoint}`,
                method: 'POST',
                header: headers,
                data: dataStr,
                timeout,
                success: (res) => {
                    clearTimeout(timer);

                    // 静默成功响应，减少不必要日志

                    if (res.statusCode === 200) {
                        try {
                            const responseData = typeof res.data === 'string'
                                ? JSON.parse(res.data)
                                : res.data;
                            resolve(responseData as T);
                        } catch (error) {
                            console.error(
                                `[NetworkService] ❌ 响应解析失败: ${error}`
                            );
                            reject(
                                new NetworkError(
                                    NetworkErrorType.PARSE_ERROR,
                                    res.statusCode,
                                    `Failed to parse response: ${error}`
                                )
                            );
                        }
                    } else {
                        NetworkService.handleHttpError(
                            res.statusCode,
                            endpoint,
                            reject
                        );
                    }
                },
                fail: (err) => {
                    clearTimeout(timer);

                console.error(`[NetworkService] ❌ 网络请求失败: ${endpoint}`);

                    reject(
                        new NetworkError(
                            NetworkErrorType.NETWORK,
                            undefined,
                            `Network request failed: ${err.errMsg}`
                        )
                    );
                }
            });
        });
    }

    /**
     * 浏览器平台 POST 请求（用于 Cocos Creator 预览）
     */
    private static postBrowser<T>(
        endpoint: string,
        dataStr: string,
        headers: Record<string, string>,
        timeout: number
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const controller = new AbortController();
            const timer = setTimeout(
                () => {
                    controller.abort();
                    console.error(`[NetworkService] ❌ 请求超时 (${timeout}ms): ${endpoint}`);
                    reject(new NetworkError(NetworkErrorType.TIMEOUT));
                },
                timeout
            );

            fetch(`${NetworkService.BASE_URL}${endpoint}`, {
                method: 'POST',
                headers,
                body: dataStr,
                signal: controller.signal
            })
                .then(res => {
                    clearTimeout(timer);

                    // 打印关键调试头，定位 Worker/上游错误来源
                    const edgeError = res.headers.get('X-Edge-Error');
                    const edgeDebug = res.headers.get('X-Edge-Debug');
                    const upstreamStatus = res.headers.get('X-Upstream-Status');
                    const edgeCache = res.headers.get('X-Edge-Cache');
                    if (edgeError || edgeDebug || upstreamStatus || edgeCache) {
                        console.debug('[NetworkService] headers:', { edgeError, edgeDebug, upstreamStatus, edgeCache });
                    }
                    // 静默成功响应，减少不必要日志

                    if (res.ok) {
                        return res.json();
                    } else {
                        NetworkService.handleHttpError(res.status, endpoint, reject);
                        throw new Error(`HTTP ${res.status}`);
                    }
                })
                .then(data => {
                    resolve(data as T);
                })
                .catch(err => {
                    clearTimeout(timer);

                    if (err instanceof NetworkError) {
                        reject(err);
                    } else {
                        console.error(
                            `[NetworkService] ❌ 网络请求失败: ${endpoint}`,
                            err
                        );

                        reject(
                            new NetworkError(
                                NetworkErrorType.NETWORK,
                                undefined,
                                `Network request failed: ${err.message}`
                            )
                        );
                    }
                });
        });
    }

    /**
     * 处理 HTTP 错误响应
     */
    private static handleHttpError(
        statusCode: number,
        endpoint: string,
        reject: (reason: any) => void
    ): void {
        console.error(`[NetworkService] ❌ HTTP 错误 (${statusCode}): ${endpoint}`);

        switch (statusCode) {
            case 429:
                reject(
                    new NetworkError(
                        NetworkErrorType.RATE_LIMIT,
                        statusCode,
                        'Rate limit exceeded'
                    )
                );
                break;

            case 401:
                reject(
                    new NetworkError(
                        NetworkErrorType.UNAUTHORIZED,
                        statusCode,
                        'Unauthorized (invalid signature)'
                    )
                );
                break;

            case 403:
                reject(
                    new NetworkError(
                        NetworkErrorType.FORBIDDEN,
                        statusCode,
                        'Forbidden (invalid request headers)'
                    )
                );
                break;

            default:
                reject(
                    new NetworkError(
                        NetworkErrorType.HTTP_ERROR,
                        statusCode,
                        `HTTP ${statusCode}`
                    )
                );
        }
    }

    /**
     * 获取基础 URL
     */
    static getBaseUrl(): string {
        return NetworkService.BASE_URL;
    }

    /**
     * 设置基础 URL（用于测试或多环境切换）
     */
    static setBaseUrl(url: string): void {
        // 注意：此方法需要使用私有变量实现
        console.warn('[NetworkService] ⚠️ 当前不支持修改基础 URL，需要重构实现');
    }

    /**
     * 单词验证接口
     * 调用后端服务验证单词是否有效
     *
     * @param word 要验证的单词
     * @returns ValidateResponse | null 返回验证结果或 null（网络失败）
     */
    static async validateWord(word: string): Promise<{
        valid: boolean;
        definition?: string;
        source: 'cache' | 'gemini';
    } | null> {
            const t0 = Date.now();
            try {
                const upper = word.toUpperCase();

                // 1) 会话内缓存命中
                const cached = NetworkService.wordCache.get(upper);
                if (cached && cached.expireAt > Date.now()) {
                    const duration = Date.now() - t0;
                    const resolvedSource = (cached.value.source === 'cache' ? 'cache' : 'gemini') as 'cache' | 'gemini';
                    const isValid = !!cached.value.valid;
                    console.log(`[NetworkService] 验证 ${upper} → valid=${isValid} source=${resolvedSource} id=session-cache 耗时=${duration}ms`);
                    return {
                        valid: cached.value.valid,
                        definition: cached.value.definition,
                        source: resolvedSource
                    };
                }

                // 2) 单飞：相同单词并发复用
                let inflight = NetworkService.inflight.get(upper);
                if (!inflight) {
                    inflight = NetworkService.callGeminiValidate(upper);
                    NetworkService.inflight.set(upper, inflight);
                }

                const response = await inflight;
                NetworkService.inflight.delete(upper);
            const duration = Date.now() - t0;
            // ✅ 修复：优先使用响应中的 source（区分 cache/gemini），并做严格收窄
            const resolvedSource = (response && response.source === 'cache') ? 'cache' : 'gemini' as 'cache' | 'gemini';
            const isValid = !!(response && response.valid);
            const definition = response && response.definition ? response.definition : '无';
                console.log(`[NetworkService] 验证 ${upper} → valid=${isValid} definition=${definition} source=${resolvedSource} 耗时=${duration}ms`);

                // 写入会话缓存
                NetworkService.wordCache.set(upper, {
                    value: {
                        valid: !!response.valid,
                        definition: response.definition,
                        source: resolvedSource
                    },
                    expireAt: Date.now() + NetworkService.WORD_CACHE_TTL_MS
                });

            if (isValid) {
                return {
                    valid: true,
                    definition: response.definition,
                    source: resolvedSource
                };
            } else {
                return {
                    valid: false,
                    source: resolvedSource
                };
            }
        } catch (error) {
            const duration = Date.now() - t0;
            console.error(`[NetworkService] ❌ 单词验证错误: ${word} (耗时=${duration}ms)`, error);
            return null;
        }
    }

    /**
     * 直接调用 Gemini 进行验证，Worker 会在边缘注入 API Key
     */
    private static async callGeminiValidate(wordUpper: string): Promise<{ valid: boolean; definition?: string }> {
        const endpoint = `${NetworkService.GENERATE_PATH}`;
        const prompt = `你是词典校验助手。请仅返回 JSON。
任务：判断输入是否为有效的英语单词（包含俚语、专有名词）。
若有效，请用简体中文在 20 字以内给出简明释义；若无效，释义用空字符串。
输入："${wordUpper}"
输出 JSON 严格符合：
{"valid": true/false, "definition": "中文释义或空字符串"}
不得输出除 JSON 外的任何字符（禁止 Markdown、代码块、解释说明）。`;

        const body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.0,
                maxOutputTokens: 64,
                candidateCount: 1,
                response_mime_type: 'application/json',
                response_schema: {
                    type: 'OBJECT',
                    properties: {
                        valid: { type: 'BOOLEAN' },
                        definition: { type: 'STRING' }
                    },
                    required: ['valid', 'definition']
                }
            }
        };

        type GeminiResp = any;
        const resp = await NetworkService.post<GeminiResp>(endpoint, body, NetworkService.DEFAULT_TIMEOUT);
        // 解析 Gemini 返回（candidates[0].content.parts[0].text 可能是 JSON 字符串）
        const text = NetworkService.extractTextFromGemini(resp);
        const parsed = NetworkService.tryParseJson(text);
        if (parsed && typeof parsed.valid === 'boolean') {
            return { valid: !!parsed.valid, definition: typeof parsed.definition === 'string' ? parsed.definition : '' };
        }
        // 容错：若已是对象
        if (resp && typeof resp.valid === 'boolean') {
            return { valid: !!resp.valid, definition: typeof resp.definition === 'string' ? resp.definition : '' };
        }
        // 解析失败视为无效
        return { valid: false, definition: '' };
    }

    private static extractTextFromGemini(resp: any): string {
        try {
            const c = resp && resp.candidates && resp.candidates[0];
            const p = c && c.content && c.content.parts && c.content.parts[0];
            const t = p && (p.text || p.inlineData);
            return typeof t === 'string' ? t : '';
        } catch (_) {
            return '';
        }
    }

    private static tryParseJson(raw: string): any | null {
        if (!raw) return null;
        const clean = raw
            .replace(/^```json\\s*/i, '')
            .replace(/^```\\s*/i, '')
            .replace(/```\\s*$/i, '')
            .trim();
        try {
            return JSON.parse(clean);
        } catch (_) {
            // 截取第一个 {...} 片段再尝试
            const m = clean.match(/\\{[\\s\\S]*\\}/);
            if (m) {
                try { return JSON.parse(m[0]); } catch (_) { /* ignore */ }
            }
        }
        return null;
    }
}

// 导出错误类型供外部使用
export { NetworkError, NetworkErrorType };
