import { _decorator, Component, Node, Prefab, instantiate, Vec3, tween, UITransform } from 'cc';
import { Card, Level } from '../data/StackTypes';
import { BlockDetector } from '../core/BlockDetector';
import { LetterTile } from './LetterTile';

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

    private cards: Card[] = [];
    private tileNodes: Map<string, Node> = new Map();

    /**
     * 初始化棋盘
     */
    public init(level: Level): void {
        this.clear();
        this.cards = [...level.cards];

        // ✅ 确保container节点位置为(0,0,0) - 世界坐标中心
        this.container.setPosition(0, 0, 0);
        console.log('[StackBoard] ✅ 设置container位置为(0, 0, 0)');

        // 创建所有卡片节点
        for (const card of this.cards) {
            this.createTileNode(card);
        }

        // 所有卡片节点创建完成后，更新rect并计算遮挡状态
        this.updateCardRects();

        // 更新遮挡状态
        this.updateBlockStatus();
    }

    /**
     * 更新所有卡片的rect（使用实际世界坐标）
     * 这是遮挡判定的基础，必须在所有卡片节点创建并设置位置后调用
     */
    private updateCardRects(): void {
        for (const card of this.cards) {
            const tileNode = this.tileNodes.get(card.id);
            if (!tileNode) continue;

            const uiTransform = tileNode.getComponent(UITransform);
            if (!uiTransform) {
                console.warn(`[StackBoard] 卡片${card.id}无UITransform组件`);
                continue;
            }

            // 获取卡片的世界坐标（中心点）
            const worldPos = uiTransform.convertToWorldSpaceAR(Vec3.ZERO);

            // 标准卡片尺寸
            const cardWidth = 90;
            const cardHeight = 90;

            // 更新card.rect为世界坐标矩形
            // rect.x 和 rect.y 是左下角坐标（Cocos坐标系Y轴向上）
            card.rect.x = worldPos.x - cardWidth / 2;
            card.rect.y = worldPos.y - cardHeight / 2;
            card.rect.width = cardWidth;
            card.rect.height = cardHeight;

            console.log(
                `[StackBoard] 更新卡片${card.id}的rect: ` +
                `世界坐标(${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}), ` +
                `rect(${card.rect.x.toFixed(2)}, ${card.rect.y.toFixed(2)}, ${card.rect.width}, ${card.rect.height})`
            );
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

        // 设置字母
        tile.setChar(card.letter);

        // 设置位置
        tileNode.setPosition(card.position);

        // 设置渲染层级（层级越高，z-index越大）
        tileNode.setSiblingIndex(card.layer);

        // 添加到容器
        this.container.addChild(tileNode);

        // 注册点击事件
        tileNode.on(Node.EventType.TOUCH_END, () => {
            this.onTileClick(card.id);
        }, this);

        // 保存引用
        this.tileNodes.set(card.id, tileNode);
    }

    /**
     * 更新所有卡片的遮挡状态
     */
    public updateBlockStatus(): void {
        // 使用BlockDetector静态方法计算遮挡关系
        BlockDetector.updateAllBlockStatus(this.cards);

        // 更新UI显示
        for (const card of this.cards) {
            const tileNode = this.tileNodes.get(card.id);
            if (!tileNode) continue;

            const tile = tileNode.getComponent(LetterTile);
            if (!tile) continue;

            if (card.removed) {
                // 已移除的卡片不显示
                tileNode.active = false;
            } else if (card.blocked) {
                // 被遮挡的卡片显示为不可选择
                tile.setState('disabled');
            } else {
                // 可点击的卡片
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

        // 飞向牌槽动画
        return new Promise<Node>((resolve) => {
            tween(tileNode)
                .to(0.1, { scale: new Vec3(0.8, 0.8, 1) })
                .to(0.3, { position: targetPos }, { easing: 'cubicOut' })
                .call(() => {
                    // ✅ 不再隐藏节点，而是返回给调用方处理
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
                tileNode.off(Node.EventType.TOUCH_END);
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
        const tileNode = this.tileNodes.get(cardId);
        if (!tileNode) return null;

        const uiTransform = tileNode.getComponent(UITransform);
        if (!uiTransform) return null;

        return uiTransform.convertToWorldSpaceAR(Vec3.ZERO);
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
