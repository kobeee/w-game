/**
 * RSA-OAEP 加密工具类
 *
 * 使用 RSA-2048 公钥加密，支持 Web Crypto API（浏览器原生）
 * 密文结构: { word, timestamp, nonce, client_id, key_id }
 *
 * 使用场景：
 * - 加密单词验证请求到后端
 * - 防止中间人攻击（MITM）
 * - 防止请求重放攻击（nonce）
 * - 防止时序攻击（时间戳验证）
 */

export class RSAEncryptor {
    private static publicKey: CryptoKey | null = null;
    private static publicKeyPem: string = "";
    private static readonly CLIENT_ID = "w-game-client";

    /**
     * 初始化加密器，加载服务器公钥
     * @param publicKeyPem Base64 编码的 PEM 格式公钥
     * @returns 是否初始化成功
     */
    static async initialize(publicKeyPem: string): Promise<boolean> {
        try {
            // 保存 PEM 格式公钥（调试用）
            this.publicKeyPem = publicKeyPem;

            // 将 PEM 格式转换为 CryptoKey
            this.publicKey = await this.importPublicKey(publicKeyPem);

            if (!this.publicKey) {
                console.error("[RSAEncryptor] ❌ 公钥导入失败");
                return false;
            }

            console.info("[RSAEncryptor] ✅ 公钥加载成功");
            return true;
        } catch (error) {
            console.error("[RSAEncryptor] ❌ 初始化失败:", error);
            return false;
        }
    }

    /**
     * 将 PEM 格式的 Base64 公钥导入为 CryptoKey
     * @param publicKeyB64 Base64 编码的 PEM 格式公钥
     * @returns CryptoKey 对象或 null
     */
    private static async importPublicKey(publicKeyB64: string): Promise<CryptoKey | null> {
        try {
            // ✅ 防御性检查：检查 crypto.subtle 是否可用
            if (typeof crypto === 'undefined' || !crypto.subtle) {
                console.error(
                    "[RSAEncryptor] ❌ Web Crypto API 不可用（Cocos Creator 预览环境限制）\n" +
                    "    提示：\n" +
                    "    1. 此错误仅在 Cocos Creator 编辑器预览中出现\n" +
                    "    2. 在真实浏览器或微信小游戏中正常可用\n" +
                    "    3. 暂时禁用网络验证，使用本地词库进行游戏"
                );
                return null;
            }

            // Base64 解码
            const binaryString = atob(publicKeyB64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // 使用 Web Crypto API 导入公钥
            const publicKey = await crypto.subtle.importKey(
                "spki",
                bytes.buffer,
                {
                    name: "RSA-OAEP",
                    hash: "SHA-256",
                },
                false,  // 不可导出
                ["encrypt"]
            );

            return publicKey;
        } catch (error) {
            console.error("[RSAEncryptor] ❌ 公钥导入异常:", error);
            return null;
        }
    }

    /**
     * 加密单词验证请求
     * @param word 单词
     * @param timestamp 时间戳（毫秒）
     * @returns Base64 编码的密文或 null
     */
    static async encrypt(word: string, timestamp: number): Promise<string | null> {
        if (!this.publicKey) {
            console.error("[RSAEncryptor] ❌ 公钥未初始化");
            return null;
        }

        try {
            // 生成随机 nonce（防重放）
            const nonce = this.generateNonce();

            // 构造待加密的载荷（严格按照后端期望格式）
            const payload = {
                word: word.toUpperCase(),
                client_ts: timestamp,  // ✅ 必须是 client_ts（不是 timestamp）
                nonce: nonce,
                client_id: this.CLIENT_ID,
                key_id: "2025Q4-01"  // ✅ 必须是 2025Q4-01（不是 rsa-2048-oaep-sha256）
            };

            const plaintext = JSON.stringify(payload);
            console.info("[RSAEncryptor] 待加密载荷:", payload);

            // 使用公钥加密（RSA-OAEP-SHA256）
            const encryptedData = await crypto.subtle.encrypt(
                {
                    name: "RSA-OAEP",
                    hash: "SHA-256"
                },
                this.publicKey,
                new TextEncoder().encode(plaintext)
            );

            // 转换为 Base64 字符串
            const encryptedArray = new Uint8Array(encryptedData);
            const binaryString = Array.from(encryptedArray)
                .map(byte => String.fromCharCode(byte))
                .join("");

            const ciphertext = btoa(binaryString);

            console.info(
                `[RSAEncryptor] ✅ 加密成功: plaintext=${plaintext.length}B → ciphertext=${ciphertext.length}B`
            );

            return ciphertext;
        } catch (error) {
            console.error("[RSAEncryptor] ❌ 加密失败:", error);
            return null;
        }
    }

    /**
     * 生成随机 nonce（防重放）
     * 格式: 时间戳 + 随机字符串
     * @returns 32 个字符的随机字符串
     */
    private static generateNonce(): string {
        const timestamp = Date.now().toString(16);
        const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(12)))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join("");

        const nonce = (timestamp + randomPart).substring(0, 32);
        console.debug(`[RSAEncryptor] 生成 nonce: ${nonce}`);
        return nonce;
    }

    /**
     * 获取公钥（仅供调试）
     * @returns Base64 编码的 PEM 格式公钥
     */
    static getPublicKeyPem(): string {
        return this.publicKeyPem;
    }

    /**
     * 检查是否已初始化
     * @returns 是否已初始化
     */
    static isInitialized(): boolean {
        return this.publicKey !== null;
    }
}
