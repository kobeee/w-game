import { _decorator, Component, Node, Label, Button, ScrollView, Prefab, instantiate, director, sys, Color, resources, Sprite, assetManager, SpriteFrame } from 'cc';
import { GlossService } from '../data/GlossService';
import { GlossSheet } from '../ui/GlossSheet';
// 使用assetManager.loadBundle动态加载远程Asset Bundle资源

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

    @property(Sprite)
    backgroundSprite: Sprite = null!; // 编辑器中不设置SpriteFrame，完全动态加载

    private glossService: GlossService;
    private sessionNotebook: string[] = [];

    protected async onLoad(): Promise<void> {
        console.log('[ResultPage] 结果页面初始化');
        
        // 初始化GlossService实例
        this.glossService = new GlossService();
        
        await this.loadRemoteAssets(); // 动态加载远程资源
        
        this.setupButtons();

        // 容错处理：自动绑定ScrollView的content
        if (!this.notebookContent && this.notebookScrollView && this.notebookScrollView.content) {
            this.notebookContent = this.notebookScrollView.content;
            console.warn('[ResultPage] notebookContent未绑定，已自动使用ScrollView.content');
        }

        // 预制体容错：若未绑定则自动从resources加载
        if (!this.notebookItemPrefab) {
            try {
                this.notebookItemPrefab = await this.loadPrefab('WordItem');
                if (this.notebookItemPrefab) {
                    console.warn('[ResultPage] notebookItemPrefab未绑定，已自动加载WordItem预制体');
                }
            } catch (e) {
                console.warn('[ResultPage] 自动加载WordItem预制体失败', e);
            }
        }

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
            // 初始化词汇服务（只加载词义库，用于显示中文释义）
            await this.glossService.load(false);
            
            // 直接从localStorage读取生词本数据
            const stored = sys.localStorage.getItem('notebook_session');
            console.log('[ResultPage] 从localStorage读取生词本数据:', stored);
            
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        // 过滤和规范化数据 - 修复微信小游戏环境下的扩展运算符问题
                        const filteredArray = parsed
                            .filter(item => typeof item === 'string' && item.trim() !== '')
                            .map(item => item.trim().toUpperCase());
                        
                        console.log('[ResultPage] 过滤后的数组:', filteredArray, '类型:', typeof filteredArray, '是数组:', Array.isArray(filteredArray));
                        
                        // 使用Array.from而不是扩展运算符，确保微信小游戏兼容性
                        const uniqueSet = new Set(filteredArray);
                        console.log('[ResultPage] 去重Set对象:', uniqueSet, '类型:', typeof uniqueSet);
                        
                        this.sessionNotebook = Array.from(uniqueSet);
                        console.log('[ResultPage] 去重后的数组:', this.sessionNotebook, '类型:', typeof this.sessionNotebook, '是数组:', Array.isArray(this.sessionNotebook));
                        
                        console.log('[ResultPage] 本局生词本加载完成，单词数量:', this.sessionNotebook.length);
                        console.log('[ResultPage] 单词列表:', this.sessionNotebook);
                    } else {
                        console.warn('[ResultPage] 生词本数据格式不正确，期待数组，实际:', typeof parsed, parsed);
                        this.sessionNotebook = [];
                    }
                } catch (parseError) {
                    console.warn('[ResultPage] 生词本数据解析失败:', parseError);
                    this.sessionNotebook = [];
                }
            } else {
                console.log('[ResultPage] 没有找到生词本数据');
                this.sessionNotebook = [];
            }
            
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
        console.log('[ResultPage] displayNotebook开始，sessionNotebook:', this.sessionNotebook);
        console.log('[ResultPage] sessionNotebook类型:', typeof this.sessionNotebook, '是数组:', Array.isArray(this.sessionNotebook));
        console.log('[ResultPage] sessionNotebook长度:', this.sessionNotebook.length);
        
        // 详细检查每个元素
        if (Array.isArray(this.sessionNotebook)) {
            this.sessionNotebook.forEach((item, index) => {
                console.log(`[ResultPage] 元素[${index}]:`, item, '类型:', typeof item, '是字符串:', typeof item === 'string');
            });
        }
        
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
            // 额外的类型检查
            if (typeof word === 'string' && word.trim() !== '') {
                this.createNotebookItem(word);
            } else {
                console.warn('[ResultPage] 跳过无效的生词本条目:', typeof word, word);
            }
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
        // 确保word是字符串类型
        if (typeof word !== 'string') {
            console.warn('[ResultPage] createNotebookItem收到非字符串参数:', typeof word, word);
            return;
        }

        const itemNode = instantiate(this.notebookItemPrefab);
        
        // 查找子节点并设置内容（兼容ZhLabel与DescLabel）
        const wordLabel = itemNode.getChildByPath('WordLabel')?.getComponent(Label);
        const zhLabel = (itemNode.getChildByPath('DescLabel') || itemNode.getChildByPath('ZhLabel'))?.getComponent(Label);

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

    /**
     * 动态加载远程Asset Bundle资源
     */
    private async loadRemoteAssets(): Promise<void> {
        try {
            // 加载结果页背景Bundle - 必须指定到spriteFrame子资源
            await this.loadRemoteBundle('bg', 'result_scene_bg/spriteFrame', this.backgroundSprite);
            console.log('[ResultPage] 远程背景资源加载完成');
        } catch (error) {
            console.error('[ResultPage] 远程资源加载失败:', error);
            // 可以加载本地备用资源或显示占位图
        }
    }

    /**
     * 加载指定Bundle中的SpriteFrame资源
     */
    private loadRemoteBundle(bundleName: string, assetPath: string, sprite: Sprite | null): Promise<void> {
        return new Promise((resolve, reject) => {
            assetManager.loadBundle(bundleName, (err, bundle) => {
                if (err) {
                    console.error(`[ResultPage] Bundle '${bundleName}' 加载失败:`, err);
                    reject(err);
                    return;
                }

                bundle.load(assetPath, SpriteFrame, (err, spriteFrame) => {
                    if (err) {
                        console.error(`[ResultPage] SpriteFrame '${assetPath}' 加载失败:`, err);
                        reject(err);
                        return;
                    }

                    if (sprite) {
                        sprite.spriteFrame = spriteFrame;
                        console.log(`[ResultPage] 成功设置SpriteFrame: ${bundleName}/${assetPath}`);
                    }
                    resolve();
                });
            });
        });
    }

    private loadPrefab(path: string): Promise<Prefab | null> {
        return new Promise((resolve) => {
            resources.load(path, Prefab, (err, prefab) => {
                if (!err && prefab) {
                    resolve(prefab);
                } else {
                    resolve(null);
                }
            });
        });
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
        
        director.loadScene('MainMenu', () => {
            console.log('[ResultPage] 成功返回主菜单');
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
        if (this.clearButton && this.clearButton.node) {
            this.clearButton.node.off(Button.EventType.CLICK, this.onClearNotebook, this);
        }
        
        if (this.returnButton && this.returnButton.node) {
            this.returnButton.node.off(Button.EventType.CLICK, this.onReturnToMenu, this);
        }
        
        console.log('[ResultPage] 结果页面组件销毁');
    }

    /**
     * Asset Bundle系统会自动处理远程资源加载
     * 只需要在场景中直接设置SpriteFrame引用即可
     */
}