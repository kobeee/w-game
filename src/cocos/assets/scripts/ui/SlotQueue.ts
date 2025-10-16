import { _decorator, Component, Node, Prefab, instantiate, tween, Vec3, CCInteger, Sprite, SpriteFrame } from 'cc';
import { SlotQueueManager } from '../core/SlotQueueManager';
import { WordMatch } from '../data/StackTypes';
import { LetterTile } from './LetterTile';
import { AssetLoader } from '../core/AssetLoader';

const { ccclass, property } = _decorator;

/**
 * 牌槽队列组件
 * 负责显示牌槽中的字母和扩容动画
 */
@ccclass('SlotQueue')
export class SlotQueue extends Component {
    @property(Node)
    public slotItemsContainer: Node = null!;

    @property(Prefab)
    public slotItemPrefab: Prefab = null!;

    @property({ type: CCInteger })
    public initialCapacity: number = 7;

    @property({ type: CCInteger })
    public maxCapacity: number = 15;

    @property(Node)
    public blinkGroup: Node = null!; // 闪烁时显示的按钮组

    @property(Node)
    public confirmButton: Node = null!; // "✓消除"按钮

    @property(Node)
    public continueButton: Node = null!; // "⏭继续拼"按钮

    private slotManager: SlotQueueManager = new SlotQueueManager();
    private slotNodes: Node[] = []; // 预渲染的slot节点数组
    private slotBackgroundFrame: SpriteFrame | null = null; // 缓存的slot背景图
    private blinking: boolean = false;
    private blinkTimer: number = 0;
    private readonly BLINK_DURATION = 3; // 闪烁倒计时3秒

    protected async onLoad(): Promise<void> {
        // 加载slot背景图
        await this.loadSlotBackground();

        // 初始化按钮事件
        if (this.confirmButton) {
            this.confirmButton.on(Node.EventType.TOUCH_END, this.onConfirmClick, this);
        }

        if (this.continueButton) {
            this.continueButton.on(Node.EventType.TOUCH_END, this.onContinueClick, this);
        }

        // 隐藏按钮组
        if (this.blinkGroup) {
            this.blinkGroup.active = false;
        }
    }

    /**
     * 初始化牌槽（异步，确保背景图已加载）
     */
    public async init(): Promise<void> {
        // 确保背景图已加载完成
        if (!this.slotBackgroundFrame) {
            console.log('[SlotQueue] 背景图尚未加载，等待加载完成...');
            await this.loadSlotBackground();
        }

        this.slotManager.clear();

        // 预渲染固定数量的slot节点
        this.createSlotNodes();

        // 更新显示
        this.updateUI();
    }

    /**
     * 预渲染slot节点（根据initialCapacity创建固定数量的slot）
     */
    private createSlotNodes(): void {
        // 清空现有节点
        for (const slotNode of this.slotNodes) {
            if (slotNode && slotNode.isValid) {
                slotNode.destroy();
            }
        }
        this.slotNodes = [];

        // 创建initialCapacity个slot节点
        for (let i = 0; i < this.initialCapacity; i++) {
            const slotNode = this.createEmptySlotNode();
            this.slotNodes.push(slotNode);
        }

        // 应用纯数学定位（移除Layout组件的spacing影响）
        this.layoutSlotsWithPureMath();

        console.log(`[SlotQueue] 预渲染了 ${this.slotNodes.length} 个牌槽节点（使用纯数学定位）`);
    }

    /**
     * 使用纯数学定位算法排列slot节点
     * 确保slot之间无间距，位置精准
     */
    private layoutSlotsWithPureMath(): void {
        const slotWidth = 90; // 卡片标准宽度
        // 不添加间距，完全紧密排列
        const totalWidth = slotWidth * this.slotNodes.length;
        const startX = -totalWidth / 2 + slotWidth / 2;

        for (let i = 0; i < this.slotNodes.length; i++) {
            const slotNode = this.slotNodes[i];
            if (!slotNode) continue;

            // 纯数学计算位置（相对于container）
            const x = startX + i * slotWidth;
            slotNode.setPosition(x, 0, 0);

            console.log(`[SlotQueue] slot[${i}] 位置: (${x.toFixed(2)}, 0, 0)`);
        }
    }

    /**
     * 创建一个空的slot节点（显示slot_item背景）
     */
    private createEmptySlotNode(): Node {
        const slotNode = instantiate(this.slotItemPrefab);

        // 设置slot背景图（查找预制体内部的Background节点）
        const backgroundNode = slotNode.getChildByName('Background');
        if (backgroundNode) {
            const sprite = backgroundNode.getComponent(Sprite);
            if (sprite) {
                if (this.slotBackgroundFrame) {
                    // 强制设置SpriteFrame，覆盖预制体默认值
                    sprite.spriteFrame = this.slotBackgroundFrame;
                    console.log('[SlotQueue] ✅ 成功设置slot背景图到Background节点');
                    console.log(`[SlotQueue] Background Sprite状态: enabled=${sprite.enabled}, spriteFrame=${sprite.spriteFrame?.name}`);
                } else {
                    console.warn('[SlotQueue] ⚠️ slotBackgroundFrame为null，无法设置背景图');
                }
            } else {
                console.warn('[SlotQueue] ⚠️ Background节点没有Sprite组件');
            }
        } else {
            console.warn('[SlotQueue] ⚠️ slotItem预制体中未找到Background节点，预制体结构：',
                        Array.from(slotNode.children).map(child => child.name).join(', '));
        }

        // 如果预制体中有LetterTile组件，先隐藏字母
        const tile = slotNode.getComponent(LetterTile);
        if (tile && tile.charLabel) {
            tile.charLabel.string = ''; // 空字母
        }

        this.slotItemsContainer.addChild(slotNode);
        return slotNode;
    }

    /**
     * 添加字母到牌槽（接收飞过来的字母牌节点）
     */
    public addLetter(letter: string, tileNode?: Node): void {
        if (this.slotManager.isFull()) {
            console.warn('牌槽已满，无法添加字母');
            this.node.emit('slot-full');
            return;
        }

        this.slotManager.addLetter(letter);

        // 如果传入了字母牌节点，将其重新父级到对应的slot上
        if (tileNode && tileNode.isValid) {
            const letters = this.slotManager.getLetters();
            const slotIndex = letters.length - 1; // 刚添加的字母对应的slot索引
            const targetSlot = this.slotNodes[slotIndex];

            if (targetSlot && targetSlot.isValid) {
                // 将字母牌移动到slot节点下
                tileNode.setParent(targetSlot);
                tileNode.setPosition(0, 0, 0); // 重置为slot的中心
                tileNode.setScale(1, 1, 1); // 重置缩放

                // 设置为高亮状态
                const tile = tileNode.getComponent(LetterTile);
                if (tile) {
                    tile.setState('highlight');
                }

                console.log(`[SlotQueue] 字母牌已移动到slot[${slotIndex}]`);
            } else {
                console.warn(`[SlotQueue] slot[${slotIndex}]不存在或无效`);
                // 降级方案：隐藏飞过来的节点，使用updateUI显示
                tileNode.active = false;
                this.updateUI();
            }
        } else {
            // 没有传入节点，使用updateUI更新显示
            this.updateUI();
        }

        // 检查是否匹配单词（由外部WordMatcher处理）
        this.node.emit('letter-added', this.slotManager.getLetters());
    }

    /**
     * 触发闪烁效果
     */
    public startBlink(match: WordMatch): void {
        this.blinking = true;
        this.blinkTimer = this.BLINK_DURATION;

        // 显示按钮组
        if (this.blinkGroup) {
            this.blinkGroup.active = true;
        }

        // 高亮匹配的字母
        this.highlightMatchedLetters(match);

        // 触发事件
        this.node.emit('blink-start', match);
    }

    /**
     * 停止闪烁
     */
    public stopBlink(): void {
        this.blinking = false;
        this.blinkTimer = 0;

        // 隐藏按钮组
        if (this.blinkGroup) {
            this.blinkGroup.active = false;
        }

        // 恢复所有字母的正常状态
        for (let i = 0; i < this.slotNodes.length; i++) {
            const slotNode = this.slotNodes[i];
            if (!slotNode) continue;

            const tile = slotNode.getComponent(LetterTile);
            if (tile) {
                tile.setState('highlight');
            }
        }
    }

    /**
     * 高亮匹配的字母
     */
    private highlightMatchedLetters(match: WordMatch): void {
        for (let i = 0; i < this.slotNodes.length; i++) {
            const slotNode = this.slotNodes[i];
            if (!slotNode) continue;

            const tile = slotNode.getComponent(LetterTile);
            if (!tile) continue;

            if (i >= match.startIdx && i <= match.endIdx) {
                // 匹配的字母使用correct状态（建议调色为黄色）
                tile.setState('correct');

                // 闪烁动画
                this.playBlinkAnimation(slotNode);
            } else {
                // 未匹配的字母保持高亮
                tile.setState('highlight');
            }
        }
    }

    /**
     * 播放闪烁动画
     */
    private playBlinkAnimation(node: Node): void {
        tween(node)
            .to(0.3, { scale: new Vec3(1.1, 1.1, 1) })
            .to(0.3, { scale: new Vec3(1, 1, 1) })
            .union()
            .repeatForever()
            .start();
    }

    /**
     * 消除单词
     */
    public removeWord(match: WordMatch): void {
        // 播放消除动画
        this.playRemoveAnimation(match).then(() => {
            // 从管理器中移除
            this.slotManager.removeWord(match);

            // 更新UI
            this.updateUI();

            // 检查扩容
            this.checkExpand();

            // 触发事件
            this.node.emit('word-removed', match.word);
        });
    }

    /**
     * 播放消除动画
     */
    private async playRemoveAnimation(match: WordMatch): Promise<void> {
        const promises: Promise<void>[] = [];

        for (let i = match.startIdx; i <= match.endIdx; i++) {
            const slotNode = this.slotNodes[i];
            if (!slotNode) continue;

            const promise = new Promise<void>((resolve) => {
                tween(slotNode)
                    .to(0.3, { scale: new Vec3(1.2, 1.2, 1) })
                    .to(0.3, { scale: new Vec3(0, 0, 1) })
                    .call(() => {
                        resolve();
                    })
                    .start();
            });

            promises.push(promise);
        }

        await Promise.all(promises);
    }

    /**
     * 检查是否需要扩容
     */
    private checkExpand(): void {
        // 扩容逻辑由SlotQueueManager内部处理
        const newCapacity = this.slotManager.getState().capacity;

        // 如果容量增加，需要添加新的slot节点并重新布局
        if (newCapacity > this.slotNodes.length) {
            console.log(`[SlotQueue] 需要扩容：从 ${this.slotNodes.length} -> ${newCapacity}`);

            // 添加新slot节点
            for (let i = this.slotNodes.length; i < newCapacity; i++) {
                const slotNode = this.createEmptySlotNode();
                this.slotNodes.push(slotNode);
            }

            // 重新应用纯数学定位
            this.layoutSlotsWithPureMath();
            console.log(`[SlotQueue] 扩容完成，现有 ${this.slotNodes.length} 个slot节点`);
        }

        // UI动画反馈
        this.playExpandAnimation();
    }

    /**
     * 播放扩容动画
     */
    private playExpandAnimation(): void {
        if (!this.slotItemsContainer) return;

        tween(this.slotItemsContainer)
            .to(0.2, { scale: new Vec3(1.1, 1.1, 1) })
            .to(0.2, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    /**
     * 更新UI显示（更新已有slot节点的内容）
     */
    private updateUI(): void {
        const letters = this.slotManager.getLetters();

        // 确保有足够的slot节点
        if (this.slotNodes.length === 0) {
            this.createSlotNodes();
        }

        // 更新每个slot节点的显示
        for (let i = 0; i < this.slotNodes.length; i++) {
            const slotNode = this.slotNodes[i];
            if (!slotNode || !slotNode.isValid) continue;

            const tile = slotNode.getComponent(LetterTile);

            if (i < letters.length) {
                // 有字母：显示字母和高亮状态
                if (tile) {
                    tile.setChar(letters[i]);
                    tile.setState('highlight');
                    if (tile.charLabel) {
                        tile.charLabel.string = letters[i].toUpperCase();
                    }
                }
            } else {
                // 无字母：显示空slot背景
                if (tile && tile.charLabel) {
                    tile.charLabel.string = ''; // 清空字母
                }

                // 恢复slot背景图（设置给Background节点）
                const backgroundNode = slotNode.getChildByName('Background');
                if (backgroundNode && this.slotBackgroundFrame) {
                    const sprite = backgroundNode.getComponent(Sprite);
                    if (sprite) {
                        sprite.spriteFrame = this.slotBackgroundFrame;
                        console.log(`[SlotQueue] 🔄 恢复slot[${i}]背景图`);
                    }
                } else if (!backgroundNode) {
                    console.warn(`[SlotQueue] ⚠️ slot[${i}]未找到Background节点`);
                } else if (!this.slotBackgroundFrame) {
                    console.warn('[SlotQueue] ⚠️ slotBackgroundFrame为null，无法恢复背景图');
                }
            }
        }
    }

    /**
     * "✓消除"按钮点击
     */
    private onConfirmClick(): void {
        if (!this.blinking) return;

        this.stopBlink();
        this.node.emit('confirm-remove');
    }

    /**
     * "⏭继续拼"按钮点击
     */
    private onContinueClick(): void {
        if (!this.blinking) return;

        this.stopBlink();
        this.node.emit('continue-spell');
    }

    /**
     * 获取牌槽管理器
     */
    public getManager(): SlotQueueManager {
        return this.slotManager;
    }

    /**
     * 获取当前字母列表
     */
    public getLetters(): string[] {
        return this.slotManager.getLetters();
    }

    /**
     * 检查是否已满
     */
    public isFull(): boolean {
        return this.slotManager.isFull();
    }

    /**
     * 获取下一个空闲slot的世界坐标
     */
    public getNextSlotWorldPosition(): Vec3 | null {
        const letters = this.slotManager.getLetters();
        const nextIndex = letters.length; // 下一个空闲slot的索引

        if (nextIndex >= this.slotNodes.length) {
            console.warn('[SlotQueue] 没有空闲的slot了');
            return null;
        }

        const slotNode = this.slotNodes[nextIndex];
        if (!slotNode || !slotNode.isValid) {
            console.warn(`[SlotQueue] slot节点[${nextIndex}]无效`);
            return null;
        }

        // 将slot节点的本地坐标转换为世界坐标
        const worldPos = slotNode.getWorldPosition();
        console.log(`[SlotQueue] 下一个空闲slot[${nextIndex}]的世界坐标: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)})`);

        return worldPos;
    }

    protected update(dt: number): void {
        // 闪烁倒计时
        if (this.blinking) {
            this.blinkTimer -= dt;
            if (this.blinkTimer <= 0) {
                // 倒计时结束，自动消除
                this.node.emit('auto-remove');
                this.stopBlink();
            }
        }
    }

    /**
     * 加载牌槽背景图（从PreloadManager预加载的缓存获取）
     */
    private async loadSlotBackground(): Promise<void> {
        // 防止重复加载
        if (this.slotBackgroundFrame) {
            console.log('[SlotQueue] 背景图已加载，直接使用缓存');
            return;
        }

        try {
            console.log('[SlotQueue] 从预加载缓存获取牌槽背景图...');

            const assetLoader = AssetLoader.getInstance();

            // 检查资源是否已完全加载并缓存
            const isCached = assetLoader.isAssetCached('slot', 'slot_item/spriteFrame');

            if (isCached) {
                console.log('[SlotQueue] ✅ 牌槽背景图已在预加载阶段完全加载');
            } else {
                console.log('[SlotQueue] ⚠️ 牌槽背景图未预加载，开始动态加载');
            }

            // 使用AssetLoader从缓存获取（已完全加载，立即可用）
            this.slotBackgroundFrame = await assetLoader.loadSpriteFrame('slot', 'slot_item/spriteFrame');

            console.log('[SlotQueue] 牌槽背景图获取成功，已缓存供所有slot使用');

        } catch (error) {
            console.error('[SlotQueue] 加载牌槽背景图失败:', error);
            this.slotBackgroundFrame = null;
            // 背景图加载失败不影响游戏运行
        }
    }

    protected onDestroy(): void {
        if (this.confirmButton && this.confirmButton.isValid) {
            this.confirmButton.off(Node.EventType.TOUCH_END, this.onConfirmClick, this);
        }

        if (this.continueButton && this.continueButton.isValid) {
            this.continueButton.off(Node.EventType.TOUCH_END, this.onContinueClick, this);
        }

        for (const slotNode of this.slotNodes) {
            if (slotNode && slotNode.isValid) {
                slotNode.destroy();
            }
        }
        this.slotNodes = [];
    }
}
