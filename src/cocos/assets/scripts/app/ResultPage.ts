import { _decorator, Component, Node, Label, Button, ScrollView, Prefab, instantiate, director, sys, Color } from 'cc';
import { GlossService } from '../data/GlossService';
import { GlossSheet } from '../ui/GlossSheet';

const { ccclass, property } = _decorator;

@ccclass('ResultPage')
export class ResultPage extends Component {
    @property(Label)
    titleLabel: Label = null!;

    @property(Label)
    statisticsLabel: Label = null!;

    @property(Button)
    clearButton: Button = null!;

    @property(Button)
    returnButton: Button = null!;

    @property(ScrollView)
    notebookScrollView: ScrollView = null!;

    @property(Node)
    notebookContent: Node = null!;

    @property(Prefab)
    notebookItemPrefab: Prefab = null!;

    @property(GlossSheet)
    glossSheet: GlossSheet = null!;

    private glossService: GlossService = new GlossService();
    private sessionNotebook: string[] = [];

    protected async onLoad(): Promise<void> {
        console.log('[ResultPage] 结果页面初始化');
        
        this.setupButtons();
        await this.loadNotebookData();
        this.displayStatistics();
        this.displayNotebook();
    }

    private setupButtons(): void {
        // 设置清空按钮
        if (this.clearButton) {
            this.clearButton.node.on(Button.EventType.CLICK, this.onClearNotebook, this);
        }

        // 设置返回按钮
        if (this.returnButton) {
            this.returnButton.node.on(Button.EventType.CLICK, this.onReturnToMenu, this);
        }
    }

    private async loadNotebookData(): Promise<void> {
        try {
            // 初始化词汇服务（不需要加载完整词库）
            await this.glossService.load(false);
            
            // 获取本局生词本
            this.sessionNotebook = this.glossService.getSessionNotebook();
            
            console.log('[ResultPage] 本局生词本加载完成，单词数量:', this.sessionNotebook.length);
        } catch (error) {
            console.error('[ResultPage] 加载生词本数据失败:', error);
            this.sessionNotebook = [];
        }
    }

    private displayStatistics(): void {
        const totalWords = this.sessionNotebook.length;
        
        const statsText = `本局单词总数: ${totalWords}`;
        
        if (this.statisticsLabel) {
            this.statisticsLabel.string = statsText;
        }

        if (this.titleLabel) {
            this.titleLabel.string = totalWords > 0 ? '游戏结果 - 生词本' : '游戏结果 - 暂无生词';
        }
        
        console.log('[ResultPage] 统计信息显示:', statsText);
    }

    private displayNotebook(): void {
        if (!this.notebookContent || !this.notebookItemPrefab) {
            console.warn('[ResultPage] notebookContent或notebookItemPrefab未设置');
            return;
        }

        // 清空现有内容
        this.notebookContent.destroyAllChildren();

        if (this.sessionNotebook.length === 0) {
            this.createEmptyStateNode();
            return;
        }

        // 创建生词本条目
        for (const word of this.sessionNotebook) {
            this.createNotebookItem(word);
        }

        console.log('[ResultPage] 生词本显示完成，条目数量:', this.sessionNotebook.length);
    }

    private createEmptyStateNode(): void {
        // 创建空状态显示
        const emptyNode = new Node('EmptyState');
        const emptyLabel = emptyNode.addComponent(Label);
        
        emptyLabel.string = '本局没有查看词义的单词\n下次游戏时答对单词会自动显示词义哦！';
        emptyLabel.fontSize = 24;
        emptyLabel.lineHeight = 30;
        emptyLabel.color = new Color(128, 128, 128, 255);
        
        this.notebookContent.addChild(emptyNode);
    }

    private createNotebookItem(word: string): void {
        const itemNode = instantiate(this.notebookItemPrefab);
        
        // 查找子节点并设置内容
        const wordLabel = itemNode.getChildByPath('WordLabel')?.getComponent(Label);
        const zhLabel = itemNode.getChildByPath('DescLabel')?.getComponent(Label);

        if (wordLabel) {
            wordLabel.string = word.toUpperCase();
        }

        if (zhLabel) {
            // 获取中文释义
            const zhText = this.glossService.explain(word) || '暂无释义';
            // 限制中文显示长度
            const displayText = zhText.length > 25 ? zhText.substring(0, 25) + '...' : zhText;
            zhLabel.string = displayText;
        }

        // 设置整个条目为可点击，点击查看详细词义
        itemNode.on(Node.EventType.TOUCH_END, () => {
            this.onInfoButtonClicked(word);
        });

        this.notebookContent.addChild(itemNode);
    }


    private onInfoButtonClicked(word: string): void {
        console.log('[ResultPage] 查看详细词义:', word);
        
        if (this.glossSheet) {
            const zh = this.glossService.explain(word);
            this.glossSheet.show(word, zh, 0); // 不自动隐藏
        }
    }

    private onClearNotebook(): void {
        console.log('[ResultPage] 清空生词本');
        
        // 显示确认对话框（简化版本）
        this.showClearConfirmation();
    }

    private showClearConfirmation(): void {
        // 简化的确认逻辑
        console.log('[ResultPage] 确认清空生词本');
        
        // 使用 GlossService 清空生词本
        this.glossService.clearSessionNotebook();
        
        // 重新加载数据
        this.sessionNotebook = [];
        this.displayStatistics();
        this.displayNotebook();
        
        console.log('[ResultPage] 生词本已清空');
    }

    private onReturnToMenu(): void {
        console.log('[ResultPage] 返回主菜单');
        
        director.loadScene('MainMenu').then(() => {
            console.log('[ResultPage] 成功返回主菜单');
        }).catch(error => {
            console.error('[ResultPage] 返回主菜单失败:', error);
        });
    }

    /**
     * 导出生词本数据（可扩展功能）
     */
    exportNotebook(): string {
        const exportData = {
            timestamp: Date.now(),
            totalWords: this.sessionNotebook.length,
            words: this.sessionNotebook.map(word => ({
                word: word,
                zh: this.glossService.explain(word) || '暂无释义'
            }))
        };
        
        const jsonString = JSON.stringify(exportData, null, 2);
        console.log('[ResultPage] 导出生词本数据:', jsonString);
        
        return jsonString;
    }

    /**
     * 获取统计信息
     */
    getStatistics(): { total: number } {
        const total = this.sessionNotebook.length;
        
        return { total };
    }

    protected onDestroy(): void {
        // 清理事件监听
        if (this.clearButton) {
            this.clearButton.node.off(Button.EventType.CLICK, this.onClearNotebook, this);
        }
        
        if (this.returnButton) {
            this.returnButton.node.off(Button.EventType.CLICK, this.onReturnToMenu, this);
        }
        
        console.log('[ResultPage] 结果页面组件销毁');
    }
}