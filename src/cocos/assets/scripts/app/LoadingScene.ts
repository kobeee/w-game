import { _decorator, Component, director, sys } from 'cc';
import { LoadingUI } from '../ui/LoadingUI';

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
    
    protected onLoad(): void {
        
        this.startTime = Date.now();
        
        // 检查网络状态
        this.checkNetworkStatus();
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
     * 处理加载完成
     */
    public async onLoadingComplete(): Promise<void> {
        
        
        // 确保最短加载时间
        await this.ensureMinLoadingTime();
        
        // 跳转到主菜单
        director.loadScene('MainMenu');
    }
    
    /**
     * 处理加载错误
     */
    public onLoadingError(error: any): void {
        console.error('[LoadingScene] 加载过程出现错误:', error);
        
        // 显示错误信息（可选）
        // 延迟后仍然跳转到主菜单
        this.scheduleOnce(() => {
            director.loadScene('MainMenu');
        }, 3.0);
    }
    
    protected onDestroy(): void {
        // 清理定时器
        this.unscheduleAllCallbacks();
        
    }
}