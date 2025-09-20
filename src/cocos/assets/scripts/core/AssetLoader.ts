import { _decorator, assetManager, SpriteFrame } from 'cc';

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
     * @param bundleName Bundle名称
     * @param assetPath 资源路径
     * @returns Promise<SpriteFrame>
     */
    public async loadSpriteFrame(bundleName: string, assetPath: string): Promise<SpriteFrame> {
        try {
            // 第一步：尝试获取已缓存的Bundle
            let bundle = assetManager.getBundle(bundleName);
            
            if (bundle) {
                console.log(`[AssetLoader] 使用缓存的Bundle: ${bundleName}`);
                
                // 第二步：使用bundle.get()获取已完全加载的资源（立即可用）
                const cachedAsset = bundle.get(assetPath, SpriteFrame);
                if (cachedAsset) {
                    console.log(`[AssetLoader] ✅ 立即获取已缓存的SpriteFrame: ${bundleName}/${assetPath}`);
                    return cachedAsset;
                }
                
                // 第三步：如果资源未完全加载，进行完全加载
                console.log(`[AssetLoader] ⚠️ 资源未完全加载，开始完全加载: ${bundleName}/${assetPath}`);
                return await this.loadAssetFromBundle(bundle, assetPath);
            }
            
            // 第四步：Bundle未缓存，需要动态加载Bundle
            console.log(`[AssetLoader] ⚠️ Bundle未缓存，开始动态加载: ${bundleName}`);
            bundle = await this.loadBundle(bundleName);
            
            // 第五步：从新加载的Bundle中完全加载资源
            return await this.loadAssetFromBundle(bundle, assetPath);
            
        } catch (error) {
            console.error(`[AssetLoader] ❌ 加载SpriteFrame失败: ${bundleName}/${assetPath}`, error);
            throw error;
        }
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
                
                console.log(`[AssetLoader] Bundle加载成功: ${bundleName}`);
                resolve(bundle);
            });
        });
    }
    
    /**
     * 从Bundle中加载资源
     */
    private loadAssetFromBundle(bundle: assetManager.Bundle, assetPath: string): Promise<SpriteFrame> {
        return new Promise((resolve, reject) => {
            bundle.load(assetPath, SpriteFrame, (err, spriteFrame) => {
                if (err) {
                    console.error(`[AssetLoader] 资源加载失败: ${assetPath}`, err);
                    reject(err);
                    return;
                }
                
                console.log(`[AssetLoader] 资源加载成功: ${assetPath}`);
                resolve(spriteFrame);
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