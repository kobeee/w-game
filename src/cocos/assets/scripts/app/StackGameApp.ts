import { _decorator, Component, Node, Label, director, Sprite, UITransform, Button, Prefab, Vec3, ScrollView } from 'cc';
import { LevelGenerator } from '../core/LevelGenerator';
import { IncrementalWordMatcher } from '../core/WordMatcher';
import { StackBoard } from '../ui/StackBoard';
import { SlotQueue } from '../ui/SlotQueue';
import { Card, WordMatch, Level, IWordMatcher } from '../data/StackTypes';
import { GlossService } from '../data/GlossService';
import { AssetLoader } from '../core/AssetLoader';
import { GridLayoutLoader } from '../core/GridLayoutLoader';
import { WordValidationManager } from '../services/WordValidationManager';
import { DefinitionHintPool } from '../ui/DefinitionHintPool';
import { DefinitionHintView } from '../ui/DefinitionHintView';
import { WordStat, GameResult } from '../types/words';
import { HINT_STAY_MS } from '../config/word-validate';

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

    // 结果页分数（与 TopHUD 的 scoreLabel 分离）
    @property(Label)
    public resultScoreLabel: Label = null!;

    // 结果页 UI（新增）
    @property(Label)
    public timeLabel: Label = null!;

    @property(Label)
    public wordsLabel: Label = null!;

    @property(ScrollView)
    public wordsScrollView: ScrollView = null!;

    @property(Button)
    public retryButton: Button = null!;

    @property(Button)
    public backButton: Button = null!;

    @property(Label)
    public clearRateLabel: Label = null!;

    @property(Node)
    public resultPanel: Node = null!;

    @property(Sprite)
    public backgroundSprite: Sprite = null!; // 场景背景，复用Game场景的背景图

    @property(Button)
    public endGameButton: Button = null!;

    // 释义气泡（编辑器绑定 DefinitionHint.prefab 与容器节点 DefinitionHints）
    @property(Prefab)
    public definitionHintPrefab: Prefab = null!;

    @property(Node)
    public definitionHintsRoot: Node = null!;

    private currentLevel: Level | null = null;
    private wordMatcher: IWordMatcher | null = null; // ✅ 延迟初始化，确保GlossService已加载
    private gameState: GameState = GameState.IDLE;
    private score: number = 0;
    private wordsCleared: WordStat[] = [];
    private currentMatch: WordMatch | null = null;
    private startTime: number = 0;
    private validationManager: WordValidationManager = new WordValidationManager();
    private hintPool: DefinitionHintPool | null = null;
    private longestWordLen: number = 0;
    /**
     * 输入推进版本号：
     * - 每次牌槽内容变化（增加/移除）或玩家继续输入时自增
     * - 用于丢弃“输入推进后才返回的旧验证结果”，避免误触发消除
     */
    private inputVersion: number = 0;
    // 正在进行的网络后缀验证批次数（用于“槽满时延迟结束”判断）
    private validationsInFlight: number = 0;
    // 延迟结束原因（例如槽满时先等待验证结果）
    private pendingEndReason: string | null = null;
    // 当前局使用的布局路径（resources/ 下的相对路径，不带扩展名）
    private lastLayoutPath: string | null = null;

    // 可用于正式游玩的堆叠布局池（排除 pyramid_default）
    private static readonly GRID_LAYOUT_POOL: string[] = [
        'layouts/sheep_style_complex',
        'layouts/stack_center_tower',
        'layouts/stack_cross_towers',
        'layouts/stack_diagonal_ridge',
        'layouts/stack_ring_fortress',
        'layouts/stack_multi_towers'
    ];

    protected async onLoad(): Promise<void> {
        // 初始化AI单词验证系统
        try {
            await this.validationManager.initialize();
        } catch (error) {
            console.error('[StackGameApp] ⚠️ 单词验证系统初始化失败:', error);
        }

        // 降级方案：如果词库未加载（直接预览Game场景时），执行加载
        const glossService = GlossService.getInstance();
        const loadStatus = glossService.getLoadStatus();

        if (!loadStatus.core) {
            console.warn('[StackGameApp] ⚠️ 词库未加载，执行降级加载...');
            try {
                await glossService.load(false); // 仅加载核心词库
            } catch (error) {
                console.error('[StackGameApp] ❌ 词库降级加载失败:', error);
            }
        }

        // ✅ 延迟初始化单词匹配器到 startGame()（此时GlossService已加载完成）
        // this.initWordMatcher();

        // 加载远程资源
        await this.loadRemoteAssets();

        // ✅ 修复：确保SlotQueue容器始终在最上层，避免遮挡飞行中的卡片
        if (this.slotQueue && this.slotQueue.node) {
            this.slotQueue.node.setSiblingIndex(9998); // SlotQueue在底层
        }
        if (this.stackBoard && this.stackBoard.node) {
            this.stackBoard.node.setSiblingIndex(9999); // StackBoard在最上层
        }

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

        // 监听中文释义异步到达事件，实时更新当前气泡
        // 维基异步补齐已移除，不再订阅中文释义更新事件

        // 隐藏结果面板
        if (this.resultPanel) {
            this.resultPanel.active = false;
        }

        // 防御性检查：如果属性未绑定，尝试通过节点路径查找
        if (!this.endGameButton) {
            const foundButton = this.findButtonNode();
            if (foundButton) {
                this.endGameButton = foundButton;
            } else {
                console.error('[StackGameApp] ❌ 无法找到 EndGameButton 节点');
            }
        }
        
        this.setupEndGameButton();

        // 初始化释义气泡对象池（若已在编辑器绑定）
        if (this.definitionHintPrefab && this.definitionHintsRoot) {
            this.hintPool = this.node.addComponent(DefinitionHintPool);
            this.hintPool.initialize(this.definitionHintPrefab, this.definitionHintsRoot);
        }

        // 结果页按钮绑定（如果未在 Inspector 配置点击事件，这里兜底）
        if (this.retryButton && this.retryButton.node) {
            this.retryButton.node.on(Button.EventType.CLICK, this.onRetryClicked, this);
        }
        if (this.backButton && this.backButton.node) {
            this.backButton.node.on(Button.EventType.CLICK, this.onBackToMenuClicked, this);
        }
    }

    protected async start(): Promise<void> {
        // ✅ 确保词库加载完成后再开始游戏
        const glossService = GlossService.getInstance();

        // ⚠️ 关键：无论 onLoad() 中是否已经开始加载，这里都再次调用 load()
        // load() 方法内部会处理并发控制，如果已经在加载，会等待完成
        try {
            await glossService.load(false);
        } catch (error) {
            console.error('[StackGameApp] start() 词库加载失败:', error);
        }

        // 最终验证
        const loadStatus = glossService.getLoadStatus();

        this.startGame();
    }

    /**
     * 查找 EndGameButton 节点（辅助方法）
     */
    private findButtonNode(): Button | null {
        // 尝试多个可能的路径
        const paths = [
            'BottomBar/EndGameButton',
            'Canvas/BottomBar/EndGameButton',
            'EndGameButton',
            'Canvas/EndGameButton'
        ];
        
        // 从当前节点开始查找
        let rootNode = this.node;
        // 如果当前节点不是 Canvas，尝试向上找到 Canvas
        if (rootNode.name !== 'Canvas') {
            let parent = rootNode.parent;
            while (parent) {
                if (parent.name === 'Canvas') {
                    rootNode = parent;
                    break;
                }
                parent = parent.parent;
            }
        }
        
        for (const path of paths) {
            const node = rootNode.getChildByPath(path);
            if (node) {
                const buttonComponent = node.getComponent(Button);
                if (buttonComponent) {
                    return buttonComponent;
                }
            }
        }
        
        // 如果路径查找失败，尝试递归查找
        const findRecursive = (node: Node, name: string): Node | null => {
            if (node.name === name) {
                return node;
            }
            for (const child of node.children) {
                const found = findRecursive(child, name);
                if (found) {
                    return found;
                }
            }
            return null;
        };
        
        const foundNode = findRecursive(rootNode, 'EndGameButton');
        if (foundNode) {
            const buttonComponent = foundNode.getComponent(Button);
            if (buttonComponent) {
                return buttonComponent;
            }
        }
        
        return null;
    }

    /**
     * 初始化单词匹配器
     * 使用完整词库验证（支持所有有效单词）
     */
    private initWordMatcher(): void {
        try {
            const glossService = GlossService.getInstance();

            // 检查词库是否已加载
            let allWords = glossService.getAllWords();

            if (allWords.length === 0) {
                console.warn('[StackGameApp] ⚠️ 词库为空，检查加载状态');

                const loadStatus = glossService.getLoadStatus();

                if (!loadStatus.core) {
                    console.error('[StackGameApp] ❌ 核心词库未加载，WordMatcher 初始化失败');
                }
            }

            // 使用完整词库初始化WordMatcher
            this.wordMatcher = new IncrementalWordMatcher(glossService);

        } catch (error) {
            console.error('[StackGameApp] ❌ 单词匹配器初始化失败:', error);
            // 降级方案：创建一个默认的匹配器
            this.wordMatcher = new IncrementalWordMatcher();
        }
    }

    /**
     * 选择布局路径：
     * - 显式传入 layoutPath 时优先使用；
     * - 否则如果已有 lastLayoutPath（本局/上一局）则复用；
     * - 初次进入场景则从 GRID_LAYOUT_POOL 中随机挑选一个。
     */
    private resolveLayoutPath(layoutPath?: string): string {
        if (layoutPath && layoutPath.trim().length > 0) {
            return layoutPath;
        }
        if (this.lastLayoutPath && this.lastLayoutPath.trim().length > 0) {
            return this.lastLayoutPath;
        }
        const pool = StackGameApp.GRID_LAYOUT_POOL;
        if (!pool || pool.length === 0) {
            // 兜底：保持与旧版本兼容
            return 'layouts/sheep_style_complex';
        }
        const idx = Math.floor(Math.random() * pool.length);
        return pool[idx];
    }

    /**
     * 开始游戏
     * @param seed 关卡种子
     * @param useGridLayout 是否使用网格布局系统（默认为true）
     * @param layoutPath 可选：网格布局配置文件路径（相对于resources/）
     */
    public async startGame(
        seed?: string,
        useGridLayout: boolean = true,
        layoutPath?: string
    ): Promise<void> {
        // ✅ 在游戏真正开始时初始化WordMatcher（此时GlossService已加载）
        if (!this.wordMatcher) {
            this.initWordMatcher();
        }

        const dailySeed = seed || LevelGenerator.getDailySeed();
        const resolvedLayoutPath = this.resolveLayoutPath(layoutPath);
        // 记录本局使用的布局，供“再来一局”复用
        this.lastLayoutPath = resolvedLayoutPath;

        try {
            if (useGridLayout) {
                // ✅ 使用网格布局系统

                // 获取词库（用于分配字母）
                const glossService = GlossService.getInstance();
                const wordPool = glossService.getAllWords().slice(0, 100); // 使用前100个单词作为词库

                // 加载并转换为Level
                this.currentLevel = await GridLayoutLoader.loadAndConvertToLevel(
                    resolvedLayoutPath,
                    wordPool,
                    dailySeed
                );

                

                // 打印布局信息
                GridLayoutLoader.debugPrintLayout(
                    await GridLayoutLoader.loadLayout(resolvedLayoutPath)
                );

            } else {
                // ✅ 使用旧的随机生成系统
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
            return;
        }

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

        

        // 移除卡片（飞向牌槽动画），返回字母牌节点
        this.stackBoard.removeCard(card.id, targetLocalPos).then((tileNode) => {
            // 添加字母到牌槽，并传递飞过来的节点
            this.slotQueue.addLetter(card.letter, tileNode || undefined);

            // 并发开始单词验证（与飞行动画同时进行）
            const currentLetters = this.slotQueue.getLetters();
            const currentWord = currentLetters.join('');

            // ✅ 网络验证后缀（MABAN → 验证 MABAN/ABAN/BAN）
            if (currentWord.length >= 3) {
                // 自增输入版本号，并将快照传入验证批次
                const ver = ++this.inputVersion;
                this.validateSuffixes(currentLetters, ver);
            }
        });
    }

    /**
     * 并发验证所有后缀（MABAN → 并发验证 MABAN/ABAN/BAN），取最长匹配
     */
    private validateSuffixes(letters: string[], versionSnapshot?: number): void {
        // 记录发起时的版本号（若未显式传入，则取当前版本的快照）
        const versionAtDispatch = (typeof versionSnapshot === 'number') ? versionSnapshot : this.inputVersion;
        const totalLen = letters.length;
        const suffixPromises: Array<Promise<{ suffix: string; startIdx: number; valid: boolean }>> = [];
        // 标记本批次开始
        this.validationsInFlight++;

        // 生成所有后缀并发验证
        for (let leftCut = 0; leftCut <= totalLen - 3; leftCut++) {
            const suffix = letters.slice(leftCut).join('');
            if (suffix.length < 3) break;

            const promise = this.validationManager.validateConcurrent(suffix)
                .then(result => ({
                    suffix,
                    startIdx: leftCut,
                    valid: !!(result && result.valid)
                }))
                .catch(() => ({
                    suffix,
                    startIdx: leftCut,
                    valid: false
                }));

            suffixPromises.push(promise);
        }

        // 等待所有验证完成，取最长的valid=true后缀
        Promise.all(suffixPromises).then(results => {
            // 若期间输入已推进（版本号变化），丢弃本批次结果
            if (versionAtDispatch !== this.inputVersion) {
                // 本批次作废，同时减少计数
                this.validationsInFlight = Math.max(0, this.validationsInFlight - 1);
                return;
            }
            // 从长到短找第一个valid=true
            const validMatch = results.find(r => r.valid);

            if (validMatch && this.gameState === GameState.PLAYING) {
                const networkMatch = {
                    word: validMatch.suffix,
                    startIdx: validMatch.startIdx,
                    endIdx: totalLen - 1,
                    length: validMatch.suffix.length
                };

                this.currentMatch = networkMatch;
                this.gameState = GameState.BLINKING;
                this.slotQueue.startBlink(networkMatch);
            }
        })
        .catch(() => null)
        .then(() => {
            // 本批次结束
            this.validationsInFlight = Math.max(0, this.validationsInFlight - 1);
            // 如果此前记录了延迟结束原因（槽满或牌源耗尽），在验证结束后检查是否可以结束
            if (this.pendingEndReason && this.validationsInFlight === 0) {
                const canEndNow = (this.gameState !== GameState.BLINKING && this.gameState !== GameState.ENDED);
                if (this.pendingEndReason === 'SLOTS_FILLED') {
                    if (this.slotQueue.isFull() && canEndNow) {
                        this.endGame('牌槽已满');
                    }
                } else if (this.pendingEndReason === 'NO_TILES') {
                    if (this.stackBoard.getRemainingCount() === 0 && canEndNow) {
                        this.endGame('牌源耗尽');
                    }
                }
                this.pendingEndReason = null;
            }
        });
    }

    /**
     * 字母添加到牌槽后回调
     */
    private onLetterAdded(letters: string[]): void {
        // 任意新字母加入即视为“输入推进”，自增版本号
        this.inputVersion++;

        // 新输入发生时，取消旧的闪烁与自动消除倒计时，避免误消除旧匹配
        if (this.gameState === GameState.BLINKING) {
            this.slotQueue.stopBlink();
            this.currentMatch = null;
            this.gameState = GameState.PLAYING;
        }

        // ✅ 防御性检查：WordMatcher是否存在
        if (!this.wordMatcher) {
            console.warn('[StackGameApp] ⚠️ WordMatcher 未初始化，尝试重新初始化');
            this.initWordMatcher();

            // 再次检查
            if (!this.wordMatcher) {
                console.error('[StackGameApp] ❌ WordMatcher 初始化失败，无法检测单词');
                return;
            }
        }

        // ✅ 检测单词
        const match = this.wordMatcher.findWord(letters);

        if (match) {
            // 保存当前匹配
            this.currentMatch = match;

            // 切换到闪烁状态
            this.gameState = GameState.BLINKING;

            // 触发闪烁动画
            this.slotQueue.startBlink(match);
        }

        // ✅ 新增：当牌源耗尽（所有字母卡都已点击进入槽位）时，也需要结束游戏（即便槽未满）
        const remaining = this.stackBoard.getRemainingCount();
        if (remaining === 0) {
            // 若当前存在闪烁或网络验证在进行，则记录延迟结束原因，待验证结束/闪烁结束后再结算
            if (this.gameState === GameState.BLINKING || this.validationsInFlight > 0 || this.currentMatch) {
                this.pendingEndReason = 'NO_TILES';
            } else {
                this.endGame('牌源耗尽');
            }
        }
    }

    /**
     * "✓消除"按钮点击
     */
    private onConfirmRemove(): void {
        if (!this.currentMatch) return;

        this.removeWord(this.currentMatch);
    }

    /**
     * "⏭继续拼"按钮点击
     */
    private onContinueSpell(): void {
        
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

        this.removeWord(this.currentMatch);
    }

    /**
     * 消除单词
     */
    private removeWord(match: WordMatch): void {
        // 播放消除动画
        this.slotQueue.removeWord(match);

		// 记录消除的单词并获取释义
        const glossService = GlossService.getInstance();
        // ✅ 关键修复：直接调用 explain()，因为 NetworkService 已经立即 flush 到 localStorage
        const def = glossService.explain(match.word) || '';
        const scoreDelta = this.calculateScore(match.word);

        this.wordsCleared.push({
            word: match.word,
            valid: true,
            scoreDelta,
            definition: def,
            clearedAtMs: Date.now()
        });
        this.longestWordLen = Math.max(this.longestWordLen, match.word.length);

        // 展示释义气泡（定位到匹配区中心）
		const centerIdx = Math.floor((match.startIdx + match.endIdx) / 2);
		const centerPos = (this.slotQueue as any).getSlotWorldPosition
			? (this.slotQueue as any).getSlotWorldPosition(centerIdx)
			: null;
		const fallbackPos = this.slotQueue.getNextSlotWorldPosition();
		const worldPos = centerPos || fallbackPos || this.slotQueue.node.getWorldPosition();
		this.showDefinitionHint(match.word, def, worldPos);

        // 计算分数
        const wordScore = this.calculateScore(match.word);
        this.score += wordScore;

        // 清除当前匹配
        this.currentMatch = null;

        // 恢复游戏状态
        this.gameState = GameState.PLAYING;

        // 更新UI
        this.updateScoreLabel();
        this.updateClearRateLabel();

        // 检查游戏是否结束
        this.checkGameEnd();
        // 如果曾记录"槽满等待结束"，但现在已不满，清空该标记（不影响 NO_TILES 判定）
        if (this.pendingEndReason === 'SLOTS_FILLED' && !this.slotQueue.isFull()) {
            this.pendingEndReason = null;
        }
    }

    /**
     * 单词消除后回调
     */
    private onWordRemoved(word: string): void {
    }

    /**
     * 牌槽已满回调
     */
    private onSlotFull(): void {
        // 若当前有正在闪烁的匹配，或有验证在进行，则延迟结束到验证完成
        if (this.gameState === GameState.BLINKING || this.validationsInFlight > 0 || this.currentMatch) {
            this.pendingEndReason = 'SLOTS_FILLED';
            return;
        }
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

            // ✅ 修复：使用正确的方法名 explain()
            const cnMeaning = glossService.explain(word);

            if (cnMeaning) {
                // TODO: 显示词义浮层（需要GlossSheet组件）
                // 可以调用 GlossSheet 显示词义
            } else {
                console.warn(`[StackGameApp] ⚠️ 未找到词义: ${word}`);
            }
        } catch (error) {
            console.error(`[StackGameApp] ❌ 查询词义失败: ${word}`, error);
        }
    }

    /**
     * 检查游戏是否结束
     */
    private checkGameEnd(): void {
        const remaining = this.stackBoard.getRemainingCount();

        if (remaining === 0) {
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

        const result: GameResult = {
            score: this.score,
            durationMs: playDuration,
            wordsCleared: this.wordsCleared.slice().sort((a, b) => b.clearedAtMs - a.clearedAtMs),
            longestWordLen: this.longestWordLen
        };

        this.openResultPanel(result);
    }

    /**
     * 显示结果面板（填充数据与列表）
     */
    private openResultPanel(result: GameResult): void {
        if (!this.resultPanel) return;

        this.resultPanel.active = true;
        // ✅ 确保结果面板渲染在最顶层，避免被字母卡片/槽位遮挡
        if (this.resultPanel.parent && this.resultPanel.parent.isValid) {
            const parent = this.resultPanel.parent;
            const topIndex = parent.children.length - 1;
            this.resultPanel.setSiblingIndex(topIndex);
        }

        // 分数（仅结果面板）
        if (this.resultScoreLabel) {
            const scoreStr = ('0000' + result.score.toString()).slice(-4);
            this.resultScoreLabel.string = `得分：${scoreStr}`;
        }
        // 用时
        if (this.timeLabel) {
            this.timeLabel.string = `用时：${this.formatDuration(result.durationMs)}`;
        }
        // 词数
        if (this.wordsLabel) {
            this.wordsLabel.string = `清除词数：${result.wordsCleared.length}`;
        }
        // 列表
        if (this.wordsScrollView && this.wordsScrollView.content) {
            const content = this.wordsScrollView.content;
            // 清空旧项
            content.removeAllChildren();
            // 动态生成简易行（Word Definition Score）
            for (const ws of result.wordsCleared) {
                const row = new Node('Row');
                const wordLabel = row.addComponent(Label);
                wordLabel.string = `${ws.word.toUpperCase()}  ${ws.definition || '（无释义）'}  +${ws.scoreDelta}`;
                wordLabel.fontSize = 22;
                content.addChild(row);
            }
        }
    }

    private closeResultPanel(): void {
        if (this.resultPanel) {
            this.resultPanel.active = false;
        }
    }

    public onRetryClicked(): void {
        this.closeResultPanel();
        // 重置状态
        this.score = 0;
        this.wordsCleared = [];
        this.longestWordLen = 0;
        this.gameState = GameState.IDLE;
        // 再来一局：沿用上一局的布局，不重新随机
        this.startGame(undefined, true, this.lastLayoutPath || undefined);
    }

    public onBackToMenuClicked(): void {
        this.closeResultPanel();
        this.backToMenu();
    }

    private formatDuration(durationMs: number): string {
        const totalSec = Math.floor(durationMs / 1000);
        const mm = this.pad2(Math.floor(totalSec / 60));
        const ss = this.pad2(totalSec % 60);
        return `${mm}:${ss}`;
    }

    private pad2(n: number): string {
        const s = '0' + n.toString();
        return s.slice(-2);
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
        // 重新开始：保持当前布局不变
        this.startGame(undefined, true, this.lastLayoutPath || undefined);
    }

    /**
     * 返回主菜单
     */
    public backToMenu(): void {
        director.loadScene('MainMenu');
    }

    /**
     * 展示释义气泡（由上层在拿到 worldPos 后调用）
     */
    // 运行期跟踪：当前正在显示气泡的单词 → 视图
    private activeHintsByWord: Map<string, DefinitionHintView> = new Map();

    public showDefinitionHint(word: string, definition: string, worldPos: Vec3): void {
        if (!this.hintPool || !this.definitionHintsRoot) return;
        const uiTrans = this.definitionHintsRoot.getComponent(UITransform);
        if (!uiTrans) return;
        const local = uiTrans.convertToNodeSpaceAR(worldPos);
        const node = this.hintPool.acquire();
        // 提高Y偏移，避免被槽位遮挡
        node.setPosition(local.x, local.y + 72, 0);
        const view = node.getComponent(DefinitionHintView) || node.addComponent(DefinitionHintView);
        const cleanDef = (definition || '').trim();
        const text = cleanDef.length > 0
            ? `${word.toUpperCase()}·${cleanDef}`
            : `${word.toUpperCase()}·暂无释义`;
        view.show(text);
        // 记录活跃气泡（后续如需扩展异步更新，可利用此映射）
        const key = word.toUpperCase();
        this.activeHintsByWord.set(key, view);
        // 停留后开始退场，并在退场完成时回收
        setTimeout(() => {
            view.dismiss(() => {
                // 回收前移除映射
                const cur = this.activeHintsByWord.get(key);
                if (cur === view) {
                    this.activeHintsByWord.delete(key);
                }
                this.hintPool && this.hintPool.release(node);
            });
        }, HINT_STAY_MS);
    }

    // 已移除 Wiktionary 异步补齐相关代码

    /**
     * 加载远程Asset Bundle资源（从PreloadManager预加载的缓存获取）
     */
    private async loadRemoteAssets(): Promise<void> {
        try {

            const assetLoader = AssetLoader.getInstance();

            // 检查资源是否已完全加载并缓存
            const isCached = assetLoader.isAssetCached('bg', 'game_scene_bg/spriteFrame');

            if (!isCached) {
                console.warn('[StackGameApp] ⚠️ 场景背景图未预加载，开始动态加载');
            }

            // 使用AssetLoader从缓存获取（已完全加载，立即可用）
            const spriteFrame = await assetLoader.loadSpriteFrame('bg', 'game_scene_bg/spriteFrame');

            if (this.backgroundSprite) {
                this.backgroundSprite.spriteFrame = spriteFrame;
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

        // 无需取消已移除的事件监听

        // 清理验证状态
        this.validationManager.clearPendingValidation();

        if (this.endGameButton && this.endGameButton.node && this.endGameButton.node.isValid) {
            this.endGameButton.node.off(Button.EventType.CLICK, this.onEndGameButtonClicked, this);
            this.endGameButton.node.off(Node.EventType.TOUCH_END);
        }
    }

    private setupEndGameButton(): void {
        if (!this.endGameButton) {
            console.warn('[StackGameApp] ⚠️ endGameButton 未绑定，结束按钮功能不可用');
            return;
        }

        if (!this.endGameButton.node) {
            console.error('[StackGameApp] ❌ endGameButton.node 为空');
            return;
        }

        // 检查按钮组件是否存在
        const buttonComponent = this.endGameButton.node.getComponent(Button);
        if (!buttonComponent) {
            console.error('[StackGameApp] ❌ EndGameButton 节点缺少 Button 组件！请在编辑器中为该节点添加 Button 组件');
            return;
        }

        // 检查父节点链，确保没有禁用触摸的节点
        let currentNode: Node | null = this.endGameButton.node.parent;
        while (currentNode) {
            if (!currentNode.active) {
                console.error(`[StackGameApp] ❌ 父节点 "${currentNode.name}" 未激活，这会导致按钮无法点击！`);
            }
            currentNode = currentNode.parent;
        }

        // 检查按钮是否可交互
        if (!buttonComponent.interactable) {
            buttonComponent.interactable = true;
        }

        // 检查节点是否激活
        if (!this.endGameButton.node.active) {
            this.endGameButton.node.active = true;
        }

        // 确保父节点也激活
        let parent = this.endGameButton.node.parent;
        while (parent) {
            if (!parent.active) {
                parent.active = true;
            }
            parent = parent.parent;
        }

        // 绑定点击事件
        this.endGameButton.node.on(Button.EventType.CLICK, this.onEndGameButtonClicked, this);
        
        // 备用方案：监听触摸事件
        this.endGameButton.node.on(Node.EventType.TOUCH_END, () => {
            this.onEndGameButtonClicked();
        }, this);
        
        // 确保按钮节点在最上层（避免被其他节点遮挡）
        const buttonParent = this.endGameButton.node.parent;
        if (buttonParent) {
            const maxIndex = buttonParent.children.length - 1;
            this.endGameButton.node.setSiblingIndex(maxIndex);
        }
    }

    private onEndGameButtonClicked(): void {
        this.forceExitToMenu();
    }

    private forceExitToMenu(): void {
        this.gameState = GameState.ENDED;
        this.validationManager.clearPendingValidation();
        director.loadScene('MainMenu');
    }
}
