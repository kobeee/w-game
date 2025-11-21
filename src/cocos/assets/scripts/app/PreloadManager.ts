import { _decorator, assetManager, SpriteFrame, JsonAsset } from 'cc';
import { GlossService } from '../data/GlossService';
import { AssetLoader } from '../core/AssetLoader';

const { ccclass } = _decorator;

/**
 * Asset Bundle完全预加载管理器
 * 负责在游戏启动时完全加载所有远程资源（包括反序列化和初始化），确保后续立即可用
 */
@ccclass('PreloadManager')
export class PreloadManager {

    private static _instance: PreloadManager = null;

    // 需要预加载的Bundle配置（按优先级分组）
    private readonly BUNDLES_TO_PRELOAD = [
        // 🔥 高优先级：启动必需资源（加载场景必须完成）
        { name: 'bg', priority: 1, phase: 'startup' },
        { name: 'title', priority: 1, phase: 'startup' },
        { name: 'tiles', priority: 1, phase: 'startup' },        // 字母瓦片资源，高优先级
        { name: 'slot', priority: 1, phase: 'startup' },         // 牌槽背景资源，高优先级（StackGame依赖）
        { name: 'words', priority: 1, phase: 'startup' },        // 词库资源，高优先级（核心功能依赖）
        
        // 🚀 中优先级：主菜单后台静默加载
        { name: 'modal', priority: 2, phase: 'menu' }
    ];
    
    // 每个Bundle内需要预加载的关键资源（按阶段分离）
    private readonly ASSETS_TO_PRELOAD = {
        // 🏁 启动阶段：必须加载的资源
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
            'words_core',          // 核心词库（3-7字母）- 启动必需
            'zh_gloss'             // 核心词义库 - 启动必需
            // 'words_extended',    // 扩展词库（8-10字母）- 延迟到主菜单
            // 'zh_gloss_extended'  // 扩展词义库 - 延迟到主菜单
        ],
        
        // 📱 主菜单阶段：后台静默加载
        'modal': [
            'pop_card/spriteFrame'
        ]
    };
    
    // 延迟加载资源配置（主菜单阶段加载）
    private readonly DELAYED_ASSETS = {
        'words': [
            'words_extended',      // 扩展词库（8-10字母）
            'zh_gloss_extended'    // 扩展词义库
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
     * 🚀 优化版：按阶段优先级加载资源
     * 启动阶段仅加载必需资源，大幅缩短首次加载时间
     */
    public async preloadStartupBundles(): Promise<void> {
        this.reportProgress(0, '正在初始化核心资源加载...');

        try {
            // 🔥 启动阶段：仅加载高优先级必需资源
            const startupBundles = this.BUNDLES_TO_PRELOAD.filter(b => b.phase === 'startup');
            await this.preloadBundleGroup(startupBundles, 0, 0.6);

            // 📚 核心词库加载（分配独立进度 0.6 → 0.8）
            await this.loadGlossDataWithProgress(0.6, 0.8, false); // 仅加载核心词库

            this.reportProgress(0.8, '核心资源加载完成，可以进入游戏');

        } catch (error) {
            console.error('[PreloadManager] 启动资源加载失败:', error);
            this.reportProgress(0.75, '核心资源加载完成（部分使用缓存）');
        }
    }

    /**
     * 📱 主菜单阶段：后台静默加载中优先级资源
     */
    public async preloadMenuResources(): Promise<void> {
        console.log('[PreloadManager] 📱 开始后台加载主菜单资源...');

        try {
            // 🚀 中优先级Bundle加载
            const menuBundles = this.BUNDLES_TO_PRELOAD.filter(b => b.phase === 'menu');
            await this.preloadBundleGroup(menuBundles, 0, 0.5);

            // 📚 扩展词库加载
            await this.loadDelayedGlossData(0.5, 1.0);

            console.log('[PreloadManager] ✅ 主菜单资源加载完成');

        } catch (error) {
            console.warn('[PreloadManager] 主菜单资源加载失败，将使用按需加载:', error);
        }
    }

    /**
     * 🎮 游戏内延迟加载（用于叠叠乐等特定场景）
     */
    public async loadGameSpecificResources(gameType: 'basic' | 'stack'): Promise<void> {
        if (gameType === 'stack') {
            console.log('[PreloadManager] 🎮 开始加载叠叠乐专属资源...');
            await this.loadStackGameResources();
        }
    }

    /**
     * 📦 叠叠乐专属资源加载
     */
    private async loadStackGameResources(): Promise<void> {
        try {
            // 🌸 BloomFilter 快速否定层
            await this.loadBloomFilter();

            // 📋 布局JSON文件
            await this.loadLayoutFiles();

            console.log('[PreloadManager] ✅ 叠叠乐专属资源加载完成');
        } catch (error) {
            console.warn('[PreloadManager] 叠叠乐资源加载失败，将按需加载:', error);
        }
    }

    /**
     * 🌸 加载 BloomFilter（快速否定层）
     */
    private async loadBloomFilter(): Promise<void> {
        // 动态导入 BloomFilter，避免启动时加载
        try {
            const { loadBloomFromBundle } = await import('../services/BloomFilter');
            await loadBloomFromBundle();
            console.log('[PreloadManager] 🌸 BloomFilter 加载完成');
        } catch (error) {
            console.warn('[PreloadManager] 🌸 BloomFilter 加载失败:', error);
        }
    }

    /**
     * 📋 加载布局JSON文件
     */
    private async loadLayoutFiles(): Promise<void> {
        try {
            const assetLoader = AssetLoader.getInstance();
            // 预加载常用布局文件
            const layoutFiles = [
                'layouts/stack_center_tower',
                'layouts/stack_cross_towers',
                'layouts/stack_diagonal_ridge',
                'layouts/stack_ring_fortress',
                'layouts/stack_multi_towers',
                'layouts/sheep_style_complex'
            ];

            for (const layoutPath of layoutFiles) {
                try {
                    await assetLoader.loadJsonAsset(layoutPath);
                } catch (e) {
                    console.warn(`[PreloadManager] 布局文件 ${layoutPath} 预加载失败，将按需加载`);
                }
            }

            console.log('[PreloadManager] 📋 布局文件预加载完成');
        } catch (error) {
            console.warn('[PreloadManager] 布局文件加载失败:', error);
        }
    }

    /**
     * 📚 加载延迟词库数据（扩展词库）
     */
    private async loadDelayedGlossData(startProgress: number, endProgress: number): Promise<void> {
        this.reportProgress(startProgress, '正在加载扩展词库...');

        try {
            const wordsBundle = this.getLoadedBundle('words');
            if (!wordsBundle) {
                console.warn('[PreloadManager] words Bundle 未加载，跳过扩展词库');
                return;
            }

            const glossService = GlossService.getInstance();
            
            // 加载扩展词库
            const midProgress = startProgress + (endProgress - startProgress) * 0.5;
            this.reportProgress(midProgress, '正在加载扩展词库数据...');

            await glossService.loadExtendedWordsOnly();

            this.reportProgress(endProgress, '扩展词库加载完成');

        } catch (error) {
            console.warn('[PreloadManager] 扩展词库加载失败:', error);
            this.reportProgress(endProgress, '扩展词库加载失败，将使用核心词库');
        }
    }

    /**
     * 🔄 兼容性方法：保持向后兼容
     * @deprecated 建议使用 preloadStartupBundles() 和 preloadMenuResources()
     */
    public async preloadAllBundles(): Promise<void> {
        console.warn('[PreloadManager] ⚠️ preloadAllBundles() 已废弃，请使用新的分阶段加载');
        
        // 为保持兼容性，执行完整的启动加载
        await this.preloadStartupBundles();
        
        // 静默加载主菜单资源（不阻塞）
        this.preloadMenuResources().catch(e => 
            console.warn('[PreloadManager] 主菜单资源后台加载失败:', e)
        );
    }

    /**
     * 加载词库数据（确保WordMatcher初始化前完成）
     * @param useExtended 是否加载扩展词库（默认false，启动阶段仅加载核心）
     */
    private async loadGlossData(useExtended: boolean = false): Promise<void> {
        try {
            // 检查 Bundle 是否已加载
            const wordsBundle = assetManager.getBundle('words');
            if (!wordsBundle) {
                console.error('[PreloadManager] ❌ 严重错误：words Bundle 未加载！');
                console.error('[PreloadManager] preloadStartupBundles() 应该已加载 words Bundle');
                return;
            }

            // 直接调用 GlossService（不使用动态import）
            const glossService = GlossService.getInstance();

            // 根据阶段决定加载范围
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
     * 加载词库数据（带进度报告）
     * @param startProgress 开始进度
     * @param endProgress 结束进度
     * @param useExtended 是否加载扩展词库（默认false，启动阶段仅加载核心）
     */
    private async loadGlossDataWithProgress(startProgress: number, endProgress: number, useExtended: boolean = false): Promise<void> {
        this.reportProgress(startProgress, `正在加载${useExtended ? '完整' : '核心'}词库数据...`);

        try {
            // 检查 Bundle 是否已加载
            const wordsBundle = assetManager.getBundle('words');
            if (!wordsBundle) {
                console.error('[PreloadManager] ❌ 严重错误：words Bundle 未加载！');
                console.error('[PreloadManager] preloadStartupBundles() 应该已加载 words Bundle');
                return;
            }

            // 中间进度点
            const midProgress = startProgress + (endProgress - startProgress) * 0.5;
            this.reportProgress(midProgress, '正在初始化词库服务...');

            // 直接调用 GlossService（不使用动态import）
            const glossService = GlossService.getInstance();

            // 根据阶段决定加载范围
            await glossService.load(useExtended);

            const allWords = glossService.getAllWords();
            const loadStatus = glossService.getLoadStatus();

            this.reportProgress(endProgress, `${useExtended ? '完整' : '核心'}词库加载完成，共 ${allWords.length} 个单词`);

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
            this.reportProgress(endProgress, '词库加载失败，将使用离线缓存');
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