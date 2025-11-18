/**
 * 单词池选择器
 * 提供多种策略来从词库中选择合适的单词组合
 */

import { SeededRandom } from '../util/SeededRandom';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type WordPoolStrategy = 'random' | 'balanced' | 'themed' | 'progressive';

/**
 * 单词池配置
 */
export interface WordPoolConfig {
    strategy: WordPoolStrategy;
    difficulty?: Difficulty;
    count?: number;
    theme?: string;
    seed: string;
}

/**
 * 单词池选择器类
 */
export class WordPoolSelector {
    // 常用字母频率（用于平衡选择）
    private static readonly LETTER_FREQUENCY = new Map([
        ['E', 12.70], ['T', 9.06], ['A', 8.17], ['O', 7.51], ['I', 6.97],
        ['N', 6.75], ['S', 6.33], ['H', 6.09], ['R', 5.99], ['D', 4.25],
        ['L', 4.03], ['C', 2.78], ['U', 2.76], ['M', 2.41], ['W', 2.36],
        ['F', 2.23], ['G', 2.02], ['Y', 1.97], ['P', 1.93], ['B', 1.29],
        ['V', 0.98], ['K', 0.77], ['J', 0.15], ['X', 0.15], ['Q', 0.10], ['Z', 0.07]
    ]);

    // 主题单词示例（可扩展）
    private static readonly THEME_WORDS = new Map([
        ['animals', ['CAT', 'DOG', 'BIRD', 'FISH', 'LION', 'TIGER', 'BEAR', 'WOLF', 'FOX']],
        ['food', ['CAKE', 'BREAD', 'APPLE', 'ORANGE', 'PIZZA', 'PASTA', 'RICE', 'MEAT', 'FISH']],
        ['sports', ['BALL', 'GAME', 'TEAM', 'SCORE', 'WIN', 'PLAY', 'RUN', 'JUMP', 'SWIM']],
        ['nature', ['TREE', 'LEAF', 'GRASS', 'RIVER', 'LAKE', 'MOUNT', 'CLOUD', 'RAIN', 'SUN']],
    ]);

    /**
     * 选择单词池
     */
    public static selectWordPool(allWords: string[], config: WordPoolConfig): string[] {
        const count = config.count || 100;
        const rng = new SeededRandom(config.seed);

        switch (config.strategy) {
            case 'random':
                return this.randomSelection(allWords, rng, count);
            
            case 'balanced':
                return this.balancedSelection(allWords, rng, count);
            
            case 'themed':
                return this.themedSelection(allWords, rng, config.theme || 'animals', count);
            
            case 'progressive':
                return this.progressiveSelection(allWords, config.difficulty || 'medium', rng, count);
            
            default:
                return this.randomSelection(allWords, rng, count);
        }
    }

    /**
     * 随机选择策略
     */
    private static randomSelection(allWords: string[], rng: SeededRandom, count: number): string[] {
        const shuffled = rng.shuffle([...allWords]);
        return shuffled.slice(0, count);
    }

    /**
     * 平衡选择策略（考虑字母频率）
     */
    private static balancedSelection(allWords: string[], rng: SeededRandom, count: number): string[] {
        // 计算每个单词的字母频率评分
        const wordScores = allWords.map(word => {
            const score = this.calculateFrequencyScore(word);
            return { word, score };
        });

        // 按评分排序（更接近自然频率的评分更高）
        wordScores.sort((a, b) => b.score - a.score);

        // 从前50%的高分词中随机选择
        const topHalf = wordScores.slice(0, Math.floor(wordScores.length / 2));
        const selected = rng.shuffle(topHalf.map(item => item.word)).slice(0, count);

        return selected;
    }

    /**
     * 主题选择策略
     */
    private static themedSelection(allWords: string[], rng: SeededRandom, theme: string, count: number): string[] {
        const themeWords = this.THEME_WORDS.get(theme) || [];
        
        // 如果主题词不够，补充随机词
        if (themeWords.length >= count) {
            return rng.shuffle([...themeWords]).slice(0, count);
        } else {
            const remaining = count - themeWords.length;
            const otherWords = allWords.filter(word => !themeWords.includes(word));
            const randomWords = rng.shuffle(otherWords).slice(0, remaining);
            return [...themeWords, ...randomWords];
        }
    }

    /**
     * 渐进选择策略（根据难度）
     */
    private static progressiveSelection(allWords: string[], difficulty: Difficulty, rng: SeededRandom, count: number): string[] {
        let filteredWords: string[];

        switch (difficulty) {
            case 'easy':
                // 简单：主要3-4字母常用词
                filteredWords = allWords.filter(word => word.length <= 4);
                break;
            case 'medium':
                // 中等：4-6字母词
                filteredWords = allWords.filter(word => word.length >= 4 && word.length <= 6);
                break;
            case 'hard':
                // 困难：5字母以上
                filteredWords = allWords.filter(word => word.length >= 5);
                break;
        }

        // 如果过滤后的词不够，补充一些其他词
        if (filteredWords.length < count) {
            const remaining = count - filteredWords.length;
            const otherWords = allWords.filter(word => !filteredWords.includes(word));
            const additionalWords = rng.shuffle(otherWords).slice(0, remaining);
            filteredWords = [...filteredWords, ...additionalWords];
        }

        return rng.shuffle(filteredWords).slice(0, count);
    }

    /**
     * 计算单词的字母频率评分
     * 评分越高表示字母频率分布越接近自然英语
     */
    private static calculateFrequencyScore(word: string): number {
        let score = 0;
        const letters = word.toUpperCase().split('');
        
        for (const letter of letters) {
            const freq = this.LETTER_FREQUENCY.get(letter) || 0;
            score += freq;
        }

        // 平均分数
        return score / letters.length;
    }

    /**
     * 获取每日策略（可根据日期轮换）
     */
    public static getDailyStrategy(date: Date = new Date()): WordPoolConfig {
        const day = date.getDay(); // 0-6
        const strategies: WordPoolStrategy[] = ['random', 'balanced', 'themed', 'progressive'];
        const strategy = strategies[day % strategies.length];
        
        const themes = ['animals', 'food', 'sports', 'nature'];
        const theme = themes[day % themes.length];

        return {
            strategy,
            difficulty: 'medium',
            count: 100,
            theme,
            seed: `daily-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
        };
    }
}