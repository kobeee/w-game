/**
 * 网络服务（微信小游戏 + Cocos Creator）
 *
 * 功能：
 * 1. 双平台支持（微信小游戏 + 浏览器预览）
 * 2. 客户端签名验证（HMAC-SHA256）
 * 3. 超时保护
 * 4. 错误处理
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
import { SignatureGenerator } from './SignatureGenerator';

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
    private static readonly DEFAULT_TIMEOUT = 2000; // 2秒
    private static readonly MAX_RETRIES = 1; // 最多重试 1 次

    /**
     * POST 请求（带签名）
     *
     * 发送带客户端签名的 POST 请求，支持微信小游戏和浏览器环境
     *
     * @template T 响应数据类型
     * @param endpoint API 端点（如 /api/validate-word）
     * @param data 请求数据（会自动转换为 JSON）
     * @param timeout 请求超时时间（毫秒，默认 2000）
     * @returns Promise<响应数据>
     *
     * @throws NetworkError 网络错误
     *
     * @example
     * ```typescript
     * try {
     *   const response = await NetworkService.post<ValidateResponse>(
     *     '/api/validate-word',
     *     { word: 'CAT' },
     *     2000
     *   );
     *   console.log(response.valid, response.definition);
     * } catch (error) {
     *   if (error instanceof NetworkError) {
     *     console.error(`网络错误: ${error.type}`, error.message);
     *   }
     * }
     * ```
     */
    static async post<T>(
        endpoint: string,
        data: any,
        timeout: number = NetworkService.DEFAULT_TIMEOUT
    ): Promise<T> {
        // 生成客户端签名（异步获取密钥）
        const timestamp = Date.now();
        const dataStr = JSON.stringify(data);
        const signature = await SignatureGenerator.generate(dataStr, timestamp);

        // 构造请求头
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Timestamp': timestamp.toString(),
            'X-Signature': signature,
            'X-Client-Version': '1.0.0',
        };

        console.log(`[NetworkService] 📤 发送请求: ${endpoint}`);
        console.log(`[NetworkService]   时间戳: ${timestamp}`);
        console.log(`[NetworkService]   签名: ${signature.substring(0, 16)}...`);

        // 检测平台并调用相应的网络请求方法
        if (sys.platform === sys.Platform.WECHAT_GAME) {
            return NetworkService.postWeChatGame<T>(
                endpoint,
                dataStr,
                headers,
                timeout
            );
        } else {
            return NetworkService.postBrowser<T>(
                endpoint,
                dataStr,
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

                    console.log(
                        `[NetworkService] ✅ 响应成功 (${res.statusCode}): ${endpoint}`
                    );

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

                    console.error(
                        `[NetworkService] ❌ 网络请求失败: ${endpoint}`,
                        err
                    );

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

                    console.log(
                        `[NetworkService] ✅ 响应成功 (${res.status}): ${endpoint}`
                    );

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
}

// 导出错误类型供外部使用
export { NetworkError, NetworkErrorType };
