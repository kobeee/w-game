/**
 * 牌槽队列管理器
 *
 * 实现设计文档第2.3章和第13章的牌槽机制
 * 核心功能：
 * - 字母管理（添加/移除）
 * - 动态扩容（常规+救济机制）
 * - 容量管理
 * - 状态查询
 */

import { EventTarget } from 'cc';
import {
    ISlotQueue,
    SlotQueueState,
    WordMatch,
    ExpandRule,
    DEFAULT_EXPAND_RULE
} from '../data/StackTypes';

/**
 * 牌槽事件
 */
export enum SlotQueueEvent {
    /** 字母添加 */
    LETTER_ADDED = 'letter_added',

    /** 单词移除 */
    WORD_REMOVED = 'word_removed',

    /** 容量扩展 */
    CAPACITY_EXPANDED = 'capacity_expanded',

    /** 牌槽已满 */
    SLOT_FULL = 'slot_full',

    /** 牌槽警告（接近满载） */
    SLOT_WARNING = 'slot_warning',

    /** 闪烁开始 */
    BLINK_START = 'blink_start',

    /** 闪烁取消 */
    BLINK_CANCEL = 'blink_cancel'
}

/**
 * 牌槽队列管理器
 */
export class SlotQueueManager extends EventTarget implements ISlotQueue {
    /** 当前字母序列 */
    private letters: string[] = [];

    /** 当前容量上限 */
    private capacity: number = 7;

    /** 最大容量限制 */
    private maxCapacity: number = 15;

    /** 是否处于闪烁状态 */
    private blinking: boolean = false;

    /** 当前匹配的单词 */
    private matchedWord?: WordMatch;

    /** 扩容规则 */
    private expandRule: ExpandRule;

    /** 已消除的单词数 */
    private wordsCleared: number = 0;

    /** 上次救济扩容时的消除数 */
    private lastRescueAt: number = 0;

    /** 消除前的占用率（用于判断救济） */
    private occupancyBeforeClear: number = 0;

    constructor(expandRule: ExpandRule = DEFAULT_EXPAND_RULE) {
        super();
        this.expandRule = expandRule;
    }

    /**
     * 初始化牌槽
     *
     * @param initialCapacity 初始容量
     * @param maxCapacity 最大容量
     */
    init(initialCapacity: number = 7, maxCapacity: number = 15): void {
        this.letters = [];
        this.capacity = initialCapacity;
        this.maxCapacity = maxCapacity;
        this.blinking = false;
        this.matchedWord = undefined;
        this.wordsCleared = 0;
        this.lastRescueAt = 0;
        this.occupancyBeforeClear = 0;

        console.log(`[SlotQueue] 初始化：容量 ${this.capacity}/${this.maxCapacity}`);
    }

    /**
     * 添加字母到牌槽
     *
     * @param letter 字母
     */
    addLetter(letter: string): void {
        if (this.isFull()) {
            console.warn(`[SlotQueue] 牌槽已满，无法添加字母 ${letter}`);
            this.emit(SlotQueueEvent.SLOT_FULL);
            return;
        }

        this.letters.push(letter.toUpperCase());

        console.log(`[SlotQueue] 添加字母 ${letter}，当前: [${this.letters.join(', ')}] (${this.letters.length}/${this.capacity})`);

        // 触发事件
        this.emit(SlotQueueEvent.LETTER_ADDED, letter);

        // 检查容量警告
        this.checkCapacityWarning();
    }

    /**
     * 移除单词
     *
     * @param match 匹配结果
     */
    removeWord(match: WordMatch): void {
        // 记录消除前的占用率（用于救济判定）
        this.occupancyBeforeClear = this.letters.length / this.capacity;

        // 移除匹配的字母
        this.letters.splice(match.startIdx, match.length);

        this.wordsCleared++;

        console.log(`[SlotQueue] 消除单词 ${match.word}，剩余: [${this.letters.join(', ')}] (${this.letters.length}/${this.capacity})`);

        // 触发事件
        this.emit(SlotQueueEvent.WORD_REMOVED, match.word);

        // 检查扩容
        this.checkExpand(match.word);
    }

    /**
     * 检查是否触发扩容
     *
     * @param word 刚消除的单词
     */
    private checkExpand(word: string): void {
        // 规则1: 每消除N个单词扩容1格
        if (this.wordsCleared > 0 && this.wordsCleared % this.expandRule.everyNWords === 0) {
            this.expand(1, '常规扩容');
        }

        // 规则2: 长单词额外奖励
        if (word.length >= this.expandRule.longWordBonus) {
            this.expand(1, `长单词奖励（${word}）`);
        }

        // 规则3: 救济机制
        const cooldownPassed = (this.wordsCleared - this.lastRescueAt) >= this.expandRule.rescue.cooldown;

        if (this.occupancyBeforeClear >= this.expandRule.rescue.trigger && cooldownPassed) {
            this.expand(this.expandRule.rescue.reward, '救济扩容');
            this.lastRescueAt = this.wordsCleared;
            console.log(`[SlotQueue] 触发救济扩容，占用率: ${(this.occupancyBeforeClear * 100).toFixed(1)}%`);
        }
    }

    /**
     * 扩容
     *
     * @param amount 扩容格数
     * @param reason 扩容原因
     */
    expand(amount: number, reason: string = '手动扩容'): void {
        const oldCapacity = this.capacity;
        this.capacity = Math.min(this.capacity + amount, this.maxCapacity);

        if (this.capacity > oldCapacity) {
            console.log(`[SlotQueue] 扩容: ${oldCapacity} → ${this.capacity} (${reason})`);

            // 触发事件
            this.emit(SlotQueueEvent.CAPACITY_EXPANDED, {
                oldCapacity,
                newCapacity: this.capacity,
                reason
            });
        }
    }

    /**
     * 获取当前字母序列
     *
     * @returns 字母数组（副本）
     */
    getLetters(): string[] {
        return Array.from(this.letters);
    }

    /**
     * 检查牌槽是否已满
     *
     * @returns 是否已满
     */
    isFull(): boolean {
        return this.letters.length >= this.capacity;
    }

    /**
     * 获取当前状态
     *
     * @returns 牌槽状态
     */
    getState(): SlotQueueState {
        return {
            letters: this.getLetters(),
            capacity: this.capacity,
            maxCapacity: this.maxCapacity,
            blinking: this.blinking,
            matchedWord: this.matchedWord
        };
    }

    /**
     * 开始闪烁
     *
     * @param match 匹配的单词
     */
    startBlink(match: WordMatch): void {
        this.blinking = true;
        this.matchedWord = match;

        console.log(`[SlotQueue] 开始闪烁: ${match.word}`);

        this.emit(SlotQueueEvent.BLINK_START, match);
    }

    /**
     * 取消闪烁（继续拼词）
     */
    cancelBlink(): void {
        if (!this.blinking) {
            return;
        }

        this.blinking = false;
        this.matchedWord = undefined;

        console.log(`[SlotQueue] 取消闪烁`);

        this.emit(SlotQueueEvent.BLINK_CANCEL);
    }

    /**
     * 确认消除（闪烁后）
     *
     * @returns 是否成功消除
     */
    confirmClear(): boolean {
        if (!this.blinking || !this.matchedWord) {
            console.warn(`[SlotQueue] 无法确认消除：未处于闪烁状态`);
            return false;
        }

        const match = this.matchedWord;

        // 取消闪烁状态
        this.blinking = false;
        this.matchedWord = undefined;

        // 移除单词
        this.removeWord(match);

        return true;
    }

    /**
     * 检查容量警告
     */
    private checkCapacityWarning(): void {
        const occupancy = this.letters.length / this.capacity;

        // 警告阈值：80%
        if (occupancy >= 0.8 && occupancy < 1.0) {
            this.emit(SlotQueueEvent.SLOT_WARNING, occupancy);
        }
    }

    /**
     * 获取占用率
     *
     * @returns 占用率（0-1）
     */
    getOccupancy(): number {
        return this.letters.length / this.capacity;
    }

    /**
     * 获取已消除单词数
     *
     * @returns 单词数
     */
    getWordsClearedCount(): number {
        return this.wordsCleared;
    }

    /**
     * 清空牌槽（游戏重置）
     */
    clear(): void {
        this.letters = [];
        this.blinking = false;
        this.matchedWord = undefined;
        this.wordsCleared = 0;
        this.lastRescueAt = 0;
        this.occupancyBeforeClear = 0;

        console.log(`[SlotQueue] 清空牌槽`);
    }

    /**
     * 销毁（释放资源）
     */
    destroy(): void {
        this.clear();
        this.targetOff(SlotQueueEvent.LETTER_ADDED);
        this.targetOff(SlotQueueEvent.WORD_REMOVED);
        this.targetOff(SlotQueueEvent.CAPACITY_EXPANDED);
        this.targetOff(SlotQueueEvent.SLOT_FULL);
        this.targetOff(SlotQueueEvent.SLOT_WARNING);
        this.targetOff(SlotQueueEvent.BLINK_START);
        this.targetOff(SlotQueueEvent.BLINK_CANCEL);
    }
}
