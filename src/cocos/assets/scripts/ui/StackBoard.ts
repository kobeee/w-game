import { _decorator, Component, Node, Prefab, instantiate, Vec3, tween, UITransform } from 'cc';
import { Card, Level } from '../data/StackTypes';
import { BlockDetector } from '../core/BlockDetector';
import { LetterTile } from './LetterTile';
import { SlotQueue } from './SlotQueue';

const { ccclass, property } = _decorator;

/**
 * 堆叠棋盘UI组件
 * 负责显示和管理堆叠的字母卡片
 */
@ccclass('StackBoard')
export class StackBoard extends Component {
    @property(Prefab)
    public letterTilePrefab: Prefab = null!;

    @property(Node)
    public container: Node = null!;

    // ✅ 新增：SlotQueue组件引用（用于获取当前缩放比例）
    private slotQueue: SlotQueue | null = null;

    private cards: Card[] = [];
    private tileNodes: Map<string, Node> = new Map();

    /**
     * ✅ 新增：在onLoad中初始化SlotQueue引用
     */
    protected onLoad(): void {
        // 假设SlotQueue与StackBoard在同一父节点下
        const parent = this.node.parent;
        if (parent) {
            this.slotQueue = parent.getComponentInChildren(SlotQueue);
            if (this.slotQueue) {
                console.log('[StackBoard] 成功获取SlotQueue组件引用');
            } else {
                console.warn('[StackBoard] 未找到SlotQueue组件，飞行缩放将使用默认值1.0');
            }
        }
    }

    /**
     * 初始化棋盘
     */
    public init(level: Level): void {
        this.clear();
        this.cards = [...level.cards];

        this.container.setPosition(0, 0, 0);

        // 创建所有卡片节点
        for (const card of this.cards) {
            this.createTileNode(card);
        }

        // 所有卡片节点创建完成后，统一按layer排序设置sibling index
        this.reorderTilesByLayer();

        // 更新rect并计算遮挡状态
        this.updateCardRects();
        this.updateBlockStatus();
    }

    /**
     * 更新所有卡片的rect（使用实际世界坐标）
     * 这是遮挡判定的基础，必须在所有卡片节点创建并设置位置后调用
     */
    private updateCardRects(): void {
        for (const card of this.cards) {
            if (!this.tileNodes.get(card.id)) continue;

            const worldPos = card.position;
            const cardWidth = 90;
            const cardHeight = 90;

            card.rect.x = worldPos.x - cardWidth / 2;
            card.rect.y = worldPos.y - cardHeight / 2;
            card.rect.width = cardWidth;
            card.rect.height = cardHeight;
        }
    }

    /**
     * 按层级重新排序卡片的渲染顺序
     * 确保Layer 0在最底层，Layer 1在中层，Layer 2在最上层
     */
    private reorderTilesByLayer(): void {
        // 按layer排序，然后为每张卡片分配唯一的siblingIndex
        const sortedCards = [...this.cards].sort((a, b) => a.layer - b.layer);

        for (let i = 0; i < sortedCards.length; i++) {
            const card = sortedCards[i];
            const tileNode = this.tileNodes.get(card.id);
            if (tileNode) {
                tileNode.setSiblingIndex(i);
            }
        }
    }

    /**
     * 创建单个瓦片节点
     */
    private createTileNode(card: Card): void {
        if (!this.letterTilePrefab) {
            console.error('LetterTile预制体未设置');
            return;
        }

        const tileNode = instantiate(this.letterTilePrefab);
        const tile = tileNode.getComponent(LetterTile);

        if (!tile) {
            console.error('LetterTile组件未找到');
            tileNode.destroy();
            return;
        }

        tile.setChar(card.letter);
        tileNode.setPosition(card.position);

        // 添加到容器（sibling index将在reorderTilesByLayer中统一设置）
        this.container.addChild(tileNode);

        // ✅ 修复：监听LetterTile发射的自定义事件，而非直接监听TOUCH_END
        tileNode.on('tile:clicked', (letterTile: LetterTile) => {
            console.log(`[StackBoard] 接收到tile:clicked事件, 卡片ID: ${card.id}`);
            this.onTileClick(card.id);
        }, this);

        this.tileNodes.set(card.id, tileNode);
    }

    /**
     * 更新所有卡片的遮挡状态
     */
    public updateBlockStatus(): void {
        BlockDetector.updateAllBlockStatus(this.cards);

        for (const card of this.cards) {
            const tileNode = this.tileNodes.get(card.id);
            if (!tileNode) continue;

            const tile = tileNode.getComponent(LetterTile);
            if (!tile) continue;

            if (card.removed) {
                tileNode.active = false;
            } else if (card.blocked) {
                tile.setState('disabled');
            } else {
                tile.setState('selectable');
            }
        }
    }

    /**
     * 获取所有可点击的卡片
     */
    public getClickableCards(): Card[] {
        return this.cards.filter(card => !card.blocked && !card.removed);
    }

    /**
     * 点击卡片回调
     */
    private onTileClick(cardId: string): void {
        const card = this.cards.find(c => c.id === cardId);
        if (!card) return;

        // 检查是否可点击
        if (card.blocked || card.removed) {
            console.log(`卡片${cardId}不可点击: blocked=${card.blocked}, removed=${card.removed}`);
            return;
        }

        // 触发点击事件（由GameApp监听）
        this.node.emit('card-clicked', card);
    }

    /**
     * 移除卡片（飞向牌槽动画）
     * @returns 返回被移除的卡片节点（用于后续在slot中显示）
     */
    public async removeCard(cardId: string, targetPos: Vec3): Promise<Node | null> {
        const card = this.cards.find(c => c.id === cardId);
        if (!card) {
            console.warn(`卡片${cardId}不存在`);
            return null;
        }

        const tileNode = this.tileNodes.get(cardId);
        if (!tileNode) {
            console.warn(`卡片节点${cardId}不存在`);
            return null;
        }

        const tile = tileNode.getComponent(LetterTile);
        if (tile) {
            tile.setState('highlight');
        }

        // 标记为已移除
        card.removed = true;

        // ✅ 新增：提升z-index确保飞行时在最上层
        // 临时提升siblingIndex到最大值，确保飞行中的卡片不被任何节点遮挡
        const originalIndex = tileNode.getSiblingIndex();
        tileNode.setSiblingIndex(9999);
        console.log(`[StackBoard] 卡片${cardId}飞行开始，siblingIndex从${originalIndex}提升至9999`);

        // ✅ 新增：获取目标slot的缩放比例
        const targetScale = this.slotQueue ? this.slotQueue.getCurrentScale() : 1.0;

        console.log(`[StackBoard] 卡片${cardId}飞行目标缩放：${targetScale}`);

        // 飞向牌槽动画
        return new Promise<Node>((resolve) => {
            tween(tileNode)
                .to(0.1, { scale: new Vec3(targetScale, targetScale, 1) }) // ✅ 使用动态缩放
                .to(0.3, { position: targetPos }, { easing: 'cubicOut' })
                .call(() => {
                    // ✅ 注释：不需要恢复originalIndex，因为节点即将被转移到SlotQueue
                    // tileNode.setSiblingIndex(originalIndex);

                    console.log(`[StackBoard] 卡片${cardId}飞行动画完成，返回节点`);

                    // 从映射表中移除（因为节点将被转移到SlotQueue）
                    this.tileNodes.delete(cardId);

                    // 卡片被移除后，重新计算剩余卡片的遮挡状态
                    this.updateCardRects();
                    this.updateBlockStatus();

                    resolve(tileNode);
                })
                .start();
        });
    }

    /**
     * 清空棋盘
     */
    public clear(): void {
        // 销毁所有瓦片节点
        for (const [, tileNode] of this.tileNodes) {
            if (tileNode && tileNode.isValid) {
                // ✅ 修复：取消自定义事件监听，而非TOUCH_END
                tileNode.off('tile:clicked');
                tileNode.destroy();
            }
        }

        this.tileNodes.clear();
        this.cards = [];
    }

    /**
     * 获取卡片的世界坐标
     */
    public getCardWorldPosition(cardId: string): Vec3 | null {
        const card = this.cards.find(c => c.id === cardId);
        if (!card) return null;

        // ✅ 直接返回card.position，这已经是准确的世界坐标
        // ❌ 不要使用convertToWorldSpaceAR()，会产生浮点误差
        return card.position;
    }

    /**
     * 获取剩余卡片数量
     */
    public getRemainingCount(): number {
        return this.cards.filter(c => !c.removed).length;
    }

    /**
     * 获取初始卡片数量
     */
    public getTotalCount(): number {
        return this.cards.length;
    }

    protected onDestroy(): void {
        this.clear();
    }
}
