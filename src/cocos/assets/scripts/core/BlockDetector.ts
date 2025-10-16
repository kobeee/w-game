/**
 * 遮挡判定算法 - 十字区域法（羊了个羊同款）
 *
 * 核心原理：
 * 1. 卡片以中心点为原点，用横线+竖线划分为4个象限区域
 * 2. 只有相邻的上一层（layer+1）才能遮挡当前层
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
 * 上层卡片B遮挡A的8种相对位置（以A中心为原点）：
 * - (0, 0): 完全重合，遮挡全部4个象限 → A不可点击
 * - (-45, 0): 左侧，遮挡象限2+3 → A不可点击
 * - (-45, 45): 左上，遮挡象限2 → A不可点击
 * - (0, 45): 上方，遮挡象限1+2 → A不可点击
 * - (45, 45): 右上，遮挡象限1 → A不可点击
 * - (45, 0): 右侧，遮挡象限1+4 → A不可点击
 * - (45, -45): 右下，遮挡象限4 → A不可点击
 * - (0, -45): 下方，遮挡象限3+4 → A不可点击
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
     * 判断卡片是否被遮挡（新算法：4象限法）
     *
     * ✅ 正确规则：只要4个象限中有任意一个被上层卡片遮挡，整个卡片就不可点击！
     * 注意：只检查相邻的上一层（layer + 1）
     *
     * @param card 待检测卡片
     * @param cards 所有卡片
     * @returns 是否被遮挡
     */
    static isCardBlocked(card: Card, cards: Card[]): boolean {
        if (card.removed) {
            return true;
        }

        // 找出所有相邻上层的卡片
        const upperLayerCards = cards.filter(
            c => c.layer === card.layer + 1 && !c.removed
        );

        if (upperLayerCards.length === 0) {
            return false; // 没有上层卡片，不可能被遮挡
        }

        // 检查四个象限
        const quadrants = [
            Quadrant.TOP_RIGHT,
            Quadrant.TOP_LEFT,
            Quadrant.BOTTOM_LEFT,
            Quadrant.BOTTOM_RIGHT
        ];

        // 统计被遮挡的象限数量
        let blockedCount = 0;
        const blockedQuadrants: string[] = [];
        const visibleQuadrants: string[] = [];

        for (const quadrant of quadrants) {
            const quadrantRegion = this.getQuadrantRegion(card, quadrant);

            // 检查这个象限是否被任意上层卡片遮挡（任意重叠都算遮挡）
            const blockingCard = upperLayerCards.find(upperCard =>
                this.isQuadrantBlocked(quadrantRegion, upperCard)
            );

            if (blockingCard) {
                blockedCount++;
                blockedQuadrants.push(
                    `象限${quadrant}被${blockingCard.id}遮挡`
                );
            } else {
                visibleQuadrants.push(`象限${quadrant}可见`);
            }
        }

        // ✅ 正确逻辑：只要有任意一个象限被遮挡，卡片就不可点击！
        const isBlocked = blockedCount > 0;

        // 详细调试日志
        console.log(
            `[BlockDetector] 卡片${card.id}(${card.letter}) layer=${card.layer} ` +
            `中心=(${(card.rect.x + card.rect.width/2).toFixed(1)},${(card.rect.y + card.rect.height/2).toFixed(1)}) ` +
            `遮挡状态: ${isBlocked ? '❌被遮挡' : '✅可点击'} ` +
            `(${blockedCount}/4象限被遮挡)\n` +
            `  已遮挡: ${blockedQuadrants.length > 0 ? blockedQuadrants.join(', ') : '无'}\n` +
            `  可见: ${visibleQuadrants.join(', ')}`
        );

        return isBlocked;
    }

    /**
     * 批量更新所有卡片的遮挡状态（使用新的十字区域法）
     *
     * 时间复杂度: O(n) - n为卡片总数（只检查相邻层级）
     *
     * @param cards 所有卡片
     */
    static updateAllBlockStatus(cards: Card[]): void {
        // 重置所有卡片为可点击
        for (const card of cards) {
            if (!card.removed) {
                card.blocked = false;
            }
        }

        // 使用新的十字区域法更新遮挡状态
        console.log('\n[BlockDetector] ========== 开始批量遮挡判定 ==========');
        for (const card of cards) {
            if (!card.removed) {
                card.blocked = this.isCardBlocked(card, cards);
            }
        }

        // 统计可点击卡片数量
        const clickableCount = cards.filter(c => !c.blocked && !c.removed).length;
        const totalCount = cards.filter(c => !c.removed).length;
        console.log(`\n[BlockDetector] ========== 遮挡判定完成 ==========`);
        console.log(`[BlockDetector] 可点击卡片: ${clickableCount}/${totalCount}`);
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
