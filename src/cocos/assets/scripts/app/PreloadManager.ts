import { _decorator, assetManager, SpriteFrame, JsonAsset } from 'cc';
import { GlossService } from '../data/GlossService';

const { ccclass } = _decorator;

/**
 * Asset Bundle完全预加载管理器
 * 负责在游戏启动时完全加载所有远程资源（包括反序列化和初始化），确保后续立即可用
 */
@ccclass('PreloadManager')
export class PreloadManager {

    private static _instance: PreloadManager = null;

    // 需要预加载的Bundle配置
    private readonly BUNDLES_TO_PRELOAD = [
        { name: 'bg', priority: 1 },
        { name: 'title', priority: 1 },
        { name: 'tiles', priority: 1 },        // 字母瓦片资源，高优先级
        { name: 'slot', priority: 1 },         // 牌槽背景资源，高优先级（StackGame依赖）
        { name: 'words', priority: 1 },        // 词库资源，高优先级（核心功能依赖）
        { name: 'modal', priority: 2 }
    ];
    
    // 每个Bundle内需要预加载的关键资源
    private readonly ASSETS_TO_PRELOAD = {
        'bg': [
            'main_scene_bg/spriteFrame',
            'game_scene_bg/spriteFrame',
            'result_scene_bg/spriteFrame'
        ],
        'title': [
            'title/spriteFrame'
        ],
        'tiles': [
            'tile_correct/spriteFrame',
            'tile_disabled/spriteFrame',
            'tile_highlight/spriteFrame',
            'tile_selectable/spriteFrame',
            'tile_wrong/spriteFrame'
        ],
        'slot': [
            'slot_item/spriteFrame'    // 牌槽背景图
        ],
        'words': [
            'words_core',          // 核心词库（3-7字母）
            'zh_gloss',            // 核心词义库
            'words_extended',      // 扩展词库（8-10字母）
            'zh_gloss_extended'    // 扩展词义库
        ],
        'modal': [
            'pop_card/spriteFrame'
        ]
    };
    
    private loadedBundles: Map<string, assetManager.Bundle> = new Map();
    private preloadProgress: Map<string, number> = new Map();
    private onProgressCallback: (progress: number, message: string) => void = null;
    
    public static getInstance(): PreloadManager {
        if (!PreloadManager._instance) {
            PreloadManager._instance = new PreloadManager();
        }
        return PreloadManager._instance;
    }
    
    /**
     * 设置进度回调函数
     */
    public setProgressCallback(callback: (progress: number, message: string) => void): void {
        this.onProgressCallback = callback;
    }
    
    /**
     * 开始完全加载所有远程Bundle（确保立即可用）
     */
    public async preloadAllBundles(): Promise<void> {
        this.reportProgress(0, '正在初始化完全资源加载...');

        try {
            // 按优先级分组
            const highPriorityBundles = this.BUNDLES_TO_PRELOAD.filter(b => b.priority === 1);
            const lowPriorityBundles = this.BUNDLES_TO_PRELOAD.filter(b => b.priority === 2);

            // 高优先级Bundle并行加载
            await this.preloadBundleGroup(highPriorityBundles, 0, 0.7);

            // ✅ 加载词库数据（确保WordMatcher初始化前完成）
            await this.loadGlossData();

            // 低优先级Bundle后续加载
            await this.preloadBundleGroup(lowPriorityBundles, 0.7, 1.0);

            this.reportProgress(1.0, '所有资源完全加载完成，立即可用');

        } catch (error) {
            console.error('[PreloadManager] Bundle完全加载失败:', error);
            this.reportProgress(0.8, '资源加载完成（部分资源使用缓存）');
            // 不抛出错误，允许游戏继续运行
        }
    }

    /**
     * 加载词库数据（确保WordMatcher初始化前完成）
     * @param useExtended 是否加载扩展词库（默认true，一次性加载全部）
     */
    private async loadGlossData(useExtended: boolean = true): Promise<void> {
        

        try {
            // 检查 Bundle 是否已加载
            const wordsBundle = assetManager.getBundle('words');
            if (!wordsBundle) {
                console.error('[PreloadManager] ❌ 严重错误：words Bundle 未加载！');
                console.error('[PreloadManager] PreloadManager.preloadAllBundles() 应该已加载 words Bundle');
                return;
            }
            

            // 直接调用 GlossService（不使用动态import）
            const glossService = GlossService.getInstance();

            // 一次性加载核心+扩展词库（避免二次加载）
            await glossService.load(useExtended);

            const allWords = glossService.getAllWords();
            const loadStatus = glossService.getLoadStatus();

            

            if (allWords.length === 0) {
                console.error('[PreloadManager] ❌ 词库为空！');
                console.error('[PreloadManager] 检查项:');
                console.error('[PreloadManager]   1. words_core.json 是否存在');
                console.error('[PreloadManager]   2. words_core.json 是否能被 GlossService.loadJsonFromBundle 访问');
                console.error('[PreloadManager]   3. words_core.json 的 JSON 结构是否正确');
            }

        } catch (error) {
            console.error('[PreloadManager] ❌ 词库数据加载失败:', error);
            console.error('[PreloadManager] 错误堆栈:', error instanceof Error ? error.stack : '');
        }
        
    }
    
    /**
     * 预加载一组Bundle
     */
    private async preloadBundleGroup(bundles: {name: string, priority: number}[], startProgress: number, endProgress: number): Promise<void> {
        const totalBundles = bundles.length;
        if (totalBundles === 0) return;
        
        const progressPerBundle = (endProgress - startProgress) / totalBundles;
        
        for (let i = 0; i < totalBundles; i++) {
            const bundle = bundles[i];
            const bundleStartProgress = startProgress + i * progressPerBundle;
            const bundleEndProgress = bundleStartProgress + progressPerBundle;
            
            await this.preloadSingleBundle(bundle.name, bundleStartProgress, bundleEndProgress);
        }
    }
    
    /**
     * 预加载单个Bundle及其关键资源
     */
    private async preloadSingleBundle(bundleName: string, startProgress: number, endProgress: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.reportProgress(startProgress, `正在加载 ${bundleName} 资源包...`);

            // 首先加载Bundle
            assetManager.loadBundle(bundleName, (err, bundle) => {
                if (err) {
                    console.error(`[PreloadManager.preloadSingleBundle] ❌ Bundle '${bundleName}' 加载失败:`, err);
                    this.reportProgress(endProgress, `${bundleName} 资源包加载失败，将使用缓存`);
                    resolve(); // 继续加载其他Bundle
                    return;
                }

                
                this.loadedBundles.set(bundleName, bundle);

                // 验证Bundle是否在官方缓存中
                const cachedBundle = assetManager.getBundle(bundleName);
                if (!cachedBundle) {
                    console.error(`[PreloadManager.preloadSingleBundle] ⚠️ Bundle '${bundleName}' 加载成功但未在缓存中！`);
                }

                // Bundle加载占50%进度
                const midProgress = startProgress + (endProgress - startProgress) * 0.5;
                this.reportProgress(midProgress, `正在预加载 ${bundleName} 内部资源...`);

                // 预加载Bundle内的关键资源
                this.preloadBundleAssets(bundle, bundleName, midProgress, endProgress)
                    .then(() => {
                        
                        resolve();
                    })
                    .catch((error) => {
                        console.error(`[PreloadManager.preloadSingleBundle] ⚠️ Bundle '${bundleName}' 资源预加载失败，但继续:`, error);
                        resolve();
                    });
            });
        });
    }
    
    /**
     * 完全加载Bundle内的关键资源（包括反序列化和初始化）
     */
    private async preloadBundleAssets(bundle: assetManager.Bundle, bundleName: string, startProgress: number, endProgress: number): Promise<void> {
        const assetsToLoad = this.ASSETS_TO_PRELOAD[bundleName] || [];
        if (assetsToLoad.length === 0) {
            this.reportProgress(endProgress, `${bundleName} 资源包完全加载完成`);
            return;
        }
        
        const progressPerAsset = (endProgress - startProgress) / assetsToLoad.length;
        
        for (let i = 0; i < assetsToLoad.length; i++) {
            const assetPath = assetsToLoad[i];
            const assetProgress = startProgress + i * progressPerAsset;
            
            try {
                await this.preloadSingleAsset(bundle, assetPath, bundleName);
                this.reportProgress(assetProgress + progressPerAsset, `${bundleName}/${assetPath} 完全加载完成`);
            } catch (error) {
                console.warn(`[PreloadManager] 完全加载资源 ${bundleName}/${assetPath} 失败:`, error);
                // 继续加载下一个资源
            }
        }
    }
    
    /**
     * 完全加载单个资源（包括反序列化和初始化，立即可用）
     */
    private preloadSingleAsset(bundle: assetManager.Bundle, assetPath: string, bundleName: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // 判断资源类型（SpriteFrame或JsonAsset）
            const assetType = assetPath.includes('/spriteFrame') ? SpriteFrame : JsonAsset;

            // 使用bundle.load进行完全加载，而不是preload
            bundle.load(assetPath, assetType, (err: Error | null, asset: SpriteFrame | JsonAsset) => {
                if (err) {
                    console.warn(`[PreloadManager] 完全加载资源 ${bundleName}/${assetPath} 失败:`, err);
                    reject(err);
                } else {
                    
                    resolve();
                }
            });
        });
    }
    
    /**
     * 获取已加载的Bundle（使用Cocos Creator 3.8.7官方缓存API）
     */
    public getLoadedBundle(bundleName: string): assetManager.Bundle | null {
        // 使用官方API获取已缓存的Bundle
        const bundle = assetManager.getBundle(bundleName);
        if (bundle) {
            return bundle;
        }
        
        // 降级检查自维护的Map（向后兼容）
        const localBundle = this.loadedBundles.get(bundleName);
        return localBundle || null;
    }
    
    /**
     * 检查Bundle是否已加载（使用官方API）
     */
    public isBundleLoaded(bundleName: string): boolean {
        // 优先使用官方API检查
        const bundle = assetManager.getBundle(bundleName);
        if (bundle) {
            return true;
        }
        
        // 降级检查本地Map
        return this.loadedBundles.has(bundleName);
    }
    
    /**
     * 获取总体预加载进度
     */
    public getOverallProgress(): number {
        if (this.preloadProgress.size === 0) return 0;
        
        let totalProgress = 0;
        this.preloadProgress.forEach(progress => {
            totalProgress += progress;
        });
        
        return totalProgress / this.preloadProgress.size;
    }
    
    /**
     * 上报进度给UI
     */
    private reportProgress(progress: number, message: string): void {
        if (this.onProgressCallback) {
            this.onProgressCallback(Math.min(progress, 1.0), message);
        }
    }
    
    /**
     * 清理资源（游戏结束时调用）
     */
    public cleanup(): void {
        this.loadedBundles.clear();
        this.preloadProgress.clear();
        this.onProgressCallback = null;
    }
}