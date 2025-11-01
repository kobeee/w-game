/**
 * 游戏模式配置模块
 * 
 * 定义游戏支持的玩法模式及其配置信息
 * 用于主菜单的玩法选择和场景跳转
 */

/**
 * 游戏模式枚举
 */
export enum GameMode {
    /** 小试牛刀 - 5×5网格单词拼写玩法 */
    BASIC = 'basic',
    
    /** 叠叠乐 - 字母堆叠消除玩法 */
    STACK = 'stack'
}

/**
 * 游戏模式配置接口
 */
export interface GameModeConfig {
    /** 模式标识 */
    mode: GameMode;
    
    /** 显示名称 */
    displayName: string;
    
    /** 场景名称 */
    sceneName: string;
    
    /** 简短描述 */
    description: string;
    
    /** 图标路径（可选，预留） */
    iconPath?: string;
}

/**
 * 游戏模式配置表
 * 
 * 集中管理所有游戏模式的配置信息
 * 方便后续扩展新玩法
 */
export const GAME_MODE_CONFIGS: Record<GameMode, GameModeConfig> = {
    [GameMode.BASIC]: {
        mode: GameMode.BASIC,
        displayName: '小试牛刀',
        sceneName: 'Game',
        description: '基础玩法：5×5网格单词拼写'
    },
    [GameMode.STACK]: {
        mode: GameMode.STACK,
        displayName: '叠叠乐',
        sceneName: 'StackGameScene',
        description: '新玩法：字母堆叠消除'
    }
};

/**
 * 默认游戏模式
 * 
 * 用于首次启动或设置未保存时的默认值
 */
export const DEFAULT_GAME_MODE = GameMode.BASIC;

/**
 * localStorage 键名常量
 * 
 * 用于保存和读取玩家选择的游戏模式
 */
export const GAME_MODE_STORAGE_KEY = 'selected_game_mode';



