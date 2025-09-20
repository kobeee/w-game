import { _decorator, JsonAsset, resources, sys, assetManager } from 'cc';

const { ccclass } = _decorator;

@ccclass('GlossService')
export class GlossService {
    private wordBank: any = null;
    private glossDict: Map<string, string> = new Map();
    private sessionNotebook: string[] = [];

    constructor() {
        console.log('[GlossService] 构造函数，初始化sessionNotebook为空数组');
        this.sessionNotebook = [];
        console.log('[GlossService] 构造函数完成，sessionNotebook:', this.sessionNotebook, '类型:', typeof this.sessionNotebook, '是数组:', Array.isArray(this.sessionNotebook));
    }

    /**
     * 加载词库数据
     * @param useFull 暂时无效，目前只有一个词库文件
     */
    async load(_useFull: boolean = false): Promise<void> {
        // 目前只有基础词库，忽略_useFull参数
        const wordsFile = 'words_core';
        const glossFile = 'zh_gloss';

        try {
            // 加载词库数据（从words Bundle）
            const wordsAsset = await this.loadJsonFromBundle('words', wordsFile);
            const glossAsset = await this.loadJsonFromBundle('words', glossFile);

            if (wordsAsset && wordsAsset.json) {
                this.wordBank = wordsAsset.json;
                console.log('[GlossService] 词库加载成功:', wordsFile);
                console.log('[GlossService] 词库数据预览:', JSON.stringify(this.wordBank).substring(0, 200) + '...');
            } else {
                console.error('[GlossService] 词库加载失败或数据为空:', wordsFile);
            }

            if (glossAsset && glossAsset.json) {
                this.buildGlossDict(glossAsset.json);
                console.log('[GlossService] 词义库加载成功:', glossFile);
            } else {
                console.error('[GlossService] 词义库加载失败或数据为空:', glossFile);
            }

            // 初始化生词本
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