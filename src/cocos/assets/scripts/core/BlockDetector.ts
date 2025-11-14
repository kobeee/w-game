/**
 * 遮挡判定算法 - 十字区域法（羊了个羊同款）
 *
 * 核心原理：
 * 1. 卡片以中心点为原点，用横线+竖线划分为4个象限区域
 * 2. ✅ 检查所有更高层级（layer > 当前层）的卡片是否遮挡（不仅仅是layer+1）
 * 3. ✅ 遮挡规则：只要4个象限中有任意一个象限被上层卡片遮挡，整个卡片就不可点击！
 * 4. 只有4个象限全部未被遮挡（完全可见），卡片才可以点击！
 *
 * 象限划分（卡片尺寸90×90px，中心点为(0,0)）：
 *      ┌─────────┬─────────┐
 *      │         │         │
 *      │    2    │    1    │  象限2(左上)  象限1(右上)
 *      │  (左上)  │  (右上)  │  45×45px     45×45px
 * (0,0)├─────────┼─────────┤  ← 中心点（横线+竖线）
 *      │    3    │    4    │  象限3(左下)  象限4(右下)
 *      │  (左下)  │  (右下)  │  45×45px     45×45px
 *      │         │         │
 *      └─────────┴─────────┘
 *
 * 关键说明：多层堆叠场景中，顶层可以跨层遮挡底层（不只是相邻层级）
 * 示例：Layer 2可以直接遮挡Layer 0，无需通过Layer 1中转
 */

import { Rect, Vec3 } from 'cc';
import { Card } from '../data/StackTypes';

/**
 * 象限枚举（4个区域）
 */
export enum Quadrant {
    TOP_RIGHT = 1,    // 右上
    TOP_LEFT = 2,     // 左上
    BOTTOM_LEFT = 3,  // 左下
    BOTTOM_RIGHT = 4  // 右下
}

/**
 * 遮挡判定器（十字区域法）
 */
export class BlockDetector {
    /**
     * 卡片尺寸
     */
    private static readonly CARD_SIZE = 90;
    /**
     * 子网格尺寸（卡片的1/2）
     */
    private static readonly CELL = 45;

    /**
     * 获取卡片的4个象限矩形
     *
     * 象限划分（以卡片中心为原点）：
     * - 象限1（右上）：中心点右上方，45×45px
     * - 象限2（左上）：中心点左上方，45×45px
     * - 象限3（左下）：中心点左下方，45×45px
     * - 象限4（右下）：中心点右下方，45×45px
     *
     * @param card 卡片
     * @param quadrant 象限
     * @returns 象限矩形
     */
    static getQuadrantRegion(card: Card, quadrant: Quadrant): Rect {
        const { rect } = card;
        const cardWidth = rect.width;   // 90px
        const cardHeight = rect.height; // 90px
        const halfWidth = cardWidth / 2;   // 45px
        const halfHeight = cardHeight / 2; // 45px

        // 卡片中心点坐标
        const centerX = rect.x + halfWidth;
        const centerY = rect.y + halfHeight;

        switch (quadrant) {
            case Quadrant.TOP_RIGHT: // 象限1（右上）
                return new Rect(
                    centerX,        // 从中心点开始
                    centerY,        // 从中心点开始
                    halfWidth,      // 宽45px
                    halfHeight      // 高45px
                );

            case Quadrant.TOP_LEFT: // 象限2（左上）
                return new Rect(
                    centerX - halfWidth,  // 中心点左侧
                    centerY,              // 从中心点开始
                    halfWidth,            // 宽45px
                    halfHeight            // 高45px
                );

            case Quadrant.BOTTOM_LEFT: // 象限3（左下）
                return new Rect(
                    centerX - halfWidth,  // 中心点左侧
                    centerY - halfHeight, // 中心点下方
                    halfWidth,            // 宽45px
                    halfHeight            // 高45px
                );

            case Quadrant.BOTTOM_RIGHT: // 象限4（右下）
                return new Rect(
                    centerX,              // 从中心点开始
                    centerY - halfHeight, // 中心点下方
                    halfWidth,            // 宽45px
                    halfHeight            // 高45px
                );
        }
    }

    /**
     * 判断两个矩形是否有重叠
     *
     * @param rect1 矩形1
     * @param rect2 矩形2
     * @returns 是否重叠
     */
    private static isOverlap(rect1: Rect, rect2: Rect): boolean {
        return !(
            rect1.x + rect1.width <= rect2.x ||
            rect2.x + rect2.width <= rect1.x ||
            rect1.y + rect1.height <= rect2.y ||
            rect2.y + rect2.height <= rect1.y
        );
    }

    /**
     * 判断某个象限是否被上层卡片遮挡（任意重叠都算遮挡）
     *
     * @param quadrantRegion 象限矩形
     * @param upperCard 可能遮挡的上层卡片
     * @returns 是否被遮挡
     */
    private static isQuadrantBlocked(quadrantRegion: Rect, upperCard: Card): boolean {
        const upperRect = upperCard.rect;

        // 检查两个矩形是否有重叠（任意重叠都算遮挡）
        return this.isOverlap(quadrantRegion, upperRect);
    }

    /**
     * 计算卡片占用的1/4网格（共4个45×45子网格）
     * 子网格坐标采用全局统一CELL对齐（世界坐标/45向下取整）
     */
    private static getOccupiedCells(card: Card): Array<{ x: number; y: number }> {
        const leftCell = Math.floor(card.rect.x / this.CELL);
        const bottomCell = Math.floor(card.rect.y / this.CELL);
        return [
            { x: leftCell, y: bottomCell },           // 左下
            { x: leftCell + 1, y: bottomCell },       // 右下
            { x: leftCell, y: bottomCell + 1 },       // 左上
            { x: leftCell + 1, y: bottomCell + 1 }    // 右上
        ];
    }

    /**
     * 批量更新所有卡片的遮挡状态（使用新的十字区域法）
     *
     * @param cards 所有卡片
     */
    static updateAllBlockStatus(cards: Card[]): void {
        // 先重置所有卡片为可点击
        for (const card of cards) {
            if (!card.removed) {
                card.blocked = false;
            }
        }

        // 构建子网格 -> 卡片栈映射（只考虑未移除的卡片）
        const cellMap = new Map<string, Card[]>();
        for (const card of cards) {
            if (card.removed) continue;
            const cells = this.getOccupiedCells(card);
            for (const cell of cells) {
                const key = `${cell.x},${cell.y}`;
                let list = cellMap.get(key);
                if (!list) {
                    list = [];
                    cellMap.set(key, list);
                }
                list.push(card);
            }
        }

        // 对每个子网格内的卡片按 layer 排序，只有栈顶卡片在该子网格上可见
        cellMap.forEach((cardsInCell) => {
            if (cardsInCell.length <= 1) {
                return;
            }

            // 底层在前，上层在后
            cardsInCell.sort((a, b) => a.layer - b.layer);

            // 除了栈顶之外，其余卡片在该子网格上都视为被遮挡
            for (let i = 0; i < cardsInCell.length - 1; i++) {
                const lower = cardsInCell[i];
                if (!lower.removed) {
                    lower.blocked = true;
                }
            }
        });
    }

    /**
     * 获取所有可点击的卡片
     *
     * @param cards 所有卡片
     * @returns 可点击卡片列表
     */
    static getClickableCards(cards: Card[]): Card[] {
        return cards.filter(card => !card.blocked && !card.removed);
    }

    /**
     * 检查指定卡片是否可点击
     *
     * @param card 卡片
     * @returns 是否可点击
     */
    static isClickable(card: Card): boolean {
        return !card.blocked && !card.removed;
    }
}

