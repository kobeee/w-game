/**
 * 本地词库管理器（第1层验证）
 * 包含核心词库（500词+释义）和扩展词库（5000词）
 */

import { _decorator, JsonAsset, assetManager } from 'cc';

const { ccclass } = _decorator;

export interface DictResult {
    valid: boolean;
    definition?: string;
}

@ccclass('LocalDictionary')
export class LocalDictionary {
    private coreDict: Map<string, string> = new Map();      // 核心词库（有释义）
    private extendedDict: Set<string> = new Set();          // 扩展词库（无释义）
    private isLoaded: boolean = false;

    /**
     * 加载本地词库（异步）
     */
    async load(): Promise<void> {
        if (this.isLoaded) {
            return;
        }

        try {
            // 加载核心词库（500词+释义）
            await this.loadCoreDict();

            // 加载扩展词库（5000词）
            await this.loadExtendedDict();

            this.isLoaded = true;
        } catch (error) {
            console.error('[LocalDictionary] ❌ 词库加载失败:', error);
            throw error;
        }
    }

    /**
     * 查询单词（先查核心，再查扩展）
     */
    get(word: string): DictResult {
        const upperWord = word.toUpperCase();

        // 优先检查核心词库（有释义）
        if (this.coreDict.has(upperWord)) {
            return {
                valid: true,
                definition: this.coreDict.get(upperWord)!
            };
        }

        // 检查扩展词库（无释义）
        if (this.extendedDict.has(upperWord)) {
            return {
                valid: true,
                definition: undefined  // 扩展词库无中文释义
            };
        }

        return { valid: false };
    }

    /**
     * 加载核心词库
     * @private
     */
    private loadCoreDict(): Promise<void> {
        return new Promise((resolve) => {
            assetManager.loadBundle('words', (err, bundle) => {
                if (err) {
                    console.warn('[LocalDictionary] 词库Bundle加载失败');
                    resolve();
                    return;
                }

                const mergeJson = (asset?: JsonAsset | null) => {
                    if (asset && asset.json) {
                        for (const [word, definition] of Object.entries(asset.json)) {
                            if (typeof definition === 'string') {
                                this.coreDict.set(String(word).toUpperCase(), definition);
                            }
                        }
                    }
                };

                // 基础核心
                bundle.load('zh_gloss', JsonAsset, (loadErr, asset) => {
                    if (loadErr) {
                        console.warn('[LocalDictionary] 核心词库释义加载失败');
                    } else {
                        mergeJson(asset);
                    }

                    // 可选：superset（更大覆盖）
                    bundle.load('zh_gloss_superset', JsonAsset, (supErr, supAsset) => {
                        if (!supErr) {
                            mergeJson(supAsset);
                        }

                        // 可选：custom（项目自定义覆盖/修正）
                        bundle.load('zh_gloss_custom', JsonAsset, (cusErr, cusAsset) => {
                            if (!cusErr) {
                                mergeJson(cusAsset);
                            }
                            resolve();
                        });
                    });

                });
            });
        });
    }

    /**
     * 加载扩展词库
     * @private
     */
    private loadExtendedDict(): Promise<void> {
        return new Promise((resolve) => {
            assetManager.loadBundle('words', (err, bundle) => {
                if (err) {
                    console.warn('[LocalDictionary] 词库Bundle加载失败');
                    resolve();
                    return;
                }

                bundle.load('words_extended', JsonAsset, (wordsErr, wordsAsset) => {
                    if (wordsErr) {
                        console.warn('[LocalDictionary] 扩展词库加载失败');
                        resolve();
                        return;
                    }

                    if (wordsAsset && wordsAsset.json) {
                        const jsonData = wordsAsset.json as any;
                        if (jsonData.by_len) {
                            for (const len in jsonData.by_len) {
                                const words = jsonData.by_len[len];
                                if (Array.isArray(words)) {
                                    words.forEach((word: string) => {
                                        this.extendedDict.add(word.toUpperCase());
                                    });
                                }
                            }
                        }
                    }

                    // 加载扩展词库释义
                    bundle.load('zh_gloss_extended', JsonAsset, (glossErr, glossAsset) => {
                        if (!glossErr && glossAsset && glossAsset.json) {
                            for (const [word, definition] of Object.entries(glossAsset.json)) {
                                if (typeof definition === 'string') {
                                    if (!this.coreDict.has(word.toUpperCase())) {
                                        this.coreDict.set(word.toUpperCase(), definition);
                                    }
                                }
                            }
                        }

                        resolve();
                    });
                });
            });
        });
    }

    /**
     * 获取加载状态
     */
    isReady(): boolean {
        return this.isLoaded;
    }
}
