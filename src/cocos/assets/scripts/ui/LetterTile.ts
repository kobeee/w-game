import { _decorator, Component, Label, Sprite, SpriteFrame, Color, Node, EventTouch, Button } from 'cc';
import { AssetLoader } from '../core/AssetLoader';

const { ccclass, property } = _decorator;

export type TileState = 'selectable' | 'selected' | 'highlight' | 'correct' | 'wrong' | 'disabled';

@ccclass('LetterTile')
export class LetterTile extends Component {
    @property(Label)
    charLabel: Label = null!;

    @property(Sprite)
    bgSprite: Sprite = null!;

    private currentChar: string = '';
    private currentState: TileState = 'disabled';
    private spriteFrames: { [key: string]: SpriteFrame } = {};
    private isLoaded: boolean = false;
    
    // 默认颜色配置（资源加载失败时的降级方案）
    private defaultColors: { [key in TileState]: Color } = {
        'selectable': new Color(255, 255, 255, 255),    // 白色
        'selected': new Color(100, 149, 237, 255),      // 蓝色
        'highlight': new Color(255, 215, 0, 255),       // 金色
        'correct': new Color(50, 205, 50, 255),         // 绿色
        'wrong': new Color(220, 20, 60, 255),           // 红色
        'disabled': new Color(128, 128, 128, 255)       // 灰色
    };

    protected onLoad(): void {
        this.loadTileSprites();
        this.setupTouchEvents();
    }

    /**
     * 设置字母内容
     * @param c 字母字符
     */
    setChar(c: string): void {
        this.currentChar = c.toUpperCase();
        if (this.charLabel) {
            this.charLabel.string = this.currentChar;
        }
    }

    /**
     * 获取当前字母
     */
    getChar(): string {
        return this.currentChar;
    }

    /**
     * 设置瓦片状态
     * @param state 瓦片状态
     */
    setState(state: TileState): void {
        this.currentState = state;
        this.updateVisual();
        
        // 更新交互性
        if (this.node) {
            // 只有selectable和highlight状态可以点击
            const isInteractable = state === 'selectable' || state === 'highlight';
            const buttonComponent = this.node.getComponent(Button);
            if (buttonComponent) {
                buttonComponent.enabled = isInteractable;
            }
        }
    }

    /**
     * 获取当前状态
     */
    getState(): TileState {
        return this.currentState;
    }

    /**
     * 播放状态变化效果（可扩展动画）
     * @param newState 新状态
     */
    playStateTransition(newState: TileState): void {
        // TODO: 可以在这里添加状态切换动画
        this.setState(newState);
    }

    private async loadTileSprites(): Promise<void> {
        const states: TileState[] = ['selectable', 'highlight', 'correct', 'wrong', 'disabled'];
        const assetLoader = AssetLoader.getInstance();
        
        
        
        for (const state of states) {
            const assetPath = `tile_${state}/spriteFrame`;
            
            try {
                // 检查资源是否已完全加载并缓存
                const isCached = assetLoader.isAssetCached('tiles', assetPath);
                
                if (isCached) {
                } else {
                }
                
                // 使用AssetLoader加载远程Bundle资源
                const spriteFrame = await assetLoader.loadSpriteFrame('tiles', assetPath);
                
                if (spriteFrame) {
                    this.spriteFrames[state] = spriteFrame;
                } else {
                    console.error(`[LetterTile] ❌ 瓦片加载失败: ${state}`);
                }
            } catch (error) {
                console.error(`[LetterTile] ❌ 无法加载瓦片资源: ${state}`, error);
            }
        }
        
        this.isLoaded = true;
        this.updateVisual();
        
    }

    private updateVisual(): void {
        if (!this.bgSprite || !this.isLoaded) {
            return;
        }

        // 使用加载的SpriteFrame
        const spriteFrame = this.spriteFrames[this.currentState];
        if (spriteFrame) {
            this.bgSprite.spriteFrame = spriteFrame;
            // 重置颜色为白色（正常显示SpriteFrame）
            this.bgSprite.color = new Color(255, 255, 255, 255);
        } else {
            console.error(`[LetterTile] 缺少状态图片: ${this.currentState}`);
        }

        // 更新标签颜色 - 在这些瓦片上使用深色文字以确保可见性
        if (this.charLabel) {
            this.charLabel.color = new Color(64, 64, 64, 255); // 深灰色，在所有瓦片背景上都清晰可见
        }
    }

    private getTextColorForState(state: TileState): Color {
        switch (state) {
            case 'selectable':
                return new Color(64, 64, 64, 255);      // 深灰色，在白色背景上清晰可见
            case 'selected':
                return new Color(255, 255, 255, 255);   // 白色，在蓝色背景上清晰可见
            case 'highlight':
                return new Color(64, 64, 64, 255);      // 深灰色，在金色背景上清晰可见
            case 'correct':
                return new Color(255, 255, 255, 255);   // 白色，在绿色背景上清晰可见
            case 'wrong':
                return new Color(255, 255, 255, 255);   // 白色，在红色背景上清晰可见
            case 'disabled':
                return new Color(160, 160, 160, 255);   // 浅灰色，在灰色背景上可见但不突出
            default:
                return new Color(64, 64, 64, 255);      // 深灰色
        }
    }

    private setupTouchEvents(): void {
        if (!this.node) return;

        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    private onTouchStart(_event: EventTouch): void {
        if (this.currentState === 'selectable') {
            // 可以添加触摸按下的视觉反馈
            const tempColor = this.bgSprite.color.clone();
            tempColor.r = Math.max(0, tempColor.r - 30);
            tempColor.g = Math.max(0, tempColor.g - 30);
            tempColor.b = Math.max(0, tempColor.b - 30);
            this.bgSprite.color = tempColor;
        }
    }

    private onTouchEnd(_event: EventTouch): void {
        if (this.currentState === 'selectable' || this.currentState === 'highlight') {
            this.updateVisual(); // 恢复正常颜色
            // 发射点击事件给父节点处理
            this.node.emit('tile:clicked', this);
        }
    }

    private onTouchCancel(_event: EventTouch): void {
        this.updateVisual(); // 恢复正常颜色
    }

    protected onDestroy(): void {
        if (this.node && this.node.isValid) {
            this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
            this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        }
    }
}