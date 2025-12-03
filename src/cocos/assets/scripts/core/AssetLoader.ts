import { _decorator, assetManager, SpriteFrame, AudioClip } from 'cc';

const { ccclass } = _decorator;

/**
 * 统一资源加载器 - 完全利用Cocos Creator 3.8.7缓存机制
 * 确保预加载的Bundle和资源能被正确复用，避免重复下载
 */
@ccclass('AssetLoader')
export class AssetLoader {
    
    private static _instance: AssetLoader = null;
    
    public static getInstance(): AssetLoader {
        if (!AssetLoader._instance) {
            AssetLoader._instance = new AssetLoader();
        }
        return AssetLoader._instance;
    }
    
    /**
     * 智能加载SpriteFrame - 优先使用已完全加载的缓存资源，实现立即可用
     * 🔥 修复：保持重试机制，但优化日志输出避免风暴
     * @param bundleName Bundle名称
     * @param assetPath 资源路径
     * @returns Promise<SpriteFrame>
     */
    public async loadSpriteFrame(bundleName: string, assetPath: string): Promise<SpriteFrame> {
        const maxRetries = 2;  // 保持适度重试
        const retryDelay = 2000; // 重试间隔2秒
        const errorKey = `${bundleName}/${assetPath}`;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // 第一步：尝试获取已缓存的Bundle
                let bundle = assetManager.getBundle(bundleName);
                
                if (bundle) {
                    // 第二步：使用bundle.get()获取已完全加载的资源（立可用）
                    const cachedAsset = bundle.get(assetPath, SpriteFrame);
                    if (cachedAsset) {
                        return cachedAsset;
                    }
                    
                    // 第三步：如果资源未完全加载，进行完全加载
                    return await this.loadSpriteFrameFromBundle(bundle, assetPath);
                }
                
                // 第四步：Bundle未缓存，需要动态加载Bundle
                bundle = await this.loadBundle(bundleName);
                
                // 第五步：从新加载的Bundle中完全加载资源
                return await this.loadSpriteFrameFromBundle(bundle, assetPath);
                
            } catch (error) {
                const errorMsg = error ? (error.message || error.errMsg || String(error)) : 'Unknown error';
                const is429 = errorMsg.includes('429');
                
                // 只在最后一次尝试时记录错误，避免日志风暴
                if (attempt === maxRetries) {
                    if (is429) {
                        console.error(`[AssetLoader] ❌ 429错误重试失败: ${bundleName}/${assetPath}`);
                    } else {
                        console.error(`[AssetLoader] ❌ 加载SpriteFrame失败: ${bundleName}/${assetPath}`, error);
                    }
                    throw error;
                }
                
                // 重试前等待，429错误等待更久
                const delay = is429 ? retryDelay * 2 : retryDelay;
                
                // 只在第一次重试时输出警告，避免重复
                if (attempt === 1) {
                    console.warn(`[AssetLoader] ⚠️ 加载失败，${delay/1000}秒后重试: ${bundleName}/${assetPath}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw new Error(`[AssetLoader] 加载失败: ${bundleName}/${assetPath}`);
    }
    
    /**
     * 加载Bundle（利用官方缓存机制）
     */
    private loadBundle(bundleName: string): Promise<assetManager.Bundle> {
        return new Promise((resolve, reject) => {
            assetManager.loadBundle(bundleName, (err, bundle) => {
                if (err) {
                    console.error(`[AssetLoader] Bundle加载失败: ${bundleName}`, err);
                    reject(err);
                    return;
                }
                
                resolve(bundle);
            });
        });
    }
    
    /**
     * 从Bundle中加载SpriteFrame资源
     */
    private loadSpriteFrameFromBundle(bundle: assetManager.Bundle, assetPath: string): Promise<SpriteFrame> {
        return new Promise((resolve, reject) => {
            bundle.load(assetPath, SpriteFrame, (err, spriteFrame) => {
                if (err) {
                    console.error(`[AssetLoader] 资源加载失败: ${assetPath}`, err);
                    reject(err);
                    return;
                }
                
                resolve(spriteFrame);
            });
        });
    }
    
    /**
     * 智能加载 AudioClip - 与 SpriteFrame 相同的缓存与429重试策略
     * @param bundleName Bundle名称
     * @param assetPath 资源路径（例如 audio/sfx/click）
     */
    public async loadAudioClip(bundleName: string, assetPath: string): Promise<AudioClip> {
        const maxRetries = 2;
        const retryDelay = 2000;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // 优先使用已缓存的Bundle
                let bundle = assetManager.getBundle(bundleName);
                
                if (bundle) {
                    // 先尝试从缓存中直接获取
                    const cachedClip = bundle.get(assetPath, AudioClip);
                    if (cachedClip) {
                        return cachedClip;
                    }
                    
                    // 未缓存则从Bundle中完全加载
                    return await this.loadAudioClipFromBundle(bundle, assetPath);
                }
                
                // Bundle未缓存时动态加载（受WXNetworkGate并发与429控制）
                bundle = await this.loadBundle(bundleName);
                return await this.loadAudioClipFromBundle(bundle, assetPath);
                
            } catch (error) {
                const errorMsg = error ? (error.message || (error as any).errMsg || String(error)) : 'Unknown error';
                const is429 = errorMsg.includes('429');
                
                if (attempt === maxRetries) {
                    if (is429) {
                        console.error(`[AssetLoader] ❌ 429错误重试失败: ${bundleName}/${assetPath}`);
                    } else {
                        console.error(`[AssetLoader] ❌ 加载AudioClip失败: ${bundleName}/${assetPath}`, error);
                    }
                    throw error;
                }
                
                const delay = is429 ? retryDelay * 2 : retryDelay;
                if (attempt === 1) {
                    console.warn(`[AssetLoader] ⚠️ 加载失败，${delay / 1000}秒后重试: ${bundleName}/${assetPath}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw new Error(`[AssetLoader] 加载失败: ${bundleName}/${assetPath}`);
    }
    
    /**
     * 从Bundle中加载 AudioClip 资源
     */
    private loadAudioClipFromBundle(bundle: assetManager.Bundle, assetPath: string): Promise<AudioClip> {
        return new Promise((resolve, reject) => {
            bundle.load(assetPath, AudioClip, (err, clip) => {
                if (err) {
                    console.error(`[AssetLoader] 音频资源加载失败: ${assetPath}`, err);
                    reject(err);
                    return;
                }
                
                resolve(clip);
            });
        });
    }
    
    /**
     * 检查Bundle是否已缓存
     */
    public isBundleCached(bundleName: string): boolean {
        return !!assetManager.getBundle(bundleName);
    }
    
    /**
     * 检查资源是否已完全加载并缓存（立即可用）
     */
    public isAssetCached(bundleName: string, assetPath: string): boolean {
        const bundle = assetManager.getBundle(bundleName);
        if (!bundle) return false;
        
        // 使用bundle.get()检查资源是否已完全加载
        const cachedAsset = bundle.get(assetPath, SpriteFrame);
        return !!cachedAsset;
    }
    
    /**
     * 增强版缓存检查：检查Bundle和资源状态，提供更详细的诊断信息
     */
    public checkAssetStatus(bundleName: string, assetPath: string): {
        bundleLoaded: boolean;
        assetCached: boolean;
        assetExists: boolean;
        diagnostic: string;
    } {
        const bundle = assetManager.getBundle(bundleName);
        const result = {
            bundleLoaded: !!bundle,
            assetCached: false,
            assetExists: false,
            diagnostic: ''
        };
        
        if (!bundle) {
            result.diagnostic = `Bundle '${bundleName}' 未加载`;
            return result;
        }
        
        result.diagnostic = `Bundle '${bundleName}' 已加载`;
        
        // 检查资源是否在缓存中
        const cachedAsset = bundle.get(assetPath, SpriteFrame);
        result.assetCached = !!cachedAsset;
        
        if (cachedAsset) {
            result.diagnostic += `，资源 '${assetPath}' 已缓存`;
            result.assetExists = true;
        } else {
            result.diagnostic += `，资源 '${assetPath}' 未缓存`;
            
            // 检查资源是否存在于Bundle中（通过检查依赖信息）
            const bundleInfo = assetManager.bundles.get(bundleName);
            if (bundleInfo && bundleInfo.depends) {
                result.assetExists = true;
                result.diagnostic += `（但存在于Bundle中）`;
            } else {
                result.diagnostic += `（Bundle中也不存在）`;
            }
        }
        
        return result;
    }
    
    /**
     * 获取缓存统计信息
     */
    public getCacheStats(): {bundleCount: number, bundleNames: string[]} {
        const bundles = assetManager.bundles;
        const bundleNames: string[] = [];
        
        bundles.forEach((bundle, name) => {
            bundleNames.push(name);
        });
        
        return {
            bundleCount: bundleNames.length,
            bundleNames: bundleNames
        };
    }
}