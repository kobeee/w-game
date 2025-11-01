import { _decorator, Component, Node, director, sys, Sprite, assetManager, SpriteFrame, JsonAsset, Button } from 'cc';
import { GlossService } from '../data/GlossService';
import { WordBank } from '../data/WordBank';
import { GameBoard } from '../ui/GameBoard';
import { HUD } from '../ui/HUD';
import { GlossSheet } from '../ui/GlossSheet';
import { AudioMgr } from '../util/AudioMgr';
// 使用assetManager.loadBundle动态加载远程Asset Bundle资源


const { ccclass, property } = _decorator;

@ccclass('GameApp')
export class GameApp extends Component {
    @property(GameBoard)
    board: GameBoard = null!;

    @property(HUD)
    hud: HUD = null!;

    @property(GlossSheet)
    glossSheet: GlossSheet = null!;

    @property(Button)
    endButton: Button = null!;

    @property(Sprite)
    backgroundSprite: Sprite = null!; // 编辑器中不设置SpriteFrame，完全动态加载

    // 游戏服务
    private glossService: GlossService = new GlossService();
    private wordBank: WordBank = new WordBank();
    private audioMgr: AudioMgr = new AudioMgr();

    // 游戏状态
    private currentTargetWord: string = '';
    private gameTimer: number = 0;
    private gameTime: number = 60; // 60秒游戏时间
    private isGameRunning: boolean = false;
    private roundsCompleted: number = 0;

    protected async onLoad(): Promise<void> {
        console.log('[GameApp] 游戏开始初始化');
        
        await this.loadRemoteAssets(); // 动态加载远程资源
        await this.initializeGame();
        this.setupEventListeners();
        this.setupComponents();
        this.setupEndButton();
        this.ensureGlossSheetOnTop();
        
        // 开始游戏
        this.startGame();
    }

    /**
     * 手动提交当前选择的单词
     */
    submit(): void {
        if (!this.isGameRunning) {
            console.warn('[GameApp] 游戏未运行，无法提交');
            return;
        }

        const currentString = this.board.getCurrentString();
        console.log('[GameApp] 提交单词:', currentString, '目标:', this.currentTargetWord);

        if (currentString === this.currentTargetWord) {
            this.onCorrectAnswer();
        } else {
            this.onWrongAnswer();
        }
    }

    private async initializeGame(): Promise<void> {
        try {
            // 检查是否使用完整词库
            const useFull = sys.localStorage.getItem('use_full_dictionary') === 'true';
            console.log('[GameApp] 使用完整词库:', useFull);

            // 加载词库
            await this.glossService.load(useFull);
            
            // 初始化单词银行
            const wordBankData = this.glossService.getWordBankData();
            if (wordBankData) {
                this.wordBank.init(wordBankData);
                console.log('[GameApp] 词库初始化成功');
            } else {
                console.error('[GameApp] 词库数据为空');
            }

            // 初始化音频管理器
            this.audioMgr.init();
            
            // 重置生词本（确保从干净状态开始）
            this.glossService.resetSessionNotebook();
            
        } catch (error) {
            console.error('[GameApp] 初始化失败:', error);
        }
    }

    private setupEventListeners(): void {
        if (this.board) {
            this.board.node.on('board:change', this.onBoardChange, this);
        }
    }

    private setupComponents(): void {
        // 绑定HUD和GlossSheet
        if (this.hud && this.glossSheet) {
            this.hud.bindGlossSheet(this.glossSheet);
        }

        // 设置GlossSheet的收藏回调
        if (this.glossSheet) {
            this.glossSheet.setStarCallback((word: string) => {
                this.glossService.star(word);
                console.log('[GameApp] 单词已收藏:', word);
            });
        }
    }

    private setupEndButton(): void {
        if (this.endButton) {
            this.endButton.node.on(Button.EventType.CLICK, this.onEndButtonClicked, this);
            console.log('[GameApp] 结束游戏按钮事件已绑定');
        } else {
            console.warn('[GameApp] endButton 未设置，结束按钮功能不可用');
        }
    }

    private ensureGlossSheetOnTop(): void {
        if (!this.glossSheet || !this.glossSheet.node || !this.glossSheet.node.parent) {
            return;
        }

        const sheetNode = this.glossSheet.node;
        const parent = sheetNode.parent;
        const topIndex = parent.children.length - 1;
        sheetNode.setSiblingIndex(topIndex);
        console.log('[GameApp] 词义卡节点层级已提升至最上方，确保覆盖底部按钮');
    }

    private onEndButtonClicked(): void {
        console.log('[GameApp] 结束游戏按钮被点击，返回主菜单');
        this.exitToMenu();
    }

    private exitToMenu(): void {
        this.stopGameLoop();
        director.loadScene('MainMenu');
    }

    private stopGameLoop(): void {
        this.isGameRunning = false;

        if (this.gameTimer > 0) {
            clearInterval(this.gameTimer);
            this.gameTimer = 0;
        }
    }

    private startGame(): void {
        console.log('[GameApp] 游戏开始');
        
        this.isGameRunning = true;
        this.roundsCompleted = 0;
        
        // 重置HUD
        if (this.hud) {
            this.hud.reset();
        }

        // 开始计时器
        this.startTimer();
        
        // 开始第一轮
        this.nextRound();
    }

    private startTimer(): void {
        this.gameTime = 60;
        
        this.gameTimer = setInterval(() => {
            this.gameTime--;
            
            if (this.hud) {
                this.hud.updateTimer(this.gameTime);
                
                // 时间不足警告
                if (this.gameTime <= 10 && this.gameTime % 2 === 0) {
                    this.hud.playTimeWarning();
                }
            }
            
            if (this.gameTime <= 0) {
                this.endGame();
            }
        }, 1000);
    }

    private nextRound(): void {
        if (!this.isGameRunning) return;

        // 随机选择4-7字母的单词
        const targetLength = 4 + Math.floor(Math.random() * 4); // 4, 5, 6, 或 7
        this.currentTargetWord = this.wordBank.pick(targetLength);
        
        if (!this.currentTargetWord) {
            console.error('[GameApp] 无法获取目标单词，长度:', targetLength);
            // 尝试其他长度
            for (let len = 4; len <= 7; len++) {
                this.currentTargetWord = this.wordBank.pick(len);
                if (this.currentTargetWord) break;
            }
        }

        if (!this.currentTargetWord) {
            console.error('[GameApp] 无法获取任何目标单词，游戏无法继续');
            return;
        }

        console.log('[GameApp] 新回合开始，目标单词:', this.currentTargetWord);
        
        // 更新HUD显示目标词
        if (this.hud) {
            this.hud.setTargetWord(this.currentTargetWord);
        }
        
        // 生成网格
        if (this.board) {
            this.board.spawnGrid(this.currentTargetWord);
        }
    }

    private onBoardChange(currentString: string): void {
        console.log('[GameApp] 棋盘选择变化:', currentString);
        
        // 可以在这里添加实时反馈逻辑
        // 比如当字符串长度达到目标时自动提交
        if (currentString.length === this.currentTargetWord.length) {
            // 短暂延迟后自动检查
            this.scheduleFunction(() => {
                // 场景切换或节点销毁保护
                if (!this.node || !this.node.isValid) return;
                if (!this.isGameRunning) return;
                if (!this.board || !this.board.node || !this.board.node.isValid) return;

                const finalString = this.board.getCurrentString();
                if (finalString === this.currentTargetWord) {
                    this.onCorrectAnswer();
                } else {
                    this.onWrongAnswer();
                }
            }, 0.3);
        }
    }

    private onCorrectAnswer(): void {
        console.log('[GameApp] 回答正确!');
        
        // 播放正确音效
        this.audioMgr.playCorrect();
        
        // 显示正确状态
        if (this.board) {
            this.board.showCorrectAnswer();
        }
        
        // 更新分数
        if (this.hud) {
            this.hud.addScore(10);
        }
        
        // 获取词义并显示
        const zh = this.glossService.explain(this.currentTargetWord);
        
        // 将单词添加到生词本
        console.log('[GameApp] 准备将单词添加到生词本:', this.currentTargetWord);
        this.glossService.star(this.currentTargetWord);
        console.log('[GameApp] 单词已添加到生词本，当前生词本:', this.glossService.getSessionNotebook());
        
        // 记录到HUD以供信息按钮使用
        if (this.hud) {
            this.hud.recordLastGloss(this.currentTargetWord, zh);
        }
        
        // 显示词义卡片（自动1.2秒后隐藏）
        if (this.glossSheet) {
            this.glossSheet.show(this.currentTargetWord, zh, 1200);
        }
        
        this.roundsCompleted++;
        
        // 延迟后进入下一轮
        this.scheduleFunction(() => {
            this.nextRound();
        }, 1.5);
    }

    private onWrongAnswer(): void {
        console.log('[GameApp] 回答错误');
        
        // 播放错误音效
        this.audioMgr.playWrong();
        
        // 显示错误状态
        if (this.board) {
            this.board.showWrongAnswer();
        }
        
        // 短暂延迟后清空选择
        this.scheduleFunction(() => {
            if (this.board) {
                this.board.resetAllTiles();
            }
        }, 0.5);
    }

    private endGame(): void {
        console.log('[GameApp] 游戏结束');
        this.stopGameLoop();
        
        // 保存本局生词本（GlossService内部已处理）
        console.log('[GameApp] 本局完成回合数:', this.roundsCompleted);
        console.log('[GameApp] 最终分数:', this.hud?.getCurrentScore() || 0);
        
        // 跳转到结果页面
        director.loadScene('Result');
    }

    private scheduleFunction(callback: () => void, delay: number): void {
        setTimeout(() => {
            try {
                if (!this.node || !this.node.isValid) return;
                callback();
            } catch (err) {
                console.warn('[GameApp] 延迟回调执行失败或已无效:', err);
            }
        }, delay * 1000);
    }

    /**
     * 动态加载远程Asset Bundle资源
     */
    private async loadRemoteAssets(): Promise<void> {
        try {
            // 并行加载所有远程Bundle
            await Promise.all([
                // 加载游戏背景Bundle - 必须指定到spriteFrame子资源
                this.loadRemoteBundle('bg', 'game_scene_bg/spriteFrame', this.backgroundSprite),
                // 预加载词库Bundle（不需要立即使用，所以预加载即可）
                this.preloadWordsBundle()
            ]);
            console.log('[GameApp] 远程资源加载完成');
        } catch (error) {
            console.error('[GameApp] 远程资源加载失败:', error);
            // 可以加载本地备用资源或显示占位图
        }
    }

    /**
     * 预加载词库Bundle
     */
    private preloadWordsBundle(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log('[GameApp] 开始预加载words Bundle');
            assetManager.loadBundle('words', (err, bundle) => {
                if (err) {
                    console.error('[GameApp] words Bundle加载失败:', err);
                    reject(err);
                    return;
                }

                // 预加载词库文件
                const assetsToLoad = ['words_core', 'zh_gloss'];
                bundle.load(assetsToLoad, JsonAsset, (err, assets) => {
                    if (err) {
                        console.error('[GameApp] 词库资源预加载失败:', err);
                        reject(err);
                        return;
                    }

                    console.log('[GameApp] words Bundle预加载完成，包含资源:', assetsToLoad);
                    resolve();
                });
            });
        });
    }

    /**
     * 加载指定Bundle中的SpriteFrame资源
     */
    private loadRemoteBundle(bundleName: string, assetPath: string, sprite: Sprite | null): Promise<void> {
        return new Promise((resolve, reject) => {
            assetManager.loadBundle(bundleName, (err, bundle) => {
                if (err) {
                    console.error(`[GameApp] Bundle '${bundleName}' 加载失败:`, err);
                    reject(err);
                    return;
                }

                bundle.load(assetPath, SpriteFrame, (err, spriteFrame) => {
                    if (err) {
                        console.error(`[GameApp] SpriteFrame '${assetPath}' 加载失败:`, err);
                        reject(err);
                        return;
                    }

                    if (sprite) {
                        sprite.spriteFrame = spriteFrame;
                        console.log(`[GameApp] 成功设置SpriteFrame: ${bundleName}/${assetPath}`);
                    }
                    resolve();
                });
            });
        });
    }

    protected onDestroy(): void {
        this.stopGameLoop();
        
        // 清理事件监听
        if (this.board && this.board.node) {
            this.board.node.off('board:change', this.onBoardChange, this);
        }

        if (this.endButton && this.endButton.node) {
            this.endButton.node.off(Button.EventType.CLICK, this.onEndButtonClicked, this);
        }
        
        console.log('[GameApp] 组件销毁');
    }
}