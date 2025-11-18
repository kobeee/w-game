import { assetManager, TextAsset } from 'cc';
import { BLOOM_ASSET, BLOOM_ASSET_TXT, BLOOM_PATH } from '../config/word-validate';

class BloomFilterCore {
    private bits!: Uint8Array;
    private m!: number; // number of bits
    private k!: number; // number of hash functions
    private ready = false;

    async load(): Promise<boolean> {
        console.log('[BloomFilter] 开始加载布隆过滤器...');
        // 1) 优先从 words Bundle 加载
        try {
            const bundle = await new Promise<any>((resolve, reject) => {
                const cached = assetManager.getBundle('words');
                if (cached) {
                    console.log('[BloomFilter] 使用缓存的 words bundle');
                    resolve(cached);
                } else {
                    console.log('[BloomFilter] 加载 words bundle...');
                    assetManager.loadBundle('words', (err, b) => {
                        if (err || !b) {
                            console.error('[BloomFilter] words bundle 加载失败:', err);
                            reject(err || new Error('LOAD_BUNDLE_FAIL'));
                        } else {
                            console.log('[BloomFilter] words bundle 加载成功');
                            resolve(b);
                        }
                    });
                }
            });

            // 0) 优先：尝试加载 Base64 文本资产（编辑器/预览最稳妥）
            const bufferFromTxt: ArrayBuffer | null = await new Promise((resolve) => {
                bundle.load(BLOOM_ASSET_TXT, TextAsset, (e: any, txt: TextAsset) => {
                    if (!e && txt && typeof txt.text === 'string' && txt.text.length > 0) {
                        try {
                            const bin = atob(txt.text.trim());
                            const arr = new Uint8Array(bin.length);
                            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                            resolve(arr.buffer);
                        } catch { resolve(null); }
                    } else {
                        resolve(null);
                    }
                });
            });

            if (bufferFromTxt) {
                console.log('[BloomFilter] 从 Base64 文本资产加载成功');
                this.parse(bufferFromTxt);
                return true;
            }

            // 1) 其次：以原生资源方式从 Bundle 加载（无需 fetch）
            const bufferFromBundle: ArrayBuffer | null = await new Promise((resolve) => {
                // 不指定类型，直接拿到底层原生资源（_nativeAsset）
                bundle.load(BLOOM_ASSET, (err: any, asset: any) => {
                    if (err || !asset) {
                        resolve(null);
                        return;
                    }
                    const raw = (asset as any)._nativeAsset;
                    if (raw instanceof ArrayBuffer) {
                        resolve(raw);
                        return;
                    }
                    // 某些平台返回的是 TypedArray 或 Blob
                    if (raw && raw.buffer instanceof ArrayBuffer) {
                        resolve(raw.buffer as ArrayBuffer);
                        return;
                    }
                    // 若误当作文本资产，尝试从 text/base64 恢复
                    const txt = (asset as TextAsset)?.text;
                    if (typeof txt === 'string' && txt.length > 0) {
                        try {
                            const bin = atob(txt);
                            const arr = new Uint8Array(bin.length);
                            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                            resolve(arr.buffer);
                            return;
                        } catch { /* ignore */ }
                    }
                    resolve(null);
                });
            });

            if (bufferFromBundle) {
                this.parse(bufferFromBundle);
                this.ready = true;
                return true;
            }
        } catch {
            // ignore and fallback
        }

        // 2) 回退：尝试从本地文件系统加载（编辑器预览）
            const fallbackPath = BLOOM_PATH; // 'assets/bundle/words/english.bloom'
            try {
                const fs = await import('fs');
                console.log('[BloomFilter] 从本地文件系统加载:', fallbackPath);
                const buffer = fs.readFileSync(fallbackPath);
                this.parse(buffer.buffer);
                console.log('[BloomFilter] 本地文件系统加载成功');
                return true;
            } catch (e) {
                console.log('[BloomFilter] 本地文件系统加载失败:', e);
                // 编辑器外环境没有 fs，忽略
            }

            // 3) 最终回退：网络加载（同域或 CDN）
            try {
                console.log('[BloomFilter] 尝试网络加载:', `./assets/bundle/words/${BLOOM_ASSET}`);
                const resp = await fetch(`./assets/bundle/words/${BLOOM_ASSET}`);
                if (resp.ok) {
                    const buffer = await resp.arrayBuffer();
                    this.parse(buffer);
                    console.log('[BloomFilter] 网络加载成功');
                    return true;
                }
            } catch (e) {
                console.log('[BloomFilter] 网络加载失败:', e);
                // 网络失败也忽略
            }

            console.error('[BloomFilter] 所有加载方式都失败，布隆过滤器不可用');
            this.ready = false;
            return false;
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


