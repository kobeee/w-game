import { _decorator, JsonAsset, resources, sys } from 'cc';

const { ccclass } = _decorator;

@ccclass('GlossService')
export class GlossService {
    private wordBank: any = null;
    private glossDict: Map<string, string> = new Map();
    private sessionNotebook: string[] = [];

    /**
     * 加载词库数据
     * @param useFull 暂时无效，目前只有一个词库文件
     */
    async load(_useFull: boolean = false): Promise<void> {
        // 目前只有基础词库，忽略_useFull参数
        const wordsFile = 'words/words_core';
        const glossFile = 'words/zh_gloss';

        try {
            // 加载词库数据
            const wordsAsset = await this.loadJsonAsset(wordsFile);
            const glossAsset = await this.loadJsonAsset(glossFile);

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
        const upperWord = word.toUpperCase();
        if (this.sessionNotebook.indexOf(upperWord) === -1) {
            this.sessionNotebook.push(upperWord);
            this.saveSessionNotebook();
            console.log(`[GlossService] 收藏单词: ${upperWord}`);
        }
    }

    /**
     * 获取本局生词本
     * @returns 去重的单词数组
     */
    getSessionNotebook(): string[] {
        return [...this.sessionNotebook];
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
     * 获取词库数据（供WordBank使用）
     */
    getWordBankData(): any {
        return this.wordBank;
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
                this.sessionNotebook = JSON.parse(stored);
                // 去重
                this.sessionNotebook = [...new Set(this.sessionNotebook)];
                console.log(`[GlossService] 加载本局生词本，共${this.sessionNotebook.length}个单词`);
            } catch (error) {
                console.warn('[GlossService] 本局生词本数据格式错误，重置');
                this.sessionNotebook = [];
            }
        }
    }

    private saveSessionNotebook(): void {
        try {
            sys.localStorage.setItem('notebook_session', JSON.stringify(this.sessionNotebook));
        } catch (error) {
            console.warn('[GlossService] 保存本局生词本失败:', error);
        }
    }
}