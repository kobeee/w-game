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
    // Cloudflare Worker 转发路由：/w-game-service -> 后端 API
    // 示例：https://example.com/w-game-service
    // 其中 example.com 是你的 Cloudflare Worker 域名
    private static readonly BASE_URL = 'https://ai.elvis1949.cloudns.pro/w-game-service';
    private static readonly DEFAULT_TIMEOUT = 5000; // 5秒，提高容错
    private static readonly MAX_RETRIES = 1; // 最多重试 1 次

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
            try {
                const response = await NetworkService.post<{
                request_id?: string;
                valid: boolean;
                definition?: string;
                source?: string;
                word?: string;
                latency_ms?: number;
                checked_at?: string;
                error_code?: number;
                message?: string;
            }>(
                '/api/v1/word/verify',  // 统一端点，由 Worker 加密转发
                { word: word.toUpperCase() },
                2000
            );
            if (response && response.valid) {
                return {
                    valid: true,
                    definition: response.definition,
                    source: (response.source === 'cache' || response.source === 'redis' ? 'cache' : 'gemini') as 'cache' | 'gemini'
                };
            } else {
                return {
                    valid: false,
                    source: (response?.source === 'cache' || response?.source === 'redis' ? 'cache' : 'gemini') as 'cache' | 'gemini'
                };
            }
        } catch (error) {
            console.error(`[NetworkService] ❌ 单词验证错误: ${word}`);
            return null;
        }
    }
}

// 导出错误类型供外部使用
export { NetworkError, NetworkErrorType };
