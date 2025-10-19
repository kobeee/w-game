import { _decorator, JsonAsset, sys, assetManager, TextAsset } from 'cc';

const { ccclass } = _decorator;

@ccclass('GlossService')
export class GlossService {
    private static instance: GlossService | null = null;

    private wordBank: any = null;
    private glossDict: Map<string, string> = new Map();
    private sessionNotebook: string[] = [];

    // 加载状态标记
    private isCoreLoaded: boolean = false;      // 核心词库是否已加载
    private isExtendedLoaded: boolean = false;  // 扩展词库是否已加载
    private loadingPromise: Promise<void> | null = null; // 正在加载的Promise（防止并发）

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
     * 加载词库（幂等操作，多次调用不会重复加载）
     * @param useExtended 是否加载扩展词库（8-10字母）
     */
    async load(useExtended: boolean = false): Promise<void> {
        // 如果正在加载中，等待之前的加载完成
        if (this.loadingPromise) {
            console.log('[GlossService] 词库正在加载中，等待之前的加载完成...');
            await this.loadingPromise;

            // 检查是否需要加载扩展词库
            if (useExtended && !this.isExtendedLoaded) {
                console.log('[GlossService] 核心词库已加载，继续加载扩展词库...');
                // 继续执行后续逻辑
            } else {
                console.log('[GlossService] 词库已加载，跳过重复加载');
                return;
            }
        }

        // 如果核心词库已加载且不需要扩展词库，直接返回
        if (this.isCoreLoaded && !useExtended) {
            console.log('[GlossService] 核心词库已加载，跳过');
            return;
        }

        // 如果核心和扩展词库都已加载，直接返回
        if (this.isCoreLoaded && this.isExtendedLoaded) {
            console.log('[GlossService] 核心+扩展词库已全部加载，跳过');
            return;
        }

        // 创建加载Promise（防止并发加载）
        this.loadingPromise = this.performLoad(useExtended);

        try {
            await this.loadingPromise;
        } finally {
            this.loadingPromise = null;
        }
    }

    /**
     * 执行实际的加载操作
     * @private
     */
    private async performLoad(useExtended: boolean): Promise<void> {
        console.log('[GlossService] ========== 开始加载词库 ==========');
        console.log(`[GlossService] 扩展词库: ${useExtended ? '是' : '否'}`);
        console.log(`[GlossService] 当前状态: 核心=${this.isCoreLoaded}, 扩展=${this.isExtendedLoaded}`);

        try {
            // 步骤1：加载核心词库（仅在未加载时）
            if (!this.isCoreLoaded) {
                console.log('[GlossService] 步骤1：加载核心词库（3-7字母）');
                const coreWordsAsset = await this.loadJsonFromBundle('words', 'words_core');
                const coreGlossAsset = await this.loadJsonFromBundle('words', 'zh_gloss');

                // ✅ 调试：检查 coreWordsAsset 的完整结构
                console.log('[GlossService] coreWordsAsset 对象:', coreWordsAsset);
                console.log('[GlossService] coreWordsAsset 类型:', typeof coreWordsAsset);

                // ✅ 兼容性处理：有些情况下 JSON 数据可能直接在 asset 对象中
                let jsonData = null;
                if (coreWordsAsset) {
                    if (coreWordsAsset.json) {
                        jsonData = coreWordsAsset.json;
                        console.log('[GlossService] 使用 asset.json 获取数据');
                    } else if ((coreWordsAsset as any)._nativeAsset) {
                        jsonData = (coreWordsAsset as any)._nativeAsset;
                        console.log('[GlossService] 使用 asset._nativeAsset 获取数据');
                    } else if (typeof coreWordsAsset === 'object' && (coreWordsAsset as any).by_len) {
                        jsonData = coreWordsAsset;
                        console.log('[GlossService] 直接使用 asset 对象作为数据');
                    }
                }

                console.log('[GlossService] 最终提取的 jsonData:', jsonData ? Object.keys(jsonData).slice(0, 3) : 'null');

                if (jsonData && jsonData.by_len) {
                    this.wordBank = jsonData;
                    this.isCoreLoaded = true; // 标记已加载
                    console.log('[GlossService] ✅ 核心词库加载成功');
                    console.log('[GlossService] wordBank结构:', Object.keys(this.wordBank));
                    console.log('[GlossService] by_len键:', Object.keys(this.wordBank.by_len || {}));
                } else {
                    console.error('[GlossService] ❌ 核心词库加载失败');
                    console.error('[GlossService] coreWordsAsset 为:', coreWordsAsset);
                    console.error('[GlossService] 提取的 jsonData 为:', jsonData);
                    return;
                }

                if (coreGlossAsset && coreGlossAsset.json) {
                    this.buildGlossDict(coreGlossAsset.json);
                    console.log('[GlossService] ✅ 核心词义库加载成功');
                } else {
                    console.error('[GlossService] ❌ 核心词义库加载失败');
                }
            } else {
                console.log('[GlossService] ℹ️ 核心词库已存在，跳过加载');
            }

            // 步骤2：如果需要且未加载，加载扩展词库（8-10字母）
            if (useExtended && !this.isExtendedLoaded) {
                console.log('[GlossService] 步骤2：加载扩展词库 (8-10字母)...');
                const extWordsAsset = await this.loadJsonFromBundle('words', 'words_extended');
                const extGlossAsset = await this.loadJsonFromBundle('words', 'zh_gloss_extended');

                if (extWordsAsset && extWordsAsset.json) {
                    // 合并扩展词库到现有词库
                    this.mergeWordBank(extWordsAsset.json);
                    this.isExtendedLoaded = true; // 标记已加载
                    console.log('[GlossService] ✅ 扩展词库加载成功，已合并');
                } else {
                    console.warn('[GlossService] ⚠️ 扩展词库加载失败，将仅使用核心词库');
                }

                if (extGlossAsset && extGlossAsset.json) {
                    // 合并扩展词义库
                    this.mergeGlossDict(extGlossAsset.json);
                    console.log('[GlossService] ✅ 扩展词义库加载成功，已合并');
                } else {
                    console.warn('[GlossService] ⚠️ 扩展词义库加载失败');
                }
            } else if (useExtended && this.isExtendedLoaded) {
                console.log('[GlossService] ℹ️ 扩展词库已存在，跳过加载');
            }

            // 步骤3：打印最终词库统计
            this.printWordBankStats();

            // 步骤4：初始化生词本（仅第一次加载时）
            if (this.isCoreLoaded && !this.isExtendedLoaded) {
                this.loadSessionNotebook();
            }

            console.log('[GlossService] ========== 词库加载完成 ==========');
            console.log(`[GlossService] 最终状态: 核心=${this.isCoreLoaded}, 扩展=${this.isExtendedLoaded}`);

        } catch (error) {
            console.error('[GlossService] ❌ 加载失败:', error);
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

    /**
     * 重置词库加载状态（仅用于测试）
     */
    public reset(): void {
        console.warn('[GlossService] ⚠️ 重置词库加载状态（仅用于测试）');
        this.wordBank = null;
        this.glossDict.clear();
        this.isCoreLoaded = false;
        this.isExtendedLoaded = false;
        this.loadingPromise = null;
    }

    /**
     * 获取加载状态
     */
    public getLoadStatus(): { core: boolean; extended: boolean } {
        return {
            core: this.isCoreLoaded,
            extended: this.isExtendedLoaded
        };
    }

    /**
     * 从Bundle加载JSON资源（优先使用缓存）
     * 参考 AssetLoader.loadSpriteFrame() 的缓存机制
     * @param bundleName Bundle名称
     * @param assetPath 资源路径
     * @returns Promise<JsonAsset | null>
     */
    private async loadJsonFromBundle(bundleName: string, assetPath: string): Promise<JsonAsset | null> {
        return new Promise((resolve) => {
            console.log(`[GlossService.loadJsonFromBundle] >>> 开始加载 ${bundleName}/${assetPath}`);

            // ✅ 步骤1：检查Bundle是否已缓存（使用官方API）
            let bundle = assetManager.getBundle(bundleName);

            if (bundle) {
                console.log(`[GlossService.loadJsonFromBundle] ✅ Bundle '${bundleName}' 已缓存`);

                // ✅ 步骤2：检查资源是否已完全加载
                const cachedAsset = bundle.get(assetPath, JsonAsset);

                if (cachedAsset) {
                    console.log(`[GlossService.loadJsonFromBundle] ✅ 资源 '${assetPath}' 已缓存，立即返回`);
                    console.log(`[GlossService.loadJsonFromBundle] 资源数据:`, cachedAsset.json ? Object.keys(cachedAsset.json).slice(0, 3) : 'null');
                    resolve(cachedAsset);
                    return;
                }

                console.log(`[GlossService.loadJsonFromBundle] ⚠️ 资源 '${assetPath}' 未缓存，动态加载`);

                // ✅ 步骤3：资源未缓存，动态加载
                // 尝试直接用 bundle.load 加载
                bundle.load(assetPath, JsonAsset, (err, asset) => {
                    if (err) {
                        console.error(`[GlossService.loadJsonFromBundle] ❌ JsonAsset 加载失败，尝试 Text 格式:`, err);

                        // 降级方案：尝试用 Text 类型加载后手动解析
                        bundle.load(assetPath, TextAsset, (textErr, textAsset: TextAsset) => {
                            if (textErr) {
                                console.error(`[GlossService.loadJsonFromBundle] ❌ Text 加载也失败:`, textErr);
                                resolve(null);
                            } else {
                                console.log(`[GlossService.loadJsonFromBundle] ✅ Text 加载成功，手动解析JSON`);
                                try {
                                    const jsonData = JSON.parse(textAsset.text);
                                    // 创建一个伪 JsonAsset 对象
                                    const fakeJsonAsset = { json: jsonData } as any as JsonAsset;
                                    resolve(fakeJsonAsset);
                                } catch (parseErr) {
                                    console.error(`[GlossService.loadJsonFromBundle] ❌ JSON 解析失败:`, parseErr);
                                    resolve(null);
                                }
                            }
                        });
                    } else {
                        console.log(`[GlossService.loadJsonFromBundle] ✅ 动态加载成功: ${bundleName}/${assetPath}`);
                        console.log(`[GlossService.loadJsonFromBundle] 资源数据:`, asset.json ? Object.keys(asset.json).slice(0, 3) : 'null');
                        resolve(asset);
                    }
                });

            } else {
                console.error(`[GlossService.loadJsonFromBundle] ❌ Bundle '${bundleName}' 未缓存！这是严重错误`);
                console.error(`[GlossService.loadJsonFromBundle] 当前缓存的Bundle:`, assetManager['bundles'] ? Object.keys(assetManager['bundles']) : '无法获取');

                // ✅ 步骤4：Bundle未缓存，加载Bundle
                console.log(`[GlossService.loadJsonFromBundle] 尝试重新加载 Bundle '${bundleName}'...`);
                assetManager.loadBundle(bundleName, (err, newBundle) => {
                    if (err) {
                        console.error(`[GlossService.loadJsonFromBundle] ❌ Bundle加载失败:`, err);
                        resolve(null);
                        return;
                    }

                    console.log(`[GlossService.loadJsonFromBundle] ✅ Bundle加载成功`);

                    // ✅ 步骤5：加载资源
                    newBundle.load(assetPath, JsonAsset, (loadErr, asset) => {
                        if (loadErr) {
                            console.error(`[GlossService.loadJsonFromBundle] ❌ 资源加载失败: ${bundleName}/${assetPath}`, loadErr);
                            resolve(null);
                        } else {
                            console.log(`[GlossService.loadJsonFromBundle] ✅ 资源加载成功: ${bundleName}/${assetPath}`);
                            console.log(`[GlossService.loadJsonFromBundle] 资源数据:`, asset.json ? Object.keys(asset.json).slice(0, 3) : 'null');
                            resolve(asset);
                        }
                    });
                });
            }
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