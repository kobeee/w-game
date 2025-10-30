/**
 * 签名生成器（HMAC-SHA256）
 *
 * 密钥动态从服务器获取，不硬编码在客户端
 * 签名方式：payload = requestBody + timestamp，signature = HMAC-SHA256(payload, SECRET_KEY)
 */

import { HmacSha256 } from '../utils/HmacSha256';
import { NetworkService } from './NetworkService';
import { TimezoneSync } from './TimezoneSync';

export class SignatureGenerator {
    /**
     * 缓存的 API 签名密钥和过期时间
     */
    private static secretKey: string = '';
    private static expiresAt: number = 0;

    /**
     * 从服务器获取 API 密钥
     *
     * 密钥每小时过期，自动刷新
     *
     * @returns 有效的 API 密钥
     */
    private static async fetchSecretKey(): Promise<string> {
        try {
            const response = await fetch(
                `${NetworkService.getBaseUrl()}/api/config`
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            this.secretKey = data.secretKey;
            this.expiresAt = data.expiresAt;

            console.log(
                `[SignatureGenerator] ✅ 密钥已获取 (有效期至: ${new Date(
                    this.expiresAt
                ).toLocaleTimeString()})`
            );

            return this.secretKey;
        } catch (error) {
            console.error('[SignatureGenerator] ❌ 获取密钥失败:', error);
            throw error;
        }
    }

    /**
     * 获取有效的 API 密钥（自动刷新）
     *
     * @returns 当前有效的 API 密钥
     */
    private static async getSecretKey(): Promise<string> {
        const now = Date.now();

        // 密钥未过期且已缓存，直接返回
        if (this.secretKey && now < this.expiresAt) {
            return this.secretKey;
        }

        // 密钥已过期或未获取，从服务器重新获取
        return await this.fetchSecretKey();
    }

    /**
     * 生成 HMAC-SHA256 签名
     *
     * @param data 请求数据（JSON 字符串）
     * @param timestamp 时间戳（毫秒，从 Date.now() 获取）
     * @returns Promise<签名字符串（十六进制格式）>
     *
     * @example
     * const dataStr = JSON.stringify({ word: 'CAT' });
     * const timestamp = Date.now();
     * const signature = await SignatureGenerator.generate(dataStr, timestamp);
     * // 返回: "a1b2c3d4e5f6..."
     */
    static async generate(data: string, timestamp: number): Promise<string> {
        const secretKey = await this.getSecretKey();
        const payload = data + timestamp.toString();

        // === 调试信息 ===
        console.log(`[SignatureGenerator] 调试信息：`);
        console.log(`  payload: ${payload}`);
        console.log(`  secretKey: ${secretKey}`);
        console.log(`  payload 长度: ${payload.length}`);
        console.log(`  secretKey 长度: ${secretKey.length}`);

        let signature: string;

        // 尝试使用 Web Crypto API（浏览器原生，最可靠）
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            try {
                const encoder = new TextEncoder();
                const keyData = encoder.encode(secretKey);
                const messageData = encoder.encode(payload);

                const key = await crypto.subtle.importKey(
                    'raw',
                    keyData,
                    { name: 'HMAC', hash: 'SHA-256' },
                    false,
                    ['sign']
                );

                const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
                const hashArray = Array.from(new Uint8Array(signatureBuffer));
                signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                console.log(`[SignatureGenerator] 使用 Web Crypto API`);
            } catch (error) {
                console.warn(`[SignatureGenerator] Web Crypto API 失败，降级到自定义实现:`, error);
                signature = HmacSha256.compute(payload, secretKey);
            }
        } else {
            // 降级：使用自定义 HmacSha256 实现
            console.warn(`[SignatureGenerator] Web Crypto API 不可用，使用自定义实现`);
            signature = HmacSha256.compute(payload, secretKey);
        }

        console.log(
            `[SignatureGenerator] ✅ 签名已生成 (时间戳: ${timestamp}, 签名: ${signature.substring(
                0,
                16
            )}...)`
        );
        console.log(`[SignatureGenerator]    完整签名: ${signature}`);

        return signature;
    }
}
