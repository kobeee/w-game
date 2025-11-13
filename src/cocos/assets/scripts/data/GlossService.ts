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
        this.sessionNotebook = [];
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
            await this.loadingPromise;

            // 检查是否需要加载扩展词库
            if (useExtended && !this.isExtendedLoaded) {
                // 继续执行后续逻辑
            } else {
                return;
            }
        }

        // 如果核心词库已加载且不需要扩展词库，直接返回
        if (this.isCoreLoaded && !useExtended) {
            return;
        }

        // 如果核心和扩展词库都已加载，直接返回
        if (this.isCoreLoaded && this.isExtendedLoaded) {
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
        

        try {
            // 步骤1：加载核心词库（仅在未加载时）
            if (!this.isCoreLoaded) {
                const coreWordsAsset = await this.loadJsonFromBundle('words', 'words_core');
                const coreGlossAsset = await this.loadJsonFromBundle('words', 'zh_gloss');

                // ✅ 调试：检查 coreWordsAsset 的完整结构
                

                // ✅ 兼容性处理：有些情况下 JSON 数据可能直接在 asset 对象中
                let jsonData = null;
                if (coreWordsAsset) {
                    if (coreWordsAsset.json) {
                        jsonData = coreWordsAsset.json;
                        
                    } else if ((coreWordsAsset as any)._nativeAsset) {
                        jsonData = (coreWordsAsset as any)._nativeAsset;
                        
                    } else if (typeof coreWordsAsset === 'object' && (coreWordsAsset as any).by_len) {
                        jsonData = coreWordsAsset;
                        
                    }
                }

                

                if (jsonData && jsonData.by_len) {
                    this.wordBank = jsonData;
                    this.isCoreLoaded = true; // 标记已加载
                    
                } else {
                    console.error('[GlossService] ❌ 核心词库加载失败');
                    console.error('[GlossService] coreWordsAsset 为:', coreWordsAsset);
                    console.error('[GlossService] 提取的 jsonData 为:', jsonData);
                    return;
                }

                if (coreGlossAsset && coreGlossAsset.json) {
                    this.buildGlossDict(coreGlossAsset.json);
                } else {
                    console.error('[GlossService] ❌ 核心词义库加载失败');
                }

                // 额外加载：超集与自定义词义库（幂等合并）
                const supersetGlossAsset = await this.loadJsonFromBundle('words', 'zh_gloss_superset', true);
                if (supersetGlossAsset && (supersetGlossAsset as any).json) {
                    this.mergeGlossDict((supersetGlossAsset as any).json);
                }
                const customGlossAsset = await this.loadJsonFromBundle('words', 'zh_gloss_custom', true);
                if (customGlossAsset && (customGlossAsset as any).json) {
                    this.mergeGlossDict((customGlossAsset as any).json);
                }
            } else {
                
            }

            // 步骤2：如果需要且未加载，加载扩展词库（8-10字母）
            if (useExtended && !this.isExtendedLoaded) {
                const extWordsAsset = await this.loadJsonFromBundle('words', 'words_extended');
                const extGlossAsset = await this.loadJsonFromBundle('words', 'zh_gloss_extended');

                if (extWordsAsset && extWordsAsset.json) {
                    // 合并扩展词库到现有词库
                    this.mergeWordBank(extWordsAsset.json);
                    this.isExtendedLoaded = true; // 标记已加载
                } else {
                    console.warn('[GlossService] ⚠️ 扩展词库加载失败，将仅使用核心词库');
                }

                if (extGlossAsset && extGlossAsset.json) {
                    // 合并扩展词义库
                    this.mergeGlossDict(extGlossAsset.json);
                } else {
                    console.warn('[GlossService] ⚠️ 扩展词义库加载失败');
                }
            } else if (useExtended && this.isExtendedLoaded) {
                
            }

            // 步骤3：打印最终词库统计
            this.printWordBankStats();

            // 步骤4：初始化生词本（仅第一次加载时）
            if (this.isCoreLoaded && !this.isExtendedLoaded) {
                this.loadSessionNotebook();
            }

            

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
        const local = this.glossDict.get(upperWord);
        if (local && typeof local === 'string' && local.trim().length > 0) {
            console.info('[GlossService][local]', { word: upperWord, zh: local });
            return local;
        }
        // 回退：从 L2 持久化缓存读取（与 WordCache/NetworkService 保存一致）
        try {
            const raw = sys.localStorage.getItem('wgame_word_cache_v2');
            if (raw) {
                const obj = JSON.parse(raw);
                const e = obj && obj[upperWord];
                if (e && typeof e === 'object') {
                    // e: { v: boolean, de?: string, dz?: string, t: number, e: number }
                    if (e.dz && typeof e.dz === 'string' && e.e > Date.now()) {
                        console.info('[GlossService][l2-hit]', { word: upperWord, zh: e.dz });
                        return e.dz as string;
                    }
                }
            }
        } catch {
            // ignore
        }
        console.info('[GlossService][miss]', { word: upperWord });
        return null;
    }

    /**
     * 收藏单词到生词本
     * @param word 单词
     */
    star(word: string): void {
        
        const upperWord = word.toUpperCase();
        if (this.sessionNotebook.indexOf(upperWord) === -1) {
            this.sessionNotebook.push(upperWord);
            this.saveSessionNotebook();
            
        } else {
            
        }
    }

    /**
     * 获取本局生词本
     * @returns 去重的单词数组
     */
    getSessionNotebook(): string[] {
        return Array.isArray(this.sessionNotebook) ? [...this.sessionNotebook] : [];
    }

    /**
     * 清空本局生词本
     */
    clearSessionNotebook(): void {
        this.sessionNotebook = [];
        sys.localStorage.removeItem('notebook_session');
    }

    /**
     * 修复损坏的生词本数据
     */
    repairSessionNotebook(): void {
        this.sessionNotebook = this.sessionNotebook.filter(item => 
            typeof item === 'string' && item.trim() !== ''
        );
        this.saveSessionNotebook();
    }

    /**
     * 强制重置生词本（用于调试）
     */
    resetSessionNotebook(): void {
        this.sessionNotebook = [];
        sys.localStorage.removeItem('notebook_session');
        
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
    private async loadJsonFromBundle(bundleName: string, assetPath: string, optional: boolean = false): Promise<JsonAsset | null> {
        return new Promise((resolve) => {

            // ✅ 步骤1：检查Bundle是否已缓存（使用官方API）
            let bundle = assetManager.getBundle(bundleName);

            if (bundle) {

                // ✅ 步骤2：检查资源是否已完全加载
                const cachedAsset = bundle.get(assetPath, JsonAsset);

                if (cachedAsset) {
                    resolve(cachedAsset);
                    return;
                }

                

                // ✅ 步骤3：资源未缓存，动态加载
                // 尝试直接用 bundle.load 加载
                bundle.load(assetPath, JsonAsset, (err, asset) => {
                    if (err) {
                        if (optional) {
                            console.warn(`[GlossService.loadJsonFromBundle] 可选资源缺失或类型不匹配: ${bundleName}/${assetPath}`);
                            resolve(null);
                            return;
                        }
                        console.error(`[GlossService.loadJsonFromBundle] ❌ JsonAsset 加载失败，尝试 Text 格式:`, err);

                        // 降级方案：尝试用 Text 类型加载后手动解析
                        bundle.load(assetPath, TextAsset, (textErr, textAsset: TextAsset) => {
                            if (textErr) {
                                if (optional) {
                                    console.warn(`[GlossService.loadJsonFromBundle] 可选资源 Text 加载失败: ${bundleName}/${assetPath}`);
                                    resolve(null);
                                    return;
                                }
                                console.error(`[GlossService.loadJsonFromBundle] ❌ Text 加载也失败:`, textErr);
                                resolve(null);
                            } else {
                                
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
                        
                        resolve(asset);
                    }
                });

            } else {
                console.warn(`[GlossService.loadJsonFromBundle] ⚠️ Bundle '${bundleName}' 未缓存，将动态加载`);

                // ✅ 步骤4：Bundle未缓存，加载Bundle
                
                assetManager.loadBundle(bundleName, (err, newBundle) => {
                    if (err) {
                        console.error(`[GlossService.loadJsonFromBundle] ❌ Bundle加载失败:`, err);
                        resolve(null);
                        return;
                    }


                    // ✅ 步骤5：加载资源
                    newBundle.load(assetPath, JsonAsset, (loadErr, asset) => {
                        if (loadErr) {
                            if (optional) {
                                console.warn(`[GlossService.loadJsonFromBundle] 可选资源缺失: ${bundleName}/${assetPath}`);
                                resolve(null);
                            } else {
                                console.error(`[GlossService.loadJsonFromBundle] ❌ 资源加载失败: ${bundleName}/${assetPath}`, loadErr);
                                resolve(null);
                            }
                        } else {
                            
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
                    
                    // 去重 - 确保结果是数组
                    const uniqueSet = new Set(this.sessionNotebook);
                    this.sessionNotebook = Array.from(uniqueSet);
                    
                    
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
            
            
            
            // 使用自定义replacer函数处理可能的Set对象
            const jsonStr = JSON.stringify(this.sessionNotebook, (key, value) => {
                if (value instanceof Set) {
                    console.warn('[GlossService] 发现Set对象，转换为数组:', value);
                    return Array.from(value);
                }
                return value;
            });
            
            
            
            // 验证序列化结果
            if (jsonStr === '{}' || jsonStr === '[{}]') {
                console.error('[GlossService] 检测到Set对象序列化问题，强制转换');
                const safeArray = Array.isArray(this.sessionNotebook) ? this.sessionNotebook : [];
                const safeJsonStr = JSON.stringify(safeArray);
                sys.localStorage.setItem('notebook_session', safeJsonStr);
            } else {
                sys.localStorage.setItem('notebook_session', jsonStr);
            }
        } catch (error) {
            console.warn('[GlossService] 保存本局生词本失败:', error);
        }
    }
}