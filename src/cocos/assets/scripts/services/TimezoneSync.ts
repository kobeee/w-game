/**
 * 时区同步工具 - 确保客户端使用Asia/Shanghai时区
 * 用于与后端服务保持时间同步
 */

export class TimezoneSync {
    private static readonly TARGET_TIMEZONE = 'Asia/Shanghai';
    private static serverTimeOffset = 0; // 服务器时间偏移（毫秒）
    
    /**
     * 从服务器获取当前时间（Asia/Shanghai时区）
     * 
     * 注意：根据新方案（RSA加密），时区同步不是必须的，因为时间戳验证在后端完成。
     * 此方法改为使用 /api/public-key 接口获取服务器时间（该接口返回服务器时间和时区信息）。
     */
    static async syncWithServer(): Promise<boolean> {
        try {
            // 使用 /api/public-key 接口获取服务器时间（该接口存在且返回服务器时间）
            const response = await fetch('https://ai.elvis1949.cloudns.pro/w-game-service/api/public-key');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();

            if (data.serverTime && data.timezone === this.TARGET_TIMEZONE) {
                const serverTime = data.serverTime;
                // 直接用 Date.now() 获取本地时间戳，不要用自定义的 getLocalTime()
                const localTime = Date.now();
                this.serverTimeOffset = serverTime - localTime;

                

                return true;
            } else {
                console.warn('[TimezoneSync] ⚠️ 服务器时区不匹配，使用本地时间');
                return false;
            }
        } catch (error) {
            console.warn('[TimezoneSync] ⚠️ 时间同步失败，使用本地时间:', error);
            return false;
        }
    }
    
    /**
     * 获取当前时间戳（毫秒，Asia/Shanghai时区）
     */
    static getCurrentTimestamp(): number {
        // 优先使用服务器同步的时间，如果没有同步则使用本地时间
        if (this.serverTimeOffset !== 0) {
            return Date.now() + this.serverTimeOffset;
        }

        // 使用本地时间戳
        return Date.now();
    }
    
    /**
     * 获取本地时间（转换为Asia/Shanghai时区）
     */
    private static getLocalTime(): number {
        // 创建Asia/Shanghai时区的时间
        const shanghaiTime = new Date().toLocaleString('en-US', {
            timeZone: this.TARGET_TIMEZONE
        });
        
        return new Date(shanghaiTime).getTime();
    }
    
    /**
     * 生成HMAC-SHA256签名（Asia/Shanghai时区）
     */
    static generateSignature(data: string, secretKey: string): string {
        const timestamp = this.getCurrentTimestamp();
        const payload = data + timestamp.toString();
        
        // 使用CryptoJS生成HMAC-SHA256签名
        // 注意：需要确保CryptoJS已加载
        if (typeof (window as any).CryptoJS !== 'undefined') {
            const signature = (window as any).CryptoJS.HmacSHA256(payload, secretKey).toString();
            return { signature, timestamp };
        }
        
        // 备用方案：使用Web Crypto API
        return this.generateSignatureWebCrypto(payload, secretKey, timestamp);
    }
    
    /**
     * 使用Web Crypto API生成签名
     */
    private static async generateSignatureWebCrypto(payload: string, secretKey: string, timestamp: number): Promise<{signature: string, timestamp: number}> {
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
            
            const signature = await crypto.subtle.sign('HMAC', key, messageData);
            const hashArray = Array.from(new Uint8Array(signature));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            return { signature: hashHex, timestamp };
        } catch (error) {
            console.error('[TimezoneSync] 签名生成失败:', error);
            
            // 最后备用：简单的哈希函数（仅用于测试）
            return this.simpleHashSignature(payload, secretKey, timestamp);
        }
    }
    
    /**
     * 简单的哈希签名（仅用于测试）
     */
    private static simpleHashSignature(payload: string, secretKey: string, timestamp: number): {signature: string, timestamp: number} {
        console.warn('[TimezoneSync] 使用简单签名（仅用于测试）');
        
        let hash = 0;
        const fullPayload = payload + secretKey;
        
        for (let i = 0; i < fullPayload.length; i++) {
            const char = fullPayload.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        return { 
            signature: Math.abs(hash).toString(16), 
            timestamp 
        };
    }
    
    /**
     * 验证时间戳是否在有效期内（±5分钟）
     */
    static isTimestampValid(timestamp: number): boolean {
        const currentTime = this.getCurrentTimestamp();
        const delta = Math.abs(currentTime - timestamp);
        const expiry = 5 * 60 * 1000; // 5分钟
        
        return delta < expiry;
    }
    
    /**
     * 获取格式化的时间字符串（Asia/Shanghai）
     */
    static getFormattedTime(): string {
        const timestamp = this.getCurrentTimestamp();
        return new Date(timestamp).toLocaleString('zh-CN', {
            timeZone: this.TARGET_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

/**
 * 网络服务封装 - 使用时区同步的签名
 * 
 * ⚠️ 注意：此类已废弃，新方案使用 RSA 加密（见 NetworkService.ts）
 * 保留此类仅用于向后兼容，不推荐使用
 */
export class NetworkServiceWithTimezone {
    private static baseUrl = 'https://ai.elvis1949.cloudns.pro/w-game-service';
    
    /**
     * 获取配置（包括密钥）
     * 
     * ⚠️ 已废弃：新方案不再需要此接口
     */
    static async getConfig(): Promise<{secretKey: string, expiresAt: number, serverTime: number, timezone: string} | null> {
        try {
            // 注意：/api/config 接口已不存在，新方案使用 /api/public-key
            const response = await fetch(`${this.baseUrl}/api/public-key`);
            if (response.ok) {
                const data = await response.json();
                // 返回兼容格式（注意：secretKey 字段在新方案中不存在）
                return {
                    secretKey: '', // ⚠️ 新方案不再使用 secretKey
                    expiresAt: Date.now() + 3600000, // 假数据
                    serverTime: data.serverTime,
                    timezone: data.timezone
                };
            }
        } catch (error) {
            console.error('[NetworkService] 获取配置失败:', error);
        }
        return null;
    }
    
    /**
     * 验证单词（使用时区同步的签名）
     */
    static async validateWord(word: string): Promise<any> {
        try {
            // 获取配置
            const config = await this.getConfig();
            if (!config) {
                throw new Error('无法获取配置');
            }
            
            // 同步时间
            await TimezoneSync.syncWithServer();
            
            // 生成签名
            const requestData = JSON.stringify({ word });
            const { signature, timestamp } = TimezoneSync.generateSignature(requestData, config.secretKey);
            
            // 发送请求
            const response = await fetch(`${this.baseUrl}/api/validate-word`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Timestamp': timestamp.toString(),
                    'X-Signature': signature,
                    'CF-Connecting-IP': '1.2.3.4',
                    'CF-RAY': '123456789abcdef'
                },
                body: requestData
            });
            
            if (response.ok) {
                return await response.json();
            } else {
                const error = await response.text();
                throw new Error(`HTTP ${response.status}: ${error}`);
            }
        } catch (error) {
            console.error('[NetworkService] 单词验证失败:', error);
            throw error;
        }
    }
}

// 导出默认实例
export default TimezoneSync;