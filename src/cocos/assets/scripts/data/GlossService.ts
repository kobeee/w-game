import { _decorator, JsonAsset, resources, sys, assetManager } from 'cc';

const { ccclass } = _decorator;

@ccclass('GlossService')
export class GlossService {
    private static instance: GlossService | null = null;

    private wordBank: any = null;
    private glossDict: Map<string, string> = new Map();
    private sessionNotebook: string[] = [];

    constructor() {
        console.log('[GlossService] 构造函数，初始化sessionNotebook为空数组');
        this.sessionNotebook = [];
        console.log('[GlossService] 构造函数完成，sessionNotebook:', this.sessionNotebook, '类型:', typeof this.sessionNotebook, '是数组:', Array.isArray(this.sessionNotebook));
    }

    /**
     * 获取单例实例
     */
    public static getInstance(): GlossService {
        if (!GlossService.instance) {
            GlossService.instance = new GlossService();
        }
        return GlossService.instance;
    }

    /**
     * 加载词库数据
     * @param useExtended 是否加载扩展词库（8-10字母长单词）
     */
    async load(useExtended: boolean = false): Promise<void> {
        try {
            // 1. 加载核心词库（3-7字母）
            const coreWordsAsset = await this.loadJsonFromBundle('words', 'words_core');
            const coreGlossAsset = await this.loadJsonFromBundle('words', 'zh_gloss');

            if (coreWordsAsset && coreWordsAsset.json) {
                this.wordBank = coreWordsAsset.json;
                console.log('[GlossService] 核心词库加载成功 (3-7字母)');
            } else {
                console.error('[GlossService] 核心词库加载失败');
                return;
            }

            if (coreGlossAsset && coreGlossAsset.json) {
                this.buildGlossDict(coreGlossAsset.json);
                console.log('[GlossService] 核心词义库加载成功');
            } else {
                console.error('[GlossService] 核心词义库加载失败');
            }

            // 2. 如果需要，加载扩展词库（8-10字母）
            if (useExtended) {
                console.log('[GlossService] 开始加载扩展词库 (8-10字母)...');
                const extWordsAsset = await this.loadJsonFromBundle('words', 'words_extended');
                const extGlossAsset = await this.loadJsonFromBundle('words', 'zh_gloss_extended');

                if (extWordsAsset && extWordsAsset.json) {
                    // 合并扩展词库到现有词库
                    this.mergeWordBank(extWordsAsset.json);
                    console.log('[GlossService] 扩展词库加载成功，已合并');
                } else {
                    console.warn('[GlossService] 扩展词库加载失败，将仅使用核心词库');
                }

                if (extGlossAsset && extGlossAsset.json) {
                    // 合并扩展词义库
                    this.mergeGlossDict(extGlossAsset.json);
                    console.log('[GlossService] 扩展词义库加载成功，已合并');
                } else {
                    console.warn('[GlossService] 扩展词义库加载失败');
                }
            }

            // 3. 打印最终词库统计
            this.printWordBankStats();

            // 4. 初始化生词本
            this.loadSessionNotebook();

        } catch (error) {
            console.error('[GlossService] 加载失败:', error);
        }
    }

    /**
     * 根据长度随机选择一个单词
     * @param len 单词长度
     * @returns 单词字符串或null
     */
    pickWord(len: number): string | null {
        if (!this.wordBank || !this.wordBank.by_len) {
            console.warn('[GlossService] 词库未加载或格式错误');
            return null;
        }

        const wordsOfLength = this.wordBank.by_len[len.toString()];
        if (!wordsOfLength || wordsOfLength.length === 0) {
            console.warn(`[GlossService] 找不到长度为${len}的单词`);
            return null;
        }

        const randomIndex = Math.floor(Math.random() * wordsOfLength.length);
        return wordsOfLength[randomIndex];
    }

    /**
     * 获取单词的中文释义
     * @param word 单词（自动转大写）
     * @returns 中文释义或null
     */
    explain(word: string): string | null {
        const upperWord = word.toUpperCase();
        return this.glossDict.get(upperWord) || null;
    }

    /**
     * 收藏单词到生词本
     * @param word 单词
     */
    star(word: string): void {
        console.log('[GlossService] star方法开始，输入单词:', word);
        console.log('[GlossService] star方法，当前sessionNotebook:', this.sessionNotebook, '类型:', typeof this.sessionNotebook, '是数组:', Array.isArray(this.sessionNotebook));
        
        const upperWord = word.toUpperCase();
        if (this.sessionNotebook.indexOf(upperWord) === -1) {
            console.log('[GlossService] 单词不存在，准备添加:', upperWord);
            this.sessionNotebook.push(upperWord);
            console.log('[GlossService] 添加后的sessionNotebook:', this.sessionNotebook, '类型:', typeof this.sessionNotebook, '是数组:', Array.isArray(this.sessionNotebook));
            this.saveSessionNotebook();
            console.log(`[GlossService] 收藏单词: ${upperWord}`);
        } else {
            console.log('[GlossService] 单词已存在，跳过:', upperWord);
        }
    }

    /**
     * 获取本局生词本
     * @returns 去重的单词数组
     */
    getSessionNotebook(): string[] {
        console.log('[GlossService] 获取生词本，当前内容:', this.sessionNotebook);
        console.log('[GlossService] 内容类型:', typeof this.sessionNotebook, Array.isArray(this.sessionNotebook));
        return Array.isArray(this.sessionNotebook) ? [...this.sessionNotebook] : [];
    }

    /**
     * 清空本局生词本
     */
    clearSessionNotebook(): void {
        this.sessionNotebook = [];
        sys.localStorage.removeItem('notebook_session');
        console.log('[GlossService] 已清空本局生词本');
    }

    /**
     * 修复损坏的生词本数据
     */
    repairSessionNotebook(): void {
        this.sessionNotebook = this.sessionNotebook.filter(item => 
            typeof item === 'string' && item.trim() !== ''
        );
        this.saveSessionNotebook();
        console.log('[GlossService] 生词本数据修复完成');
    }

    /**
     * 强制重置生词本（用于调试）
     */
    resetSessionNotebook(): void {
        console.log('[GlossService] 强制重置生词本');
        this.sessionNotebook = [];
        sys.localStorage.removeItem('notebook_session');
        console.log('[GlossService] 生词本已重置完成');
    }

    /**
     * 获取词库数据（供WordBank使用）
     */
    getWordBankData(): any {
        return this.wordBank;
    }

    /**
     * 获取所有单词列表（供WordMatcher使用）
     * @returns 所有单词的字符串数组
     */
    getAllWords(): string[] {
        if (!this.wordBank || !this.wordBank.by_len) {
            console.warn('[GlossService] 词库未加载或格式错误');
            return [];
        }

        const allWords: string[] = [];
        // 遍历所有长度的单词
        for (const len in this.wordBank.by_len) {
            if (this.wordBank.by_len.hasOwnProperty(len)) {
                const wordsOfLength = this.wordBank.by_len[len];
                if (Array.isArray(wordsOfLength)) {
                    allWords.push(...wordsOfLength);
                }
            }
        }

        console.log(`[GlossService] getAllWords返回 ${allWords.length} 个单词`);
        return allWords;
    }

    private async loadJsonFromBundle(bundleName: string, assetPath: string): Promise<JsonAsset | null> {
        return new Promise((resolve) => {
            console.log(`[GlossService] 尝试从Bundle '${bundleName}' 加载资源: ${assetPath}`);
            
            assetManager.loadBundle(bundleName, (err, bundle) => {
                if (err) {
                    console.error(`[GlossService] Bundle '${bundleName}' 加载失败:`, err);
                    resolve(null);
                    return;
                }

                bundle.load(assetPath, JsonAsset, (err, asset) => {
                    if (err) {
                        console.error(`[GlossService] 无法从Bundle '${bundleName}' 加载资源: ${assetPath}`, err);
                        resolve(null);
                    } else if (!asset) {
                        console.error(`[GlossService] 资源为空: ${bundleName}/${assetPath}`);
                        resolve(null);
                    } else {
                        console.log(`[GlossService] 成功从Bundle '${bundleName}' 加载资源: ${assetPath}`);
                        resolve(asset);
                    }
                });
            });
        });
    }

    private async loadJsonAsset(path: string): Promise<JsonAsset | null> {
        return new Promise((resolve) => {
            console.log(`[GlossService] 尝试加载资源: ${path}`);
            resources.load(path, JsonAsset, (err, asset) => {
                if (err) {
                    console.error(`[GlossService] 无法加载资源: ${path}`, err);
                    resolve(null);
                } else if (!asset) {
                    console.error(`[GlossService] 资源为空: ${path}`);
                    resolve(null);
                } else {
                    console.log(`[GlossService] 成功加载资源: ${path}`);
                    resolve(asset);
                }
            });
        });
    }

    /**
     * 合并词库数据（用于扩展词库）
     * @param additionalBank 要合并的词库数据
     */
    private mergeWordBank(additionalBank: any): void {
        if (!additionalBank || !additionalBank.by_len) {
            console.warn('[GlossService] 无效的词库数据，跳过合并');
            return;
        }

        if (!this.wordBank.by_len) {
            this.wordBank.by_len = {};
        }

        // 逐长度合并单词列表
        for (const len in additionalBank.by_len) {
            if (additionalBank.by_len.hasOwnProperty(len)) {
                const words = additionalBank.by_len[len];
                if (Array.isArray(words)) {
                    if (!this.wordBank.by_len[len]) {
                        // 该长度的单词列表不存在，直接赋值
                        this.wordBank.by_len[len] = words;
                    } else {
                        // 该长度的单词列表已存在，合并并去重
                        const existingWords = this.wordBank.by_len[len];
                        const mergedWords = [...existingWords, ...words];
                        // 去重
                        const uniqueSet = new Set(mergedWords);
                        this.wordBank.by_len[len] = Array.from(uniqueSet);
                    }
                }
            }
        }
    }

    /**
     * 合并词义字典（用于扩展词义库）
     * @param additionalGloss 要合并的词义数据
     */
    private mergeGlossDict(additionalGloss: any): void {
        if (!additionalGloss || typeof additionalGloss !== 'object') {
            console.warn('[GlossService] 无效的词义数据，跳过合并');
            return;
        }

        for (const key in additionalGloss) {
            if (additionalGloss.hasOwnProperty(key)) {
                const value = additionalGloss[key];
                if (typeof value === 'string') {
                    // 如果已存在相同的key，会被新值覆盖（可根据需要调整策略）
                    this.glossDict.set(key.toUpperCase(), value);
                }
            }
        }
    }

    /**
     * 打印词库统计信息
     */
    private printWordBankStats(): void {
        if (!this.wordBank || !this.wordBank.by_len) {
            console.warn('[GlossService] 词库为空或格式错误');
            return;
        }

        let totalWords = 0;
        const stats: string[] = [];

        for (const len in this.wordBank.by_len) {
            if (this.wordBank.by_len.hasOwnProperty(len)) {
                const words = this.wordBank.by_len[len];
                if (Array.isArray(words)) {
                    totalWords += words.length;
                    stats.push(`${len}字母: ${words.length}个`);
                }
            }
        }

        console.log(`[GlossService] 词库统计 - 总计: ${totalWords}个单词`);
        console.log(`[GlossService] 词库明细: ${stats.join(', ')}`);
        console.log(`[GlossService] 词义数量: ${this.glossDict.size}条`);
    }

    private buildGlossDict(glossData: any): void {
        this.glossDict.clear();
        if (glossData && typeof glossData === 'object') {
            for (const key in glossData) {
                if (glossData.hasOwnProperty(key)) {
                    const value = glossData[key];
                    if (typeof value === 'string') {
                        this.glossDict.set(key.toUpperCase(), value);
                    }
                }
            }
            console.log(`[GlossService] 词义字典构建完成，共${this.glossDict.size}条记录`);
        }
    }

    private loadSessionNotebook(): void {
        const stored = sys.localStorage.getItem('notebook_session');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                // 验证数据类型：必须是数组
                if (Array.isArray(parsed)) {
                    // 过滤出有效的字符串
                    this.sessionNotebook = parsed.filter(item => typeof item === 'string' && item.trim() !== '');
                    console.log('[GlossService] 过滤后的生词本:', this.sessionNotebook, '类型:', typeof this.sessionNotebook, '是数组:', Array.isArray(this.sessionNotebook));
                    
                    // 去重 - 确保结果是数组
                    const uniqueSet = new Set(this.sessionNotebook);
                    console.log('[GlossService] 去重Set对象:', uniqueSet, '类型:', typeof uniqueSet);
                    this.sessionNotebook = Array.from(uniqueSet);
                    console.log('[GlossService] 去重后的生词本:', this.sessionNotebook, '类型:', typeof this.sessionNotebook, '是数组:', Array.isArray(this.sessionNotebook));
                    console.log(`[GlossService] 加载本局生词本，共${this.sessionNotebook.length}个单词`);
                    
                    // 如果有无效数据被过滤掉，保存修复后的数据
                    if (this.sessionNotebook.length !== parsed.length) {
                        console.warn(`[GlossService] 发现并修复了${parsed.length - this.sessionNotebook.length}个无效条目`);
                        this.saveSessionNotebook();
                    }
                } else {
                    console.warn('[GlossService] 本局生词本数据类型不匹配，重置', typeof parsed, parsed);
                    this.sessionNotebook = [];
                }
            } catch (error) {
                console.warn('[GlossService] 本局生词本数据格式错误，重置', error);
                this.sessionNotebook = [];
            }
        }
    }

    private saveSessionNotebook(): void {
        try {
            // 确保sessionNotebook是数组类型
            if (!Array.isArray(this.sessionNotebook)) {
                console.warn('[GlossService] sessionNotebook不是数组，类型:', typeof this.sessionNotebook, '值:', this.sessionNotebook);
                this.sessionNotebook = [];
            }
            
            console.log('[GlossService] 准备保存生词本:', this.sessionNotebook);
            console.log('[GlossService] 保存前检查：是否为数组:', Array.isArray(this.sessionNotebook), '长度:', this.sessionNotebook.length);
            
            // 使用自定义replacer函数处理可能的Set对象
            const jsonStr = JSON.stringify(this.sessionNotebook, (key, value) => {
                if (value instanceof Set) {
                    console.warn('[GlossService] 发现Set对象，转换为数组:', value);
                    return Array.from(value);
                }
                return value;
            });
            
            console.log('[GlossService] 保存JSON字符串:', jsonStr);
            
            // 验证序列化结果
            if (jsonStr === '{}' || jsonStr === '[{}]') {
                console.error('[GlossService] 检测到Set对象序列化问题，强制转换');
                const safeArray = Array.isArray(this.sessionNotebook) ? this.sessionNotebook : [];
                const safeJsonStr = JSON.stringify(safeArray);
                sys.localStorage.setItem('notebook_session', safeJsonStr);
                console.log('[GlossService] 使用安全序列化:', safeJsonStr);
            } else {
                sys.localStorage.setItem('notebook_session', jsonStr);
            }
        } catch (error) {
            console.warn('[GlossService] 保存本局生词本失败:', error);
        }
    }
}