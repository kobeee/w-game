import { _decorator, Component, Node, Label, tween, Vec3, UITransform, EventTouch, Button, Sprite, SpriteFrame, Texture2D, assetManager, resources } from 'cc';
// 使用assetManager.loadBundle动态加载远程Asset Bundle资源

const { ccclass, property } = _decorator;

@ccclass('GlossSheet')
export class GlossSheet extends Component {
    @property(Label)
    titleLabel: Label = null!;

    @property(Label)
    descLabel: Label = null!;

    @property(Node)
    starButton: Node = null!;

    @property(Node)
    closeButton: Node = null!;

    @property(Node)
    panel: Node = null!;

    private currentWord: string = '';
    private currentZh: string = '';
    private isShowing: boolean = false;
    private autoHideTimer: number = 0;
    private starCallback: ((word: string) => void) | null = null;

    protected onLoad(): void {
        this.setupUI();
        this.loadModalResources();
        this.setupButtons();
        this.hideImmediate();
    }

    protected onEnable(): void {
        this.hideImmediate();
    }

    /**
     * 显示词义卡片
     * @param word 单词
     * @param zh 中文释义
     * @param autoMs 自动隐藏时间（毫秒），0表示不自动隐藏
     */
    show(word: string, zh: string | null, autoMs: number = 1200): void {
        if (this.isShowing) {
            this.hideImmediate();
        }

        this.currentWord = word.toUpperCase();
        this.currentZh = zh || '暂无释义';

        this.updateContent();
        this.slideIn();

        if (autoMs > 0) {
            this.scheduleAutoHide(autoMs);
        }
        
    }

    /**
     * 隐藏词义卡片
     */
    hide(): void {
        if (!this.isShowing) return;

        this.clearAutoHideTimer();
        this.slideOut();
    }

    /**
     * 设置收藏按钮回调
     * @param callback 收藏回调函数
     */
    setStarCallback(callback: (word: string) => void): void {
        this.starCallback = callback;
    }

    /**
     * 立即隐藏（无动画）
     */
    private hideImmediate(): void {
        if (!this.panel) return;

        this.isShowing = false;
        this.panel.active = false;
        this.clearAutoHideTimer();

        // 重置位置到屏幕底部
        const transform = this.panel.getComponent(UITransform);
        if (transform) {
            this.panel.setPosition(0, -transform.height, 0);
        }
    }

    private async loadModalResources(): Promise<void> {
        try {
            // 加载modal Bundle中的弹窗背景 - 必须指定到spriteFrame子资源
            if (this.panel) {
                await this.loadRemoteBundle('modal', 'pop_card/spriteFrame', this.panel.getComponent(Sprite));
            }
        } catch (error) {
            console.warn('[GlossSheet] 弹窗背景加载失败', error);
        }

        // 收藏按钮图标由本地resources加载（小图标不需要远程加载）
        // 此部分保持原有逐级加载逼辑
        if (this.starButton) {
            try {
                const starIcon = await this.loadSpriteFrame('badges/reward_star');
                if (starIcon) {
                    const sprite = this.starButton.getComponent(Sprite);
                    if (sprite) {
                        sprite.spriteFrame = starIcon;
                    }
                }
            } catch (error) {
                console.warn('[GlossSheet] 无法加载星星图标，使用默认显示');
            }
        }
    }

    /**
     * 加载指定Bundle中的SpriteFrame资源
     */
    private loadRemoteBundle(bundleName: string, assetPath: string, sprite: Sprite | null): Promise<void> {
        return new Promise((resolve, reject) => {
            assetManager.loadBundle(bundleName, (err, bundle) => {
                if (err) {
                    console.error(`[GlossSheet] Bundle '${bundleName}' 加载失败:`, err);
                    reject(err);
                    return;
                }

                bundle.load(assetPath, SpriteFrame, (err, spriteFrame) => {
                    if (err) {
                        console.error(`[GlossSheet] SpriteFrame '${assetPath}' 加载失败:`, err);
                        reject(err);
                        return;
                    }

                    if (sprite) {
                        sprite.spriteFrame = spriteFrame;
                        sprite.type = Sprite.Type.SLICED; // 弹窗背景使用9-slice
                        
                    }
                    resolve();
                });
            });
        });
    }

    /**
     * 从本地resources加载SpriteFrame（用于小图标等不需要远程加载的资源）
     */
    private loadSpriteFrame(path: string): Promise<SpriteFrame | null> {
        return new Promise((resolve) => {
            // 这部分保持原有的逐级加载逻辑，用于本地小资源
            // 先尝试直接加载SpriteFrame
            resources.load(path, SpriteFrame, (err, spriteFrame) => {
                    if (!err && spriteFrame) {
                    resolve(spriteFrame);
                    return;
                }
                
                // 如果失败，尝试加载图片文件并获取spriteFrame子资源
                resources.load(path + '/spriteFrame', SpriteFrame, (err2, spriteFrame2) => {
                        if (!err2 && spriteFrame2) {
                        resolve(spriteFrame2);
                        return;
                    }
                    
                    // 最后尝试加载Texture2D并创建SpriteFrame
                    resources.load(path, Texture2D, (err3, texture) => {
                        if (!err3 && texture) {
                            const spriteFrame3 = new SpriteFrame();
                            spriteFrame3.texture = texture;
                            resolve(spriteFrame3);
                        } else {
                            console.warn(`[GlossSheet] 所有方式都失败: ${path}`, err, err2, err3);
                            resolve(null);
                        }
                    });
                });
            });
        });
    }

    private setupUI(): void {
        if (!this.panel) {
            console.error('[GlossSheet] panel节点未设置');
            return;
        }

        // 确保面板初始位置在屏幕底部
        const transform = this.panel.getComponent(UITransform);
        if (transform) {
            this.panel.setPosition(0, -transform.height, 0);
        }

        this.panel.active = false;
    }

    private setupButtons(): void {
        // 设置收藏按钮
        if (this.starButton) {
            const button = this.starButton.getComponent(Button);
            if (button) {
                this.starButton.on(Button.EventType.CLICK, this.onStarClicked, this);
            } else {
                this.starButton.on(Node.EventType.TOUCH_END, this.onStarClicked, this);
            }
        }

        // 设置关闭按钮
        if (this.closeButton) {
            const button = this.closeButton.getComponent(Button);
            if (button) {
                this.closeButton.on(Button.EventType.CLICK, this.onCloseClicked, this);
            } else {
                this.closeButton.on(Node.EventType.TOUCH_END, this.onCloseClicked, this);
            }
        }

        // 设置面板触摸事件（延长显示时间）
        if (this.panel) {
            this.panel.on(Node.EventType.TOUCH_START, this.onPanelTouched, this);
        }
    }

    private updateContent(): void {
        // 更新标题
        if (this.titleLabel) {
            this.titleLabel.string = this.currentWord;
        }

        // 更新描述，限制长度并截断
        if (this.descLabel) {
            let displayText = this.currentZh;
            
            // 中文截断≤18字符
            if (displayText.length > 18) {
                displayText = displayText.substring(0, 18) + '...更多';
            }
            
            this.descLabel.string = displayText;
        }
    }

    private slideIn(): void {
        if (!this.panel) return;

        this.isShowing = true;
        this.panel.active = true;

        // 计算目标位置（从屏幕底部滑入到可见位置）
        const transform = this.panel.getComponent(UITransform);
        const targetY = transform ? transform.height * 0.5 : 150; // 显示在屏幕底部上方

        // 200ms滑入动画
        tween(this.panel)
            .to(0.2, { position: new Vec3(0, targetY, 0) }, { easing: 'quartOut' })
            .call(() => {
            })
            .start();
    }

    private slideOut(): void {
        if (!this.panel) return;

        const transform = this.panel.getComponent(UITransform);
        const targetY = transform ? -transform.height : -200;

        // 120ms滑出动画
        tween(this.panel)
            .to(0.12, { position: new Vec3(0, targetY, 0) }, { easing: 'quartIn' })
            .call(() => {
                this.hideImmediate();
            })
            .start();
    }

    private scheduleAutoHide(delayMs: number): void {
        this.clearAutoHideTimer();
        
        this.autoHideTimer = setTimeout(() => {
            this.hide();
        }, delayMs);
    }

    private clearAutoHideTimer(): void {
        if (this.autoHideTimer > 0) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = 0;
        }
    }

    private onStarClicked(): void {
        
        if (this.starCallback) {
            this.starCallback(this.currentWord);
        }

        // 视觉反馈：可以添加收藏成功的动画或改变按钮状态
        this.showStarFeedback();
    }

    private onCloseClicked(): void {
        this.hide();
    }

    private onPanelTouched(event: EventTouch): void {
        // 当用户触摸面板时，延长显示时间到2.5秒
        this.scheduleAutoHide(2500);
    }

    private showStarFeedback(): void {
        if (!this.starButton) return;

        // 简单的缩放反馈动画
        const originalScale = this.starButton.scale.clone();
        
        tween(this.starButton)
            .to(0.1, { scale: new Vec3(1.2, 1.2, 1) })
            .to(0.1, { scale: originalScale })
            .start();
    }

    protected onDestroy(): void {
        this.clearAutoHideTimer();
        
        // 清理事件监听
        if (this.starButton && this.starButton.isValid) {
            this.starButton.off(Button.EventType.CLICK, this.onStarClicked, this);
            this.starButton.off(Node.EventType.TOUCH_END, this.onStarClicked, this);
        }
        
        if (this.closeButton && this.closeButton.isValid) {
            this.closeButton.off(Button.EventType.CLICK, this.onCloseClicked, this);
            this.closeButton.off(Node.EventType.TOUCH_END, this.onCloseClicked, this);
        }
        
        if (this.panel && this.panel.isValid) {
            this.panel.off(Node.EventType.TOUCH_START, this.onPanelTouched, this);
        }
    }
}