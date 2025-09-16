import { _decorator } from 'cc';

const { ccclass } = _decorator;

@ccclass('WordBank')
export class WordBank {
    private byLength: { [key: string]: string[] } = {};
    private allWords: Set<string> = new Set();

    /**
     * 初始化词库
     * @param coreJson words_core.json的数据结构
     */
    init(coreJson: any): void {
        this.byLength = {};
        this.allWords.clear();

        if (!coreJson || !coreJson.by_len) {
            console.error('[WordBank] 无效的词库数据结构');
            return;
        }

        // 解析按长度分类的词库
        for (const [length, words] of Object.entries(coreJson.by_len)) {
            if (Array.isArray(words)) {
                this.byLength[length] = words.map(word => word.toString().toUpperCase());
                // 同时添加到全词集合
                words.forEach(word => {
                    this.allWords.add(word.toString().toUpperCase());
                });
            }
        }

        const totalWords = this.allWords.size;
        const lengthDistribution = Object.keys(this.byLength).map(len => 
            `${len}字母:${this.byLength[len].length}词`
        ).join(', ');
        
        console.log(`[WordBank] 词库初始化完成，共${totalWords}个单词`);
        console.log(`[WordBank] 长度分布: ${lengthDistribution}`);
    }

    /**
     * 按长度随机选择单词
     * @param len 单词长度
     * @returns 随机选中的单词或null
     */
    pick(len: number): string | null {
        const wordsOfLength = this.byLength[len.toString()];
        
        if (!wordsOfLength || wordsOfLength.length === 0) {
            console.warn(`[WordBank] 找不到长度为${len}的单词`);
            return null;
        }

        const randomIndex = Math.floor(Math.random() * wordsOfLength.length);
        const selectedWord = wordsOfLength[randomIndex];
        
        console.log(`[WordBank] 选择了${len}字母单词: ${selectedWord}`);
        return selectedWord;
    }

    /**
     * 检查指定长度是否包含某个单词
     * @param len 单词长度
     * @param word 要检查的单词
     * @returns 是否包含该单词
     */
    has(len: number, word: string): boolean {
        const wordsOfLength = this.byLength[len.toString()];
        if (!wordsOfLength) {
            return false;
        }
        
        const upperWord = word.toUpperCase();
        return wordsOfLength.includes(upperWord);
    }

    /**
     * 检查单词是否在整个词库中存在
     * @param word 要检查的单词
     * @returns 是否存在
     */
    contains(word: string): boolean {
        return this.allWords.has(word.toUpperCase());
    }

    /**
     * 获取指定长度的所有单词数量
     * @param len 单词长度
     * @returns 该长度的单词数量
     */
    getCountByLength(len: number): number {
        const wordsOfLength = this.byLength[len.toString()];
        return wordsOfLength ? wordsOfLength.length : 0;
    }

    /**
     * 获取所有可用的单词长度
     * @returns 长度数组，按升序排列
     */
    getAvailableLengths(): number[] {
        return Object.keys(this.byLength)
            .map(len => parseInt(len))
            .filter(len => this.byLength[len.toString()].length > 0)
            .sort((a, b) => a - b);
    }

    /**
     * 获取指定长度的所有单词（用于调试）
     * @param len 单词长度
     * @returns 该长度的所有单词数组
     */
    getWordsByLength(len: number): string[] {
        return this.byLength[len.toString()] || [];
    }

    /**
     * 获取词库统计信息
     */
    getStats(): { totalWords: number, lengthDistribution: { [key: number]: number } } {
        const lengthDistribution: { [key: number]: number } = {};
        
        for (const [length, words] of Object.entries(this.byLength)) {
            lengthDistribution[parseInt(length)] = words.length;
        }

        return {
            totalWords: this.allWords.size,
            lengthDistribution
        };
    }
}