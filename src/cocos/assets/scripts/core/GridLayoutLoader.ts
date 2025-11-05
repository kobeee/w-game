/**
 * 网格布局加载器
 *
 * 负责加载JSON布局配置文件，验证配置合法性，并转换为游戏运行时数据
 * 遵循设计文档第5章和第8章的规范
 */

import { resources, JsonAsset, Vec2, Rect } from 'cc';
import {
    LayoutConfig,
    CardConfig,
    LayoutValidationResult,
    LayoutError,
    ALLOWED_OFFSETS,
    Level,
    Card,
    LayoutTemplate,
    LayerConfig,
    GRID_UNIT
} from '../data/StackTypes';
import { CoordinateMapper } from './CoordinateMapper';

/**
 * 网格布局加载器类
 */
export class GridLayoutLoader {
    /**
     * 加载布局配置文件
     * @param layoutPath 配置文件路径（相对于 resources/ 目录，不带扩展名）
     * @returns Promise<LayoutConfig>
     */
    public static loadLayout(layoutPath: string): Promise<LayoutConfig> {
        return new Promise((resolve, reject) => {
            resources.load(layoutPath, JsonAsset, (err, jsonAsset) => {
                if (err) {
                    console.error(`[GridLayoutLoader] 加载配置文件失败: ${layoutPath}`, err);
                    reject({
                        code: LayoutError.FILE_NOT_FOUND,
                        message: `配置文件不存在: ${layoutPath}`
                    });
                    return;
                }

                try {
                    const config = jsonAsset.json as LayoutConfig;
                    resolve(config);
                } catch (parseErr) {
                    console.error(`[GridLayoutLoader] JSON解析错误:`, parseErr);
                    reject({
                        code: LayoutError.JSON_PARSE_ERROR,
                        message: 'JSON格式错误'
                    });
                }
            });
        });
    }

    /**
     * 验证布局配置合法性
     * @param config 布局配置
     * @returns 验证结果
     */
    public static validateConfig(config: LayoutConfig): LayoutValidationResult {
        const errors: string[] = [];

        // 验证网格大小
        if (!config.gridSize || config.gridSize.rows <= 0 || config.gridSize.cols <= 0) {
            errors.push('网格大小无效');
        }

        // 验证卡片配置
        if (!config.cards || config.cards.length === 0) {
            errors.push('卡片配置为空');
        } else {
            for (let i = 0; i < config.cards.length; i++) {
                const card = config.cards[i];

                // 验证网格索引
                if (card.gridRow < 0 || card.gridRow >= config.gridSize.rows) {
                    errors.push(
                        `卡片${i}: 网格行索引越界 (${card.gridRow}, 允许范围: 0-${config.gridSize.rows - 1})`
                    );
                }

                if (card.gridCol < 0 || card.gridCol >= config.gridSize.cols) {
                    errors.push(
                        `卡片${i}: 网格列索引越界 (${card.gridCol}, 允许范围: 0-${config.gridSize.cols - 1})`
                    );
                }

                // 验证偏移值
                // ⚠️ 使用 indexOf 兼容较低的TypeScript版本（ES2015）
                if (ALLOWED_OFFSETS.indexOf(card.offset.x) === -1) {
                    errors.push(
                        `卡片${i}: X轴偏移值不合法 (${card.offset.x}, 允许值: ${ALLOWED_OFFSETS.join(', ')})`
                    );
                }

                if (ALLOWED_OFFSETS.indexOf(card.offset.y) === -1) {
                    errors.push(
                        `卡片${i}: Y轴偏移值不合法 (${card.offset.y}, 允许值: ${ALLOWED_OFFSETS.join(', ')})`
                    );
                }

                // 验证层级
                if (card.layer < 0) {
                    errors.push(`卡片${i}: 层级编号错误 (${card.layer}, 必须 >= 0)`);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * 配置转换为关卡数据
     * @param config 布局配置
     * @param words 单词池（用于随机分配字母）
     * @param seed 种子（用于确定性生成）
     * @returns Level数据
     */
    public static configToLevel(
        config: LayoutConfig,
        words: string[],
        seed: string = 'default'
    ): Level {
        // 验证配置
        const validation = this.validateConfig(config);
        if (!validation.isValid) {
            console.error('[GridLayoutLoader] 配置验证失败:', validation.errors);
            throw new Error(
                `${LayoutError.VALIDATION_FAILED}: ${validation.errors.join('; ')}`
            );
        }

        // 生成字母池（从单词池中提取所有字母）
        const letterPool = this.generateLetterPool(words);

        // 转换卡片配置为Card实例
        const cards: Card[] = config.cards.map((cardConfig, index) => {
            return this.cardConfigToCard(cardConfig, index, config.gridSize, letterPool);
        });

        // 生成布局模板
        const layout = this.createLayoutTemplate(config);

        return {
            seed: seed,
            cards: cards,
            layout: layout,
            wordPool: words,
            totalCards: cards.length
        };
    }

    /**
     * CardConfig转换为Card
     * @param cardConfig 卡片配置
     * @param index 索引
     * @param gridSize 网格大小
     * @param letterPool 字母池
     * @returns Card实例
     */
    private static cardConfigToCard(
        cardConfig: CardConfig,
        index: number,
        gridSize: { rows: number; cols: number },
        letterPool: string[]
    ): Card {
        // 计算世界坐标
        const offset = new Vec2(cardConfig.offset.x, cardConfig.offset.y);
        const position = CoordinateMapper.gridToWorld(
            cardConfig.gridRow,
            cardConfig.gridCol,
            offset,
            gridSize
        );

        // 设置Z轴坐标（根据层级）
        position.z = CoordinateMapper.calculateZIndex(cardConfig.layer);

        // 分配字母（优先使用配置中的字母，否则从字母池随机选择）
        let letter = cardConfig.letter;
        if (!letter) {
            if (!letterPool || letterPool.length === 0) {
                console.warn(`[GridLayoutLoader] 卡片${index}: 字母池为空，使用默认字母'A'`);
                letter = 'A';
            } else {
                const selectedLetter = letterPool[index % letterPool.length];
                if (!selectedLetter || typeof selectedLetter !== 'string') {
                    console.warn(`[GridLayoutLoader] 卡片${index}: 字母池中的项无效 (${selectedLetter}), 使用默认字母'A'`);
                    letter = 'A';
                } else {
                    letter = selectedLetter.toUpperCase();
                }
            }
        }

        // 计算碰撞矩形（卡片尺寸为 GRID_UNIT × GRID_UNIT）
        // ⚠️ 重要：Rect在Cocos Creator中使用左下角作为原点
        // 但position是卡片的中心点，需要转换为Rect的左下角坐标
        const halfSize = GRID_UNIT / 2;
        // Rect(x, y, width, height) 其中(x,y)是左下角
        // position是中心点，所以左下角 = 中心 - halfSize
        const rect = new Rect(
            position.x - halfSize,  // 左边界
            position.y - halfSize,  // 下边界（注意Cocos Y轴向上）
            GRID_UNIT,              // 宽度
            GRID_UNIT               // 高度
        );


        return {
            id: `card_${index}`,
            letter: letter,
            layer: cardConfig.layer,
            position: position,
            rect: rect,
            blocked: false,
            removed: false
        };
    }

    /**
     * 从单词池生成字母池
     * @param words 单词池
     * @returns 字母数组
     */
    private static generateLetterPool(words: string[]): string[] {
        const letters: string[] = [];

        // 防御性检查
        if (!words || words.length === 0) {
            console.warn('[GridLayoutLoader] 单词池为空，返回默认字母池');
            return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        }

        for (const word of words) {
            // 验证word是否为字符串
            if (typeof word !== 'string') {
                console.warn(`[GridLayoutLoader] 单词池中发现非字符串项: ${word}`);
                continue;
            }

            for (const char of word) {
                const upperChar = char.toUpperCase();
                // 仅添加字母
                if (/[A-Z]/.test(upperChar)) {
                    letters.push(upperChar);
                }
            }
        }

        // 如果处理后字母池为空，返回默认字母
        if (letters.length === 0) {
            console.warn('[GridLayoutLoader] 从单词池生成的字母池为空，返回默认字母池');
            return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        }

        return letters;
    }

    /**
     * 创建布局模板
     * @param config 布局配置
     * @returns LayoutTemplate
     */
    private static createLayoutTemplate(config: LayoutConfig): LayoutTemplate {
        // 按层级分组
        const layerMap = new Map<number, CardConfig[]>();
        for (const card of config.cards) {
            if (!layerMap.has(card.layer)) {
                layerMap.set(card.layer, []);
            }
            layerMap.get(card.layer)!.push(card);
        }

        // 生成层级配置
        const layers: LayerConfig[] = [];
        layerMap.forEach((cards, layerId) => {
            const positions = cards.map((card) => {
                const offset = new Vec2(card.offset.x, card.offset.y);
                return CoordinateMapper.gridToWorld(
                    card.gridRow,
                    card.gridCol,
                    offset,
                    config.gridSize
                );
            });

            layers.push({
                id: layerId,
                positions: positions,
                zIndex: CoordinateMapper.calculateZIndex(layerId)
            });
        });

        // 按层级ID排序
        layers.sort((a, b) => a.id - b.id);

        return {
            id: config.layoutName,
            name: config.layoutName,
            cardCount: config.cards.length,
            layers: layers
        };
    }

    /**
     * 加载并转换为Level（便捷方法）
     * @param layoutPath 布局文件路径
     * @param words 单词池
     * @param seed 种子
     * @returns Promise<Level>
     */
    public static async loadAndConvertToLevel(
        layoutPath: string,
        words: string[],
        seed: string = 'default'
    ): Promise<Level> {
        const config = await this.loadLayout(layoutPath);
        return this.configToLevel(config, words, seed);
    }

    /**
     * 调试输出：打印布局信息
     * @param config 布局配置
     */
    public static debugPrintLayout(config: LayoutConfig): void {

        // 统计各层级卡片数
        const layerStats = new Map<number, number>();
        for (const card of config.cards) {
            layerStats.set(card.layer, (layerStats.get(card.layer) || 0) + 1);
        }

        layerStats.forEach((count, layer) => {
            // no-op: disabled verbose logging in production
        });
    }
}
