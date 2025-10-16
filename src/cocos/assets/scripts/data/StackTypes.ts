/**
 * 字母堆叠消除玩法 - 核心数据结构定义
 *
 * 本文件定义了堆叠玩法所需的所有核心数据结构和接口
 * 遵循设计文档第9章的规范
 */

import { Vec3, Rect } from 'cc';

/**
 * 词库级别枚举
 */
export enum WordBankLevel {
    /** 核心词库（3-7字母，约2000词） */
    CORE = 'core',
    /** 扩展词库（8-10字母长单词，约2000词） */
    EXTENDED = 'extended',
    /** 全量词库（核心+扩展，约4000词） */
    FULL = 'full'
}

/**
 * 词库配置
 */
export interface WordBankConfig {
    /** 词库级别 */
    level: WordBankLevel;

    /** 词库支持的单词长度范围 */
    lengthRange: {
        min: number;
        max: number;
    };

    /** 词库描述 */
    description: string;
}

/**
 * 默认词库配置
 */
export const WORD_BANK_CONFIGS: Record<WordBankLevel, WordBankConfig> = {
    [WordBankLevel.CORE]: {
        level: WordBankLevel.CORE,
        lengthRange: { min: 3, max: 7 },
        description: '核心词库 - 适合初级和中级玩家'
    },
    [WordBankLevel.EXTENDED]: {
        level: WordBankLevel.EXTENDED,
        lengthRange: { min: 8, max: 10 },
        description: '扩展词库 - 适合高级玩家挑战'
    },
    [WordBankLevel.FULL]: {
        level: WordBankLevel.FULL,
        lengthRange: { min: 3, max: 10 },
        description: '全量词库 - 包含所有难度单词'
    }
};

/**
 * 字母卡片数据结构
 */
export interface Card {
    /** 唯一标识符 */
    id: string;

    /** 字母内容（A-Z） */
    letter: string;

    /** 层级（0=底层，数值越大越上层） */
    layer: number;

    /** 世界坐标位置 */
    position: Vec3;

    /** 碰撞检测用的矩形区域 */
    rect: Rect;

    /** 是否被上层卡片遮挡 */
    blocked: boolean;

    /** 是否已被移除 */
    removed: boolean;
}

/**
 * 单词匹配结果
 */
export interface WordMatch {
    /** 匹配到的单词 */
    word: string;

    /** 起始索引（在牌槽字母数组中） */
    startIdx: number;

    /** 结束索引（在牌槽字母数组中） */
    endIdx: number;

    /** 单词长度 */
    length: number;
}

/**
 * 牌槽队列状态
 */
export interface SlotQueueState {
    /** 当前字母序列 */
    letters: string[];

    /** 当前容量上限 */
    capacity: number;

    /** 最大容量限制 */
    maxCapacity: number;

    /** 是否处于闪烁状态 */
    blinking: boolean;

    /** 当前匹配的单词（闪烁时） */
    matchedWord?: WordMatch;
}

/**
 * 扩容规则配置
 */
export interface ExpandRule {
    /** 每消除N个单词扩容1格 */
    everyNWords: number;

    /** N字母以上的长单词额外扩容1格 */
    longWordBonus: number;

    /** 救济机制配置 */
    rescue: {
        /** 触发条件：牌槽占用率阈值（0-1） */
        trigger: number;

        /** 奖励格数 */
        reward: number;

        /** 冷却：需要消除N个单词后才能再次触发 */
        cooldown: number;
    };
}

/**
 * 默认扩容规则（设计文档13.1章）
 */
export const DEFAULT_EXPAND_RULE: ExpandRule = {
    everyNWords: 3,
    longWordBonus: 7,
    rescue: {
        trigger: 0.9,   // 90%满载
        reward: 1,
        cooldown: 5
    }
};

/**
 * 层级配置
 */
export interface LayerConfig {
    /** 层级ID */
    id: number;

    /** 卡片位置列表 */
    positions: Vec3[];

    /** 渲染层级（用于排序） */
    zIndex: number;
}

/**
 * 布局模板
 */
export interface LayoutTemplate {
    /** 模板ID（如 "spiral", "pyramid"） */
    id: string;

    /** 模板名称 */
    name: string;

    /** 卡片总数 */
    cardCount: number;

    /** 层级配置列表 */
    layers: LayerConfig[];
}

/**
 * 关卡数据
 */
export interface Level {
    /** 关卡种子（用于生成确定性关卡） */
    seed: string;

    /** 所有卡片数据 */
    cards: Card[];

    /** 布局模板 */
    layout: LayoutTemplate;

    /** 单词池（用于生成卡片字母） */
    wordPool: string[];

    /** 总卡片数 */
    totalCards: number;
}

/**
 * 操作类型
 */
export enum OperationType {
    /** 点击卡片 */
    CLICK = 'click',

    /** 消除单词 */
    CLEAR = 'clear',

    /** 继续拼词（取消闪烁） */
    CONTINUE = 'continue'
}

/**
 * 操作记录（用于防作弊和回放）
 */
export interface Operation {
    /** 时间戳（相对游戏开始时间，单位ms） */
    timestamp: number;

    /** 操作类型 */
    type: OperationType;

    /** 操作数据（卡片ID或单词） */
    data: string;
}

/**
 * 游戏结果
 */
export interface GameResult {
    /** 关卡种子 */
    seed: string;

    /** 清除率（0-1） */
    clearRate: number;

    /** 消除的单词列表 */
    wordsCleared: string[];

    /** 操作序列 */
    operations: Operation[];

    /** 操作指纹（防作弊） */
    fingerprint: string;

    /** 游戏时长（ms） */
    playDuration: number;

    /** 总分 */
    totalScore: number;
}

/**
 * 排行榜条目
 */
export interface LeaderboardEntry {
    /** 用户ID */
    userId: string;

    /** 用户昵称 */
    username: string;

    /** 头像URL */
    avatar: string;

    /** 清除率（0-1） */
    clearRate: number;

    /** 排名 */
    rank: number;

    /** 游戏时间戳 */
    playedAt: number;
}

/**
 * 堆叠棋盘管理器接口
 */
export interface IStackBoard {
    /**
     * 初始化棋盘
     * @param level 关卡数据
     */
    init(level: Level): void;

    /**
     * 获取所有可点击的卡片
     * @returns 可点击卡片列表
     */
    getClickableCards(): Card[];

    /**
     * 点击卡片
     * @param cardId 卡片ID
     */
    clickCard(cardId: string): Promise<void>;

    /**
     * 更新所有卡片的遮挡状态
     */
    updateBlockStatus(): void;

    /**
     * 销毁棋盘
     */
    destroy(): void;
}

/**
 * 单词匹配器接口
 */
export interface IWordMatcher {
    /**
     * 查找最长匹配单词（从右侧开始）
     * @param letters 字母数组
     * @returns 匹配结果，无匹配返回null
     */
    findWord(letters: string[]): WordMatch | null;

    /**
     * 验证单词是否有效
     * @param word 单词
     * @returns 是否有效
     */
    isValidWord(word: string): boolean;
}

/**
 * 牌槽管理器接口
 */
export interface ISlotQueue {
    /**
     * 添加字母到牌槽
     * @param letter 字母
     */
    addLetter(letter: string): void;

    /**
     * 移除单词
     * @param match 匹配结果
     */
    removeWord(match: WordMatch): void;

    /**
     * 获取当前字母序列
     * @returns 字母数组
     */
    getLetters(): string[];

    /**
     * 检查牌槽是否已满
     * @returns 是否已满
     */
    isFull(): boolean;

    /**
     * 扩容
     * @param amount 扩容格数
     */
    expand(amount: number): void;

    /**
     * 获取当前状态
     * @returns 牌槽状态
     */
    getState(): SlotQueueState;
}

/**
 * 关卡生成器接口
 */
export interface ILevelGenerator {
    /**
     * 生成每日关卡
     * @param seed 种子字符串
     * @returns 关卡数据
     */
    generateDailyLevel(seed: string): Level;

    /**
     * 验证关卡可解性
     * @param level 关卡数据
     * @returns 验证结果
     */
    validateLevel(level: Level): ValidationResult;
}

/**
 * 关卡验证结果
 */
export interface ValidationResult {
    /** 是否有效 */
    valid: boolean;

    /** 原因说明 */
    reason: string;

    /** 理论最高清除率（AI模拟） */
    theoreticalMax: number;
}

// ========== 网格布局系统类型定义 ==========

/**
 * 网格坐标
 */
export interface GridCoordinate {
    /** 行索引 (0-6, 从下往上) */
    row: number;

    /** 列索引 (0-6, 从左往右) */
    col: number;
}

/**
 * 允许的偏移值枚举
 */
export enum AllowedOffset {
    /** 完全对齐网格 */
    ZERO = 0,

    /** 1/4卡片偏移 (22.5px) */
    QUARTER = 22.5,

    /** 1/2卡片偏移 (45px) */
    HALF = 45,

    /** -1/4卡片偏移 */
    MINUS_QUARTER = -22.5,

    /** -1/2卡片偏移 */
    MINUS_HALF = -45
}

/**
 * 允许的偏移值数组
 */
export const ALLOWED_OFFSETS: number[] = [
    AllowedOffset.MINUS_HALF,
    AllowedOffset.MINUS_QUARTER,
    AllowedOffset.ZERO,
    AllowedOffset.QUARTER,
    AllowedOffset.HALF
];

/**
 * 卡片配置（JSON格式）
 */
export interface CardConfig {
    /** 层级 (0为最底层) */
    layer: number;

    /** 网格行索引 (0-6) */
    gridRow: number;

    /** 网格列索引 (0-6) */
    gridCol: number;

    /** 偏移量 */
    offset: {
        /** X轴偏移 (必须是 ±45, ±22.5, 0) */
        x: number;

        /** Y轴偏移 (必须是 ±45, ±22.5, 0) */
        y: number;
    };

    /** 可选：预定义字母(用于测试) */
    letter?: string;
}

/**
 * 布局配置（JSON格式）
 */
export interface LayoutConfig {
    /** 布局名称 (如 "pyramid_easy") */
    layoutName: string;

    /** 网格大小 */
    gridSize: {
        /** 网格行数 (建议7) */
        rows: number;

        /** 网格列数 (建议7) */
        cols: number;
    };

    /** 卡片配置数组 */
    cards: CardConfig[];
}

/**
 * 配置验证结果
 */
export interface LayoutValidationResult {
    /** 是否合法 */
    isValid: boolean;

    /** 错误信息列表 */
    errors: string[];
}

// ========== 网格系统常量 ==========

/** 网格单元尺寸 (px) */
export const GRID_UNIT = 90;

/** 默认网格大小 (7×7) */
export const DEFAULT_GRID_SIZE = 7;

/** 1/4卡偏移 */
export const OFFSET_QUARTER = 22.5;

/** 1/2卡偏移 */
export const OFFSET_HALF = 45;

/** 无偏移 */
export const OFFSET_ZERO = 0;

/** 层级间Z轴间隔 */
export const Z_STEP = 10;

/**
 * 布局错误码枚举
 */
export enum LayoutError {
    /** 网格索引越界 */
    INVALID_GRID_INDEX = 'E001',

    /** 偏移值不合法 */
    INVALID_OFFSET = 'E002',

    /** 层级编号错误 */
    INVALID_LAYER = 'E003',

    /** 配置文件不存在 */
    FILE_NOT_FOUND = 'E004',

    /** JSON格式错误 */
    JSON_PARSE_ERROR = 'E005',

    /** 配置验证失败 */
    VALIDATION_FAILED = 'E006'
}
