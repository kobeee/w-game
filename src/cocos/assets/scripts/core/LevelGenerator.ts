import { Vec3, Rect } from 'cc';
import { SmartLayoutGenerator } from './SmartLayoutGenerator';
import { Card, Level, LayoutTemplate } from '../data/StackTypes';
import { SeededRandom } from '../util/SeededRandom';

/**
 * 关卡生成器
 * 负责生成每日挑战关卡，保证同一种子生成相同关卡
 */
export class LevelGenerator {
    /**
     * 生成每日关卡
     * @param seed 关卡种子（如"w-game-stack-2025-10-15"）
     * @param wordPool 可选的单词池（如果不提供，使用默认单词池）
     */
    public static generateDailyLevel(seed: string, wordPool?: string[]): Level {
        const rng = new SeededRandom(seed);

        // 1. 使用智能布局生成器（十字四分区遮挡规则）
        const layoutPatterns: Array<'grid' | 'circle' | 'pyramid'> = ['grid', 'circle', 'pyramid'];
        const selectedPattern = rng.choice(layoutPatterns);
        const numLayers = 2 + rng.nextInt(0, 2); // 2-3层

        

        const layout = SmartLayoutGenerator.generateSmartLayout(selectedPattern, numLayers);

        // 2. 生成目标单词池（如果未提供）
        const defaultWordPool = this.getDefaultWordPool();
        const finalWordPool = wordPool || defaultWordPool;

        // 3. 选择目标单词
        const targetWords = this.selectTargetWords(rng, finalWordPool, layout.cardCount);

        // 4. 生成字母卡片
        const cards = this.generateCards(rng, layout, targetWords);

        return {
            seed,
            cards,
            layout,
            wordPool: targetWords,
            totalCards: cards.length
        };
    }

    /**
     * 生成每日种子（基于当前日期）
     */
    public static getDailySeed(): string {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const day = today.getDate();

        // 使用兼容ES2015的方式填充前导零
        const monthStr = month < 10 ? `0${month}` : `${month}`;
        const dayStr = day < 10 ? `0${day}` : `${day}`;

        return `w-game-stack-${year}-${monthStr}-${dayStr}`;
    }

    /**
     * 选择目标单词
     * 策略：均衡字母频率，避免过多低频字母（Q/X/Z）
     */
    private static selectTargetWords(
        rng: SeededRandom,
        wordPool: string[],
        targetCardCount: number
    ): string[] {
        const selected: string[] = [];
        const letterCount: Map<string, number> = new Map();
        let totalLetters = 0;

        // 按单词频率排序（常用词优先）
        const sortedPool = rng.shuffle(wordPool);

        for (const word of sortedPool) {
            const wordLetters = word.toUpperCase().split('');
            const deviation = this.calculateLetterDeviation(
                letterCount,
                wordLetters,
                totalLetters
            );

            // 如果偏差在可接受范围内（5%），添加该单词
            if (deviation < 0.05 || totalLetters === 0) {
                selected.push(word);

                // 更新字母统计
                for (const char of wordLetters) {
                    letterCount.set(char, (letterCount.get(char) || 0) + 1);
                }
                totalLetters += wordLetters.length;

                // 达到目标卡片数量，停止
                if (totalLetters >= targetCardCount) {
                    break;
                }
            }
        }

        return selected;
    }

    /**
     * 计算添加新单词后的字母频率偏差
     */
    private static calculateLetterDeviation(
        letterCount: Map<string, number>,
        newLetters: string[],
        totalLetters: number
    ): number {
        // 英语字母自然频率（简化版，仅检查低频字母）
        const LOW_FREQ_LETTERS = new Set(['Q', 'X', 'Z', 'J']);
        const MAX_LOW_FREQ_RATIO = 0.03; // 低频字母不超过3%

        // 计算添加新单词后的低频字母占比
        const tempCount = new Map(letterCount);
        for (const char of newLetters) {
            tempCount.set(char, (tempCount.get(char) || 0) + 1);
        }

        const tempTotal = totalLetters + newLetters.length;
        let lowFreqCount = 0;
        for (const [char, count] of tempCount) {
            if (LOW_FREQ_LETTERS.has(char)) {
                lowFreqCount += count;
            }
        }

        const lowFreqRatio = lowFreqCount / tempTotal;
        return Math.max(0, lowFreqRatio - MAX_LOW_FREQ_RATIO);
    }

    /**
     * 生成卡片数据
     * 将目标单词的字母分配到布局位置
     */
    private static generateCards(
        rng: SeededRandom,
        layout: LayoutTemplate,
        targetWords: string[]
    ): Card[] {
        const cards: Card[] = [];

        // 收集所有字母
        const letters: string[] = [];
        for (const word of targetWords) {
            letters.push(...word.toUpperCase().split(''));
        }

        // 洗牌
        const shuffledLetters = rng.shuffle(letters);

        // 收集所有布局位置
        const allPositions: { layer: number; position: Vec3 }[] = [];
        for (const layerConfig of layout.layers) {
            for (const position of layerConfig.positions) {
                allPositions.push({
                    layer: layerConfig.id,
                    position: position.clone()
                });
            }
        }

        // 洗牌位置
        const shuffledPositions = rng.shuffle(allPositions);

        // 分配字母到位置
        const numCards = Math.min(shuffledLetters.length, shuffledPositions.length);

        // 卡片尺寸（与UI中的LetterTile尺寸一致）
        const CARD_WIDTH = 90;
        const CARD_HEIGHT = 90;

        for (let i = 0; i < numCards; i++) {
            const { layer, position } = shuffledPositions[i];

            // 创建矩形碰撞区域（以position为中心）
            const rect = new Rect(
                position.x - CARD_WIDTH / 2,
                position.y - CARD_HEIGHT / 2,
                CARD_WIDTH,
                CARD_HEIGHT
            );

            cards.push({
                id: `card_${i}`,
                letter: shuffledLetters[i],
                layer,
                position,
                rect,
                blocked: false,
                removed: false
            });
        }

        return cards;
    }

    

    /**
     * 获取默认单词池（用于测试）
     */
    private static getDefaultWordPool(): string[] {
        return [
            // 3字母
            'CAT', 'DOG', 'SUN', 'RUN', 'CAR', 'BAT', 'HAT', 'MAP', 'PEN', 'CUP',
            // 4字母
            'BOOK', 'DOOR', 'TREE', 'STAR', 'MOON', 'FISH', 'BIRD', 'LOVE', 'TIME', 'GAME',
            // 5字母
            'HOUSE', 'WATER', 'LIGHT', 'MUSIC', 'HAPPY', 'SUNNY', 'CLOUD', 'SMILE', 'DREAM', 'MAGIC',
            // 6字母
            'FRIEND', 'FLOWER', 'GARDEN', 'WINDOW', 'WINTER', 'SUMMER', 'SPRING', 'NATURE', 'BEAUTY', 'MOMENT',
            // 7字母
            'RAINBOW', 'MORNING', 'EVENING', 'FREEDOM', 'JOURNEY', 'WELCOME', 'AMAZING', 'PERFECT', 'BELIEVE', 'COURAGE'
        ];
    }
}
