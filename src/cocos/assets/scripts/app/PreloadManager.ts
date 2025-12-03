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

    // 🎯 单Bundle配置：所有资源都在一个bundle中
    private readonly BUNDLE_NAME = 'bundle';
    
    // 启动阶段必须加载的关键资源
    private readonly STARTUP_ASSETS = [
        // 背景资源
        'bg/main_scene_bg/spriteFrame',
        'bg/game_scene_bg/spriteFrame', 
        'bg/result_scene_bg/spriteFrame',
        // 标题资源
        'title/title/spriteFrame',
        // 牌槽资源
        'slot/slot_item/spriteFrame',
        // 词库资源
        'words/words_core',
        'words/zh_gloss',
        // 弹窗资源
        'modal/pop_card/spriteFrame',
        // 瓦片资源（保持完整，确保渲染正常）
        'tiles/tile_selectable/spriteFrame',
        'tiles/tile_highlight/spriteFrame',
        'tiles/tile_correct/spriteFrame',
        'tiles/tile_wrong/spriteFrame',
        'tiles/tile_disabled/spriteFrame'
    ];
    
    // 延迟加载资源（主菜单阶段）
    private readonly DELAYED_ASSETS = [
        'words/words_extended',
        'words/zh_gloss_extended'
    ];
    
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
     * 获取AssetLoader实例
     */
    public getAssetLoader(): AssetLoader {
        return AssetLoader.getInstance();
    }
    
    /**
     * 🚀 优化版：加载单个Bundle中的关键资源
     * 启动阶段仅加载必需资源，大幅缩短首次加载时间
     */
    public async preloadStartupBundles(): Promise<void> {
        console.log('[PreloadManager] 🚀 开始启动阶段资源加载（单Bundle版）...');
        this.reportProgress(0, '正在初始化核心资源加载...');

        // 检测微信小游戏网络状态
        if (typeof wx !== 'undefined') {
            this.checkWeChatNetworkStatus();
        }

        // 🔥 加载单个Bundle（分配 0 → 0.3 进度）
        await this.loadSingleBundle(this.BUNDLE_NAME, 0, 0.3);

        // 🎯 预热关键资源（分配 0.3 → 0.8 进度）
        await this.preloadCriticalAssetsWithProgress(0.3, 0.8);

        // 📚 核心词库加载（分配 0.8 → 0.95 进度）
        await this.loadGlossDataWithProgress(0.8, 0.95, false); // 仅加载核心词库

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
     * 📱 主菜单阶段：后台静默加载延迟资源
     */
    public async preloadMenuResources(): Promise<void> {
        console.log('[PreloadManager] 📱 开始后台加载延迟资源...');

        try {
            // 📚 扩展词库加载
            await this.loadDelayedGlossData(0, 1.0);

            console.log('[PreloadManager] ✅ 延迟资源加载完成');

        } catch (error) {
            console.warn('[PreloadManager] 延迟资源加载失败，将使用按需加载:', error);
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
            const bundle = this.getLoadedBundle(this.BUNDLE_NAME);
            if (!bundle) {
                console.warn(`[PreloadManager] Bundle '${this.BUNDLE_NAME}' 未加载，跳过扩展词库`);
                return;
            }

            // 预热扩展资源
            const progressPerAsset = (endProgress - startProgress) / this.DELAYED_ASSETS.length;
            
            for (let i = 0; i < this.DELAYED_ASSETS.length; i++) {
                const assetPath = this.DELAYED_ASSETS[i];
                const assetProgress = startProgress + i * progressPerAsset;
                
                // 检查资源路径有效性
                if (!assetPath || typeof assetPath !== 'string') {
                    console.warn(`[PreloadManager] ⚠️ 跳过无效的扩展资源路径: ${assetPath}`);
                    continue;
                }
                
                try {
                    await this.preloadAsset(bundle, this.BUNDLE_NAME, assetPath);
                    this.reportProgress(assetProgress + progressPerAsset, `扩展资源预热完成: ${assetPath}`);
                } catch (error) {
                    console.warn(`[PreloadManager] 扩展资源预热失败: ${assetPath}`, error);
                }
            }

            const glossService = GlossService.getInstance();
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
            const bundle = assetManager.getBundle('bundle');
            if (!bundle) {
                console.error(`[PreloadManager] ❌ 严重错误：Bundle '${this.BUNDLE_NAME}' 未加载！`);
                console.error('[PreloadManager] preloadStartupBundles() 应该已加载 Bundle');
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
            const bundle = assetManager.getBundle('bundle');
            if (!bundle) {
                console.error(`[PreloadManager] ❌ 严重错误：Bundle '${this.BUNDLE_NAME}' 未加载！`);
                console.error('[PreloadManager] preloadStartupBundles() 应该已加载 Bundle');
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
    /**
     * 🎯 加载单个Bundle（适配新的单Bundle结构）
     */
    private async loadSingleBundle(bundleName: string, startProgress: number, endProgress: number): Promise<void> {
        this.reportProgress(startProgress, `正在加载 ${bundleName} 资源包...`);

        return new Promise<void>((resolve, reject) => {
            assetManager.loadBundle(bundleName, (err: any, bundle: any) => {
                if (err) {
                    console.error(`[PreloadManager.loadSingleBundle] ❌ Bundle '${bundleName}' 加载失败:`, err);
                    this.reportProgress(endProgress, `${bundleName} 资源包加载失败，将使用本地资源`);
                    resolve(); // 不阻断流程
                    return;
                }

                this.loadedBundles.set(bundleName, bundle);
                console.log(`[PreloadManager.loadSingleBundle] ✅ Bundle '${bundleName}' 加载完成`);
                this.reportProgress(endProgress, `${bundleName} 资源包加载完成`);
                resolve();
            });
        });
    }

    /**
     * 🎯 预热关键资源（适配新的单Bundle结构）
     */
    private async preloadCriticalAssetsWithProgress(startProgress: number, endProgress: number): Promise<void> {
        this.reportProgress(startProgress, '正在预热关键资源...');
        
        const bundle = this.getLoadedBundle(this.BUNDLE_NAME);
        if (!bundle) {
            console.error(`[PreloadManager.preloadCriticalAssetsWithProgress] ❌ Bundle '${this.BUNDLE_NAME}' 未加载`);
            return;
        }

        const progressPerAsset = (endProgress - startProgress) / this.STARTUP_ASSETS.length;
        
        // 微信环境：串行加载避免429
        if (typeof wx !== 'undefined') {
            console.log('[PreloadManager] 📱 微信环境：串行预热资源（瓦片资源增加间隔）');
            for (let i = 0; i < this.STARTUP_ASSETS.length; i++) {
                const assetPath = this.STARTUP_ASSETS[i];
                const assetProgress = startProgress + i * progressPerAsset;
                
                // 检查资源路径有效性
                if (!assetPath || typeof assetPath !== 'string') {
                    console.warn(`[PreloadManager] ⚠️ 跳过无效的关键资源路径: ${assetPath}`);
                    continue;
                }
                
                try {
                    await this.preloadAsset(bundle, this.BUNDLE_NAME, assetPath);
                    this.reportProgress(assetProgress + progressPerAsset, `资源预热完成: ${assetPath}`);
                    
                    // 🔥 瓦片资源增加额外间隔，避免429
                    if (assetPath.includes('tiles/tile_')) {
                        console.log('[PreloadManager] 🧊 瓦片资源加载完成，冷却0.5秒...');
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } catch (error) {
                    console.warn(`[PreloadManager] 资源预热失败: ${assetPath}`, error);
                    // 🔥 瓦片资源失败时增加额外等待时间
                    if (assetPath.includes('tiles/tile_')) {
                        console.log('[PreloadManager] 🧊 瓦片资源失败，额外等待2秒...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
        } else {
            // 浏览器环境：并行加载
            console.log('[PreloadManager] 🌐 浏览器环境：并行预热资源');
            const assetPromises = this.STARTUP_ASSETS.map(async (assetPath, i) => {
                const assetProgress = startProgress + i * progressPerAsset;
                
                // 检查资源路径有效性
                if (!assetPath || typeof assetPath !== 'string') {
                    console.warn(`[PreloadManager] ⚠️ 跳过无效的关键资源路径: ${assetPath}`);
                    return;
                }
                
                try {
                    await this.preloadAsset(bundle, this.BUNDLE_NAME, assetPath);
                    this.reportProgress(assetProgress + progressPerAsset, `资源预热完成: ${assetPath}`);
                } catch (error) {
                    console.warn(`[PreloadManager] 资源预热失败: ${assetPath}`, error);
                }
            });
            
            await Promise.all(assetPromises);
        }
        
        this.reportProgress(endProgress, '关键资源预热完成');
    }

    

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
        // 使用 STARTUP_ASSETS 作为关键资源列表
        const assetsToLoad = this.STARTUP_ASSETS;
        if (assetsToLoad.length === 0) {
            this.reportProgress(endProgress, `${bundleName} 资源包完全加载完成`);
            return;
        }
        
        const progressPerAsset = (endProgress - startProgress) / assetsToLoad.length;
        
        // 🚀 统一使用并发加载，底层拦截器自动控制并发
        console.log(`[PreloadManager] 🚀 ${bundleName} 资源使用并发加载（底层拦截器控制并发）`);
        const assetPromises = assetsToLoad.map(async (assetPath, i) => {
            const assetProgress = startProgress + i * progressPerAsset;
            
            // 检查资源路径有效性
            if (!assetPath || typeof assetPath !== 'string') {
                console.warn(`[PreloadManager] ⚠️ 跳过无效的资源路径: ${bundleName}:${assetPath}`);
                return;
            }
            
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
        // 检查 assetPath 是否有效
        if (!assetPath || typeof assetPath !== 'string') {
            console.warn(`[PreloadManager] ⚠️ 无效的资源路径: ${bundleName}:${assetPath}`);
            return Promise.reject(new Error(`无效的资源路径: ${bundleName}:${assetPath}`));
        }

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

        // 使用 STARTUP_ASSETS 作为关键资源列表
        const assetsToLoad = this.STARTUP_ASSETS;
        const promises = assetsToLoad.map(assetPath => {
            // 检查资源路径有效性
            if (!assetPath || typeof assetPath !== 'string') {
                console.warn(`[PreloadManager] ⚠️ 跳过无效的资源路径: ${bundleName}:${assetPath}`);
                return Promise.resolve();
            }
            return this.preloadAsset(bundle, bundleName, assetPath);
        });

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