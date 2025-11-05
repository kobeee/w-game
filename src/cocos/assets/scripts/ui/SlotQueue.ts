import { _decorator, Component, Node, Prefab, instantiate, tween, Vec3, CCInteger, Sprite, SpriteFrame, Tween } from 'cc';
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

        // ✅ 新增：验证按钮节点是否存在

        // 初始化按钮事件
        if (this.confirmButton) {
            this.confirmButton.on(Node.EventType.TOUCH_END, this.onConfirmClick, this);
        } else {
            console.error('[SlotQueue] ❌ confirmButton未设置，无法注册事件！');
        }

        if (this.continueButton) {
            this.continueButton.on(Node.EventType.TOUCH_END, this.onContinueClick, this);
        } else {
            console.error('[SlotQueue] ❌ continueButton未设置，无法注册事件！');
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

        
    }

    /**
     * 根据容量获取缩放比例（四档式，更激进）
     * @param capacity 当前容量（7-10）
     * @returns 缩放比例（1.0 / 0.85 / 0.75 / 0.68）
     */
    private getSlotScale(capacity: number): number {
        if (capacity <= 7) {
            return 1.0;    // 100%（初始状态，97px/格，总宽679px）
        } else if (capacity === 8) {
            return 0.85;   // 85%（第一次扩容，82.5px/格，总宽660px）
        } else if (capacity === 9) {
            return 0.75;   // 75%（第二次扩容，72.75px/格，总宽655px）
        } else {
            return 0.68;   // 68%（最大容量10格，66px/格，总宽660px）
        }
    }

    /**
     * 获取当前缩放比例（供外部调用）
     * @returns 当前缩放比例
     */
    public getCurrentScale(): number {
        return this.getSlotScale(this.slotNodes.length);
    }

    /**
     * 使用纯数学定位算法排列slot节点（支持动态缩放）
     * ✅ 修改：根据当前容量动态计算slot宽度和缩放
     */
    private layoutSlotsWithPureMath(): void {
        const capacity = this.slotNodes.length;
        const scale = this.getSlotScale(capacity);

        // ✅ 动态计算slot宽度
        const baseSlotWidth = 85; // slot实际宽度（SlotItem预制体宽度）
        const slotWidth = baseSlotWidth * scale;

        const totalWidth = slotWidth * capacity;
        const startX = -totalWidth / 2 + slotWidth / 2;

        

        for (let i = 0; i < this.slotNodes.length; i++) {
            const slotNode = this.slotNodes[i];
            if (!slotNode) continue;

            // 计算位置
            const x = startX + i * slotWidth;
            slotNode.setPosition(x, 0, 0);

            // ✅ 设置slot节点的缩放
            slotNode.setScale(scale, scale, 1);

            
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

                // ✅ 修改：保持localScale为1，继承slot的worldScale
                tileNode.setScale(1, 1, 1);

                // 设置为高亮状态
                const tile = tileNode.getComponent(LetterTile);
                if (tile) {
                    tile.setState('highlight');
                }

                
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
        } else {
            console.error('[SlotQueue] ❌ blinkGroup未设置！');
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

        // ✅ 修复：停止所有闪烁动画并恢复状态
        for (let i = 0; i < this.slotNodes.length; i++) {
            const slotNode = this.slotNodes[i];
            if (!slotNode) continue;

            // 查找字母牌节点
            const letterTileNode = this.findLetterTileNode(slotNode);
            if (!letterTileNode) continue;

            // 停止闪烁动画
            Tween.stopAllByTag(1001, letterTileNode);

            // 恢复节点缩放
            letterTileNode.setScale(1, 1, 1);

            const tile = letterTileNode.getComponent(LetterTile);
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

            // ✅ 修复：查找字母牌节点（LetterTile组件所在节点）
            const letterTileNode = this.findLetterTileNode(slotNode);
            if (!letterTileNode) {
                console.warn(`[SlotQueue] slot[${i}]中未找到LetterTile节点`);
                continue;
            }

            const tile = letterTileNode.getComponent(LetterTile);
            if (!tile) continue;

            if (i >= match.startIdx && i <= match.endIdx) {
                // 匹配的字母：设置为correct状态
                tile.setState('correct');

                // ✅ 修复：闪烁动画作用于字母牌节点
                this.playBlinkAnimation(letterTileNode, match.word);

                
            } else {
                // 未匹配的字母：保持高亮
                tile.setState('highlight');
            }
        }
    }

    /**
     * ✅ 新增：查找slot节点中的字母牌节点
     * 因为addLetter时，字母牌节点被setParent到slot下
     */
    private findLetterTileNode(slotNode: Node): Node | null {
        // 遍历slot的所有子节点，找到LetterTile组件
        for (const child of slotNode.children) {
            const tile = child.getComponent(LetterTile);
            if (tile) {
                return child;
            }
        }
        return null;
    }

    /**
     * 播放闪烁动画（重构版）
     * ✅ 修复：
     * 1. 作用于字母牌节点，而非slot根节点
     * 2. 使用tag标记，方便后续停止
     * 3. 不再使用repeatForever，改为有限次数
     */
    private playBlinkAnimation(letterTileNode: Node, word: string): void {
        // ⚠️ 停止该节点上所有之前的闪烁动画
        Tween.stopAllByTarget(letterTileNode);

        // 闪烁效果：缩放+透明度变化
        tween(letterTileNode)
            .tag(1001) // 标记为闪烁动画
            // 第1次闪烁
            .to(0.15, { scale: new Vec3(1.15, 1.15, 1) })
            .to(0.15, { scale: new Vec3(1, 1, 1) })
            // 第2次闪烁
            .to(0.15, { scale: new Vec3(1.15, 1.15, 1) })
            .to(0.15, { scale: new Vec3(1, 1, 1) })
            // 第3次闪烁
            .to(0.15, { scale: new Vec3(1.15, 1.15, 1) })
            .to(0.15, { scale: new Vec3(1, 1, 1) })
            // 第4次闪烁
            .to(0.15, { scale: new Vec3(1.15, 1.15, 1) })
            .to(0.15, { scale: new Vec3(1, 1, 1) })
            // 第5次闪烁
            .to(0.15, { scale: new Vec3(1.15, 1.15, 1) })
            .to(0.15, { scale: new Vec3(1, 1, 1) })
            .call(() => {
            })
            .start();
    }

    /**
     * 消除单词
     */
    public removeWord(match: WordMatch): void {
        

        // ✅ 修复：在动画播放前先停止闪烁
        this.stopBlink();

        // 播放消除动画
        this.playRemoveAnimation(match).then(() => {
            

            // 从管理器中移除
            this.slotManager.removeWord(match);

            // ✅ 修复：updateUI前打印状态
            const remainingLetters = this.slotManager.getLetters();

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

            // ✅ 修复：对字母牌节点播放动画
            const letterTileNode = this.findLetterTileNode(slotNode);
            if (!letterTileNode) {
                console.warn(`[SlotQueue] slot[${i}]中未找到LetterTile节点`);
                continue;
            }

            

            const promise = new Promise<void>((resolve) => {
                tween(letterTileNode)
                    .to(0.2, { scale: new Vec3(1.3, 1.3, 1) })  // 放大
                    .to(0.3, { scale: new Vec3(0, 0, 1) })      // 缩小至消失
                    .call(() => {

                        // ✅ 销毁字母牌节点
                        if (letterTileNode.isValid) {
                            letterTileNode.destroy();
                        }

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
     * ✅ 修改：增加扩容动画（闪烁缩小效果）
     */
    private checkExpand(): void {
        const newCapacity = this.slotManager.getState().capacity;

        if (newCapacity > this.slotNodes.length) {
            const oldCapacity = this.slotNodes.length;
            const oldScale = this.getSlotScale(oldCapacity);
            const newScale = this.getSlotScale(newCapacity);

            

            // 添加新slot节点
            for (let i = this.slotNodes.length; i < newCapacity; i++) {
                const slotNode = this.createEmptySlotNode();
                this.slotNodes.push(slotNode);
            }

            // 重新应用纯数学定位（会设置新的scale）
            this.layoutSlotsWithPureMath();

            // 播放扩容动画（闪烁缩小效果）
            this.playExpandAnimation(oldScale, newScale);

            
        }
    }

    /**
     * 播放扩容动画（闪烁缩小效果）
     * ✅ 重构：原尺寸 ↔ 新尺寸闪烁3次，最后固定为新尺寸
     * @param oldScale 原缩放比例
     * @param newScale 新缩放比例
     */
    private playExpandAnimation(oldScale: number, newScale: number): void {
        if (!this.slotItemsContainer) return;

        

        // 1. 将所有slot节点的localScale临时重置为1.0（避免双重缩放）
        for (const slotNode of this.slotNodes) {
            if (slotNode && slotNode.isValid) {
                slotNode.setScale(1, 1, 1);
            }
        }

        // 2. 停止之前的扩容动画（如果有）
        Tween.stopAllByTag(2001, this.slotItemsContainer);

        // 3. 播放闪烁动画：原尺寸 ↔ 新尺寸，循环3次
        tween(this.slotItemsContainer)
            .tag(2001) // 标记为扩容动画
            // 第1次闪烁
            .to(0.15, { scale: new Vec3(oldScale, oldScale, 1) }, { easing: 'sineInOut' })
            .to(0.15, { scale: new Vec3(newScale, newScale, 1) }, { easing: 'sineInOut' })
            // 第2次闪烁
            .to(0.15, { scale: new Vec3(oldScale, oldScale, 1) }, { easing: 'sineInOut' })
            .to(0.15, { scale: new Vec3(newScale, newScale, 1) }, { easing: 'sineInOut' })
            // 第3次闪烁
            .to(0.15, { scale: new Vec3(oldScale, oldScale, 1) }, { easing: 'sineInOut' })
            .to(0.15, { scale: new Vec3(newScale, newScale, 1) }, { easing: 'sineInOut' })
            .call(() => {
                // 4. 动画结束后，恢复container的scale为1.0
                this.slotItemsContainer.setScale(1, 1, 1);

                // 5. 为每个slot节点设置新缩放
                for (const slotNode of this.slotNodes) {
                    if (slotNode && slotNode.isValid) {
                        slotNode.setScale(newScale, newScale, 1);
                    }
                }

                

                // 6. 触发事件，通知其他组件（如StackBoard）
                this.node.emit('capacity-expanded', newScale);
            })
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
        

        if (!this.blinking) {
            console.warn('[SlotQueue] ❌ blinking为false，点击无效');
            return;
        }

        
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

        return worldPos;
    }

    protected update(dt: number): void {
        // 闪烁倒计时
        if (this.blinking) {
            this.blinkTimer -= dt;

            

            if (this.blinkTimer <= 0) {
                

                // ❌ 修复前：立即停止闪烁
                // this.stopBlink();

                // ✅ 修复后：先触发事件，由StackGameApp处理消除
                this.node.emit('auto-remove');

                // ⚠️ 不在这里停止闪烁！由removeWord()动画完成后停止
            }
        }
    }

    /**
     * 加载牌槽背景图（从PreloadManager预加载的缓存获取）
     */
    private async loadSlotBackground(): Promise<void> {
        // 防止重复加载
        if (this.slotBackgroundFrame) {
            return;
        }

        try {
            

            const assetLoader = AssetLoader.getInstance();

            // 检查资源是否已完全加载并缓存
            const isCached = assetLoader.isAssetCached('slot', 'slot_item/spriteFrame');

            if (isCached) {
            } else {
            }

            // 使用AssetLoader从缓存获取（已完全加载，立即可用）
            this.slotBackgroundFrame = await assetLoader.loadSpriteFrame('slot', 'slot_item/spriteFrame');

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
