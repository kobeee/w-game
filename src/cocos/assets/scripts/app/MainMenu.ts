import { _decorator, Component, Node, Button, Toggle, ToggleContainer, director, sys, Sprite } from 'cc';
import { AssetLoader } from '../core/AssetLoader';
import { TimezoneSync } from '../services/TimezoneSync';
import { GameMode, GAME_MODE_CONFIGS, DEFAULT_GAME_MODE, GAME_MODE_STORAGE_KEY } from '../data/GameMode';
// 使用统一AssetLoader，完全利用Cocos Creator 3.8.7缓存机制

const { ccclass, property } = _decorator;

@ccclass('MainMenu')
export class MainMenu extends Component {
    @property(Button)
    startButton: Button = null!;

    // ========== 玩法模式选择 ==========
    @property(ToggleContainer)
    gameModeToggleContainer: ToggleContainer = null!;
    
    @property(Toggle)
    basicModeToggle: Toggle = null!;
    
    @property(Toggle)
    stackModeToggle: Toggle = null!;

    // ========== 词库设置 ==========
    @property(Toggle)
    useFullToggle: Toggle = null!;

    // ========== UI元素 ==========
    @property(Sprite)
    titleSprite: Sprite = null!; // 标题图片Sprite组件，编辑器中不设置SpriteFrame

    @property(Node)
    settingsPanel: Node = null!;

    @property(Sprite)
    backgroundSprite: Sprite = null!; // 编辑器中不设置SpriteFrame，完全动态加载

    // ========== 私有变量 ==========
    private selectedGameMode: GameMode = DEFAULT_GAME_MODE;
    private isSyncingGameMode = false;

    protected async onLoad(): Promise<void> {
        this.setupButtons();
        this.loadSettings();
        
        // 时区同步初始化（确保使用 Asia/Shanghai 时区）
        try {
            console.log('[MainMenu] 开始同步时区...');
            const syncSuccess = await TimezoneSync.syncWithServer();
            if (syncSuccess) {
                console.log('[MainMenu] ✅ 时区同步成功');
            } else {
                console.warn('[MainMenu] ⚠️ 时区同步失败，使用本地 Asia/Shanghai 时区');
            }
        } catch (error) {
            console.warn('[MainMenu] ⚠️ 时区同步出错，使用本地 Asia/Shanghai 时区:', error);
        }
        
        await this.loadRemoteAssets(); // 动态加载远程资源
        console.log('[MainMenu] 主菜单初始化完成');
    }

    protected onEnable(): void {
        this.refreshUI();
    }

    private setupButtons(): void {
        // 设置开始按钮
        if (this.startButton) {
            this.startButton.node.on(Button.EventType.CLICK, this.onStartGame, this);
        } else {
            console.warn('[MainMenu] startButton未设置');
        }

        this.ensureGameModeToggleGroup();

        // 设置玩法模式选择监听（直接监听每个Toggle）
        if (this.basicModeToggle && this.stackModeToggle) {
            this.basicModeToggle.node.on('toggle', this.onGameModeChanged, this);
            this.stackModeToggle.node.on('toggle', this.onGameModeChanged, this);
            console.log('[MainMenu] 游戏模式Toggle事件监听已设置');
            
            // 验证ToggleContainer配置
            if (this.gameModeToggleContainer) {
                console.log('[MainMenu] ToggleContainer已设置，allowSwitchOff:', this.gameModeToggleContainer.allowSwitchOff);
            }
        } else {
            console.warn('[MainMenu] 游戏模式Toggle未完全设置 - basic:', !!this.basicModeToggle, ', stack:', !!this.stackModeToggle);
        }

        // 设置词库切换开关
        if (this.useFullToggle) {
            this.useFullToggle.node.on('toggle', this.onToggleChanged, this);
        }
    }

    private loadSettings(): void {
        // 1. 加载游戏模式设置（带默认值兼容）
        let savedMode = sys.localStorage.getItem(GAME_MODE_STORAGE_KEY);
        
        // 兼容旧版本：如果没有保存过游戏模式，使用默认值
        if (!savedMode) {
            savedMode = DEFAULT_GAME_MODE;
            console.log('[MainMenu] 未找到游戏模式设置，使用默认值:', DEFAULT_GAME_MODE);
        }
        
        this.selectedGameMode = savedMode as GameMode;
        
        console.log('[MainMenu] 已加载设置 - 游戏模式:', this.selectedGameMode);
        
        // 同步 UI 状态
        this.syncGameModeUI();
        
        // 2. 从本地存储读取词库设置
        const useFull = sys.localStorage.getItem('use_full_dictionary');
        const useFullDictionary = useFull === 'true';
        
        if (this.useFullToggle) {
            this.useFullToggle.isChecked = useFullDictionary;
        }
        
        console.log('[MainMenu] 已加载设置 - 使用完整词库:', useFullDictionary);
    }

    private saveSettings(): void {
        // 保存游戏模式
        sys.localStorage.setItem(GAME_MODE_STORAGE_KEY, this.selectedGameMode);
        console.log('[MainMenu] 已保存设置 - 游戏模式:', this.selectedGameMode);
        
        // 保存词库设置
        if (this.useFullToggle) {
            const useFull = this.useFullToggle.isChecked;
            sys.localStorage.setItem('use_full_dictionary', useFull ? 'true' : 'false');
            console.log('[MainMenu] 已保存设置 - 使用完整词库:', useFull);
        }
    }

    private refreshUI(): void {
        // 刷新UI显示
        if (this.titleSprite) {
            // 可以在这里添加标题动画或其他UI效果
        }

        // 显示当前词库模式
        this.updateDictionaryModeDisplay();
    }

    /**
     * 同步游戏模式 UI 状态
     * 根据 selectedGameMode 更新 Toggle 的选中状态
     */
    private syncGameModeUI(): void {
        if (!this.basicModeToggle || !this.stackModeToggle) {
            console.warn('[MainMenu] 游戏模式 Toggle 未设置');
            return;
        }
        
        this.isSyncingGameMode = true;

        if (this.selectedGameMode === GameMode.BASIC) {
            this.basicModeToggle.isChecked = true;
            this.stackModeToggle.isChecked = false;
        } else if (this.selectedGameMode === GameMode.STACK) {
            this.basicModeToggle.isChecked = false;
            this.stackModeToggle.isChecked = true;
        } else {
            console.warn('[MainMenu] 未知的游戏模式:', this.selectedGameMode);
            this.selectedGameMode = GameMode.BASIC;
            this.basicModeToggle.isChecked = true;
            this.stackModeToggle.isChecked = false;
        }

        this.isSyncingGameMode = false;
    }

    /**
     * 游戏模式切换回调
     * @param toggle 触发事件的 Toggle 组件
     */
    private onGameModeChanged(toggle: Toggle): void {
        if (this.isSyncingGameMode) {
            return;
        }

        console.log('[MainMenu] Toggle事件触发 - name:', toggle.node.name, ', isChecked:', toggle.isChecked);
        
        // 根据 toggle 的 node.name 判断选中的模式
        const toggleName = toggle.node.name;
        let nextMode: GameMode | null = null;

        if (toggleName === 'BasicModeToggle') {
            nextMode = GameMode.BASIC;
        } else if (toggleName === 'StackModeToggle') {
            nextMode = GameMode.STACK;
        } else {
            console.warn('[MainMenu] 未知的 Toggle:', toggleName);
            return;
        }

        if (!toggle.isChecked) {
            // 禁止出现全未选状态，立即回滚到当前模式
            this.syncGameModeUI();
            return;
        }

        if (nextMode === this.selectedGameMode) {
            this.syncGameModeUI();
            return;
        }

        this.selectedGameMode = nextMode;
        this.syncGameModeUI();
        
        console.log('[MainMenu] 游戏模式切换成功:', GAME_MODE_CONFIGS[this.selectedGameMode].displayName, '场景:', GAME_MODE_CONFIGS[this.selectedGameMode].sceneName);
        
        // 实时保存设置
        this.saveSettings();
    }

    private updateDictionaryModeDisplay(): void {
        if (!this.useFullToggle) return;

        const useFull = this.useFullToggle.isChecked;
        const modeText = useFull ? '完整词库' : '基础词库';
        console.log('[MainMenu] 当前词库模式:', modeText);
        
        // 可以在这里更新UI显示当前模式
    }

    private onStartGame(): void {
        console.log('[MainMenu] 开始游戏按钮被点击');
        
        // 保存当前设置
        this.saveSettings();
        
        // 获取当前选中模式的场景名称
        const config = GAME_MODE_CONFIGS[this.selectedGameMode];
        const sceneName = config.sceneName;
        
        console.log(`[MainMenu] 跳转到场景: ${sceneName} (${config.displayName})`);
        
        // 跳转到游戏场景
        director.loadScene(sceneName, (error: any) => {
            if (error) {
                console.error(`[MainMenu] 跳转场景失败: ${sceneName}`, error);
            } else {
                console.log(`[MainMenu] 成功跳转到场景: ${sceneName}`);
            }
        });
    }

    private onToggleChanged(toggle: Toggle): void {
        console.log('[MainMenu] 词库模式切换:', toggle.isChecked ? '完整词库' : '基础词库');
        
        this.updateDictionaryModeDisplay();
        
        // 实时保存设置
        this.saveSettings();
    }

    /**
     * 重置游戏数据（可选功能）
     */
    resetGameData(): void {
        console.log('[MainMenu] 重置游戏数据');
        
        // 清除本地存储的游戏数据
        sys.localStorage.removeItem('session_notebook');
        sys.localStorage.removeItem('use_full_dictionary');
        
        // 重新加载设置
        this.loadSettings();
        this.refreshUI();
        
        console.log('[MainMenu] 游戏数据已重置');
    }

    /**
     * 显示设置面板
     */
    showSettings(): void {
        if (this.settingsPanel) {
            this.settingsPanel.active = true;
            console.log('[MainMenu] 显示设置面板');
        }
    }

    /**
     * 隐藏设置面板
     */
    hideSettings(): void {
        if (this.settingsPanel) {
            this.settingsPanel.active = false;
            console.log('[MainMenu] 隐藏设置面板');
        }
    }

    /**
     * 查看历史生词本
     */
    viewHistory(): void {
        console.log('[MainMenu] 查看历史生词本');
        
        // 跳转到结果页面查看历史
        director.loadScene('Result', (error: any) => {
            if (error) {
                console.error('[MainMenu] 跳转历史页面失败:', error);
            } else {
                console.log('[MainMenu] 成功跳转到历史页面');
            }
        });
    }

    /**
     * 获取当前词库设置
     */
    getCurrentDictionaryMode(): boolean {
        return this.useFullToggle ? this.useFullToggle.isChecked : false;
    }

    /**
     * 设置词库模式
     * @param useFull 是否使用完整词库
     */
    setDictionaryMode(useFull: boolean): void {
        if (this.useFullToggle) {
            this.useFullToggle.isChecked = useFull;
            this.updateDictionaryModeDisplay();
            this.saveSettings();
        }
    }

    protected onDestroy(): void {
        // 清理事件监听
        if (this.startButton && this.startButton.node) {
            this.startButton.node.off(Button.EventType.CLICK, this.onStartGame, this);
        }
        
        if (this.basicModeToggle && this.basicModeToggle.node) {
            this.basicModeToggle.node.off('toggle', this.onGameModeChanged, this);
        }
        
        if (this.stackModeToggle && this.stackModeToggle.node) {
            this.stackModeToggle.node.off('toggle', this.onGameModeChanged, this);
        }
        
        if (this.useFullToggle && this.useFullToggle.node) {
            this.useFullToggle.node.off('toggle', this.onToggleChanged, this);
        }
        
        console.log('[MainMenu] 主菜单组件销毁');
    }

    private ensureGameModeToggleGroup(): void {
        if (!this.gameModeToggleContainer) {
            console.warn('[MainMenu] ToggleContainer 未绑定');
            return;
        }

        const toggles: Toggle[] = [];

        if (this.basicModeToggle) {
            const basicToggle = this.basicModeToggle as unknown as { toggleGroup: ToggleContainer | null };
            if (basicToggle.toggleGroup !== this.gameModeToggleContainer) {
                basicToggle.toggleGroup = this.gameModeToggleContainer;
                toggles.push(this.basicModeToggle);
            }
        } else {
            console.warn('[MainMenu] basicModeToggle 未绑定');
        }

        if (this.stackModeToggle) {
            const stackToggle = this.stackModeToggle as unknown as { toggleGroup: ToggleContainer | null };
            if (stackToggle.toggleGroup !== this.gameModeToggleContainer) {
                stackToggle.toggleGroup = this.gameModeToggleContainer;
                toggles.push(this.stackModeToggle);
            }
        } else {
            console.warn('[MainMenu] stackModeToggle 未绑定');
        }

        if (this.gameModeToggleContainer.allowSwitchOff) {
            this.gameModeToggleContainer.allowSwitchOff = false;
        }

        if (toggles.length > 0) {
            console.log('[MainMenu] 已重新绑定游戏模式 ToggleGroup');
        }
    }

    /**
     * 加载远程Asset Bundle资源（使用统一AssetLoader，充分利用缓存）
     */
    private async loadRemoteAssets(): Promise<void> {
        try {
            console.log('[MainMenu] 开始加载远程资源...');
            const assetLoader = AssetLoader.getInstance();
            
            // 显示缓存统计信息
            const cacheStats = assetLoader.getCacheStats();
            console.log(`[MainMenu] 当前缓存统计: ${cacheStats.bundleCount}个Bundle (${cacheStats.bundleNames.join(', ')})`);
            
            // 并行加载背景和标题资源
            await Promise.all([
                // 加载背景资源 - 自动利用预加载缓存
                this.loadSpriteFromBundle('bg', 'main_scene_bg/spriteFrame', this.backgroundSprite),
                // 加载标题资源 - 自动利用预加载缓存
                this.loadSpriteFromBundle('title', 'title/spriteFrame', this.titleSprite)
            ]);
            console.log('[MainMenu] 远程资源加载完成');
        } catch (error) {
            console.error('[MainMenu] 远程资源加载失败:', error);
            // 可以加载本地备用资源或显示占位图
        }
    }

    /**
     * 使用统一AssetLoader加载Sprite资源
     */
    private async loadSpriteFromBundle(bundleName: string, assetPath: string, sprite: Sprite | null): Promise<void> {
        try {
            const assetLoader = AssetLoader.getInstance();
            
            // 检查缓存状态
            const bundleCached = assetLoader.isBundleCached(bundleName);
            const assetCached = assetLoader.isAssetCached(bundleName, assetPath);
            
            console.log(`[MainMenu] 加载${bundleName}/${assetPath} - Bundle缓存:${bundleCached}, 资源完全加载:${assetCached}`);
            
            if (assetCached) {
                console.log(`[MainMenu] 🚀 资源立即可用，无需等待加载`);
            } else {
                console.log(`[MainMenu] ⏳ 资源需要完全加载，可能有延迟`);
            }
            
            // 使用统一加载器加载资源
            const spriteFrame = await assetLoader.loadSpriteFrame(bundleName, assetPath);
            
            if (sprite) {
                sprite.spriteFrame = spriteFrame;
                console.log(`[MainMenu] ✅ 成功设置SpriteFrame: ${bundleName}/${assetPath}`);
            }
        } catch (error) {
            console.error(`[MainMenu] 加载Sprite失败: ${bundleName}/${assetPath}`, error);
            throw error;
        }
    }
}