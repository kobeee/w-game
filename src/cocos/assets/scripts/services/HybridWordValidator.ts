/**
 * 混合单词验证器（三层验证架构）
 *
 * 验证流程：
 * 1. 第1层：本地词库（核心+扩展）→ 5-10ms，命中率80%
 * 2. 第2层：Redis全局缓存（后端） → 5ms，命中率+19%（累计99%）
 * 3. 第3层：Gemini API（后端） → 200-400ms，命中率+1%（累计100%）
 */

import { _decorator } from 'cc';
import { LocalDictionary } from './LocalDictionary';
import { NetworkService } from './NetworkService';

const { ccclass } = _decorator;

export interface ValidateResult {
    valid: boolean;
    definition?: string;
    source: 'local' | 'cache' | 'gemini' | 'offline';  // ✅ 更新为 'cache'（后端返回值）
    latency?: number;
    error?: string;
}

@ccclass('HybridWordValidator')
export class HybridWordValidator {
    private localDict: LocalDictionary = new LocalDictionary();
    private initialized: boolean = false;

    /**
     * 初始化验证器
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        console.log('[HybridWordValidator] 初始化验证器...');

        try {
            await this.localDict.load();
            this.initialized = true;
            console.log('[HybridWordValidator] ✅ 验证器初始化完成');
        } catch (error) {
            console.error('[HybridWordValidator] ❌ 初始化失败:', error);
            throw error;
        }
    }

    /**
     * 验证单词（三层验证）
     */
    async validate(word: string): Promise<ValidateResult> {
        const startTime = Date.now();
        word = word.toUpperCase();

        if (!this.initialized) {
            console.warn('[HybridWordValidator] 验证器未初始化，尝试初始化...');
            try {
                await this.initialize();
            } catch (error) {
                return {
                    valid: false,
                    source: 'offline',
                    latency: Date.now() - startTime,
                    error: 'VALIDATOR_NOT_INITIALIZED'
                };
            }
        }

        // ========== 第1层：本地词库 ==========
        const localResult = this.localDict.get(word);
        if (localResult.valid) {
            const latency = Date.now() - startTime;
            console.log(`[HybridWordValidator] ✅ 第1层命中: ${word} → ${localResult.definition || '(扩展词库)'} (${latency}ms)`);
            return {
                valid: true,
                definition: localResult.definition,
                source: 'local',
                latency
            };
        }

        // ========== 第2+3层：调用后端API ==========
        try {
            const apiResult = await NetworkService.validateWord(word);
            const latency = Date.now() - startTime;

            if (apiResult) {
                console.log(`[HybridWordValidator] ✅ 后端验证: ${word} → ${apiResult.valid ? '有效' : '无效'} (${apiResult.source}, ${latency}ms)`);
                return {
                    valid: apiResult.valid,
                    definition: apiResult.definition,
                    source: apiResult.source,  // ✅ 直接使用后端返回的源（'cache' 或 'gemini'）
                    latency
                };
            } else {
                console.log(`[HybridWordValidator] ❌ 后端验证: ${word} → 无效 (${latency}ms)`);
                return {
                    valid: false,
                    source: 'offline',
                    latency,
                    error: 'BACKEND_VALIDATION_FAILED'
                };
            }
        } catch (error) {
            const latency = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : 'NETWORK_ERROR';

            console.warn(
                `[HybridWordValidator] ⚠️ 后端验证失败（${errorMsg}），已降级为本地词库\n` +
                `    单词: ${word}\n` +
                `    延迟: ${latency}ms`
            );

            // ✅ 降级：网络异常时返回无效（但不是错误，只是说明该词不在本地词库中）
            return {
                valid: false,
                source: 'offline',
                latency,
                error: errorMsg
            };
        }
    }

    /**
     * 判断验证器是否已初始化
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}
