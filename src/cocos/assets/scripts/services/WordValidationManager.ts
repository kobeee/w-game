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
import { HybridWordValidator, ValidateResult } from './HybridWordValidator';

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
     * @param word 要验证的单词
     * @returns Promise<ValidateResult>
     */
    async validateConcurrent(word: string): Promise<ValidateResult> {
        const upperWord = word.toUpperCase();

        

        // 更新待验证状态
        this.pendingValidation = {
            word: upperWord,
            state: 'validating',
            result: null
        };

        try {
            // 执行验证（与飞行动画并发）
            const result = await this.validator.validate(upperWord);

            // 验证完成，更新状态
            this.pendingValidation.state = 'completed';
            this.pendingValidation.result = result;

            

            return result;
        } catch (error) {
            console.error(`[WordValidationManager] ❌ 验证失败: ${upperWord}`, error);

            const errorResult: ValidateResult = {
                valid: false,
                source: 'offline',
                latency: 0,
                error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
            };

            this.pendingValidation.state = 'timeout';
            this.pendingValidation.result = errorResult;

            return errorResult;
        }
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
}
