/**
 * HMAC-SHA256 纯 TypeScript 实现（无依赖）
 *
 * 适用于微信小游戏环境，支持浏览器 Crypto API 和完整 SHA-256 实现
 *
 * 实现方式：
 * 1. 优先使用浏览器原生 Web Crypto API（最高效）
 * 2. 降级到内嵌的 SHA-256 实现（兼容性最好）
 */

/**
 * SHA-256 完整实现
 * 基于 FIPS 180-4 标准
 */
class SHA256 {
    /**
     * SHA-256 初始哈希值
     */
    private static readonly INITIAL_HASH = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];

    /**
     * SHA-256 常数表
     */
    private static readonly K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
        0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
        0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
        0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    /**
     * 计算 SHA-256 哈希
     *
     * @param message 输入消息（字节数组）
     * @returns 32 字节的哈希值（作为数字数组）
     */
    static hash(message: number[]): number[] {
        // 1. 消息预处理
        const processed = SHA256.preprocessMessage(message);

        // 2. 初始化哈希值
        let h = [...SHA256.INITIAL_HASH];

        // 3. 处理每个 512 位块
        for (let i = 0; i < processed.length; i += 16) {
            const w = SHA256.scheduleWords(processed, i);
            const [a, b, c, d, e, f, g, hash] = SHA256.compressionFunction(
                h,
                w
            );
            h = SHA256.updateHash(h, [a, b, c, d, e, f, g, hash]);
        }

        // 4. 生成最终哈希值
        return SHA256.hashToBytes(h);
    }

    /**
     * 消息预处理
     */
    private static preprocessMessage(message: number[]): number[] {
        const msgLen = message.length * 8; // 消息长度（位）
        const message_copy = [...message];

        // 追加 '1' 比特（0x80）
        message_copy.push(0x80);

        // 追加 '0' 比特，直到长度 ≡ 448 (mod 512)
        while ((message_copy.length * 8) % 512 !== 448) {
            message_copy.push(0x00);
        }

        // 追加原始消息长度（64 位大端）
        const lengthBytes = new Array(8);
        for (let i = 0; i < 8; i++) {
            lengthBytes[7 - i] = (msgLen >>> (i * 8)) & 0xff;
        }
        message_copy.push(...lengthBytes);

        return message_copy;
    }

    /**
     * 生成消息计划（64 个 32 位字）
     */
    private static scheduleWords(processed: number[], start: number): number[] {
        const w = new Array(64);

        // 前 16 个字来自消息块
        for (let i = 0; i < 16; i++) {
            w[i] =
                ((processed[start + i * 4] << 24) |
                    (processed[start + i * 4 + 1] << 16) |
                    (processed[start + i * 4 + 2] << 8) |
                    processed[start + i * 4 + 3]) >>>
                0;
        }

        // 扩展剩余 48 个字
        for (let i = 16; i < 64; i++) {
            const s0 = SHA256.rightRotate(w[i - 15], 7) ^ SHA256.rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = SHA256.rightRotate(w[i - 2], 17) ^ SHA256.rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }

        return w;
    }

    /**
     * 压缩函数
     */
    private static compressionFunction(hh: number[], w: number[]): number[] {
        let [a, b, c, d, e, f, g, h] = hh;

        for (let i = 0; i < 64; i++) {
            const S1 = SHA256.rightRotate(e, 6) ^ SHA256.rightRotate(e, 11) ^ SHA256.rightRotate(e, 25);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + S1 + ch + SHA256.K[i] + w[i]) >>> 0;
            const S0 = SHA256.rightRotate(a, 2) ^ SHA256.rightRotate(a, 13) ^ SHA256.rightRotate(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        return [a, b, c, d, e, f, g, h];
    }

    /**
     * 更新哈希值
     */
    private static updateHash(h: number[], values: number[]): number[] {
        return h.map((v, i) => (v + values[i]) >>> 0);
    }

    /**
     * 转换为字节数组
     */
    private static hashToBytes(h: number[]): number[] {
        const bytes: number[] = [];
        for (const val of h) {
            bytes.push((val >>> 24) & 0xff);
            bytes.push((val >>> 16) & 0xff);
            bytes.push((val >>> 8) & 0xff);
            bytes.push(val & 0xff);
        }
        return bytes;
    }

    /**
     * 右旋转
     */
    private static rightRotate(n: number, b: number): number {
        return ((n >>> b) | (n << (32 - b))) >>> 0;
    }
}

/**
 * HMAC-SHA256 实现
 */
export class HmacSha256 {
    /**
     * 计算 HMAC-SHA256
     *
     * @param message 消息字符串
     * @param secret 密钥字符串
     * @returns HMAC-SHA256 签名（十六进制字符串）
     *
     * @example
     * const signature = HmacSha256.compute('hello world', 'secret-key');
     * // 返回: "3c2c6f5a4d8e9f1b..."
     */
    static compute(message: string, secret: string): string {
        // 尝试使用浏览器 Crypto API（最高效）
        if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
            // 异步方式需要在 async 函数中
            // 这里返回一个同步实现
            console.warn('[HmacSha256] ⚠️ 检测到浏览器环境，建议使用异步 API');
        }

        // 使用内嵌 SHA-256 实现（兼容所有环境）
        const blockSize = 64; // SHA-256 块大小（字节）
        let key = HmacSha256.stringToBytes(secret);

        // 1. 调整密钥长度
        if (key.length > blockSize) {
            key = SHA256.hash(key);
        }
        if (key.length < blockSize) {
            key.push(...new Array(blockSize - key.length).fill(0));
        }

        // 2. 创建 ipad 和 opad
        const ipad = key.map(b => b ^ 0x36);
        const opad = key.map(b => b ^ 0x5c);

        // 3. 计算 HMAC = H(K XOR opad, H(K XOR ipad, message))
        const messageBytes = HmacSha256.stringToBytes(message);
        const innerHash = SHA256.hash(ipad.concat(messageBytes));
        const outerHash = SHA256.hash(opad.concat(innerHash));

        // 4. 转换为十六进制字符串
        return HmacSha256.bytesToHex(outerHash);
    }

    /**
     * 计算 HMAC-SHA256（异步版，使用浏览器 Crypto API）
     *
     * 在支持 Web Crypto API 的环境中使用此方法获得最高性能
     *
     * @param message 消息字符串
     * @param secret 密钥字符串
     * @returns Promise<签名字符串（十六进制）>
     *
     * @example
     * const signature = await HmacSha256.computeAsync('hello world', 'secret-key');
     */
    static async computeAsync(message: string, secret: string): Promise<string> {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const messageData = encoder.encode(message);

        try {
            const key = await crypto.subtle.importKey(
                'raw',
                keyData,
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );

            const signature = await crypto.subtle.sign('HMAC', key, messageData);
            const hashArray = Array.from(new Uint8Array(signature));

            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.error('[HmacSha256] ❌ 异步计算失败，降级到同步实现', e);
            return HmacSha256.compute(message, secret);
        }
    }

    /**
     * 字符串转字节数组
     */
    private static stringToBytes(str: string): number[] {
        const bytes: number[] = [];
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            if (code <= 0x7f) {
                bytes.push(code);
            } else if (code <= 0x7ff) {
                bytes.push(0xc0 | (code >> 6));
                bytes.push(0x80 | (code & 0x3f));
            } else if (code <= 0xffff) {
                bytes.push(0xe0 | (code >> 12));
                bytes.push(0x80 | ((code >> 6) & 0x3f));
                bytes.push(0x80 | (code & 0x3f));
            }
        }
        return bytes;
    }

    /**
     * 字节数组转十六进制字符串
     */
    private static bytesToHex(bytes: number[]): string {
        return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    }
}
