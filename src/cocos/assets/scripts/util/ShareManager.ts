import { _decorator } from 'cc';

// 微信小游戏类型声明
declare const wx: any;

const { ccclass } = _decorator;

/**
 * 微信小游戏分享管理器
 * 支持分享给好友和分享到朋友圈
 */
@ccclass('ShareManager')
export class ShareManager {
    private static instance: ShareManager | null = null;
    private isInitialized: boolean = false;

    private constructor() {}

    /**
     * 获取单例实例
     */
    public static getInstance(): ShareManager {
        if (!ShareManager.instance) {
            ShareManager.instance = new ShareManager();
        }
        return ShareManager.instance;
    }

    /**
     * 初始化分享功能
     * 在应用启动时调用，设置右上角菜单的分享按钮
     */
    public init(): void {
        if (this.isInitialized) {
            console.log('[ShareManager] 分享功能已初始化，跳过');
            return;
        }

        if (typeof wx === 'undefined') {
            console.log('[ShareManager] 非微信环境，跳过分享初始化');
            return;
        }

        try {
            // 设置分享给好友的默认内容
            wx.onShareAppMessage(() => {
                return this.getShareAppMessageConfig();
            });

            // 设置分享到朋友圈的默认内容
            wx.onShareTimeline(() => {
                return this.getShareTimelineConfig();
            });

            // 显示右上角分享按钮
            wx.showShareMenu({
                withShareTicket: true,
                menus: ['shareAppMessage', 'shareTimeline']
            });

            this.isInitialized = true;
            console.log('[ShareManager] ✅ 分享功能初始化成功');
        } catch (error) {
            console.error('[ShareManager] ❌ 分享功能初始化失败:', error);
        }
    }

    /**
     * 获取分享给好友的配置
     * 不指定 imageUrl，使用微信小游戏默认 logo
     */
    private getShareAppMessageConfig(): any {
        return {
            title: '猜单词挑战',
            desc: '一起来挑战单词拼写游戏，看看你能拼出多少单词！',
            // 不指定 imageUrl，使用微信小游戏默认 logo
            query: 'from=share'
        };
    }

    /**
     * 获取分享到朋友圈的配置
     * 不指定 imageUrl，使用微信小游戏默认 logo
     */
    private getShareTimelineConfig(): any {
        return {
            title: '猜单词挑战 - 拼出单词，挑战高分！',
            // 不指定 imageUrl，使用微信小游戏默认 logo
            query: 'from=share'
        };
    }

    /**
     * 主动触发分享给好友
     * @param title 分享标题（可选，覆盖默认标题）
     * @param desc 分享描述（可选，覆盖默认描述）
     */
    public shareAppMessage(title?: string, desc?: string): void {
        if (typeof wx === 'undefined') {
            console.log('[ShareManager] 非微信环境，无法分享');
            return;
        }

        try {
            const config = this.getShareAppMessageConfig();

            // 如果提供了自定义标题和描述，覆盖默认值
            if (title) {
                config.title = title;
            }
            if (desc) {
                config.desc = desc;
            }

            wx.shareAppMessage(config);
            console.log('[ShareManager] 触发分享给好友');
        } catch (error) {
            console.error('[ShareManager] 分享给好友失败:', error);
        }
    }

    /**
     * 主动触发分享到朋友圈
     * @param title 分享标题（可选，覆盖默认标题）
     */
    public shareTimeline(title?: string): void {
        if (typeof wx === 'undefined') {
            console.log('[ShareManager] 非微信环境，无法分享');
            return;
        }

        try {
            const config = this.getShareTimelineConfig();

            // 如果提供了自定义标题，覆盖默认值
            if (title) {
                config.title = title;
            }

            wx.shareTimeline(config);
            console.log('[ShareManager] 触发分享到朋友圈');
        } catch (error) {
            console.error('[ShareManager] 分享到朋友圈失败:', error);
        }
    }

    /**
     * 更新分享内容（用于游戏内动态更新）
     * @param title 分享标题
     * @param score 游戏分数（可选）
     * @param mode 游戏模式（可选）
     */
    public updateShareContent(title: string, score?: number, mode?: string): void {
        if (typeof wx === 'undefined') {
            return;
        }

        try {
            // 更新分享给好友的内容
            wx.onShareAppMessage(() => {
                let desc = '一起来挑战单词拼写游戏，看看你能拼出多少单词！';
                if (score !== undefined) {
                    desc = `我在${mode || '猜单词'}中获得了${score}分，快来挑战吧！`;
                }

                return {
                    title: title,
                    desc: desc,
                    imageUrl: this.getShareImage(),
                    query: this.getShareQuery(),
                    path: '/pages/index/index'
                };
            });

            // 更新分享到朋友圈的内容
            wx.onShareTimeline(() => {
                let timelineTitle = title;
                if (score !== undefined) {
                    timelineTitle = `${title} - 我获得了${score}分！`;
                }

                return {
                    title: timelineTitle,
                    imageUrl: this.getShareImage(),
                    query: this.getShareQuery()
                };
            });

            console.log('[ShareManager] ✅ 分享内容已更新');
        } catch (error) {
            console.error('[ShareManager] 更新分享内容失败:', error);
        }
    }
}