/**
 * 层级化布局生成器（基于坐标记录 + 十字区域遮挡）
 *
 * 核心设计原则（参考羊了个羊）:
 * 1. **底层网格初始化**: 底层卡片随机分布,记录每个卡片的精确坐标
 * 2. **逐层向上生成**: 从底层开始,逐层向上,基于下层坐标信息生成上层
 * 3. **十字区域遮挡规则**: 上层卡片必须遮挡下层卡片的某个十字方向,但不能完全遮挡
 * 4. **间接遮挡允许**: B遮挡A的左侧,C遮挡B的右侧,C可以完全遮挡A（这是允许的）
 * 5. **同层不重叠**: 同一层的卡片之间不允许重叠
 *
 * @author Claude Code
 * @date 2025-01-16
 */

import { Vec3, Rect } from 'cc';
import { Card, Level, LayoutTemplate, LayerConfig } from '../data/StackTypes';

/**
 * 层级化布局生成器
 */
export class LayerBasedLayoutGenerator {
    // 卡片尺寸
    private static readonly CARD_WIDTH = 90;
    private static readonly CARD_HEIGHT = 90;

    // ❌ 卡片间距应为0！堆叠布局允许卡片重叠
    private static readonly CARD_SPACING = 0;

    /**
     * 十字偏移量配置（相对卡片中心的偏移）
     * 这些偏移量保证了上层卡片遮挡下层卡片的十字区域,但不会完全遮挡
     */
    private static readonly CROSS_OFFSETS = [
        // 遮挡上方十字区域（上层卡片在下层卡片的下方）
        { x: 0, y: -30, name: '遮挡上方' },

        // 遮挡下方十字区域（上层卡片在下层卡片的上方）
        { x: 0, y: 30, name: '遮挡下方' },

        // 遮挡左侧十字区域（上层卡片在下层卡片的右侧）
        { x: 30, y: 0, name: '遮挡左侧' },

        // 遮挡右侧十字区域（上层卡片在下层卡片的左侧）
        { x: -30, y: 0, name: '遮挡右侧' },

        // 遮挡对角（同时遮挡两个方向）
        { x: 25, y: 25, name: '遮挡左上' },
        { x: -25, y: 25, name: '遮挡右上' },
        { x: 25, y: -25, name: '遮挡左下' },
        { x: -25, y: -25, name: '遮挡右下' },
    ];

    /**
     * 生成层级化布局
     *
     * @param numLayers 总层数（建议2-4层）
     * @param cardsPerLayer 每层卡片数量（[底层数量, 第二层, 第三层, ...]）
     * @returns 布局模板
     */
    public static generateLayeredLayout(
        numLayers: number = 3,
        cardsPerLayer: number[] = [25, 15, 8]
    ): LayoutTemplate {
        const layers: LayerConfig[] = [];

        // 1. 生成底层（网格布局,不考虑遮挡）
        const baseLayer = this.generateBaseLayer(cardsPerLayer[0]);
        layers.push(baseLayer);

        console.log(`[LayerBasedLayoutGenerator] 底层生成完成: ${baseLayer.positions.length}张卡片`);

        // 2. 逐层向上生成（基于下层坐标）
        for (let layerId = 1; layerId < numLayers; layerId++) {
            const targetCount = cardsPerLayer[layerId] || Math.max(5, Math.floor(cardsPerLayer[layerId - 1] * 0.6));
            const prevLayer = layers[layerId - 1];

            const upperLayer = this.generateUpperLayer(
                prevLayer.positions,
                layerId,
                targetCount
            );

            layers.push(upperLayer);

            console.log(`[LayerBasedLayoutGenerator] 第${layerId}层生成完成: ${upperLayer.positions.length}张卡片`);
        }

        const totalCards = layers.reduce((sum, layer) => sum + layer.positions.length, 0);

        return {
            id: `layer_based_${numLayers}layers`,
            name: `层级化布局（${numLayers}层）`,
            cardCount: totalCards,
            layers
        };
    }

    /**
     * 生成底层布局（5×5网格 + 轻微随机扰动）
     *
     * @param cardCount 卡片数量
     * @returns 底层配置
     */
    private static generateBaseLayer(cardCount: number): LayerConfig {
        const positions: Vec3[] = [];

        // 根据卡片数量决定网格大小
        const gridSize = Math.ceil(Math.sqrt(cardCount));
        const step = this.CARD_WIDTH + this.CARD_SPACING;

        for (let i = 0; i < cardCount; i++) {
            const row = Math.floor(i / gridSize);
            const col = i % gridSize;

            // 基础网格位置（以中心为原点）
            const baseX = (col - Math.floor(gridSize / 2)) * step;
            const baseY = (Math.floor(gridSize / 2) - row) * step;

            // 添加轻微随机扰动（避免过于规则）
            const randomOffsetX = (Math.random() - 0.5) * 10; // ±5px随机偏移
            const randomOffsetY = (Math.random() - 0.5) * 10;

            positions.push(new Vec3(
                baseX + randomOffsetX,
                baseY + randomOffsetY,
                0 // 底层z=0
            ));
        }

        return {
            id: 0,
            positions,
            zIndex: 0
        };
    }

    /**
     * 生成上层布局（基于下层坐标 + 十字偏移）
     *
     * 关键算法:
     * 1. 从下层位置中随机采样
     * 2. 对每个采样位置,应用十字偏移量
     * 3. 检查新位置是否与同层已有位置冲突
     * 4. 如果冲突,尝试下一个偏移量;如果所有偏移都冲突,跳过该位置
     *
     * @param lowerPositions 下层卡片位置
     * @param layerId 层级ID
     * @param targetCount 目标卡片数量
     * @returns 上层配置
     */
    private static generateUpperLayer(
        lowerPositions: Vec3[],
        layerId: number,
        targetCount: number
    ): LayerConfig {
        const positions: Vec3[] = [];

        // 从下层位置中随机采样（洗牌）
        const shuffledIndices = this.shuffleIndices(lowerPositions.length);

        for (let i = 0; i < shuffledIndices.length && positions.length < targetCount; i++) {
            const basePos = lowerPositions[shuffledIndices[i]];

            // 随机选择一个十字偏移
            const offsetIndex = Math.floor(Math.random() * this.CROSS_OFFSETS.length);
            const offset = this.CROSS_OFFSETS[offsetIndex];

            // 计算新位置
            const newPos = new Vec3(
                basePos.x + offset.x,
                basePos.y + offset.y,
                layerId * 10 // Z轴分层
            );

            // 检查同层冲突
            if (!this.hasConflictInSameLayer(newPos, positions)) {
                positions.push(newPos);
                console.log(
                    `[LayerBasedLayoutGenerator] 第${layerId}层添加卡片: ` +
                    `基于(${basePos.x.toFixed(1)}, ${basePos.y.toFixed(1)}) + ${offset.name} → ` +
                    `(${newPos.x.toFixed(1)}, ${newPos.y.toFixed(1)})`
                );
            } else {
                // 尝试其他偏移
                let added = false;
                for (let j = 0; j < this.CROSS_OFFSETS.length; j++) {
                    if (j === offsetIndex) continue;

                    const altOffset = this.CROSS_OFFSETS[j];
                    const altPos = new Vec3(
                        basePos.x + altOffset.x,
                        basePos.y + altOffset.y,
                        layerId * 10
                    );

                    if (!this.hasConflictInSameLayer(altPos, positions)) {
                        positions.push(altPos);
                        added = true;
                        console.log(
                            `[LayerBasedLayoutGenerator] 第${layerId}层添加卡片（备选偏移）: ` +
                            `${altOffset.name} → (${altPos.x.toFixed(1)}, ${altPos.y.toFixed(1)})`
                        );
                        break;
                    }
                }

                if (!added) {
                    console.log(`[LayerBasedLayoutGenerator] 第${layerId}层跳过位置: 所有偏移都冲突`);
                }
            }
        }

        return {
            id: layerId,
            positions,
            zIndex: layerId
        };
    }

    /**
     * 检查新位置是否与同层已有位置冲突
     *
     * @param newPos 新位置
     * @param existingPositions 已有位置
     * @returns 是否冲突
     */
    private static hasConflictInSameLayer(newPos: Vec3, existingPositions: Vec3[]): boolean {
        const minDistance = this.CARD_WIDTH - 5; // 最小安全距离（允许5px容差）

        for (const existingPos of existingPositions) {
            const distance = Math.sqrt(
                Math.pow(newPos.x - existingPos.x, 2) +
                Math.pow(newPos.y - existingPos.y, 2)
            );

            if (distance < minDistance) {
                return true; // 冲突
            }
        }

        return false;
    }

    /**
     * 生成随机索引数组（洗牌）
     *
     * @param length 数组长度
     * @returns 洗牌后的索引数组
     */
    private static shuffleIndices(length: number): number[] {
        const indices = Array.from({ length }, (_, i) => i);

        // Fisher-Yates洗牌
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        return indices;
    }

    /**
     * 生成完整关卡（布局 + 单词分配）
     *
     * @param words 单词列表
     * @param numLayers 层数
     * @param cardsPerLayer 每层卡片数
     * @returns 关卡数据
     */
    public static generateLevel(
        words: string[],
        numLayers: number = 3,
        cardsPerLayer: number[] = [25, 15, 8]
    ): Level {
        // 1. 生成布局
        const layout = this.generateLayeredLayout(numLayers, cardsPerLayer);

        // 2. 收集所有字母
        const letters: string[] = [];
        for (const word of words) {
            letters.push(...word.toUpperCase().split(''));
        }

        // 3. 洗牌字母
        const shuffledLetters = this.shuffleArray(letters);

        // 4. 分配字母到卡片
        const cards: Card[] = [];
        let letterIndex = 0;

        for (const layerConfig of layout.layers) {
            for (const position of layerConfig.positions) {
                if (letterIndex >= shuffledLetters.length) {
                    // 字母不够,循环使用
                    letterIndex = 0;
                }

                const rect = new Rect(
                    position.x - this.CARD_WIDTH / 2,
                    position.y - this.CARD_HEIGHT / 2,
                    this.CARD_WIDTH,
                    this.CARD_HEIGHT
                );

                cards.push({
                    id: `card_L${layerConfig.id}_${letterIndex}`,
                    letter: shuffledLetters[letterIndex],
                    layer: layerConfig.id,
                    position,
                    rect,
                    blocked: false,
                    removed: false
                });

                letterIndex++;
            }
        }

        return {
            seed: `layer_based_${Date.now()}`,
            cards,
            layout,
            wordPool: words,
            totalCards: cards.length
        };
    }

    /**
     * Fisher-Yates洗牌算法
     */
    private static shuffleArray<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}
