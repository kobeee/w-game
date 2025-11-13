/**
 * 混合单词验证器（三层验证架构）
 *
 * 验证流程：
 * 1. 第1层：本地词库（核心+扩展）→ 5-10ms，命中率80%
 * 2. 第2层：Redis全局缓存（后端） → 5ms，命中率+19%（累计99%）
 * 3. 第3层：Gemini API（后端） → 200-400ms，命中率+1%（累计100%）
 */

import { _decorator } from 'cc';
import { NewWordValidator } from './NewWordValidator';
import { ValidateResult } from '../types/words';

const { ccclass } = _decorator;

@ccclass('HybridWordValidator')
export class HybridWordValidator {
    private newValidator: NewWordValidator = new NewWordValidator();
    private initialized: boolean = false;

    /**
     * 初始化验证器
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        

        try {
            await this.newValidator.initialize();
            this.initialized = true;
        } catch (error) {
            console.error('[HybridWordValidator] ❌ 初始化失败:', error);
            throw error;
        }
    }

    /**
     * 验证单词（三层验证）
     */
    async validate(word: string, signal?: AbortSignal): Promise<ValidateResult> {
        const startTime = Date.now();
        const upper = word.toUpperCase();

        if (!this.initialized) {
            console.warn('[HybridWordValidator] 验证器未初始化，尝试初始化...');
            try {
                await this.initialize();
            } catch (error) {
                return {
                    word: upper,
                    valid: false,
                    source: 'offline',
                    latency: Date.now() - startTime,
                    error: 'VALIDATOR_NOT_INITIALIZED'
                };
            }
        }

        const res = await this.newValidator.validate(upper, signal);
        res.latency = Date.now() - startTime;
        return res;
    }

    /**
     * 判断验证器是否已初始化
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}
