import { _decorator, Component, director, sys } from 'cc';
import { LoadingUI } from '../ui/LoadingUI';
import { PreloadManager } from './PreloadManager';

const { ccclass, property } = _decorator;

/**
 * 加载场景控制器
 * 负责协调预加载流程和场景跳转
 */
@ccclass('LoadingScene')
export class LoadingScene extends Component {
    
    @property(LoadingUI)
    loadingUI: LoadingUI = null!;
    
    // 最短加载时间（避免加载太快导致用户体验不佳）
    private readonly MIN_LOADING_TIME = 2.0;
    private startTime: number = 0;
    private preloadManager: PreloadManager = null!;
    
    protected async onLoad(): Promise<void> {
        this.startTime = Date.now();
        this.preloadManager = PreloadManager.getInstance();
        
        // 检查网络状态
        this.checkNetworkStatus();

        // Fix 3: 实施容错加载流程
        await this.startLoadingWithErrorHandling();
    }
    
    protected start(): void {
        // LoadingUI会自动开始加载流程
        if (!this.loadingUI) {
            console.error('[LoadingScene] LoadingUI组件未找到，直接跳转到主菜单');
            this.scheduleOnce(() => {
                director.loadScene('MainMenu');
            }, 1.0);
        }
    }

    /**
     * Fix 3: 容错加载流程
     */
    private async startLoadingWithErrorHandling(): Promise<void> {
        try {
            console.log('[LoadingScene] 开始容错加载流程...');
            
            // 获取启动Bundle列表
            const startupBundles = ['bg', 'title', 'tiles', 'slot', 'words'];
            
            // Fix 3: 即使 bundle 加载返回 null，也不要中断循环
            for (let i = 0; i < startupBundles.length; i++) {
                const bundleName = startupBundles[i];
                
                // 无论成功失败，都视为进度推进
                await this.preloadManager.ensureBundleLoaded(bundleName);
                
                // 临时修复：检查preloadCriticalAssets方法是否存在
                if (this.preloadManager.preloadCriticalAssets) {
                    await this.preloadManager.preloadCriticalAssets(bundleName);
                } else {
                    console.warn(`[LoadingScene] preloadCriticalAssets方法不存在，跳过${bundleName}资源预加载`);
                }
                
                // 强制计算一个单调递增的进度
                const currentProgress = (i + 1) / startupBundles.length;
                this.loadingUI.updateProgress(currentProgress, '');
            }

            console.log('[LoadingScene] 容错加载流程完成');
            this.onLoadingComplete();
            
        } catch (error) {
            console.error('[LoadingScene] 容错加载流程失败:', error);
            this.onLoadingError(error);
        }
    }
    
    /**
     * 检查网络状态
     */
    private checkNetworkStatus(): void {
        // 微信小游戏环境检查
        if (typeof wx !== 'undefined') {
            wx.getNetworkType({
                success: (res) => {
                    
                    if (res.networkType === 'none') {
                        console.warn('[LoadingScene] 当前无网络连接，将使用缓存资源');
                    }
                },
                fail: (err) => {
                    console.warn('[LoadingScene] 获取网络状态失败:', err);
                }
            });
        }
        
        // 检查本地存储可用性
        try {
            const testKey = 'loading_test';
            sys.localStorage.setItem(testKey, 'test');
            sys.localStorage.removeItem(testKey);
        } catch (error) {
            console.warn('[LoadingScene] 本地存储功能异常:', error);
        }
    }
    
    /**
     * 确保最短加载时间
     */
    private async ensureMinLoadingTime(): Promise<void> {
        const elapsedTime = (Date.now() - this.startTime) / 1000;
        const remainingTime = this.MIN_LOADING_TIME - elapsedTime;
        
        if (remainingTime > 0) {
            
            return new Promise(resolve => {
                this.scheduleOnce(() => {
                    resolve();
                }, remainingTime);
            });
        }
    }
    
    /**
     * 处理加载完成（Fix 3: 增强容错机制）
     */
    public async onLoadingComplete(): Promise<void> {
        console.log('[LoadingScene] 加载完成，准备跳转...');
        
        // 确保最短加载时间
        await this.ensureMinLoadingTime();
        
        // Fix 3: 增加跳转容错
        try {
            director.loadScene('MainMenu');
        } catch (error) {
            console.error('[LoadingScene] 跳转MainMenu失败:', error);
            // 兜底：重新加载当前场景
            director.loadScene(director.getScene().name);
        }
    }
    
    /**
     * 处理加载错误（Fix 3: 增强容错机制）
     */
    public onLoadingError(error: any): void {
        console.error('[LoadingScene] 加载过程出现错误:', error);
        
        // Fix 3: 即使出错也要尝试跳转，避免卡死
        console.log('[LoadingScene] 出错但继续跳转到MainMenu...');
        
        // 短暂延迟后仍然跳转到主菜单
        this.scheduleOnce(() => {
            try {
                director.loadScene('MainMenu');
            } catch (jumpError) {
                console.error('[LoadingScene] 跳转MainMenu也失败:', jumpError);
                // 最后的兜底：重新加载当前场景
                director.loadScene(director.getScene().name);
            }
        }, 2.0); // 减少等待时间
    }
    
    protected onDestroy(): void {
        // 清理定时器
        this.unscheduleAllCallbacks();
        
    }
}