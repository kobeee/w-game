import { _decorator, Component, Label, ProgressBar, Sprite, tween, Vec3, director, Color, Tween } from 'cc';
import { PreloadManager } from '../app/PreloadManager';
import { GlossService } from '../data/GlossService';

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
    private timeoutTimer: any = null;
    private hasNavigated: boolean = false;
    private startTime: number = 0;
    private checkInterval: any = null;
    private _lastProgress: number = 0; // Fix 4: 防止进度条倒车
    
    protected onLoad(): void {
        // 监听微信生命周期
        if (typeof wx !== 'undefined') {
            wx.onMemoryWarning(() => {
                console.warn('[LoadingUI] ⚠️ 微信内存警告触发！');
            });

            wx.onHide(() => {
                console.warn('[LoadingUI] ⚠️ 小游戏进入后台！');
            });

            wx.onShow(() => {
                console.log('[LoadingUI] ✅ 小游戏回到前台');
            });
        }

        this.preloadManager = PreloadManager.getInstance();
        this.initializeUI();
    }
    
    protected start(): void {
        // ✅ 强制超时跳转（30秒兜底）- 使用微信小游戏兼容的超时机制
        this.setupWeChatTimeoutFallback(30000); // 30秒

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
        
    }
    
    /**
     * 设置微信小游戏兼容的超时机制
     */
    private setupWeChatTimeoutFallback(timeoutMs: number): void {
        console.log(`[LoadingUI] 设置超时机制：${timeoutMs}ms`);
        
        // 微信小游戏环境下的多重超时保障
        const forceNavigate = () => {
            if (this.hasNavigated) {
                console.log('[LoadingUI] 已跳转，忽略超时');
                return;
            }
            
            console.error(`[LoadingUI] ⏰ 加载超时（${timeoutMs/1000}秒），强制跳转！`);
            this.hasNavigated = true;
            
            // 更新状态提示
            if (this.statusLabel) {
                this.statusLabel.string = `加载超时，正在跳转...`;
            }
            
            // 强制跳转
            try {
                director.loadScene('MainMenu');
            } catch (error) {
                console.error('[LoadingUI] 强制跳转失败:', error);
                // 备用方案：重新加载当前场景
                director.loadScene(director.getScene().name);
            }
        };

        // 方案1：原生 setTimeout（主要方案）
        this.timeoutTimer = setTimeout(forceNavigate, timeoutMs);
        
        // 方案2：微信小游戏环境下的额外保障
        if (typeof wx !== 'undefined') {
            // 微信小游戏可能限制 setTimeout，添加备用检查
            const checkInterval = setInterval(() => {
                if (this.hasNavigated) {
                    clearInterval(checkInterval);
                    return;
                }
                
                // 检查是否超时
                const now = Date.now();
                if (now - this.startTime > timeoutMs + 5000) { // 额外5秒缓冲
                    console.warn('[LoadingUI] 微信小游戏超时检查触发');
                    clearInterval(checkInterval);
                    forceNavigate();
                }
            }, 2000); // 每2秒检查一次
            
            // 存储检查定时器以便清理
            this.checkInterval = checkInterval;
        }
    }

    /**
     * 开始加载流程
     */
    private async startLoading(): Promise<void> {
        this.startTime = Date.now(); // 记录开始时间
        console.log('[LoadingUI] Point A: 开始加载流程...');

        // 设置进度回调
        this.preloadManager.setProgressCallback(this.onLoadingProgress.bind(this));

        try {
            console.log('[LoadingUI] Point B: preloadStartupBundles 开始');
            // 🚀 执行优化后的启动阶段加载（仅核心资源）
            await this.preloadManager.preloadStartupBundles();
            console.log('[LoadingUI] Point C: preloadStartupBundles 完成');

            // 🚀 PreloadManager已在preloadStartupBundles()中加载核心词库到 95%
            this.updateStatus(0.96, '核心资源加载完成，正在预加载主菜单资源...');

            // 🎯 预加载主菜单必需的Bundle，避免场景切换时429错误
            await this.preloadMainMenuBundles();

            // 验证词库是否加载成功
            const glossService = GlossService.getInstance();
            const allWords = glossService.getAllWords();

            if (allWords.length === 0) {
                console.error('[LoadingUI] ⚠️ 词库未加载，尝试手动加载...');
                this.updateStatus(0.95, '正在修复词库加载...');

                await glossService.load(false); // 仅加载核心词库

                const retryWords = glossService.getAllWords();
                if (retryWords.length > 0) {
                    console.log('[LoadingUI] ✅ 词库修复成功，词库包含', retryWords.length, '个单词');
                } else {
                    console.error('[LoadingUI] ❌ 词库修复失败，词库为空，无法启动游戏');
                    this.updateStatus(0.98, '词库加载失败，请检查网络连接后重试');
                    
                    // 显示错误信息并停止加载
                    if (this.statusLabel) {
                        this.statusLabel.string = '词库加载失败\n请检查网络连接后重新进入游戏';
                    }
                    
                    // 不继续跳转，保持在加载页面
                    return;
                }
            } else {
                console.log('[LoadingUI] ✅ 词库验证成功，词库包含', allWords.length, '个单词');
            }

            // 🎯 平滑过渡到 100%，让用户看到完整进度
            console.log('[LoadingUI] Point D: 开始平滑过渡到 100%');
            await this.smoothProgressToFull(0.96, 1.0, 800); // 从 96% 到 100%，耗时 800ms

            console.log('[LoadingUI] Point E: 延迟开始（1秒）');
            // ✅ 使用 Promise + setTimeout 替代 scheduleOnce
            await new Promise<void>(resolve => {
                setTimeout(() => {
                    console.log('[LoadingUI] 延迟结束，准备跳转...');
                    resolve();
                }, 1000);
            });

            console.log('[LoadingUI] Point F: 调用 navigateToMainMenu()');
            // ✅ 直接调用跳转，不依赖 scheduleOnce
            this.navigateToMainMenu();

        } catch (error) {
            console.error('[LoadingUI] Point ERROR:', error);
            // ✅ 错误分支也使用 Promise + setTimeout
            await new Promise<void>(resolve => {
                setTimeout(() => {
                    console.log('[LoadingUI] 错误延迟结束，准备跳转...');
                    resolve();
                }, 2000);
            });

            console.log('[LoadingUI] 出错后跳转...');
            this.navigateToMainMenu();
        }
    }

    /**
     * 平滑过渡到完整进度
     */
    private async smoothProgressToFull(startProgress: number, endProgress: number, duration: number): Promise<void> {
        return new Promise<void>((resolve) => {
            const steps = 20; // 分20步完成过渡
            const stepDuration = duration / steps;
            const progressIncrement = (endProgress - startProgress) / steps;
            let currentStep = 0;

            const updateStep = () => {
                currentStep++;
                const currentProgress = Math.min(startProgress + (progressIncrement * currentStep), endProgress);
                
                this.updateStatus(currentProgress, `正在完成最终准备... ${Math.round(currentProgress * 100)}%`);

                if (currentStep < steps) {
                    setTimeout(updateStep, stepDuration);
                } else {
                    // 最终完成
                    this.updateStatus(endProgress, '所有资源加载完成！');
                    resolve();
                }
            };

            updateStep();
        });
    }

    /**
     * 🎯 预加载主菜单必需的Bundle，避免场景切换时429错误
     */
    private async preloadMainMenuBundles(): Promise<void> {
        console.log('[LoadingUI] 🎯 开始预加载主菜单Bundle...');
        
        try {
            // 主菜单需要的Bundle：bg（背景）、title（标题）
            const requiredBundles = ['bg', 'title'];
            
            for (const bundleName of requiredBundles) {
                // 检查Bundle是否已经预加载
                if (this.preloadManager.isBundleLoaded(bundleName)) {
                    console.log(`[LoadingUI] ✅ Bundle ${bundleName} 已预加载，跳过`);
                    continue;
                }
                
                console.log(`[LoadingUI] 🔄 预加载主菜单Bundle: ${bundleName}`);
                
                // 使用PreloadManager的串行加载机制，避免429
                await this.preloadManager.preloadSingleBundleCompat(bundleName, 0.96, 0.98);
                
                // 添加延迟，避免触发429
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            console.log('[LoadingUI] ✅ 主菜单Bundle预加载完成');
            
        } catch (error) {
            console.warn('[LoadingUI] ⚠️ 主菜单Bundle预加载失败，但不影响场景切换:', error);
            // 失败不影响场景切换，MainMenu会在onLoad时动态加载
        }
    }

    /**
     * 更新加载状态 (Fix 4 & 5: 防止倒车 + 屏蔽文件名)
     */
    private updateStatus(progress: number, message: string): void {
        // Fix 4: 防止进度条倒车
        if (progress < this._lastProgress) {
            progress = this._lastProgress;
        } else {
            this._lastProgress = progress;
        }

        // Fix 5: 强制隐藏文件名，只显示统一文案
        const cleanMessage = "资源加载中..."; 

        // 直接设置进度条和百分比，确保同步
        if (this.progressBar) {
            this.progressBar.progress = progress;
        }
        if (this.progressLabel) {
            this.progressLabel.string = `${Math.round(progress * 100)}%`;
        }
        if (this.statusLabel) {
            this.statusLabel.string = cleanMessage;
        }
    }
    
    /**
     * 加载进度回调 (Fix 4 & 5: 防止倒车 + 屏蔽文件名)
     */
    private onLoadingProgress(progress: number, message: string): void {
        // Fix 4: 防止进度条倒车
        if (progress < this._lastProgress) {
            progress = this._lastProgress;
        } else {
            this._lastProgress = progress;
        }

        // Fix 5: 强制隐藏文件名，只显示统一文案
        const cleanMessage = "资源加载中..."; 
        
        // 更新进度条和百分比文本，确保同步
        if (this.progressBar && this.progressBar.node && this.progressBar.node.isValid) {
            // 使用动画过渡，让进度变化更平滑
            tween(this.progressBar)
                .to(0.3, { progress: progress })
                .call(() => {
                    // 在动画完成时同步更新百分比，确保进度条和百分比一致
                    if (this.progressLabel) {
                        this.progressLabel.string = `${Math.round(progress * 100)}%`;
                    }
                })
                .start();
        } else {
            // 如果进度条不可用，直接更新百分比
            if (this.progressLabel) {
                this.progressLabel.string = `${Math.round(progress * 100)}%`;
            }
        }
        
        // 更新状态文本
        if (this.statusLabel) {
            this.statusLabel.string = cleanMessage;
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
        if (this.hasNavigated) {
            console.log('[LoadingUI] 已跳转，重复调用忽略');
            return;
        }
        
        console.log('[LoadingUI] navigateToMainMenu 被调用');
        console.log('[LoadingUI] this.node 有效性:', this.node ? 'valid' : 'null');
        console.log('[LoadingUI] this.node.isValid:', this.node?.isValid);
        
        // 标记已跳转
        this.hasNavigated = true;
        
        // 清理超时定时器
        this.cleanupTimeouts();
        
        // 添加淡出效果
        if (this.node && this.node.isValid) {
            tween(this.node)
                .to(0.5, { 
                    scale: new Vec3(0.8, 0.8, 1),
                    position: new Vec3(0, 100, 0)
                }, { easing: 'sineIn' })
                .call(() => {
                    console.log('[LoadingUI] 执行 director.loadScene(MainMenu)');
                    director.loadScene('MainMenu');
                })
                .start();
        } else {
            console.log('[LoadingUI] fallback：直接跳转');
            // fallback：直接跳转
            director.loadScene('MainMenu');
        }
    }

    /**
     * 清理超时定时器
     */
    private cleanupTimeouts(): void {
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
        
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
    
    /**
     * 组件销毁时清理
     */
    protected onDestroy(): void {
        // 清理定时器
        this.unscheduleAllCallbacks();
        
        // 清理超时定时器
        this.cleanupTimeouts();
        
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
        
    }
}