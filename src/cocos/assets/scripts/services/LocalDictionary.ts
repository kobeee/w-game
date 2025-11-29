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
            // 检查Bundle是否已经加载，避免重复加载
            let bundle = assetManager.getBundle('bundle');
            if (bundle) {
                console.log('[LocalDictionary] Bundle已缓存，直接使用');
                this.loadCoreDictFromBundle(bundle, resolve);
                return;
            }

            assetManager.loadBundle('bundle', (err, bundle) => {
                if (err) {
                    console.warn('[LocalDictionary] Bundle加载失败');
                    resolve();
                    return;
                }
                this.loadCoreDictFromBundle(bundle, resolve);
            });
        });
    }

    /**
     * 从已加载的Bundle加载核心词库
     * @private
     */
    private loadCoreDictFromBundle(bundle: assetManager.Bundle, resolve: () => void): void {
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
        bundle.load('words/zh_gloss', JsonAsset, (loadErr, asset) => {
            if (loadErr) {
                console.warn('[LocalDictionary] 核心词库释义加载失败');
            } else {
                mergeJson(asset);
            }

            // 可选：custom（项目自定义覆盖/修正）
            bundle.load('words/zh_gloss_custom', JsonAsset, (cusErr, cusAsset) => {
                if (cusErr) {
                    console.warn('[LocalDictionary] 自定义词库加载失败');
                } else {
                    mergeJson(cusAsset);
                }
                resolve();
            });
        });
    }

    /**
     * 加载扩展词库
     * @private
     */
    private loadExtendedDict(): Promise<void> {
        return new Promise((resolve) => {
            // 检查Bundle是否已经加载，避免重复加载
            let bundle = assetManager.getBundle('bundle');
            if (bundle) {
                console.log('[LocalDictionary] Bundle已缓存，直接加载扩展词库');
                this.loadExtendedDictFromBundle(bundle, resolve);
                return;
            }

            assetManager.loadBundle('bundle', (err, bundle) => {
                if (err) {
                    console.warn('[LocalDictionary] Bundle加载失败');
                    resolve();
                    return;
                }
                this.loadExtendedDictFromBundle(bundle, resolve);
            });
        });
    }

    /**
     * 从已加载的Bundle加载扩展词库
     * @private
     */
    private loadExtendedDictFromBundle(bundle: assetManager.Bundle, resolve: () => void): void {
        bundle.load('words/words_extended', JsonAsset, (wordsErr, wordsAsset) => {
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

            // 加载扩展释义
            bundle.load('words/zh_gloss_extended', JsonAsset, (glossErr, glossAsset) => {
                if (glossErr) {
                    console.warn('[LocalDictionary] 扩展释义加载失败');
                } else {
                    const mergeJson = (asset?: JsonAsset | null) => {
                        if (asset && asset.json) {
                            for (const [word, definition] of Object.entries(asset.json)) {
                                if (typeof definition === 'string') {
                                    this.coreDict.set(String(word).toUpperCase(), definition);
                                }
                            }
                        }
                    };
                    mergeJson(glossAsset);
                }
                resolve();
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
