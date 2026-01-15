import { _decorator, Component, Node, Button, Toggle, ToggleContainer, director, sys, Sprite, Label, Color, UITransform, tween, Vec3, UIOpacity, view, Widget, BlockInputEvents, Graphics, find } from 'cc';
import { AssetLoader } from '../core/AssetLoader';
import { TimezoneSync } from '../services/TimezoneSync';
import { GameMode, GAME_MODE_CONFIGS, DEFAULT_GAME_MODE, GAME_MODE_STORAGE_KEY } from '../data/GameMode';
import { PreloadManager } from './PreloadManager';
import { AudioMgr } from '../util/AudioMgr';
// 尽早导入 AbortController polyfill，确保微信小游戏兼容性
import '../util/AbortControllerPolyfill';
// 使用统一AssetLoader，完全利用Cocos Creator 3.8.7缓存机制

// 微信小游戏类型声明
declare const wx: any;
declare const gc: () => void;

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

    // ========== 游戏设置 ==========
    @property(Toggle)
    useFullToggle: Toggle = null!;

    @property(Toggle)
    soundToggle: Toggle = null!;

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
    private audioMgr: AudioMgr = AudioMgr.getInstance();
    private loadingOverlay: Node = null;  // 自定义 loading overlay
    private loadingDots: string = '';     // loading 动画点点
    private loadingTimer: number = null;  // loading 动画定时器

    protected async onLoad(): Promise<void> {
        // 🔍 监控微信小游戏内存状态
        this.setupMemoryMonitoring();
        
        this.setupButtons();
        this.loadSettings();
        
        // 时区同步初始化（确保使用 Asia/Shanghai 时区）
        try {
            const syncSuccess = await TimezoneSync.syncWithServer();
            if (!syncSuccess) {
                console.warn('[MainMenu] ⚠️ 时区同步失败，使用本地 Asia/Shanghai 时区');
            }
        } catch (error) {
            console.warn('[MainMenu] ⚠️ 时区同步出错，使用本地 Asia/Shanghai 时区:', error);
        }
        
        await this.loadRemoteAssets(); // 动态加载远程资源
        
        // 初始化音频管理器
        console.log('[MainMenu] 初始化音频管理器');
        this.audioMgr.init();
        
        // 强制重新加载设置，确保场景切换后保持用户设置
        this.audioMgr.forceReloadSettings();
        
        const isSoundEnabled = this.audioMgr.getEnabled();
        
        // 如果音效开启，延迟一秒播放背景音乐
        if (isSoundEnabled) {
            this.scheduleOnce(() => {
                console.log('[MainMenu] 开始播放背景音乐');
                this.audioMgr.playBackgroundMusic();
            }, 1.0);
        }
        
        // 🚀 启动主菜单后台资源加载
        this.startBackgroundResourceLoading();
        
    }

    /**
     * 🔍 设置微信小游戏内存监控
     */
    private setupMemoryMonitoring(): void {
        if (typeof wx !== 'undefined') {
            // 监听内存警告
            wx.onMemoryWarning((res) => {
                console.warn('[MainMenu] ⚠️ 收到内存警告:', res);
                console.warn('[MainMenu] 当前可用内存较少，可能影响资源加载');
                
                // 可以在这里清理缓存或降低资源质量
                this.handleMemoryWarning();
            });

            // 监听性能状态（兼容性检查）
            if (wx.onPerformanceEntry && typeof wx.onPerformanceEntry === 'function') {
                wx.onPerformanceEntry((entries) => {
                    for (const entry of entries) {
                        if (entry.entryType === 'memory' && entry.usedJSHeapSize) {
                            const usedMB = Math.round(entry.usedJSHeapSize / 1024 / 1024);
                            if (usedMB > 150) { // 超过150MB认为内存紧张
                                console.warn(`[MainMenu] ⚠️ 内存使用较高: ${usedMB}MB`);
                            }
                        }
                    }
                });
            } else {
                console.warn('[MainMenu] wx.onPerformanceEntry API不可用，跳过性能监听');
            }
        }
    }

    /**
     * 处理内存警告
     */
    private handleMemoryWarning(): void {
        console.log('[MainMenu] 🧹 处理内存警告，清理非必要资源');
        
        // 可以在这里：
        // 1. 清理不用的纹理缓存
        // 2. 降低资源质量
        // 3. 释放音频资源
        // 4. 停止后台动画
        
        // 简单的内存清理：强制垃圾回收（如果支持）
        if (typeof gc !== 'undefined') {
            gc();
        }
    }

    protected onEnable(): void {
        this.refreshUI();
    }

    protected start(): void {
        // 确保在场景完全加载后再次同步UI状态
        this.scheduleOnce(() => {
            this.syncSoundToggleState();
        }, 0.1);
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
        } else {
            console.warn('[MainMenu] 游戏模式Toggle未完全设置 - basic:', !!this.basicModeToggle, ', stack:', !!this.stackModeToggle);
        }

        // 设置词库切换开关
        if (this.useFullToggle) {
            this.useFullToggle.node.on('toggle', this.onToggleChanged, this);
        }

        // 设置音效切换开关
        if (this.soundToggle) {
            this.soundToggle.node.on('toggle', this.onSoundToggleChanged, this);
        }
    }

    private loadSettings(): void {
        // 1. 加载游戏模式设置（带默认值兼容）
        let savedMode = sys.localStorage.getItem(GAME_MODE_STORAGE_KEY);
        
        // 兼容旧版本：如果没有保存过游戏模式，使用默认值
        if (!savedMode) {
            savedMode = DEFAULT_GAME_MODE;
        }
        
        this.selectedGameMode = savedMode as GameMode;
        
        
        // 同步 UI 状态
        this.syncGameModeUI();
        
        // 2. 从本地存储读取词库设置
        const useFull = sys.localStorage.getItem('use_full_dictionary');
        const useFullDictionary = useFull === 'true';
        
        if (this.useFullToggle) {
            this.useFullToggle.isChecked = useFullDictionary;
        }

        // 3. 音效设置将在 AudioMgr.init() 和 forceReloadSettings() 中处理
        // 这里不需要单独设置，避免与 AudioMgr 缓存冲突
        
        
    }

    private saveSettings(): void {
        // 保存游戏模式
        sys.localStorage.setItem(GAME_MODE_STORAGE_KEY, this.selectedGameMode);
        
        // 保存词库设置
        if (this.useFullToggle) {
            const useFull = this.useFullToggle.isChecked;
            sys.localStorage.setItem('use_full_dictionary', useFull ? 'true' : 'false');
        }

        // 保存音效设置
        if (this.soundToggle) {
            const soundEnabled = this.soundToggle.isChecked;
            sys.localStorage.setItem('sound_enabled', soundEnabled ? 'true' : 'false');
        }
    }

    private refreshUI(): void {
        // 刷新UI显示
        if (this.titleSprite) {
            // 可以在这里添加标题动画或其他UI效果
        }

        // 显示当前词库模式
        this.updateDictionaryModeDisplay();
        
        // 同步音效Toggle状态
        this.syncSoundToggleState();
    }

    /**
     * 同步音效Toggle状态
     */
    private syncSoundToggleState(): void {
        if (this.soundToggle) {
            // 直接从 AudioMgr 获取最新的设置状态
            const isSoundEnabled = this.audioMgr.getEnabled();
            this.soundToggle.isChecked = isSoundEnabled;
            console.log(`[MainMenu] 同步音效Toggle状态: ${isSoundEnabled}`);
        }
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
        
        
        // 实时保存设置
        this.saveSettings();
    }

    private updateDictionaryModeDisplay(): void {
        if (!this.useFullToggle) return;

        const useFull = this.useFullToggle.isChecked;
        const modeText = useFull ? '完整词库' : '基础词库';
        
        // 可以在这里更新UI显示当前模式
    }

    private onStartGame(): void {
        this.saveSettings();
        const config = GAME_MODE_CONFIGS[this.selectedGameMode];
        const sceneName = config.sceneName;

        console.log(`[MainMenu] 开始预加载游戏场景: ${sceneName}`);

        // 🎯 立即禁用按钮，防止重复点击
        if (this.startButton) {
            this.startButton.interactable = false;
        }

        // 🎯 显示加载状态，给用户即时反馈
        this.showLoadingFeedback('正在进入游戏');
        
        // 记录开始时间，确保 loading 至少显示 500ms
        const startTime = Date.now();
        const MIN_LOADING_TIME = 500;  // 最小显示时间（毫秒）

        // ✅ 先预加载游戏场景（Game有16个资源，StackGameScene有29个资源）
        director.preloadScene(sceneName, (error) => {
            if (error) {
                console.error(`[MainMenu] 场景预加载失败: ${sceneName}`, error);
                // 恢复按钮状态
                this.hideLoadingFeedback();
                if (this.startButton) {
                    this.startButton.interactable = true;
                }
                return;
            }

            console.log(`[MainMenu] ✅ ${sceneName}场景预加载完成，开始切换`);
            
            // 计算已经过去的时间，确保 loading 至少显示一段时间
            const elapsed = Date.now() - startTime;
            const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
            
            // 延迟切换场景，让用户能看到 loading
            setTimeout(() => {
                director.loadScene(sceneName, (err: any) => {
                    // 无论成功失败都隐藏加载提示（场景切换后会销毁）
                    this.hideLoadingFeedback();

                    if (err) {
                        console.error(`[MainMenu] 跳转场景失败: ${sceneName}`, err);
                        // 恢复按钮状态
                        if (this.startButton) {
                            this.startButton.interactable = true;
                        }
                    } else {
                        console.log(`[MainMenu] ✅ 成功进入${sceneName}`);
                    }
                });
            }, remainingTime);
        });
    }

    /**
     * 显示加载中反馈（使用自定义美观 UI）
     */
    private showLoadingFeedback(message: string): void {
        console.log(`[MainMenu] 🔄 ${message}`);
        
        // 如果已存在，先销毁
        if (this.loadingOverlay && this.loadingOverlay.isValid) {
            this.loadingOverlay.destroy();
        }
        
        // 创建 loading overlay
        this.loadingOverlay = this.createLoadingOverlay(message);
        
        // 找到 Canvas 节点并添加到最顶层
        const canvas = find('Canvas');
        if (canvas) {
            this.loadingOverlay.setParent(canvas);
            // 确保在最顶层显示
            this.loadingOverlay.setSiblingIndex(canvas.children.length - 1);
            console.log(`[MainMenu] Loading overlay 已添加到 Canvas，siblingIndex: ${this.loadingOverlay.getSiblingIndex()}`);
        } else {
            console.error('[MainMenu] Canvas 节点未找到！');
            // 备用方案：添加到当前节点的父节点
            const parent = this.node.parent;
            if (parent) {
                this.loadingOverlay.setParent(parent);
                this.loadingOverlay.setSiblingIndex(parent.children.length - 1);
            }
        }
        
        // 淡入动画
        const opacity = this.loadingOverlay.getComponent(UIOpacity);
        if (opacity) {
            opacity.opacity = 0;
            tween(opacity)
                .to(0.2, { opacity: 255 })
                .start();
        }
    }

    /**
     * 隐藏加载中反馈
     */
    private hideLoadingFeedback(): void {
        // 清除动画定时器
        if (this.loadingTimer !== null) {
            clearInterval(this.loadingTimer);
            this.loadingTimer = null;
        }
        
        if (this.loadingOverlay && this.loadingOverlay.isValid) {
            const opacity = this.loadingOverlay.getComponent(UIOpacity);
            if (opacity) {
                // 淡出动画
                tween(opacity)
                    .to(0.15, { opacity: 0 })
                    .call(() => {
                        if (this.loadingOverlay && this.loadingOverlay.isValid) {
                            this.loadingOverlay.destroy();
                            this.loadingOverlay = null;
                        }
                    })
                    .start();
            } else {
                this.loadingOverlay.destroy();
                this.loadingOverlay = null;
            }
        }
    }

    /**
     * 创建自定义 loading overlay UI
     */
    private createLoadingOverlay(message: string): Node {
        const screenSize = view.getVisibleSize();
        
        // 1. 创建根节点（全屏遮罩）
        const overlay = new Node('LoadingOverlay');
        const overlayTransform = overlay.addComponent(UITransform);
        overlayTransform.setContentSize(screenSize.width, screenSize.height);
        overlay.addComponent(UIOpacity);
        overlay.addComponent(BlockInputEvents);  // 阻止点击穿透
        
        // 2. 创建半透明黑色背景（使用 Graphics 绘制）
        const bgNode = new Node('Background');
        bgNode.parent = overlay;
        const bgTransform = bgNode.addComponent(UITransform);
        bgTransform.setContentSize(screenSize.width, screenSize.height);
        const bgGraphics = bgNode.addComponent(Graphics);
        bgGraphics.fillColor = new Color(0, 0, 0, 150);  // 半透明黑色
        bgGraphics.rect(-screenSize.width / 2, -screenSize.height / 2, screenSize.width, screenSize.height);
        bgGraphics.fill();
        
        // 3. 创建居中的卡片容器（使用 Graphics 绘制圆角矩形）
        const cardWidth = 280;
        const cardHeight = 120;
        const cardRadius = 16;  // 圆角半径
        
        const cardNode = new Node('Card');
        cardNode.parent = overlay;
        const cardTransform = cardNode.addComponent(UITransform);
        cardTransform.setContentSize(cardWidth, cardHeight);
        const cardGraphics = cardNode.addComponent(Graphics);
        cardGraphics.fillColor = new Color(255, 255, 255, 245);  // 白色卡片
        cardGraphics.roundRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, cardRadius);
        cardGraphics.fill();
        
        // 4. 创建 loading 文字
        const labelNode = new Node('Label');
        labelNode.parent = cardNode;
        labelNode.setPosition(0, 0, 0);
        const labelTransform = labelNode.addComponent(UITransform);
        labelTransform.setContentSize(260, 100);
        const label = labelNode.addComponent(Label);
        label.string = message;
        label.fontSize = 28;
        label.lineHeight = 36;
        label.color = new Color(80, 80, 80, 255);  // 深灰色文字
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        
        // 5. 启动点点动画
        this.loadingDots = '';
        const baseMessage = message.replace(/\.+$/, '');  // 去掉末尾的点
        this.loadingTimer = setInterval(() => {
            this.loadingDots = this.loadingDots.length >= 3 ? '' : this.loadingDots + '.';
            if (label && label.isValid) {
                label.string = baseMessage + this.loadingDots;
            }
        }, 400) as unknown as number;
        
        // 6. 卡片弹出动画
        cardNode.setScale(0.8, 0.8, 1);
        tween(cardNode)
            .to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
        
        return overlay;
    }

    private onToggleChanged(toggle: Toggle): void {
        
        this.updateDictionaryModeDisplay();
        
        // 实时保存设置
        this.saveSettings();
    }

    private onSoundToggleChanged(toggle: Toggle): void {
        // 应用音效设置到音频管理器
        if (this.soundToggle) {
            const soundEnabled = this.soundToggle.isChecked;
            this.audioMgr.setEnabled(soundEnabled);
            
            // 如果关闭音效，停止当前播放的背景音乐
            if (!soundEnabled) {
                this.audioMgr.stopBackgroundMusic();
            } else {
                // 如果开启音效，播放背景音乐
                this.audioMgr.playBackgroundMusic();
            }
        }
        
        // 实时保存设置（注意：AudioMgr.setEnabled 已经保存了，这里可以不重复保存）
        this.saveSettings();
    }

    /**
     * 重置游戏数据（可选功能）
     */
    resetGameData(): void {
        
        // 清除本地存储的游戏数据
        sys.localStorage.removeItem('session_notebook');
        sys.localStorage.removeItem('use_full_dictionary');
        
        // 重新加载设置
        this.loadSettings();
        this.refreshUI();
        
        
    }

    /**
     * 显示设置面板
     */
    showSettings(): void {
        if (this.settingsPanel) {
            this.settingsPanel.active = true;
        }
    }

    /**
     * 隐藏设置面板
     */
    hideSettings(): void {
        if (this.settingsPanel) {
            this.settingsPanel.active = false;
        }
    }

    /**
     * 查看历史生词本
     */
    viewHistory(): void {
        console.log('[MainMenu] 开始预加载结果页面...');

        // 🎯 显示加载状态
        this.showLoadingFeedback('正在加载...');

        // ✅ 先预加载结果页（Result有24个资源）
        director.preloadScene('Result', (error) => {
            if (error) {
                console.error('[MainMenu] 结果页预加载失败:', error);
                this.hideLoadingFeedback();
                return;
            }

            console.log('[MainMenu] ✅ 结果页预加载完成，开始切换');

            director.loadScene('Result', (err: any) => {
                this.hideLoadingFeedback();
                
                if (err) {
                    console.error('[MainMenu] 跳转历史页面失败:', err);
                } else {
                    console.log('[MainMenu] ✅ 成功进入历史页面');
                }
            });
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
        // 清理 loading 相关资源
        if (this.loadingTimer !== null) {
            clearInterval(this.loadingTimer);
            this.loadingTimer = null;
        }
        if (this.loadingOverlay && this.loadingOverlay.isValid) {
            this.loadingOverlay.destroy();
            this.loadingOverlay = null;
        }
        
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

        if (this.soundToggle && this.soundToggle.node) {
            this.soundToggle.node.off('toggle', this.onSoundToggleChanged, this);
        }
        
        
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
            
        }
    }

    /**
     * 加载远程Asset Bundle资源（使用统一AssetLoader，充分利用缓存）
     */
    private async loadRemoteAssets(): Promise<void> {
        try {
            const assetLoader = AssetLoader.getInstance();
            
            // 显示缓存统计信息
            const cacheStats = assetLoader.getCacheStats();
            
            // 🎯 微信小游戏环境下串行加载，避免并发限制
            if (typeof wx !== 'undefined') {
                console.log('[MainMenu] 📱 微信小游戏环境：使用串行加载避免429');
                
                // 串行加载，避免并发限制
                await this.loadSpriteFromBundle('bundle', 'bg/main_scene_bg/spriteFrame', this.backgroundSprite);
                // 添加延迟，避免触发429
                await new Promise(resolve => setTimeout(resolve, 100));
                await this.loadSpriteFromBundle('bundle', 'title/title/spriteFrame', this.titleSprite);
            } else {
                // 浏览器环境：并行加载
                console.log('[MainMenu] 🌐 浏览器环境：使用并行加载');
                await Promise.all([
                    // 加载背景资源 - 自动利用预加载缓存
                    this.loadSpriteFromBundle('bundle', 'bg/main_scene_bg/spriteFrame', this.backgroundSprite),
                    // 加载标题资源 - 自动利用预加载缓存
                    this.loadSpriteFromBundle('bundle', 'title/title/spriteFrame', this.titleSprite)
                ]);
            }
            
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
            
            console.log(`[MainMenu] 资源缓存检查: ${bundleName}/${assetPath}, Bundle缓存: ${bundleCached}, 资源缓存: ${assetCached}`);
            
            // ✅ 如果资源已缓存，直接获取，无需网络请求
            if (assetCached) {
                console.log(`[MainMenu] ✅ 资源已缓存，直接获取: ${bundleName}/${assetPath}`);
                const spriteFrame = await assetLoader.loadSpriteFrame(bundleName, assetPath);
                if (sprite) {
                    sprite.spriteFrame = spriteFrame;
                }
                return;
            }
            
            // 🎯 微信小游戏环境下：如果资源未缓存，延迟加载避免429
            if (typeof wx !== 'undefined') {
                console.log(`[MainMenu] 📱 资源未缓存，延迟加载避免429: ${bundleName}/${assetPath}`);
                // 添加额外延迟，避免与Loading阶段的预加载冲突
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            // 使用统一加载器加载资源
            const spriteFrame = await assetLoader.loadSpriteFrame(bundleName, assetPath);
            
            if (sprite) {
                sprite.spriteFrame = spriteFrame;
            }
        } catch (error) {
            console.error(`[MainMenu] 加载Sprite失败: ${bundleName}/${assetPath}`, error);
            throw error;
        }
    }

    /**
     * 🚀 启动主菜单后台资源加载
     * 不阻塞UI，静默加载中优先级资源
     */
    private startBackgroundResourceLoading(): void {
        console.log('[MainMenu] 🚀 启动后台资源加载...');
        
        // 异步加载，不阻塞主线程
        setTimeout(async () => {
            try {
                const preloadManager = PreloadManager.getInstance();
                await preloadManager.preloadMenuResources();
                console.log('[MainMenu] ✅ 后台资源加载完成');
            } catch (error) {
                console.warn('[MainMenu] ⚠️ 后台资源加载失败:', error);
            }
        }, 1000); // 延迟1秒启动，确保主菜单UI已完全显示
    }
}