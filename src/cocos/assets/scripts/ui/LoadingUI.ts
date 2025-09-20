import { _decorator, Component, Label, ProgressBar, Sprite, tween, Vec3, director, Color, Tween } from 'cc';
import { PreloadManager } from '../app/PreloadManager';

const { ccclass, property } = _decorator;

/**
 * 加载页面UI组件
 * 显示预加载进度和状态信息
 */
@ccclass('LoadingUI')
export class LoadingUI extends Component {
    
    @property(ProgressBar)
    progressBar: ProgressBar = null!;
    
    @property(Label)
    progressLabel: Label = null!;
    
    @property(Label)
    statusLabel: Label = null!;
    
    @property(Label)
    tipLabel: Label = null!;
    
    @property(Sprite)
    logoSprite: Sprite = null!;
    
    // 加载提示文案
    private readonly LOADING_TIPS = [
        '正在为你准备精彩的猜词游戏...',
        '提示：仔细观察字母的叠层关系哦',
        '小贴士：点击高亮的字母才能选中',
        '游戏技巧：错误的字母会进入缓冲槽',
        '准备就绪！马上就能开始游戏了'
    ];
    
    private currentTipIndex: number = 0;
    private preloadManager: PreloadManager = null!;
    
    protected onLoad(): void {
        console.log('[LoadingUI] LoadingUI组件已加载');
        this.preloadManager = PreloadManager.getInstance();
        this.initializeUI();
    }
    
    protected start(): void {
        this.startLoading();
    }
    
    /**
     * 初始化UI状态
     */
    private initializeUI(): void {
        // 初始化进度条
        if (this.progressBar) {
            this.progressBar.progress = 0;
        }
        
        // 初始化文本
        if (this.progressLabel) {
            this.progressLabel.string = '0%';
        }
        
        if (this.statusLabel) {
            this.statusLabel.string = '正在初始化...';
        }
        
        // 开始提示文案轮播
        this.startTipRotation();
        
        // Logo呼吸动画
        this.startLogoAnimation();
        
        console.log('[LoadingUI] UI初始化完成');
    }
    
    /**
     * 开始加载流程
     */
    private async startLoading(): Promise<void> {
        console.log('[LoadingUI] 开始预加载流程');
        
        // 设置进度回调
        this.preloadManager.setProgressCallback(this.onLoadingProgress.bind(this));
        
        try {
            // 执行预加载
            await this.preloadManager.preloadAllBundles();
            
            // 加载完成，延迟一下再跳转
            this.scheduleOnce(() => {
                this.navigateToMainMenu();
            }, 1.0);
            
        } catch (error) {
            console.error('[LoadingUI] 预加载过程出现错误:', error);
            // 即使出错也跳转到主菜单
            this.scheduleOnce(() => {
                this.navigateToMainMenu();
            }, 2.0);
        }
    }
    
    /**
     * 加载进度回调
     */
    private onLoadingProgress(progress: number, message: string): void {
        console.log(`[LoadingUI] 加载进度: ${(progress * 100).toFixed(1)}% - ${message}`);
        
        // 更新进度条
        if (this.progressBar && this.progressBar.node && this.progressBar.node.isValid) {
            // 使用动画过渡，让进度变化更平滑
            tween(this.progressBar)
                .to(0.3, { progress: progress })
                .start();
        }
        
        // 更新进度文本
        if (this.progressLabel) {
            this.progressLabel.string = `${Math.round(progress * 100)}%`;
        }
        
        // 更新状态文本
        if (this.statusLabel) {
            this.statusLabel.string = message;
        }
        
        // 进度达到100%时更新提示
        if (progress >= 1.0) {
            if (this.tipLabel) {
                this.tipLabel.string = this.LOADING_TIPS[this.LOADING_TIPS.length - 1];
            }
        }
    }
    
    /**
     * 开始提示文案轮播
     */
    private startTipRotation(): void {
        if (!this.tipLabel || this.LOADING_TIPS.length === 0) return;
        
        // 设置初始提示
        this.tipLabel.string = this.LOADING_TIPS[0];
        
        // 每3秒轮播一次提示
        this.schedule(() => {
            this.currentTipIndex = (this.currentTipIndex + 1) % (this.LOADING_TIPS.length - 1);
            
            if (this.tipLabel && this.tipLabel.node && this.tipLabel.node.isValid) {
                // 淡出效果
                tween(this.tipLabel.node)
                    .to(0.3, { scale: new Vec3(0.8, 0.8, 1) }, { easing: 'sineOut' })
                    .call(() => {
                        if (this.tipLabel) {
                            this.tipLabel.string = this.LOADING_TIPS[this.currentTipIndex];
                        }
                    })
                    .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                    .start();
            }
        }, 3.0);
    }
    
    /**
     * Logo呼吸动画
     */
    private startLogoAnimation(): void {
        if (!this.logoSprite || !this.logoSprite.node || !this.logoSprite.node.isValid) return;
        
        // 缓慢的缩放呼吸效果
        const breatheTween = tween(this.logoSprite.node)
            .to(2.0, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineInOut' })
            .to(2.0, { scale: new Vec3(0.95, 0.95, 1) }, { easing: 'sineInOut' })
            .union()
            .repeatForever();
            
        breatheTween.start();
    }
    
    /**
     * 跳转到主菜单
     */
    private navigateToMainMenu(): void {
        console.log('[LoadingUI] 预加载完成，跳转到主菜单');
        
        // 添加淡出效果
        if (this.node && this.node.isValid) {
            tween(this.node)
                .to(0.5, { 
                    scale: new Vec3(0.8, 0.8, 1),
                    position: new Vec3(0, 100, 0)
                }, { easing: 'sineIn' })
                .call(() => {
                    director.loadScene('MainMenu');
                })
                .start();
        } else {
            // fallback：直接跳转
            director.loadScene('MainMenu');
        }
    }
    
    /**
     * 组件销毁时清理
     */
    protected onDestroy(): void {
        // 清理定时器
        this.unscheduleAllCallbacks();
        
        // 停止所有Tween动画 - 使用新的Tween系统方法
        if (this.logoSprite && this.logoSprite.node && this.logoSprite.node.isValid) {
            Tween.stopAllByTarget(this.logoSprite.node);
        }
        
        if (this.tipLabel && this.tipLabel.node && this.tipLabel.node.isValid) {
            Tween.stopAllByTarget(this.tipLabel.node);
        }
        
        if (this.node && this.node.isValid) {
            Tween.stopAllByTarget(this.node);
        }
        
        console.log('[LoadingUI] LoadingUI组件已清理');
    }
}