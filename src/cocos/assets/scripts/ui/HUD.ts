import { _decorator, Component, Node, Label, Color, tween, Vec3 } from 'cc';
import { GlossSheet } from './GlossSheet';

const { ccclass, property } = _decorator;

@ccclass('HUD')
export class HUD extends Component {
    @property(Label)
    timerLabel: Label = null!;

    @property(Label)
    scoreLabel: Label = null!;

    @property(Label)
    targetWordLabel: Label = null!;

    private currentScore: number = 0;
    private remainingTime: number = 60;
    private boundGlossSheet: GlossSheet | null = null;
    private lastWord: string = '';
    private lastZh: string = '';
    private currentTargetWord: string = '';

    protected onLoad(): void {
        this.updateDisplay();
    }

    /**
     * 绑定词义卡组件
     * @param sheet GlossSheet组件实例
     */
    bindGlossSheet(sheet: GlossSheet): void {
        this.boundGlossSheet = sheet;
        console.log('[HUD] 已绑定词义卡组件');
    }

    /**
     * 更新计时器
     * @param seconds 剩余秒数
     */
    updateTimer(seconds: number): void {
        this.remainingTime = Math.max(0, seconds);
        this.updateTimerDisplay();
    }

    /**
     * 更新分数
     * @param score 当前分数
     */
    updateScore(score: number): void {
        this.currentScore = score;
        this.updateScoreDisplay();
    }

    /**
     * 增加分数
     * @param points 增加的分数
     */
    addScore(points: number): void {
        this.updateScore(this.currentScore + points);
    }

    /**
     * 获取当前分数
     */
    getCurrentScore(): number {
        return this.currentScore;
    }

    /**
     * 获取剩余时间
     */
    getRemainingTime(): number {
        return this.remainingTime;
    }

    /**
     * 设置目标词显示
     * @param targetWord 目标单词
     */
    setTargetWord(targetWord: string): void {
        this.currentTargetWord = targetWord.toUpperCase();
        this.updateTargetWordDisplay();
    }

    /**
     * 重置HUD状态
     */
    reset(): void {
        this.currentScore = 0;
        this.remainingTime = 60;
        this.lastWord = '';
        this.lastZh = '';
        this.currentTargetWord = '';
        this.updateDisplay();
    }


    /**
     * 记录最近查看的词义
     * @param word 单词
     * @param zh 中文释义
     */
    recordLastGloss(word: string, zh: string | null): void {
        this.lastWord = word;
        this.lastZh = zh || '';
    }


    private updateDisplay(): void {
        this.updateTimerDisplay();
        this.updateScoreDisplay();
        this.updateTargetWordDisplay();
    }

    private updateTimerDisplay(): void {
        if (!this.timerLabel) return;

        const minutes = Math.floor(this.remainingTime / 60);
        const seconds = this.remainingTime % 60;
        
        // 格式化为 MM:SS
        const secondsStr = seconds < 10 ? '0' + seconds : seconds.toString();
        const timeText = `${minutes}:${secondsStr}`;
        this.timerLabel.string = timeText;

        // 时间不足时的视觉提醒
        if (this.remainingTime <= 10) {
            // 红色警告
            this.timerLabel.color = new Color(220, 20, 60, 255);
        } else if (this.remainingTime <= 30) {
            // 橙色提醒
            this.timerLabel.color = new Color(255, 165, 0, 255);
        } else {
            // 正常黑色（游戏背景是浅色）
            this.timerLabel.color = new Color(255, 255, 255, 255);
        }
    }

    private updateScoreDisplay(): void {
        if (!this.scoreLabel) return;

        this.scoreLabel.string = this.currentScore.toString();
        
        // 可以添加分数变化的动画效果
        this.playScoreUpdateAnimation();
    }

    private updateTargetWordDisplay(): void {
        if (!this.targetWordLabel) return;

        if (this.currentTargetWord) {
            this.targetWordLabel.string = `目标: ${this.currentTargetWord}`;
        } else {
            this.targetWordLabel.string = '';
        }
    }

    private playScoreUpdateAnimation(): void {
        if (!this.scoreLabel) return;

        // 简单的缩放动画表示分数更新
        const originalScale = this.scoreLabel.node.scale.clone();
        
        tween(this.scoreLabel.node)
            .to(0.1, { scale: new Vec3(1.2, 1.2, 1) })
            .to(0.1, { scale: originalScale })
            .start();
    }

    /**
     * 播放时间即将结束的警告动画
     */
    playTimeWarning(): void {
        if (!this.timerLabel || this.remainingTime > 10) return;

        // 闪烁动画
        const originalColor = this.timerLabel.color.clone();
        const warningColor = new Color(255, 0, 0, 255);
        
        tween(this.timerLabel)
            .to(0.2, { color: warningColor })
            .to(0.2, { color: originalColor })
            .to(0.2, { color: warningColor })
            .to(0.2, { color: originalColor })
            .start();
    }

    /**
     * 获取格式化的时间字符串
     */
    getFormattedTime(): string {
        const minutes = Math.floor(this.remainingTime / 60);
        const seconds = this.remainingTime % 60;
        const secondsStr = seconds < 10 ? '0' + seconds : seconds.toString();
        return `${minutes}:${secondsStr}`;
    }

    /**
     * 检查是否时间不足
     */
    isTimeRunningOut(): boolean {
        return this.remainingTime <= 10;
    }

    /**
     * 检查游戏是否结束
     */
    isGameOver(): boolean {
        return this.remainingTime <= 0;
    }

    protected onDestroy(): void {
        // HUD销毁清理
        console.log('[HUD] 组件销毁');
    }
}