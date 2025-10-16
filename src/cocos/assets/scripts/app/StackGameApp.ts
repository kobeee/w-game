import { _decorator, Component, Node, Label, director, Sprite, UITransform } from 'cc';
import { LevelGenerator } from '../core/LevelGenerator';
import { IncrementalWordMatcher } from '../core/WordMatcher';
import { StackBoard } from '../ui/StackBoard';
import { SlotQueue } from '../ui/SlotQueue';
import { Card, WordMatch, Level, IWordMatcher } from '../data/StackTypes';
import { GlossService } from '../data/GlossService';
import { AssetLoader } from '../core/AssetLoader';
import { GridLayoutLoader } from '../core/GridLayoutLoader';

const { ccclass, property } = _decorator;

/**
 * 游戏状态
 */
enum GameState {
    IDLE = 'idle',
    PLAYING = 'playing',
    BLINKING = 'blinking', // 闪烁状态（等待玩家决策）
    PAUSED = 'paused',
    ENDED = 'ended'
}

/**
 * 堆叠游戏主控制器
 * 负责整合所有模块，管理游戏流程
 */
@ccclass('StackGameApp')
export class StackGameApp extends Component {
    @property(StackBoard)
    public stackBoard: StackBoard = null!;

    @property(SlotQueue)
    public slotQueue: SlotQueue = null!;

    @property(Label)
    public scoreLabel: Label = null!;

    @property(Label)
    public clearRateLabel: Label = null!;

    @property(Node)
    public resultPanel: Node = null!;

    @property(Sprite)
    public backgroundSprite: Sprite = null!; // 场景背景，复用Game场景的背景图

    private currentLevel: Level | null = null;
    private wordMatcher: IWordMatcher | null = null; // ✅ 延迟初始化，确保GlossService已加载
    private gameState: GameState = GameState.IDLE;
    private score: number = 0;
    private wordsCleared: string[] = [];
    private currentMatch: WordMatch | null = null;
    private startTime: number = 0;

    protected async onLoad(): Promise<void> {
        // 初始化单词匹配器（确保GlossService已加载完成）
        this.initWordMatcher();

        // 加载远程资源
        await this.loadRemoteAssets();

        // 注册堆叠棋盘事件
        if (this.stackBoard) {
            this.stackBoard.node.on('card-clicked', this.onCardClicked, this);
        }

        // 注册牌槽事件
        if (this.slotQueue) {
            this.slotQueue.node.on('letter-added', this.onLetterAdded, this);
            this.slotQueue.node.on('confirm-remove', this.onConfirmRemove, this);
            this.slotQueue.node.on('continue-spell', this.onContinueSpell, this);
            this.slotQueue.node.on('auto-remove', this.onAutoRemove, this);
            this.slotQueue.node.on('slot-full', this.onSlotFull, this);
            this.slotQueue.node.on('word-removed', this.onWordRemoved, this);
        }

        // 隐藏结果面板
        if (this.resultPanel) {
            this.resultPanel.active = false;
        }
    }

    protected start(): void {
        this.startGame();
    }

    /**
     * 初始化单词匹配器
     * 使用完整词库验证（支持所有有效单词）
     */
    private initWordMatcher(): void {
        try {
            const glossService = GlossService.getInstance();

            // ✅ 使用完整词库初始化WordMatcher
            // 这样玩家拼出任何有效单词都能消除
            this.wordMatcher = new IncrementalWordMatcher(glossService);

            console.log('[StackGameApp] 单词匹配器初始化完成（支持完整词库验证）');

        } catch (error) {
            console.error('[StackGameApp] 单词匹配器初始化失败:', error);
            // 降级方案：创建一个默认的匹配器
            this.wordMatcher = new IncrementalWordMatcher();
        }
    }

    /**
     * 开始游戏
     * @param seed 关卡种子
     * @param useGridLayout 是否使用网格布局系统（默认为true）
     * @param layoutPath 网格布局配置文件路径（相对于resources/，默认为'layouts/pyramid_default'）
     */
    public async startGame(
        seed?: string,
        useGridLayout: boolean = true,
        layoutPath: string = 'layouts/pyramid_default'
    ): Promise<void> {
        const dailySeed = seed || LevelGenerator.getDailySeed();
        console.log(`[StackGameApp] 生成每日关卡，种子: ${dailySeed}`);

        try {
            if (useGridLayout) {
                // ✅ 使用网格布局系统
                console.log(`[StackGameApp] 使用网格布局系统，配置文件: ${layoutPath}`);

                // 获取词库（用于分配字母）
                const glossService = GlossService.getInstance();
                const wordPool = glossService.getAllWords().slice(0, 100); // 使用前100个单词作为词库

                // 加载并转换为Level
                this.currentLevel = await GridLayoutLoader.loadAndConvertToLevel(
                    layoutPath,
                    wordPool,
                    dailySeed
                );

                console.log(`[StackGameApp] ✅ 网格布局加载成功: ${this.currentLevel.layout.name}`);
                console.log(`[StackGameApp] 总卡片数: ${this.currentLevel.totalCards}`);

                // 打印布局信息
                GridLayoutLoader.debugPrintLayout(
                    await GridLayoutLoader.loadLayout(layoutPath)
                );

            } else {
                // ✅ 使用旧的随机生成系统
                console.log(`[StackGameApp] 使用随机布局生成系统`);
                this.currentLevel = LevelGenerator.generateDailyLevel(dailySeed);
            }

            // 初始化组件（异步等待SlotQueue加载完成）
            this.stackBoard.init(this.currentLevel);
            await this.slotQueue.init(); // ✅ 等待牌槽初始化完成（包括背景图加载）

            // 重置数据
            this.score = 0;
            this.wordsCleared = [];
            this.gameState = GameState.PLAYING;
            this.startTime = Date.now();

            // 更新UI
            this.updateScoreLabel();
            this.updateClearRateLabel();

            console.log(`[StackGameApp] 游戏开始，总卡片数: ${this.currentLevel.totalCards}`);

        } catch (error) {
            console.error('[StackGameApp] 启动游戏失败:', error);

            // 降级方案：使用旧的随机生成系统
            console.warn('[StackGameApp] 降级使用随机生成系统');
            this.currentLevel = LevelGenerator.generateDailyLevel(dailySeed);
            this.stackBoard.init(this.currentLevel);
            await this.slotQueue.init();

            this.score = 0;
            this.wordsCleared = [];
            this.gameState = GameState.PLAYING;
            this.startTime = Date.now();

            this.updateScoreLabel();
            this.updateClearRateLabel();
        }
    }

    /**
     * 卡片点击回调
     */
    private onCardClicked(card: Card): void {
        if (this.gameState !== GameState.PLAYING) {
            console.log('[StackGameApp] 游戏未在进行中，忽略点击');
            return;
        }

        console.log(`[StackGameApp] 点击卡片: ${card.id}, 字母: ${card.letter}`);

        // 检查牌槽是否已满
        if (this.slotQueue.isFull()) {
            console.warn('[StackGameApp] 牌槽已满');
            this.onSlotFull();
            return;
        }

        // 获取下一个空闲slot的世界坐标
        const targetWorldPos = this.slotQueue.getNextSlotWorldPosition();
        if (!targetWorldPos) {
            console.error('[StackGameApp] 无法获取slot世界坐标');
            return;
        }

        // 将世界坐标转换为StackBoard容器的本地坐标
        const targetLocalPos = this.stackBoard.container.getComponent(UITransform)?.convertToNodeSpaceAR(targetWorldPos);
        if (!targetLocalPos) {
            console.error('[StackGameApp] 坐标转换失败');
            return;
        }

        console.log(`[StackGameApp] 卡片将飞向slot的本地坐标: (${targetLocalPos.x.toFixed(2)}, ${targetLocalPos.y.toFixed(2)})`);

        // 移除卡片（飞向牌槽动画），返回字母牌节点
        this.stackBoard.removeCard(card.id, targetLocalPos).then((tileNode) => {
            // 添加字母到牌槽，并传递飞过来的节点
            this.slotQueue.addLetter(card.letter, tileNode || undefined);
        });
    }

    /**
     * 字母添加到牌槽后回调
     */
    private onLetterAdded(letters: string[]): void {
        console.log(`[StackGameApp] 字母添加到牌槽: ${letters.join('')}`);

        // 检测单词
        if (!this.wordMatcher) {
            console.warn('[StackGameApp] WordMatcher未初始化');
            return;
        }

        const match = this.wordMatcher.findWord(letters);

        if (match) {
            console.log(`[StackGameApp] ✅ 检测到有效单词: ${match.word}（完整词库验证）`);

            // 保存当前匹配
            this.currentMatch = match;

            // 切换到闪烁状态
            this.gameState = GameState.BLINKING;

            // 触发闪烁动画
            this.slotQueue.startBlink(match);
        }
    }

    /**
     * "✓消除"按钮点击
     */
    private onConfirmRemove(): void {
        if (!this.currentMatch) return;

        console.log(`[StackGameApp] 玩家确认消除: ${this.currentMatch.word}`);
        this.removeWord(this.currentMatch);
    }

    /**
     * "⏭继续拼"按钮点击
     */
    private onContinueSpell(): void {
        console.log('[StackGameApp] 玩家选择继续拼词');

        // 清除当前匹配
        this.currentMatch = null;

        // 恢复游戏状态
        this.gameState = GameState.PLAYING;
    }

    /**
     * 自动消除（3秒倒计时结束）
     */
    private onAutoRemove(): void {
        if (!this.currentMatch) return;

        console.log(`[StackGameApp] 自动消除: ${this.currentMatch.word}`);
        this.removeWord(this.currentMatch);
    }

    /**
     * 消除单词
     */
    private removeWord(match: WordMatch): void {
        // 播放消除动画
        this.slotQueue.removeWord(match);

        // 记录消除的单词
        this.wordsCleared.push(match.word);

        // 计算分数
        const wordScore = this.calculateScore(match.word);
        this.score += wordScore;

        console.log(`[StackGameApp] 消除单词: ${match.word}, 分数: +${wordScore}, 总分: ${this.score}`);

        // 查询词义并显示
        this.showWordMeaning(match.word);

        // 清除当前匹配
        this.currentMatch = null;

        // 恢复游戏状态
        this.gameState = GameState.PLAYING;

        // 更新UI
        this.updateScoreLabel();
        this.updateClearRateLabel();

        // 检查游戏是否结束
        this.checkGameEnd();
    }

    /**
     * 单词消除后回调
     */
    private onWordRemoved(word: string): void {
        console.log(`[StackGameApp] 单词消除完成: ${word}`);
    }

    /**
     * 牌槽已满回调
     */
    private onSlotFull(): void {
        console.log('[StackGameApp] 牌槽已满，游戏结束');
        this.endGame('牌槽已满');
    }

    /**
     * 计算单词分数
     */
    private calculateScore(word: string): number {
        const len = word.length;
        if (len <= 3) return 10;
        if (len === 4) return 20;
        if (len === 5) return 35;
        if (len === 6) return 50;
        if (len === 7) return 70;
        return 100;
    }

    /**
     * 显示词义（Bottom Sheet）
     */
    private async showWordMeaning(word: string): Promise<void> {
        try {
            const glossService = GlossService.getInstance();
            const gloss = await glossService.getGloss(word);

            if (gloss && gloss.cn) {
                console.log(`[StackGameApp] ${word}: ${gloss.cn}`);
                // TODO: 显示词义浮层（需要GlossSheet组件）
            }
        } catch (error) {
            console.warn(`[StackGameApp] 查询词义失败: ${word}`, error);
        }
    }

    /**
     * 检查游戏是否结束
     */
    private checkGameEnd(): void {
        const remaining = this.stackBoard.getRemainingCount();

        if (remaining === 0) {
            console.log('[StackGameApp] 完美通关！');
            this.endGame('完美通关');
        }
    }

    /**
     * 结束游戏
     */
    private endGame(reason: string): void {
        if (this.gameState === GameState.ENDED) return;

        this.gameState = GameState.ENDED;

        const totalCards = this.stackBoard.getTotalCount();
        const remaining = this.stackBoard.getRemainingCount();
        const cleared = totalCards - remaining;
        const clearRate = (cleared / totalCards) * 100;

        const playDuration = Date.now() - this.startTime;

        console.log(`[StackGameApp] 游戏结束 - ${reason}`);
        console.log(`  总卡片: ${totalCards}`);
        console.log(`  已消除: ${cleared}`);
        console.log(`  剩余: ${remaining}`);
        console.log(`  清除率: ${clearRate.toFixed(2)}%`);
        console.log(`  总分: ${this.score}`);
        console.log(`  消除单词: ${this.wordsCleared.join(', ')}`);
        console.log(`  游戏时长: ${(playDuration / 1000).toFixed(1)}秒`);

        // 显示结果面板
        this.showResult(clearRate);
    }

    /**
     * 显示结果面板
     */
    private showResult(clearRate: number): void {
        if (!this.resultPanel) return;

        this.resultPanel.active = true;

        // TODO: 设置结果面板的数据
        // - 清除率
        // - 总分
        // - 消除单词列表
        // - 排行榜按钮
    }

    /**
     * 更新分数显示
     */
    private updateScoreLabel(): void {
        if (!this.scoreLabel) return;
        this.scoreLabel.string = `分数: ${this.score}`;
    }

    /**
     * 更新清除率显示
     */
    private updateClearRateLabel(): void {
        if (!this.clearRateLabel) return;

        const totalCards = this.stackBoard.getTotalCount();
        const remaining = this.stackBoard.getRemainingCount();
        const cleared = totalCards - remaining;
        const clearRate = totalCards > 0 ? (cleared / totalCards) * 100 : 0;

        this.clearRateLabel.string = `清除率: ${clearRate.toFixed(1)}%`;
    }

    /**
     * 重新开始游戏
     */
    public restartGame(): void {
        this.startGame();
    }

    /**
     * 返回主菜单
     */
    public backToMenu(): void {
        director.loadScene('Menu');
    }

    /**
     * 加载远程Asset Bundle资源（从PreloadManager预加载的缓存获取）
     */
    private async loadRemoteAssets(): Promise<void> {
        try {
            console.log('[StackGameApp] 从预加载缓存获取场景背景图...');

            const assetLoader = AssetLoader.getInstance();

            // 检查资源是否已完全加载并缓存
            const isCached = assetLoader.isAssetCached('bg', 'game_scene_bg/spriteFrame');

            if (isCached) {
                console.log('[StackGameApp] ✅ 场景背景图已在预加载阶段完全加载');
            } else {
                console.log('[StackGameApp] ⚠️ 场景背景图未预加载，开始动态加载');
            }

            // 使用AssetLoader从缓存获取（已完全加载，立即可用）
            const spriteFrame = await assetLoader.loadSpriteFrame('bg', 'game_scene_bg/spriteFrame');

            if (this.backgroundSprite) {
                this.backgroundSprite.spriteFrame = spriteFrame;
                console.log('[StackGameApp] 场景背景图设置成功');
            }

        } catch (error) {
            console.error('[StackGameApp] 加载场景背景图失败:', error);
            // 背景图加载失败不影响游戏运行
        }
    }

    protected onDestroy(): void {
        if (this.stackBoard && this.stackBoard.node.isValid) {
            this.stackBoard.node.off('card-clicked', this.onCardClicked, this);
        }

        if (this.slotQueue && this.slotQueue.node.isValid) {
            this.slotQueue.node.off('letter-added', this.onLetterAdded, this);
            this.slotQueue.node.off('confirm-remove', this.onConfirmRemove, this);
            this.slotQueue.node.off('continue-spell', this.onContinueSpell, this);
            this.slotQueue.node.off('auto-remove', this.onAutoRemove, this);
            this.slotQueue.node.off('slot-full', this.onSlotFull, this);
            this.slotQueue.node.off('word-removed', this.onWordRemoved, this);
        }
    }
}
