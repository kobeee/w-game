import { assetManager, TextAsset } from 'cc';
import { BLOOM_ASSET, BLOOM_ASSET_TXT, BLOOM_PATH } from '../config/word-validate';

class BloomFilterCore {
    private bits!: Uint8Array;
    private m!: number; // number of bits
    private k!: number; // number of hash functions
    private ready = false;

    async load(): Promise<boolean> {
        // 1) 优先从 words Bundle 加载
        try {
            const bundle = await new Promise<any>((resolve, reject) => {
                const cached = assetManager.getBundle('words');
                if (cached) {
                    resolve(cached);
                } else {
                    assetManager.loadBundle('words', (err, b) => {
                        if (err || !b) reject(err || new Error('LOAD_BUNDLE_FAIL'));
                        else resolve(b);
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
                this.parse(bufferFromTxt);
                this.ready = true;
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

        // 2) 回退：直接 fetch 项目相对路径（开发环境/远程静态资源）
        try {
            const resp = await fetch(BLOOM_PATH);
            if (resp.ok) {
                const buf = await resp.arrayBuffer();
                this.parse(buf);
                this.ready = true;
                return true;
            }
        } catch {
            // ignore
        }
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
    }

    private fnv1a64(bytes: Uint8Array): number {
        let h = 0xcbf29ce484222325n;
        const FNV_PRIME = 0x100000001b3n;
        for (let i = 0; i < bytes.length; i++) {
            h ^= BigInt(bytes[i]);
            h = (h * FNV_PRIME) & 0xffffffffffffffffn;
        }
        return Number(h & 0xffffffffn) ^ Number((h >> 32n) & 0xffffffffn);
    }

    private sha256hi(bytes: Uint8Array): number {
        // 简化：用浏览器 SubtleCrypto 会是异步；这里退化用内置不便，改为简单 hash 近似
        // 为稳定起见，复用 fnv1a 的变体
        let acc = 2166136261 >>> 0;
        for (let i = 0; i < bytes.length; i++) {
            acc ^= bytes[i];
            acc = Math.imul(acc, 16777619) >>> 0;
        }
        return acc >>> 0;
    }

    private testBit(pos: number): boolean {
        const idx = (pos / 8) | 0;
        const off = pos % 8;
        return (this.bits[idx] & (1 << off)) !== 0;
    }

    mightContain(wordUpper: string): boolean {
        if (!this.ready) return true; // 未加载不阻塞，返回“可能包含”
        const w = wordUpper.toUpperCase();
        const bytes = new TextEncoder().encode(w);
        const h1 = this.fnv1a64(bytes) >>> 0;
        const h2 = this.sha256hi(bytes) >>> 0;
        for (let i = 0; i < this.k; i++) {
            const pos = (h1 + i * h2) % this.m;
            if (!this.testBit(pos)) return false;
        }
        return true;
    }
}

const singleton = new BloomFilterCore();

export async function loadBloomFromBundle(): Promise<boolean> {
    return singleton.load();
}

export function bloomMightContain(wordUpper: string): boolean {
    return singleton.mightContain(wordUpper);
}


