import { _decorator, Component, Label, ProgressBar, Sprite, tween, Vec3, Tween, director } from 'cc';
import { PreloadManager } from '../app/PreloadManager';
// 尽早导入 AbortController polyfill，确保微信小游戏兼容性
import '../util/AbortControllerPolyfill';

const { ccclass, property } = _decorator;

// 微信小游戏类型声明
declare const wx: any;

/**
 * 加载页面UI组件
 * Fix 016: 恢复自驱动加载逻辑（因为场景中没有 LoadingScene 组件）
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
    private _lastProgress: number = 0;
    private _isLoading: boolean = false;
    private preloadManager: PreloadManager = null!;

    protected onLoad(): void {
        console.log('[LoadingUI] onLoad() 开始');
        this.preloadManager = PreloadManager.getInstance();
        this.initializeUI();
        console.log('[LoadingUI] onLoad() 完成');
    }

    protected start(): void {
        console.log('[LoadingUI] start() 开始');
        // Fix 016: 恢复自驱动加载
        this.startLoadingSequence();
    }

    /**
     * 初始化UI状态
     */
    private initializeUI(): void {
        if (this.progressBar) {
            this.progressBar.progress = 0;
        }

        if (this.progressLabel) {
            this.progressLabel.string = '0%';
        }

        if (this.statusLabel) {
            this.statusLabel.string = '正在初始化...';
        }

        this.startTipRotation();
        this.startLogoAnimation();
    }

    /**
     * Fix 016: 启动加载流程
     */
    private async startLoadingSequence(): Promise<void> {
        if (this._isLoading) return;
        this._isLoading = true;

        console.log('[LoadingUI] 开始加载流程...');

        // 设置进度回调
        this.preloadManager.setProgressCallback((progress: number, message: string) => {
            console.log(`[LoadingUI] 进度: ${Math.round(progress * 100)}% - ${message}`);
            this.updateProgress(progress, message);
        });

        try {
            // 调用 PreloadManager 的启动加载
            await this.preloadManager.preloadStartupBundles();

            console.log('[LoadingUI] 启动资源加载完成');
            this.updateProgress(1.0, '加载完成！');

            // 延迟跳转，让用户看到 100%
            await new Promise<void>(resolve => setTimeout(resolve, 500));

            this.navigateToMainMenu();

        } catch (error) {
            console.error('[LoadingUI] 加载流程失败:', error);
            this._isLoading = false;
            this.showRetryDialog();
        }
    }

    /**
     * 跳转到主菜单
     */
    private navigateToMainMenu(): void {
        console.log('[LoadingUI] 准备跳转到 MainMenu');

        try {
            director.loadScene('MainMenu', (err) => {
                if (err) {
                    console.error('[LoadingUI] 跳转 MainMenu 失败:', err);
                    this._isLoading = false;
                    this.showRetryDialog();
                }
            });
        } catch (error) {
            console.error('[LoadingUI] 跳转异常:', error);
            this._isLoading = false;
            this.showRetryDialog();
        }
    }

    /**
     * Fix 016: 显示重试弹窗
     */
    private showRetryDialog(): void {
        const title = '网络连接受限';
        const content = '资源加载失败，可能是访问人数过多或网络不畅。请稍后重试。';

        if (typeof wx !== 'undefined' && wx.showModal) {
            wx.showModal({
                title: title,
                content: content,
                showCancel: false,
                confirmText: '重试',
                success: (res: any) => {
                    if (res.confirm) {
                        this.retryLoading();
                    }
                }
            });
        } else {
            // 浏览器环境
            if (confirm(`${title}\n${content}`)) {
                this.retryLoading();
            }
        }
    }

    private retryLoading(): void {
        this._lastProgress = 0;
        this.updateProgress(0, '重新连接中...');
        this.startLoadingSequence();
    }

    /**
     * 更新进度 (核心公开方法)
     * Fix 4 & 5: 防止倒车 + 屏蔽文件名
     */
    public updateProgress(progress: number, message: string): void {
        // Fix 4: 防止进度条倒车
        if (progress < this._lastProgress) {
            progress = this._lastProgress;
        } else {
            this._lastProgress = progress;
        }

        // Fix 5: 强制隐藏文件名，只显示统一文案
        const cleanMessage = "资源加载中...";

        // 更新进度条
        if (this.progressBar && this.progressBar.node && this.progressBar.node.isValid) {
            tween(this.progressBar)
                .to(0.3, { progress: progress })
                .call(() => {
                    if (this.progressLabel) {
                        this.progressLabel.string = `${Math.round(progress * 100)}%`;
                    }
                })
                .start();
        } else {
            if (this.progressLabel) {
                this.progressLabel.string = `${Math.round(progress * 100)}%`;
            }
        }

        // 更新状态文本
        if (this.statusLabel) {
            this.statusLabel.string = cleanMessage;
        }
    }

    /**
     * 开始提示文案轮播
     */
    private startTipRotation(): void {
        if (!this.tipLabel || this.LOADING_TIPS.length === 0) return;

        this.tipLabel.string = this.LOADING_TIPS[0];

        this.schedule(() => {
            this.currentTipIndex = (this.currentTipIndex + 1) % (this.LOADING_TIPS.length);

            if (this.tipLabel && this.tipLabel.node && this.tipLabel.node.isValid) {
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

        const breatheTween = tween(this.logoSprite.node)
            .to(2.0, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineInOut' })
            .to(2.0, { scale: new Vec3(0.95, 0.95, 1) }, { easing: 'sineInOut' })
            .union()
            .repeatForever();

        breatheTween.start();
    }

    protected onDestroy(): void {
        this.unscheduleAllCallbacks();

        if (this.logoSprite && this.logoSprite.node && this.logoSprite.node.isValid) {
            Tween.stopAllByTarget(this.logoSprite.node);
        }

        if (this.tipLabel && this.tipLabel.node && this.tipLabel.node.isValid) {
            Tween.stopAllByTarget(this.tipLabel.node);
        }

        if (this.progressBar && this.progressBar.node && this.progressBar.node.isValid) {
            Tween.stopAllByTarget(this.progressBar.node);
        }
    }
}
