import { _decorator, Component, Node, Button, Toggle, director, sys } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('MainMenu')
export class MainMenu extends Component {
    @property(Button)
    startButton: Button = null!;

    @property(Toggle)
    useFullToggle: Toggle = null!;

    @property(Node)
    titleNode: Node = null!;

    @property(Node)
    settingsPanel: Node = null!;

    protected onLoad(): void {
        this.setupButtons();
        this.loadSettings();
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
        if (this.titleNode) {
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
        if (this.startButton) {
            this.startButton.node.off(Button.EventType.CLICK, this.onStartGame, this);
        }
        
        if (this.useFullToggle) {
            this.useFullToggle.node.off('toggle', this.onToggleChanged, this);
        }
        
        console.log('[MainMenu] 主菜单组件销毁');
    }
}