import { _decorator, Component, Label, Sprite, UIOpacity, tween, Vec3 } from 'cc';
import { HINT_FADE_IN_MS, HINT_STAY_MS, HINT_FADE_OUT_MS } from '../config/word-validate';
const { ccclass, property } = _decorator;

@ccclass('DefinitionHintView')
export class DefinitionHintView extends Component {
    @property(Label)
    public textLabel: Label = null!;

    @property(Sprite)
    public bgSprite: Sprite = null!;

    private ensureBindings(): void {
        // 懒绑定：若未通过编辑器绑定，运行时自动查找
        if (!this.textLabel || !this.textLabel.isValid) {
            // 兼容不同的子节点命名：优先 Text，其次 Label，最后任意后代中的第一个 Label
            let label: Label | null = null;
            const textNode = this.node.getChildByName('Text') || this.node.getChildByName('Label');
            if (textNode) {
                label = textNode.getComponent(Label);
            }
            if (!label) {
                // 回退：向下搜索任意后代的第一个 Label 组件
                // @ts-ignore - Cocos 引擎支持 getComponentInChildren
                label = this.node.getComponentInChildren(Label);
            }
            if (label) {
                this.textLabel = label;
            }
        }
        if (!this.bgSprite || !this.bgSprite.isValid) {
            const bgNode = this.node.getChildByName('Bg');
            if (bgNode) {
                // Bg/Sprite
                const childSpriteNode = bgNode.getChildByName('Sprite') || bgNode;
                const sprite = childSpriteNode.getComponent(Sprite);
                if (sprite) {
                    this.bgSprite = sprite;
                }
            }
        }
    }

    public show(text: string): void {
        this.ensureBindings();
        if (this.textLabel) this.textLabel.string = text || '';
        const opacity = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
        opacity.opacity = 0;
        this.node.setScale(1, 1, 1);
        // 淡入
        tween(opacity)
            .to(HINT_FADE_IN_MS / 1000, { opacity: 255 })
            .start();
    }

    public updateText(text: string): void {
        this.ensureBindings();
        if (this.textLabel) this.textLabel.string = text || '';
    }

    public dismiss(onComplete?: () => void): void {
        const opacity = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
        const startPos = this.node.getPosition();
        tween(this.node)
            .to(HINT_FADE_OUT_MS / 1000, { position: new Vec3(startPos.x, startPos.y + 20, startPos.z) })
            .call(() => {
                tween(opacity)
                    .to(HINT_FADE_OUT_MS / 1000, { opacity: 0 })
                    .call(() => { onComplete && onComplete(); })
                    .start();
            })
            .start();
    }
}


