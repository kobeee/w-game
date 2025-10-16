import { Vec3 } from 'cc';
import { LayoutTemplate, LayerConfig } from '../data/StackTypes';

/**
 * 布局模板管理器
 * 提供五种预设布局：螺旋、金字塔、环形、随机堆、波浪
 */
export class LayoutTemplates {
    private static readonly TILE_SIZE = 90; // 卡片尺寸
    private static readonly SPACING = 5; // 卡片间距
    private static readonly LAYER_Z_STEP = 10; // 层级Z轴间距

    /**
     * 获取指定ID的布局模板
     */
    public static getTemplate(id: string): LayoutTemplate | null {
        switch (id) {
            case 'spiral':
                return this.createSpiralLayout();
            case 'pyramid':
                return this.createPyramidLayout();
            case 'ring':
                return this.createRingLayout();
            case 'random':
                return this.createRandomLayout();
            case 'wave':
                return this.createWaveLayout();
            default:
                console.warn(`未知的布局模板ID: ${id}`);
                return null;
        }
    }

    /**
     * 获取所有可用的布局模板ID列表
     */
    public static getAllTemplateIds(): string[] {
        return ['spiral', 'pyramid', 'ring', 'random', 'wave'];
    }

    /**
     * 随机选择一个布局模板
     */
    public static getRandomTemplate(): LayoutTemplate {
        const ids = this.getAllTemplateIds();
        const randomId = ids[Math.floor(Math.random() * ids.length)];
        return this.getTemplate(randomId)!;
    }

    /**
     * 创建螺旋布局
     * 中心向外螺旋扩散，3层
     */
    private static createSpiralLayout(): LayoutTemplate {
        const layers: LayerConfig[] = [];
        const step = this.TILE_SIZE + this.SPACING;

        // 层级0（底层）：5×5网格（25张）
        const layer0Positions: Vec3[] = [];
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const x = (col - 2) * step;
                const y = (2 - row) * step;
                layer0Positions.push(new Vec3(x, y, 0));
            }
        }
        layers.push({
            id: 0,
            positions: layer0Positions,
            zIndex: 1
        });

        // 层级1（中层）：3×3网格（8张，去掉中心）
        const layer1Positions: Vec3[] = [];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                if (row === 1 && col === 1) continue; // 跳过中心
                const x = (col - 1) * step;
                const y = (1 - row) * step;
                layer1Positions.push(new Vec3(x, y, this.LAYER_Z_STEP));
            }
        }
        layers.push({
            id: 1,
            positions: layer1Positions,
            zIndex: 2
        });

        // 层级2（顶层）：中心1张
        layers.push({
            id: 2,
            positions: [new Vec3(0, 0, this.LAYER_Z_STEP * 2)],
            zIndex: 3
        });

        return {
            id: 'spiral',
            name: '螺旋布局',
            cardCount: 34,
            layers
        };
    }

    /**
     * 创建金字塔布局
     * 经典金字塔，4层
     */
    private static createPyramidLayout(): LayoutTemplate {
        const layers: LayerConfig[] = [];
        const step = this.TILE_SIZE + this.SPACING;

        // 层级0（底层）：4×4网格（16张）
        const layer0Positions: Vec3[] = [];
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const x = (col - 1.5) * step;
                const y = (1.5 - row) * step;
                layer0Positions.push(new Vec3(x, y, 0));
            }
        }
        layers.push({
            id: 0,
            positions: layer0Positions,
            zIndex: 1
        });

        // 层级1：3×3网格（9张）
        const layer1Positions: Vec3[] = [];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const x = (col - 1) * step;
                const y = (1 - row) * step;
                layer1Positions.push(new Vec3(x, y, this.LAYER_Z_STEP));
            }
        }
        layers.push({
            id: 1,
            positions: layer1Positions,
            zIndex: 2
        });

        // 层级2：2×2网格（4张）
        const layer2Positions: Vec3[] = [];
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 2; col++) {
                const x = (col - 0.5) * step;
                const y = (0.5 - row) * step;
                layer2Positions.push(new Vec3(x, y, this.LAYER_Z_STEP * 2));
            }
        }
        layers.push({
            id: 2,
            positions: layer2Positions,
            zIndex: 3
        });

        // 层级3（顶层）：1张
        layers.push({
            id: 3,
            positions: [new Vec3(0, 0, this.LAYER_Z_STEP * 3)],
            zIndex: 4
        });

        return {
            id: 'pyramid',
            name: '金字塔布局',
            cardCount: 30,
            layers
        };
    }

    /**
     * 创建环形布局
     * 同心圆环，3层
     */
    private static createRingLayout(): LayoutTemplate {
        const layers: LayerConfig[] = [];
        const step = this.TILE_SIZE + this.SPACING;

        // 层级0（外环）：12张
        const layer0Positions: Vec3[] = [];
        const outerRadius = step * 2;
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const x = Math.cos(angle) * outerRadius;
            const y = Math.sin(angle) * outerRadius;
            layer0Positions.push(new Vec3(x, y, 0));
        }
        layers.push({
            id: 0,
            positions: layer0Positions,
            zIndex: 1
        });

        // 层级1（中环）：8张
        const layer1Positions: Vec3[] = [];
        const middleRadius = step * 1.2;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const x = Math.cos(angle) * middleRadius;
            const y = Math.sin(angle) * middleRadius;
            layer1Positions.push(new Vec3(x, y, this.LAYER_Z_STEP));
        }
        layers.push({
            id: 1,
            positions: layer1Positions,
            zIndex: 2
        });

        // 层级2（核心）：4张
        const layer2Positions: Vec3[] = [];
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const x = Math.cos(angle) * step * 0.5;
            const y = Math.sin(angle) * step * 0.5;
            layer2Positions.push(new Vec3(x, y, this.LAYER_Z_STEP * 2));
        }
        layers.push({
            id: 2,
            positions: layer2Positions,
            zIndex: 3
        });

        return {
            id: 'ring',
            name: '环形布局',
            cardCount: 24,
            layers
        };
    }

    /**
     * 创建随机堆布局
     * 随机生成3-5层，每层5-12张不等
     */
    private static createRandomLayout(): LayoutTemplate {
        const layers: LayerConfig[] = [];
        const step = this.TILE_SIZE + this.SPACING;
        const numLayers = 3 + Math.floor(Math.random() * 3); // 3-5层

        let totalCards = 0;

        for (let layerId = 0; layerId < numLayers; layerId++) {
            const numCards = 5 + Math.floor(Math.random() * 8); // 5-12张
            const positions: Vec3[] = [];

            // 在[-2*step, 2*step]范围内随机分布
            for (let i = 0; i < numCards; i++) {
                const x = (Math.random() - 0.5) * step * 4;
                const y = (Math.random() - 0.5) * step * 4;
                const z = layerId * this.LAYER_Z_STEP;
                positions.push(new Vec3(x, y, z));
            }

            layers.push({
                id: layerId,
                positions,
                zIndex: layerId + 1
            });

            totalCards += numCards;
        }

        return {
            id: 'random',
            name: '随机堆布局',
            cardCount: totalCards,
            layers
        };
    }

    /**
     * 创建波浪布局
     * 波浪起伏，3层
     */
    private static createWaveLayout(): LayoutTemplate {
        const layers: LayerConfig[] = [];
        const step = this.TILE_SIZE + this.SPACING;

        // 层级0（底层）：4×2网格（8张）
        const layer0Positions: Vec3[] = [];
        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 2; row++) {
                const x = (col - 1.5) * step;
                const y = (0.5 - row) * step;
                layer0Positions.push(new Vec3(x, y, 0));
            }
        }
        layers.push({
            id: 0,
            positions: layer0Positions,
            zIndex: 1
        });

        // 层级1（中层）：5×2网格（10张）
        const layer1Positions: Vec3[] = [];
        for (let col = 0; col < 5; col++) {
            for (let row = 0; row < 2; row++) {
                const x = (col - 2) * step;
                const y = (0.5 - row) * step * 0.8;
                layer1Positions.push(new Vec3(x, y, this.LAYER_Z_STEP));
            }
        }
        layers.push({
            id: 1,
            positions: layer1Positions,
            zIndex: 2
        });

        // 层级2（顶层）：3×2网格（6张）
        const layer2Positions: Vec3[] = [];
        for (let col = 0; col < 3; col++) {
            for (let row = 0; row < 2; row++) {
                const x = (col - 1) * step;
                const y = (0.5 - row) * step * 0.6;
                layer2Positions.push(new Vec3(x, y, this.LAYER_Z_STEP * 2));
            }
        }
        layers.push({
            id: 2,
            positions: layer2Positions,
            zIndex: 3
        });

        return {
            id: 'wave',
            name: '波浪布局',
            cardCount: 24,
            layers
        };
    }
}
