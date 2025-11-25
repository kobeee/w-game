import { _decorator, assetManager, SpriteFrame, JsonAsset } from 'cc';
import { GlossService } from '../data/GlossService';
import { AssetLoader } from '../core/AssetLoader';
// 尽早导入 AbortController polyfill，确保微信小游戏兼容性
import '../util/AbortControllerPolyfill';

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

        // 检测微信小游戏网络状态
        if (typeof wx !== 'undefined') {
            this.checkWeChatNetworkStatus();
        }

        // 🔥 启动阶段：仅加载高优先级必需资源（分配 0 → 0.75 进度）
        const startupBundles = this.BUNDLES_TO_PRELOAD.filter(b => b.phase === 'startup');
        await this.preloadBundleGroup(startupBundles, 0, 0.75);

        // 📚 核心词库加载（分配独立进度 0.75 → 0.95）
        await this.loadGlossDataWithProgress(0.75, 0.95, false); // 仅加载核心词库

        this.reportProgress(0.95, '核心资源加载完成，准备进入游戏');
    }

    /**
     * 检查微信小游戏网络状态
     */
    private checkWeChatNetworkStatus(): void {
        try {
            const systemInfo = wx.getSystemInfoSync();
            console.log('[PreloadManager] 微信环境信息:', {
                platform: systemInfo.platform,
                version: systemInfo.version,
                SDKVersion: systemInfo.SDKVersion,
                benchmarkLevel: systemInfo.benchmarkLevel
            });

            // 检查网络类型
            wx.getNetworkType({
                success: (res) => {
                    console.log('[PreloadManager] 网络类型:', res.networkType);
                    if (res.networkType === 'none') {
                        console.warn('[PreloadManager] ⚠️ 无网络连接，将使用缓存资源');
                        this.reportProgress(0.05, '检测到无网络，将使用缓存资源');
                    } else if (res.networkType === '2g' || res.networkType === '3g') {
                        console.warn('[PreloadManager] ⚠️ 网络较慢，可能需要更长时间');
                        this.reportProgress(0.05, `网络较慢(${res.networkType})，请耐心等待`);
                    }
                },
                fail: () => {
                    console.warn('[PreloadManager] 无法获取网络类型');
                }
            });

            // 监听网络状态变化
            wx.onNetworkStatusChange((res) => {
                if (!res.isConnected) {
                    console.warn('[PreloadManager] 网络断开');
                } else {
                    console.log('[PreloadManager] 网络已连接，类型:', res.networkType);
                }
            });

        } catch (error) {
            console.warn('[PreloadManager] 微信网络状态检测失败:', error);
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
     * 🔍 微信小游戏兼容性检查
     * 在预加载开始前检查关键API的可用性
     */
    private checkCompatibility(): void {
        console.log('[PreloadManager] 🔍 开始微信小游戏兼容性检查...');
        
        // 检查 AbortController
        if (typeof AbortController === 'undefined') {
            console.error('❌ AbortController 不可用，这会导致网络请求失败');
        } else {
            console.log('✅ AbortController 可用');
        }
        
        // 检查微信小游戏 API
        if (typeof wx !== 'undefined') {
            console.log('✅ 微信小游戏环境检测成功');
            
            if (wx.base64ToArrayBuffer) {
                console.log('✅ wx.base64ToArrayBuffer 可用');
            } else {
                console.warn('⚠️ wx.base64ToArrayBuffer 不可用，将使用回退方案');
            }
            
            if (wx.getFileSystemManager) {
                console.log('✅ wx.getFileSystemManager 可用');
            } else {
                console.warn('⚠️ wx.getFileSystemManager 不可用，将使用回退方案');
            }
        } else {
            console.log('ℹ️ 非微信小游戏环境（浏览器预览）');
        }
        
        // 检查 Base64 API
        if (typeof btoa !== 'undefined' && typeof atob !== 'undefined') {
            console.log('✅ 浏览器 Base64 API 可用');
        } else {
            console.warn('⚠️ 浏览器 Base64 API 不可用，将使用手动解码');
        }
        
        console.log('[PreloadManager] 🔍 兼容性检查完成');
    }

    /**
     * 🎯 兼容性方法：预加载单个Bundle（用于LoadingUI）
     * 保持与现有preloadSingleBundle方法的兼容性，但支持微信小游戏并发控制
     */
    public async preloadSingleBundleCompat(bundleName: string, startProgress: number, endProgress: number): Promise<void> {
        // 在首次预加载时进行兼容性检查
        if (this.loadedBundles.size === 0) {
            this.checkCompatibility();
        }
        
        // 直接调用现有的preloadSingleBundle方法，已包含并发控制和429重试
        await this.preloadSingleBundle(bundleName, startProgress, endProgress);
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
     * 预加载一组Bundle（支持并发控制）
     */
    private async preloadBundleGroup(bundles: {name: string, priority: number}[], startProgress: number, endProgress: number): Promise<void> {
        const totalBundles = bundles.length;
        if (totalBundles === 0) return;
        
        const progressPerBundle = (endProgress - startProgress) / totalBundles;
        
        // 🎯 统一使用并发加载，底层拦截器自动控制并发
    console.log('[PreloadManager] 🚀 使用并发Bundle加载（底层拦截器控制并发）');
    const bundlePromises = bundles.map((bundle, i) => {
        const bundleStartProgress = startProgress + i * progressPerBundle;
        const bundleEndProgress = bundleStartProgress + progressPerBundle;
        return this.preloadSingleBundle(bundle.name, bundleStartProgress, bundleEndProgress);
    });
    
    await Promise.all(bundlePromises);
    }
    
    /**
     * 预加载单个Bundle及其关键资源（Fix 016: 增加超时和容错机制）
     */
    public async ensureBundleLoaded(bundleName: string): Promise<assetManager.Bundle | null> {
        // 检查是否已加载
        if (this.isBundleLoaded(bundleName)) {
            return this.getLoadedBundle(bundleName);
        }

        try {
            // 添加超时机制，避免无限等待
            const bundle = await Promise.race([
                this.loadBundleInternal(bundleName),
                new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`Bundle ${bundleName} 加载超时 (10s)`));
                    }, 10000);
                })
            ]);
            
            this.loadedBundles.set(bundleName, bundle);
            return bundle;
        } catch (error) {
            console.error(`[PreloadManager] 🚨 Bundle ${bundleName} 加载失败:`, error);
            
            // Fix 016: 不再直接抛出错误，而是返回 null 让上层处理
            // 这样可以避免整个加载流程完全卡死
            return null;
        }
    }

    /**
     * 内部Bundle加载方法
     */
    private loadBundleInternal(bundleName: string): Promise<assetManager.Bundle> {
        return new Promise((resolve, reject) => {
            assetManager.loadBundle(bundleName, (err: any, bundle: any) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(bundle);
            });
        });
    }

    /**
     * 预加载单个Bundle及其关键资源（简化版，底层拦截器处理429重试）
     */
    private async preloadSingleBundle(bundleName: string, startProgress: number, endProgress: number): Promise<void> {
        const attemptMsg = '';
        this.reportProgress(startProgress, `正在加载 ${bundleName} 资源包${attemptMsg}...`);

        return new Promise<void>((resolve, reject) => {
            assetManager.loadBundle(bundleName, (err: any, bundle: any) => {
                if (err) {
                    console.error(`[PreloadManager.preloadSingleBundle] ❌ Bundle '${bundleName}' 加载失败:`, err);
                    // 底层拦截器会自动处理429重试，这里直接报告失败
                    this.reportProgress(endProgress, `${bundleName} 资源包加载失败，将使用本地资源`);
                    resolve(); // 不阻断流程，继续加载其他Bundle
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
                    .then(() => resolve())
                    .catch((error) => {
                        console.error(`[PreloadManager.preloadSingleBundle] ⚠️ Bundle '${bundleName}' 资源预加载失败，但继续:`, error);
                        resolve(); // 资源预加载失败不阻断Bundle加载
                    });
            });
        });
    }

    
    
    /**
     * 完全加载Bundle内的关键资源（包括反序列化和初始化）
     * 🎯 底层拦截器自动控制并发，简化逻辑
     */
    private async preloadBundleAssets(bundle: assetManager.Bundle, bundleName: string, startProgress: number, endProgress: number): Promise<void> {
        const assetsToLoad = this.ASSETS_TO_PRELOAD[bundleName] || [];
        if (assetsToLoad.length === 0) {
            this.reportProgress(endProgress, `${bundleName} 资源包完全加载完成`);
            return;
        }
        
        const progressPerAsset = (endProgress - startProgress) / assetsToLoad.length;
        
        // 🚀 统一使用并发加载，底层拦截器自动控制并发
        console.log(`[PreloadManager] 🚀 ${bundleName} 资源使用并发加载（底层拦截器控制并发）`);
        const assetPromises = assetsToLoad.map(async (assetPath, i) => {
            const assetProgress = startProgress + i * progressPerAsset;
            try {
                await this.preloadAsset(bundle, bundleName, assetPath);
                this.reportProgress(assetProgress + progressPerAsset, `${bundleName}/${assetPath} 完全加载完成`);
            } catch (error) {
                console.warn(`[PreloadManager] 完全加载资源 ${bundleName}/${assetPath} 失败:`, error);
            }
        });
        
        await Promise.all(assetPromises);
    }
    
    /**
     * 完全加载单个资源（Fix 3: 增加容错机制，失败不阻断流程）
     */
    private preloadAsset(bundle: assetManager.Bundle, bundleName: string, assetPath: string): Promise<void> {
        // 判断资源类型（SpriteFrame或JsonAsset）
        const assetType = assetPath.includes('/spriteFrame') ? SpriteFrame : JsonAsset;

        return new Promise<void>((resolve, reject) => { 
            bundle.load(assetPath, assetType, (err: Error | null, asset: SpriteFrame | JsonAsset) => {
                if (err) {
                    console.warn(`[PreloadManager] 资源预热失败 ${bundleName}:${assetPath}`);
                    reject(err); // 失败则 reject
                    return;
                }
                
                // 成功加载，记录
                console.log(`[PreloadManager] ✅ 资源预热成功 ${bundleName}:${assetPath}`);
                resolve();
            });
        });
    }

    /**
     * 完全加载单个资源（兼容性方法）
     */
    private preloadSingleAsset(bundle: assetManager.Bundle, assetPath: string, bundleName: string): Promise<void> {
        return this.preloadAsset(bundle, bundleName, assetPath);
    }

    /**
     * 预加载关键资源（兼容性方法）
     */
    public async preloadCriticalAssets(bundleName: string): Promise<void> {
        const bundle = this.getLoadedBundle(bundleName);
        if (!bundle) {
            console.warn(`[PreloadManager] Bundle ${bundleName} 未加载，跳过关键资源预加载`);
            return;
        }

        const assetsToLoad = this.ASSETS_TO_PRELOAD[bundleName] || [];
        const promises = assetsToLoad.map(assetPath => 
            this.preloadAsset(bundle, bundleName, assetPath)
        );

        await Promise.all(promises);
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