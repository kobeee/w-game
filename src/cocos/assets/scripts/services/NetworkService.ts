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
import { RSAEncryptor } from '../utils/RSAEncryptor';

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
    private static rsaInitPromise: Promise<void> | null = null; // RSA 初始化 Promise，防止多次初始化

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
        // 1. 初始化 RSA 加密器（仅首次调用执行，后续使用缓存）
        if (!RSAEncryptor.isInitialized()) {
            // 防止并发初始化
            if (!NetworkService.rsaInitPromise) {
                NetworkService.rsaInitPromise = NetworkService.initializeRSA();
            }
            await NetworkService.rsaInitPromise;
        }

        // ✅ 关键修复：如果 RSA 未初始化，抛出错误让上层处理（使用本地词库）
        if (!RSAEncryptor.isInitialized()) {
            throw new NetworkError(
                NetworkErrorType.UNAUTHORIZED,
                undefined,
                'RSA 加密器未初始化，网络验证不可用。使用本地词库进行游戏。'
            );
        }

        // 2. 获取当前时间戳（毫秒）
        const timestamp = Date.now();

        // 3. 使用 RSA 公钥加密请求（包含单词、时间戳、nonce）
        const word = data.word || '';
        const ciphertext = await RSAEncryptor.encrypt(word, timestamp);

        if (!ciphertext) {
            throw new NetworkError(
                NetworkErrorType.UNAUTHORIZED,
                undefined,
                '加密失败'
            );
        }

        // 4. 构造请求头（密文通过 X-Encrypted-Payload 头发送）
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Encrypted-Payload': ciphertext,
            'X-Client-Version': '1.0.0',
        };

        console.log(`[NetworkService] 📤 发送加密请求: ${endpoint}`);
        console.log(`[NetworkService]   时间戳: ${timestamp}`);
        console.log(`[NetworkService]   密文长度: ${ciphertext.length}B`);

        // 5. 检测平台并调用相应的网络请求方法
        const emptyBody = '{}';  // RSA 加密后，请求体为空
        if (sys.platform === sys.Platform.WECHAT_GAME) {
            return NetworkService.postWeChatGame<T>(
                endpoint,
                emptyBody,
                headers,
                timeout
            );
        } else {
            return NetworkService.postBrowser<T>(
                endpoint,
                emptyBody,
                headers,
                timeout
            );
        }
    }

    /**
     * 初始化 RSA 加密器（从后端获取公钥）
     */
    private static async initializeRSA(): Promise<void> {
        try {
            // ✅ 防御性检查：Cocos Creator 预览环境可能不支持 crypto.subtle
            if (typeof crypto === 'undefined' || !crypto.subtle) {
                console.warn(
                    '[NetworkService] ⚠️ Web Crypto API 不可用（Cocos Creator 预览环境限制）\n' +
                    '    当前环境将禁用网络单词验证\n' +
                    '    本地词库验证仍然可用（第1层：80%命中率）\n' +
                    '    在真实浏览器或微信小游戏中完全正常'
                );
                // 不抛出错误，允许游戏继续运行（使用本地词库）
                return;
            }

            console.info('[NetworkService] 🔑 初始化 RSA 加密器...');

            // 从后端获取公钥（此请求不需要加密）
            const response = await fetch(`${NetworkService.BASE_URL}/api/public-key`, {
                timeout: 5000  // 5秒超时
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const configData = await response.json();
            const publicKeyB64 = configData.publicKey;

            if (!publicKeyB64) {
                throw new Error('后端未返回公钥');
            }

            // 初始化加密器
            const success = await RSAEncryptor.initialize(publicKeyB64);
            if (!success) {
                throw new Error('RSA 加密器初始化失败');
            }

            console.info('[NetworkService] ✅ RSA 加密器初始化成功');
        } catch (error) {
            console.warn(
                '[NetworkService] ⚠️ RSA 加密器初始化失败（网络单词验证禁用）\n' +
                `    原因: ${error}\n` +
                '    本地词库验证仍然可用'
            );
            // 不抛出错误，允许游戏继续运行（使用本地词库）
            // 真实网络错误会在 validateWord() 中单独处理
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
                '/api/v1/word/verify',  // ✅ 更新为正确的端点
                { word: word.toUpperCase() },
                2000
            );

            if (response && response.valid) {
                console.log(
                    `[NetworkService] ✅ 单词验证成功: ${word} → ${response.definition || 'N/A'} ` +
                    `(${response.source}, latency=${response.latency_ms}ms, id=${response.request_id})`
                );
                return {
                    valid: true,
                    definition: response.definition,
                    source: (response.source === 'cache' || response.source === 'redis' ? 'cache' : 'gemini') as 'cache' | 'gemini'  // ✅ 支持两种源
                };
            } else {
                console.log(
                    `[NetworkService] ❌ 单词验证失败: ${word} 不是有效单词 (${response?.source}, latency=${response?.latency_ms}ms)`
                );
                return {
                    valid: false,
                    source: (response?.source === 'cache' || response?.source === 'redis' ? 'cache' : 'gemini') as 'cache' | 'gemini'  // ✅ 支持两种源
                };
            }
        } catch (error) {
            console.error(`[NetworkService] ❌ 单词验证错误: ${word}`, error);
            return null;
        }
    }
}

// 导出错误类型供外部使用
export { NetworkError, NetworkErrorType };
