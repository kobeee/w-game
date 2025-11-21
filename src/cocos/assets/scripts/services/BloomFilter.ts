import { assetManager, TextAsset } from 'cc';
import { BLOOM_ASSET_TXT } from '../config/word-validate';

class BloomFilterCore {
    private bits!: Uint8Array;
    private m!: number; // number of bits
    private k!: number; // number of hash functions
    private ready = false;

    /**
     * 微信小游戏兼容的 Base64 解码方法
     * @param base64String Base64 编码的字符串
     */
    private base64Decode(base64String: string): string {
        // 检查是否在微信小游戏环境
        if (typeof wx !== 'undefined' && wx.getFileSystemManager) {
            // 微信小游戏环境，使用 wx.getFileSystemManager().readFileSync 的 base64 解码
            try {
                const fs = wx.getFileSystemManager();
                // 创建临时文件路径
                const tempFilePath = `${wx.env.USER_DATA_PATH}/temp_base64_${Date.now()}.txt`;
                // 写入 base64 数据
                fs.writeFileSync(tempFilePath, base64String, 'base64');
                // 读取为二进制数据再转回字符串
                const buffer = fs.readFileSync(tempFilePath);
                // 删除临时文件
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (e) {
                    // 忽略删除错误
                }
                // 将 ArrayBuffer 转换为字符串
                return String.fromCharCode.apply(null, new Uint8Array(buffer));
            } catch (e) {
                console.warn('[BloomFilter] 微信小游戏 Base64 解码失败，回退到手动解码:', e);
            }
        }
        
        // 回退方案：手动实现 Base64 解码（兼容所有环境）
        return this.manualBase64Decode(base64String);
    }

    /**
     * 手动实现 Base64 解码（不依赖 atob）
     * @param base64String Base64 编码的字符串
     */
    private manualBase64Decode(base64String: string): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let result = '';
        let buffer = 0;
        let bufferBits = 0;
        
        // 移除空白字符
        base64String = base64String.replace(/[^A-Za-z0-9+/]/g, '');
        
        for (let i = 0; i < base64String.length; i++) {
            const char = base64String[i];
            const value = chars.indexOf(char);
            
            if (value === -1) continue; // 跳过无效字符
            
            buffer = (buffer << 6) | value;
            bufferBits += 6;
            
            if (bufferBits >= 8) {
                bufferBits -= 8;
                result += String.fromCharCode((buffer >> bufferBits) & 0xFF);
            }
        }
        
        return result;
    }

    async load(): Promise<boolean> {
        console.log('[BloomFilter] 开始加载布隆过滤器...');
        try {
            // 等待words bundle加载完成，最多等待10秒
            const bundle = await this.waitForBundle('words', 10000);
            if (!bundle) {
                console.error('[BloomFilter] words bundle 加载超时或失败');
                this.ready = false;
                return false;
            }

            console.log('[BloomFilter] words bundle 已就绪，开始加载 Base64 文本资产...');

            // 首先列出bundle中的所有资源，用于调试
            const bundleResources = bundle.getDirWithPath('.');
            console.log('[BloomFilter] Bundle 中的所有资源:', bundleResources);
            
            // 检查 bundle 配置信息
            const assetInfos = bundle._config.assetInfos || {};
            console.log('[BloomFilter] Bundle 中的所有资源信息:', Object.keys(assetInfos));
            
            // 详细检查每个相关资源
            const possibleNames = ['english.bloom.txt', 'english.bloom', 'english.bloom.txt'];
            for (const name of possibleNames) {
                const info = assetInfos[name];
                if (info) {
                    console.log(`[BloomFilter] 资源 ${name} 配置信息:`, info);
                } else {
                    console.log(`[BloomFilter] 资源 ${name} 未在配置中找到`);
                }
            }

            // 尝试多种资源名称加载
            const assetNames = [
                BLOOM_ASSET_TXT,                    // 'english.bloom' (配置中的名称)
                'english.bloom.txt',                // 带完整 .txt 扩展名
                'english.bloom'                     // 不带扩展名（Cocos可能的处理结果）
            ];

            let bufferFromTxt: ArrayBuffer | null = null;
            let lastError: any = null;

            for (const assetName of assetNames) {
                console.log(`[BloomFilter] 尝试加载资源: ${assetName}`);
                
                bufferFromTxt = await new Promise((resolve) => {
                    bundle.load(assetName, TextAsset, (e: any, txt: TextAsset) => {
                        if (!e && txt && typeof txt.text === 'string' && txt.text.length > 0) {
                            try {
                                // 使用微信小游戏兼容的 Base64 解码方法
                                const bin = this.base64Decode(txt.text.trim());
                                const arr = new Uint8Array(bin.length);
                                for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                                console.log(`[BloomFilter] 成功加载资源: ${assetName}`);
                                resolve(arr.buffer);
                            } catch (error) {
                                console.error(`[BloomFilter] Base64 解码失败 (${assetName}):`, error);
                                resolve(null);
                            }
                        } else {
                            console.error(`[BloomFilter] 资源加载失败 (${assetName}):`, e);
                            console.error(`[BloomFilter] txt 对象 (${assetName}):`, txt);
                            console.error(`[BloomFilter] txt.text 类型 (${assetName}):`, typeof txt?.text);
                            console.error(`[BloomFilter] txt.text 长度 (${assetName}):`, txt?.text?.length);
                            lastError = e;
                            resolve(null);
                        }
                    });
                });

                if (bufferFromTxt) {
                    break; // 成功加载，退出循环
                }
            }

            if (bufferFromTxt) {
                console.log('[BloomFilter] 从 Base64 文本资产加载成功');
                this.parse(bufferFromTxt);
                return true;
            }

            console.error('[BloomFilter] Base64 文本资产加载失败，布隆过滤器不可用');
            this.ready = false;
            return false;
        } catch (e) {
            console.error('[BloomFilter] 加载异常:', e);
            this.ready = false;
            return false;
        }
    }

    /**
     * 等待指定bundle加载完成
     * @param bundleName bundle名称
     * @param timeoutMs 超时时间（毫秒）
     */
    private async waitForBundle(bundleName: string, timeoutMs: number): Promise<assetManager.Bundle | null> {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            const cached = assetManager.getBundle(bundleName);
            if (cached) {
                console.log(`[BloomFilter] ${bundleName} bundle 已在缓存中`);
                return cached;
            }
            
            // 等待100ms后重试
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // 如果等待超时，尝试手动加载
        console.log(`[BloomFilter] 等待 ${bundleName} bundle 超时，尝试手动加载...`);
        return new Promise((resolve) => {
            assetManager.loadBundle(bundleName, (err, bundle) => {
                if (err || !bundle) {
                    console.error(`[BloomFilter] 手动加载 ${bundleName} bundle 失败:`, err);
                    resolve(null);
                } else {
                    console.log(`[BloomFilter] 手动加载 ${bundleName} bundle 成功`);
                    resolve(bundle);
                }
            });
        });
    }

    private parse(buf: ArrayBuffer): void {
        const u8 = new Uint8Array(buf);
        // 头 12 字节：'BLOM'(4) + m(4) + k(4)
        if (u8.length < 12) throw new Error('BLOOM_TOO_SHORT');
        if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'BLOM') throw new Error('BLOOM_MAGIC_MISMATCH');
        const dv = new DataView(buf);
        const m = dv.getUint32(4, false);
        const k = dv.getUint32(8, false);
        const bits = u8.subarray(12);
        if (bits.length * 8 < m) throw new Error('BLOOM_INCOMPLETE');
        this.m = m;
        this.k = k;
        this.bits = bits;
        this.ready = true; // ✅ 标记为已准备就绪
    }

    private simpleHash64(bytes: Uint8Array): number[] {
        // 返回 [high32, low32] 来表示 64 位 hash
        // 与 Python simple_hash_64 完全一致
        let h1 = 5381; // DJB2 初值
        let h2 = 2166136261; // FNV32 初值

        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];

            // DJB2 hash
            h1 = ((h1 << 5) + h1) ^ b;
            h1 >>>= 0; // 转换为无符号 32 位

            // FNV-1a 32-bit
            h2 ^= b;
            h2 = Math.imul(h2, 16777619) >>> 0;
        }

        return [h2 >>> 0, h1 >>> 0]; // [high, low]
    }

    private murmurhash3_32(bytes: Uint8Array): number {
        // 使用一个快速、分布均匀的 32 位 hash
        // 与 Python murmurhash3_32 完全一致
        let h = 0;

        for (let i = 0; i < bytes.length; i++) {
            h = Math.imul(h ^ bytes[i], 0x85ebca6b) >>> 0;
        }

        h ^= bytes.length;
        h ^= (h >>> 16);
        h = Math.imul(h, 0x85ebca6b) >>> 0;

        return h >>> 0;
    }

    private testBit(pos: number): boolean {
        const idx = (pos / 8) | 0;
        const off = pos % 8;
        return (this.bits[idx] & (1 << off)) !== 0;
    }

    private check(wordUpper: string): boolean {
        // 将单词转为 UTF-8 字节
        const encoder = new TextEncoder();
        const bytes = encoder.encode(wordUpper);
        
        // 使用双哈希方法生成 k 个哈希值
        const [h1, h2] = this.simpleHash64(bytes);
        
        for (let i = 0; i < this.k; i++) {
            const pos = (h1 + i * h2) % this.m;
            if (!this.testBit(pos)) {
                return false; // 只要有一个位为 0，就确定不存在
            }
        }
        
        return true; // 所有位都为 1，可能存在
    }

    mightContain(wordUpper: string): boolean {
        if (!this.ready) {
            console.warn('[BloomFilter] 未加载完成，默认返回 true（可能包含）');
            return true; // 未加载不阻塞，返回"可能包含"
        }
        return this.check(wordUpper);
    }
}

const singleton = new BloomFilterCore();

export async function loadBloomFromBundle(): Promise<boolean> {
    return singleton.load();
}

export function bloomMightContain(wordUpper: string): boolean {
    return singleton.mightContain(wordUpper);
}


