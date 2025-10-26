import { _decorator, Component, Node, Button, Toggle, director, sys, Sprite } from 'cc';
import { AssetLoader } from '../core/AssetLoader';
import { TimezoneSync } from '../services/TimezoneSync';
// 使用统一AssetLoader，完全利用Cocos Creator 3.8.7缓存机制

const { ccclass, property } = _decorator;

@ccclass('MainMenu')
export class MainMenu extends Component {
    @property(Button)
    startButton: Button = null!;

    @property(Toggle)
    useFullToggle: Toggle = null!;

    @property(Sprite)
    titleSprite: Sprite = null!; // 标题图片Sprite组件，编辑器中不设置SpriteFrame

    @property(Node)
    settingsPanel: Node = null!;

    @property(Sprite)
    backgroundSprite: Sprite = null!; // 编辑器中不设置SpriteFrame，完全动态加载

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

        // 设置词库切换开关
        if (this.useFullToggle) {
            this.useFullToggle.node.on('toggle', this.onToggleChanged, this);
        }
    }

    private loadSettings(): void {
        // 从本地存储读取词库设置
        const useFull = sys.localStorage.getItem('use_full_dictionary');
        const useFullDictionary = useFull === 'true';
        
        if (this.useFullToggle) {
            this.useFullToggle.isChecked = useFullDictionary;
        }
        
        console.log('[MainMenu] 已加载设置 - 使用完整词库:', useFullDictionary);
    }

    private saveSettings(): void {
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
        
        // 跳转到游戏场景
        director.loadScene('Game', (error: any) => {
            if (error) {
                console.error('[MainMenu] 跳转游戏场景失败:', error);
            } else {
                console.log('[MainMenu] 成功跳转到游戏场景');
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
        
        if (this.useFullToggle && this.useFullToggle.node) {
            this.useFullToggle.node.off('toggle', this.onToggleChanged, this);
        }
        
        console.log('[MainMenu] 主菜单组件销毁');
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