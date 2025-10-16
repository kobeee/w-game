import { Vec3, Rect } from 'cc';
import { Card, Level, LayoutTemplate, LayerConfig } from '../data/StackTypes';

/**
 * 智能布局生成器（羊了个羊风格）
 *
 * 核心设计原则：
 * 1. **同层不堆叠**：同一层的卡片按网格排列，彼此不重叠
 * 2. **遮挡判定**：只要卡片没有被上层卡片压住，就是可点击的（动态层级）
 * 3. **十字区域遮挡**：上层卡片可以遮挡下层卡片的1/4或1/2区域，但不能完全遮挡
 * 4. **从底层开始**：先生成底层网格，再逐层往上按规则堆叠
 */
export class SmartLayoutGenerator {
    // 卡片尺寸
    private static readonly CARD_WIDTH = 90;
    private static readonly CARD_HEIGHT = 90;

    // 卡片间距（同层卡片之间的安全距离）
    // 堆叠布局不留间隙！卡片应该紧密排列
    private static readonly CARD_SPACING = 0;

    // 二分之一遮挡偏移量（用于上层遮挡下层）
    private static readonly HALF_OFFSET = 45;  // 卡片宽度的1/2

    /**
     * 遮挡类型（上层卡片相对下层卡片的偏移）
     * 只保留整数偏移，避免浮点坐标
     * 注意：不再支持22.5px的四分之一遮挡（会产生.5小数）
     */
    private static readonly OVERLAP_OFFSETS = [
        { x: 0, y: 0 },       // 完全重合
        { x: -45, y: 0 },     // 左偏移
        { x: 45, y: 0 },      // 右偏移
        { x: 0, y: 45 },      // 上偏移
        { x: 0, y: -45 }      // 下偏移
    ];

    /**
     * 生成智能布局
     * @param basePattern 底层布局模式
     * @param numLayers 总层数（2-4层）
     * @returns 布局模板
     */
    public static generateSmartLayout(
        basePattern: 'grid' | 'circle' | 'pyramid' = 'grid',
        numLayers: number = 3
    ): LayoutTemplate {
        const layers: LayerConfig[] = [];

        // 1. 生成底层（同层不堆叠，按网格排列）
        const baseLayer = this.generateBaseLayer(basePattern);
        layers.push(baseLayer);

        console.log(`[SmartLayoutGenerator] 底层生成: ${basePattern}, 卡片数: ${baseLayer.positions.length}`);

        // 2. 逐层生成上层（基于下层位置，按十字区域遮挡规则堆叠）
        for (let layerId = 1; layerId < numLayers; layerId++) {
            const prevLayer = layers[layerId - 1];
            const upperLayer = this.generateUpperLayer(
                prevLayer.positions,
                layerId,
                layerId === numLayers - 1 // 是否为顶层
            );
            layers.push(upperLayer);

            console.log(`[SmartLayoutGenerator] 第${layerId}层生成: 卡片数: ${upperLayer.positions.length}`);
        }

        // 3. 验证同层不堆叠
        this.validateNoOverlapInSameLayer(layers);

        const totalCards = layers.reduce((sum, layer) => sum + layer.positions.length, 0);

        return {
            id: `smart_${basePattern}_${numLayers}layer`,
            name: `智能${basePattern}布局（${numLayers}层）`,
            cardCount: totalCards,
            layers
        };
    }

    /**
     * 生成底层布局（同层不堆叠）
     */
    private static generateBaseLayer(pattern: 'grid' | 'circle' | 'pyramid'): LayerConfig {
        let positions: Vec3[] = [];

        switch (pattern) {
            case 'grid':
                positions = this.generateGridPattern(5, 5); // 5×5网格（25张）
                break;
            case 'circle':
                positions = this.generateCirclePattern(12, 200); // 12张，半径200
                break;
            case 'pyramid':
                positions = this.generatePyramidPattern(4); // 4×4网格（16张）
                break;
        }

        return {
            id: 0,
            positions,
            zIndex: 0 // 底层z-index为0
        };
    }

    /**
     * 生成上层布局（基于下层位置，按十字区域遮挡规则）
     *
     * 关键原则：
     * 1. 从下层位置中采样（越往上，采样率越低）
     * 2. 使用十字区域遮挡偏移（避免完全遮挡）
     * 3. 检查同层是否堆叠，若堆叠则跳过该位置
     */
    private static generateUpperLayer(
        basePositions: Vec3[],
        layerId: number,
        isTopLayer: boolean
    ): LayerConfig {
        const positions: Vec3[] = [];

        // 根据层级调整采样率（越往上，卡片越少）
        const samplingRate = isTopLayer ? 0.15 : (layerId === 1 ? 0.5 : 0.3);

        // 从底层位置中采样
        for (let i = 0; i < basePositions.length; i++) {
            // 使用确定性伪随机（基于索引和层级）
            const shouldSample = this.pseudoRandom(i + layerId * 100) < samplingRate;

            if (shouldSample) {
                const basePos = basePositions[i];

                // 随机选择一个遮挡偏移类型
                const randomIndex = Math.floor(this.pseudoRandom(i + layerId * 200) * this.OVERLAP_OFFSETS.length);
                const offset = this.OVERLAP_OFFSETS[randomIndex];

                // 计算新位置（基础位置 + 偏移）
                const newPos = new Vec3(
                    basePos.x + offset.x,
                    basePos.y + offset.y,
                    layerId * 10 // Z轴分层
                );

                // ✅ 关键：检查同层是否堆叠
                if (!this.hasOverlapInSameLayer(newPos, positions)) {
                    positions.push(newPos);
                } else {
                    console.log(`[SmartLayoutGenerator] 跳过位置 (${newPos.x}, ${newPos.y})：同层堆叠`);
                }
            }
        }

        // 确保至少有1张卡片（顶层允许非常少）
        if (positions.length === 0 && !isTopLayer && basePositions.length > 0) {
            const centerPos = basePositions[Math.floor(basePositions.length / 2)];
            positions.push(new Vec3(centerPos.x, centerPos.y, layerId * 10));
        }

        return {
            id: layerId,
            positions,
            zIndex: layerId
        };
    }

    /**
     * 检查新位置是否与同层已有位置堆叠
     * @param newPos 新位置
     * @param existingPositions 已有位置列表
     * @returns 是否堆叠
     */
    private static hasOverlapInSameLayer(newPos: Vec3, existingPositions: Vec3[]): boolean {
        const minDistance = this.CARD_WIDTH - 1; // 最小安全距离（卡片宽度 - 1px容差）

        for (const existingPos of existingPositions) {
            const distance = Math.sqrt(
                Math.pow(newPos.x - existingPos.x, 2) +
                Math.pow(newPos.y - existingPos.y, 2)
            );

            // 如果距离小于最小安全距离，认为堆叠
            if (distance < minDistance) {
                return true;
            }
        }

        return false;
    }

    /**
     * 验证所有层的同层不堆叠
     */
    private static validateNoOverlapInSameLayer(layers: LayerConfig[]): void {
        for (const layer of layers) {
            for (let i = 0; i < layer.positions.length; i++) {
                for (let j = i + 1; j < layer.positions.length; j++) {
                    const pos1 = layer.positions[i];
                    const pos2 = layer.positions[j];

                    const distance = Math.sqrt(
                        Math.pow(pos1.x - pos2.x, 2) +
                        Math.pow(pos1.y - pos2.y, 2)
                    );

                    const minDistance = this.CARD_WIDTH - 1;

                    if (distance < minDistance) {
                        console.warn(
                            `[SmartLayoutGenerator] ⚠️ 层级${layer.id}检测到同层堆叠: ` +
                            `卡片${i}(${pos1.x.toFixed(1)}, ${pos1.y.toFixed(1)}) 与 ` +
                            `卡片${j}(${pos2.x.toFixed(1)}, ${pos2.y.toFixed(1)}) 距离过近: ${distance.toFixed(1)}px`
                        );
                    }
                }
            }
        }
    }

    /**
     * 生成网格布局（底层）
     */
    private static generateGridPattern(rows: number, cols: number): Vec3[] {
        const positions: Vec3[] = [];
        const step = this.CARD_WIDTH + this.CARD_SPACING;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = (col - Math.floor(cols / 2)) * step;
                const y = (Math.floor(rows / 2) - row) * step;
                positions.push(new Vec3(x, y, 0));
            }
        }

        return positions;
    }

    /**
     * 生成圆形布局（底层）
     */
    private static generateCirclePattern(numCards: number, radius: number): Vec3[] {
        const positions: Vec3[] = [];

        for (let i = 0; i < numCards; i++) {
            const angle = (i / numCards) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            positions.push(new Vec3(x, y, 0));
        }

        return positions;
    }

    /**
     * 生成金字塔布局（底层）
     */
    private static generatePyramidPattern(size: number): Vec3[] {
        const positions: Vec3[] = [];
        const step = this.CARD_WIDTH + this.CARD_SPACING;

        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const x = (col - (size - 1) / 2) * step;
                const y = ((size - 1) / 2 - row) * step;
                positions.push(new Vec3(x, y, 0));
            }
        }

        return positions;
    }

    /**
     * 伪随机数生成器（确定性，基于种子）
     */
    private static pseudoRandom(seed: number): number {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    /**
     * 生成关卡（整合布局 + 单词）
     */
    public static generateLevel(
        words: string[],
        layoutPattern: 'grid' | 'circle' | 'pyramid' = 'grid',
        numLayers: number = 3
    ): Level {
        // 1. 生成布局
        const layout = this.generateSmartLayout(layoutPattern, numLayers);

        // 2. 收集所有字母
        const letters: string[] = [];
        for (const word of words) {
            letters.push(...word.toUpperCase().split(''));
        }

        // 3. 洗牌字母
        const shuffledLetters = this.shuffleArray(letters);

        // 4. 分配字母到位置
        const cards: Card[] = [];
        let letterIndex = 0;

        for (const layerConfig of layout.layers) {
            for (const position of layerConfig.positions) {
                if (letterIndex >= shuffledLetters.length) {
                    break; // 字母用完了
                }

                const rect = new Rect(
                    position.x - this.CARD_WIDTH / 2,
                    position.y - this.CARD_HEIGHT / 2,
                    this.CARD_WIDTH,
                    this.CARD_HEIGHT
                );

                cards.push({
                    id: `card_${letterIndex}`,
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
            seed: `smart_${Date.now()}`,
            cards,
            layout,
            wordPool: words,
            totalCards: cards.length
        };
    }

    /**
     * Fisher-Yates 洗牌算法
     */
    private static shuffleArray<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    /**
     * 验证布局合理性（调试用）
     */
    public static validateLayout(layout: LayoutTemplate): {
        valid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        // 检查同层堆叠
        for (const layer of layout.layers) {
            for (let i = 0; i < layer.positions.length; i++) {
                for (let j = i + 1; j < layer.positions.length; j++) {
                    const pos1 = layer.positions[i];
                    const pos2 = layer.positions[j];

                    const distance = Math.sqrt(
                        Math.pow(pos1.x - pos2.x, 2) +
                        Math.pow(pos1.y - pos2.y, 2)
                    );

                    if (distance < this.CARD_WIDTH - 1) {
                        errors.push(
                            `层级${layer.id}存在同层堆叠: 卡片${i}与卡片${j}距离过近(${distance.toFixed(1)}px)`
                        );
                    }
                }
            }
        }

        // 检查完全遮挡
        for (let i = 1; i < layout.layers.length; i++) {
            const lowerLayer = layout.layers[i - 1];
            const upperLayer = layout.layers[i];

            for (const upperPos of upperLayer.positions) {
                for (const lowerPos of lowerLayer.positions) {
                    const distance = Math.sqrt(
                        Math.pow(upperPos.x - lowerPos.x, 2) +
                        Math.pow(upperPos.y - lowerPos.y, 2)
                    );

                    // 如果距离小于5px，认为是完全重叠（不符合规则）
                    if (distance < 5) {
                        errors.push(
                            `层级${i}的卡片(${upperPos.x.toFixed(1)}, ${upperPos.y.toFixed(1)})` +
                            `完全遮挡了层级${i-1}的卡片(${lowerPos.x.toFixed(1)}, ${lowerPos.y.toFixed(1)})`
                        );
                    }
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}
