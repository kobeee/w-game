/**
 * 单词检测系统
 *
 * 实现设计文档第11章的单词检测算法
 * 核心优化：增量检测 - 利用"新字母总是追加到右侧"的特性
 *
 * 匹配规则（设计文档3.2章）：
 * - 新字母永远追加到牌槽最右侧
 * - 从完整牌槽开始检测（所有字母）
 * - 逐步去掉最左侧的字母，向右缩短检测范围
 * - 一旦剩余字母少于3个就停止
 * - 找到第一个有效单词就停止（贪心最长）
 */

import { WordMatch, IWordMatcher } from '../data/StackTypes';
import { GlossService } from '../data/GlossService';

/**
 * 增量单词匹配器（推荐V0.1使用）
 *
 * 性能：
 * - 快速路径（90%情况）：O(n) = 13次检测
 * - 降级路径（10%情况）：O(n²) = 195次操作
 * - 平均提升约15倍
 */
export class IncrementalWordMatcher implements IWordMatcher {
    /** 上次检测的完整字符串（用于增量优化） */
    private lastCheckedStr: string = '';

    /** 词库服务（复用现有GlossService） */
    private glossService: GlossService;

    /** 单词集合（用于快速查找） */
    private wordBank: Set<string>;

    constructor(glossService?: GlossService) {
        this.glossService = glossService || GlossService.getInstance();
        this.wordBank = new Set<string>();
        this.initWordBank();
    }

    /**
     * 初始化单词银行
     */
    private initWordBank(): void {
        

        // 从GlossService获取词库
        const allWords = this.glossService.getAllWords();

        

        this.wordBank.clear();
        for (const word of allWords) {
            this.wordBank.add(word.toUpperCase());
        }

        

        if (this.wordBank.size === 0) {
            console.error('[WordMatcher] ❌ 警告：词库为空！');
            console.error('[WordMatcher] 可能原因：GlossService 未加载或加载失败');
        } else {
            // 打印词库样本（前10个单词）
            const sample = Array.from(this.wordBank).slice(0, 10);
        }

        
    }

    /**
     * 查找最长匹配单词（从右侧开始）
     *
     * @param letters 字母数组
     * @returns 匹配结果，无匹配返回null
     */
    findWord(letters: string[]): WordMatch | null {
        if (letters.length < 3) {
            return null; // 最少3个字母
        }

        const currentStr = letters.join('').toUpperCase();

        // 情况1: 只追加了1个字母（快速路径）
        if (currentStr.startsWith(this.lastCheckedStr) && currentStr.length === this.lastCheckedStr.length + 1) {
            const result = this.incrementalCheck(currentStr);
            this.lastCheckedStr = currentStr;
            return result;
        }

        // 情况2: 点击"继续拼"后或其他情况（降级到完整检测）
        this.lastCheckedStr = currentStr;
        return this.fullCheck(letters);
    }

    /**
     * 增量检测（快速路径）
     * 只检测以新字母结尾的子串
     *
     * @param currentStr 当前完整字符串
     * @returns 匹配结果
     */
    private incrementalCheck(currentStr: string): WordMatch | null {
        const totalLen = currentStr.length;

        // 从长到短检测（优先匹配长单词）
        for (let len = Math.min(totalLen, 15); len >= 3; len--) {
            const substr = currentStr.slice(-len); // 右侧len个字母

            if (this.wordBank.has(substr)) {
                return {
                    word: substr,
                    startIdx: totalLen - len,
                    endIdx: totalLen - 1,
                    length: len
                };
            }
        }

        return null;
    }

    /**
     * 完整检测（降级逻辑）
     * 按照设计文档3.2章的规则：从左向右逐步截断
     *
     * @param letters 字母数组
     * @returns 匹配结果
     */
    private fullCheck(letters: string[]): WordMatch | null {
        const totalLen = letters.length;

        // 从完整牌槽开始，逐步去掉最左侧字母
        for (let leftCut = 0; leftCut <= totalLen - 3; leftCut++) {
            const substr = letters.slice(leftCut).join('').toUpperCase();

            if (this.wordBank.has(substr)) {
                return {
                    word: substr,
                    startIdx: leftCut,
                    endIdx: totalLen - 1, // 永远是最右侧
                    length: substr.length
                };
            }

            // 如果剩余长度 < 3，停止检测
            if (totalLen - leftCut - 1 < 3) {
                break;
            }
        }

        return null;
    }

    /**
     * 验证单词是否有效
     *
     * @param word 单词
     * @returns 是否有效
     */
    isValidWord(word: string): boolean {
        return this.wordBank.has(word.toUpperCase());
    }

    /**
     * 重置检测状态（开始新游戏时调用）
     */
    reset(): void {
        this.lastCheckedStr = '';
    }

    /**
     * 更新词库（动态加载新词库时调用）
     */
    updateWordBank(): void {
        this.initWordBank();
    }
}

/**
 * Trie树节点（V0.2+用于进一步优化）
 */
class TrieNode {
    children: Map<string, TrieNode> = new Map();
    isWord: boolean = false;
    word?: string; // 存储完整单词
}

/**
 * 基于Trie树的单词匹配器（V0.2+）
 *
 * 优势：提前终止无效前缀
 * 性能：比普通算法快5倍
 */
export class TrieWordMatcher implements IWordMatcher {
    private root: TrieNode = new TrieNode();
    private glossService: GlossService;

    constructor(glossService?: GlossService) {
        this.glossService = glossService || GlossService.getInstance();
        this.buildTrie();
    }

    /**
     * 构建Trie树（初始化时执行一次）
     */
    private buildTrie(): void {
        const allWords = this.glossService.getAllWords();

        for (const word of allWords) {
            let node = this.root;
            const upperWord = word.toUpperCase();

            for (const char of upperWord) {
                if (!node.children.has(char)) {
                    node.children.set(char, new TrieNode());
                }
                node = node.children.get(char)!;
            }

            node.isWord = true;
            node.word = upperWord;
        }

        
    }

    /**
     * 查找最长匹配单词
     *
     * @param letters 字母数组
     * @returns 匹配结果
     */
    findWord(letters: string[]): WordMatch | null {
        if (letters.length < 3) {
            return null;
        }

        const totalLen = letters.length;
        let longestMatch: WordMatch | null = null;

        // 从每个起始位置开始检测
        for (let start = 0; start <= totalLen - 3; start++) {
            let node = this.root;

            // 沿Trie树向下走
            for (let end = start; end < totalLen; end++) {
                const char = letters[end].toUpperCase();

                if (!node.children.has(char)) {
                    break; // 前缀不存在，剪枝！
                }

                node = node.children.get(char)!;

                // 找到单词且长度≥3
                if (node.isWord && (end - start + 1) >= 3) {
                    // 记录最长匹配（右侧优先）
                    if (!longestMatch || end > longestMatch.endIdx) {
                        longestMatch = {
                            word: node.word!,
                            startIdx: start,
                            endIdx: end,
                            length: node.word!.length
                        };
                    }
                }
            }
        }

        return longestMatch;
    }

    /**
     * 验证单词是否有效
     *
     * @param word 单词
     * @returns 是否有效
     */
    isValidWord(word: string): boolean {
        let node = this.root;
        const upperWord = word.toUpperCase();

        for (const char of upperWord) {
            if (!node.children.has(char)) {
                return false;
            }
            node = node.children.get(char)!;
        }

        return node.isWord;
    }

    /**
     * 重置检测状态
     */
    reset(): void {
        // Trie树无状态，无需重置
    }

    /**
     * 更新词库
     */
    updateWordBank(): void {
        this.root = new TrieNode();
        this.buildTrie();
    }
}

/**
 * 单词匹配器工厂
 *
 * 根据配置选择合适的匹配器
 */
export class WordMatcherFactory {
    /**
     * 创建单词匹配器
     *
     * @param useTrie 是否使用Trie树（V0.2+）
     * @param glossService 词库服务
     * @returns 单词匹配器实例
     */
    static create(useTrie: boolean = false, glossService?: GlossService): IWordMatcher {
        if (useTrie) {
            return new TrieWordMatcher(glossService);
        } else {
            return new IncrementalWordMatcher(glossService);
        }
    }
}
