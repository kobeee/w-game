/**
 * 单词验证管理器
 * 处理飞行动画与单词验证的并发执行
 *
 * 核心流程：
 * 1. 卡片点击 → 立即开始飞行动画（0.4s）
 * 2. 并发执行单词验证（三层验证）
 * 3. 卡片落地 → 检查验证状态
 *    - 如果已完成：立即触发闪烁
 *    - 如果未完成：显示loading，等待结果
 */

import { _decorator } from 'cc';
import { HybridWordValidator } from './HybridWordValidator';
import { ValidateResult } from '../types/words';
import { REMOTE_MERGE_WINDOW_MS } from '../config/word-validate';

const { ccclass } = _decorator;

export interface PendingValidation {
    word: string;
    state: 'validating' | 'completed' | 'timeout';
    result: ValidateResult | null;
}

@ccclass('WordValidationManager')
export class WordValidationManager {
    private validator: HybridWordValidator = new HybridWordValidator();
    private pendingValidation: PendingValidation = {
        word: '',
        state: 'validating',
        result: null
    };
    private isInitialized: boolean = false;
    private onFinishedCallback: ((word: string, result: ValidateResult) => void) | null = null;
    /**
     * 将原先的"单一防抖计时器"改为"按单词分组"的计时器
     * 这样在一次批量后缀校验（如 DARE/ARE/RE...）时，互不干扰，不会相互取消
     */
    private timersByWord: Map<string, any> = new Map();
    private pendingsByWord: Map<string, PendingValidation> = new Map();
    private currentAbort: AbortController | null = null;

    /**
     * 单飞去重：记录同一单词正在进行的 Promise
     * 若同一单词的验证正在进行中，后续请求复用该 Promise，不发新请求
     */
    private validatingPromises: Map<string, Promise<ValidateResult>> = new Map();

    /**
     * 初始化验证管理器
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        

        try {
            await this.validator.initialize();
            this.isInitialized = true;
        } catch (error) {
            console.error('[WordValidationManager] ❌ 初始化失败:', error);
            throw error;
        }
    }

    /**
     * 并发执行单词验证（与飞行动画并发）
     * 返回Promise，在验证完成时resolve
     *
     * 核心特性：
     * 1. 单飞去重：同一单词的验证正在进行中，后续请求复用该 Promise
     * 2. 防抖合并：同一单词在短时间内的多次请求，仅发起一次网络请求
     * 3. 缓存优先：命中客户端缓存直接返回，无需网络
     *
     * @param word 要验证的单词
     * @returns Promise<ValidateResult>
     */
    async validateConcurrent(word: string): Promise<ValidateResult> {
        const upperWord = word.toUpperCase();

        // 记录"最近一次提交的单词"（维持对外API兼容）
        this.pendingValidation = {
            word: upperWord,
            state: 'validating',
            result: null
        };

        // === 单飞去重：检查是否有同一单词的验证正在进行 ===
        const existingPromise = this.validatingPromises.get(upperWord);
        if (existingPromise) {
            return existingPromise;
        }

        // 清理同一个单词的上一计时器（不影响其他单词）
        const prevTimer = this.timersByWord.get(upperWord);
        if (prevTimer) {
            clearTimeout(prevTimer);
            this.timersByWord.delete(upperWord);
        }

        // 独立维护每个单词的pending状态
        this.pendingsByWord.set(upperWord, {
            word: upperWord,
            state: 'validating',
            result: null
        });

        // 创建新的验证 Promise，存入 validatingPromises
        const validationPromise = new Promise<ValidateResult>((resolve) => {
            const timer = setTimeout(async () => {
                try {
                    // 在途取消：开始新一轮前取消旧请求
                    if (this.currentAbort) {
                        try { this.currentAbort.abort(); } catch { /* ignore */ }
                    }
                    this.currentAbort = new AbortController();
                    const result = await this.validator.validate(upperWord, this.currentAbort.signal);
                    // 更新该单词的pending状态
                    const pending = this.pendingsByWord.get(upperWord);
                    if (pending) {
                        pending.state = 'completed';
                        pending.result = result;
                        this.pendingsByWord.set(upperWord, pending);
                    }
                    if (this.onFinishedCallback) {
                        try {
                            this.onFinishedCallback(upperWord, result);
                        } catch (_) { /* ignore callback errors */ }
                    }
                    resolve(result);
                } catch (error) {
                    console.error(`[WordValidationManager] ❌ 验证失败: ${upperWord}`, error);
                    const errorResult: ValidateResult = {
                        word: upperWord,
                        valid: false,
                        source: 'offline',
                        latency: 0,
                        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
                    };
                    const pending = this.pendingsByWord.get(upperWord);
                    if (pending) {
                        pending.state = 'timeout';
                        pending.result = errorResult;
                        this.pendingsByWord.set(upperWord, pending);
                    }
                    if (this.onFinishedCallback) {
                        try {
                            this.onFinishedCallback(upperWord, errorResult);
                        } catch (_) { /* ignore callback errors */ }
                    }
                    resolve(errorResult);
                } finally {
                    // 清理该单词的计时器和单飞Promise
                    this.timersByWord.delete(upperWord);
                    this.validatingPromises.delete(upperWord);
                }
            }, REMOTE_MERGE_WINDOW_MS); // 远端合并窗口（仅对相同单词生效）

            this.timersByWord.set(upperWord, timer);
        });

        // 将该 Promise 存入单飞去重表，供后续相同单词复用
        this.validatingPromises.set(upperWord, validationPromise);

        return validationPromise;
    }

    /**
     * 获取当前待验证的单词信息
     */
    getPendingValidation(): PendingValidation {
        return this.pendingValidation;
    }

    /**
     * 检查验证是否已完成
     */
    isValidationCompleted(): boolean {
        return this.pendingValidation.state === 'completed';
    }

    /**
     * 获取验证结果（仅在验证完成时返回）
     */
    getValidationResult(): ValidateResult | null {
        return this.isValidationCompleted() ? this.pendingValidation.result : null;
    }

    /**
     * 清除待验证状态
     */
    clearPendingValidation(): void {
        // 清理所有计时器与pending
        this.timersByWord.forEach((t) => clearTimeout(t));
        this.timersByWord.clear();
        this.pendingsByWord.clear();
        this.validatingPromises.clear(); // 清理单飞去重表

        // 保持对外字段为初始状态
        this.pendingValidation = {
            word: '',
            state: 'validating',
            result: null
        };
    }

    /**
     * 获取初始化状态
     */
    isReady(): boolean {
        return this.isInitialized && this.validator.isInitialized();
    }

    /**
     * 订阅验证完成事件
     */
    setOnValidationFinished(cb: (word: string, result: ValidateResult) => void): void {
        this.onFinishedCallback = cb;
    }
}
