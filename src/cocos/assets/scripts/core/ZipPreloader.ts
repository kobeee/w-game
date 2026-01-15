/**
 * ZIP 预加载管理器
 * 负责下载、解压、版本管理
 * 
 * 核心目标：将 111 次 HTTP 请求减少到 1-2 次，彻底根治微信小游戏 429 问题
 * 
 * 工作流程：
 * 1. 检查本地缓存
 * 2. 需要时下载 ZIP 包
 * 3. 本地解压
 * 4. 提供本地路径供 assetManager.loadBundle 使用
 */

import { sys, assetManager } from 'cc';

interface VersionInfo {
    version: string;
    buildTime: string;
    zipHash: string;
}

// 声明微信小游戏类型
declare const wx: any;

export class ZipPreloader {
    private static _instance: ZipPreloader = null;

    // 配置
    // 注意：服务器路由是 /remote/<path:filename>，所以需要加上 /remote 前缀
    private readonly REMOTE_BASE_URL = 'https://ai.elvis1949.cloudns.pro/w-game-remote/remote';
    private readonly ZIP_FILENAME = 'remote.zip';
    private readonly LOCAL_CACHE_DIR = 'w-game-cache';
    private readonly VERSION_FILE = 'version.json';

    // 状态
    private isWeChatEnv: boolean = false;
    private localCachePath: string = '';
    private progressCallback: (progress: number, message: string) => void = null;

    public static getInstance(): ZipPreloader {
        if (!ZipPreloader._instance) {
            ZipPreloader._instance = new ZipPreloader();
        }
        return ZipPreloader._instance;
    }

    constructor() {
        this.isWeChatEnv = typeof wx !== 'undefined';
        if (this.isWeChatEnv) {
            this.localCachePath = `${wx.env.USER_DATA_PATH}/${this.LOCAL_CACHE_DIR}`;
        }
    }

    /**
     * 设置进度回调
     */
    public setProgressCallback(callback: (progress: number, message: string) => void): void {
        this.progressCallback = callback;
    }

    /**
     * 主入口：确保资源已准备就绪
     * @returns 本地缓存路径（供 assetManager.loadBundle 使用），非微信环境返回空字符串
     */
    public async ensureResourcesReady(): Promise<string> {
        if (!this.isWeChatEnv) {
            console.log('[ZipPreloader] 非微信环境，跳过 ZIP 预加载');
            return '';
        }

        this.reportProgress(0, '正在检查资源缓存...');

        try {
            // 1. 检查本地缓存
            const needsDownload = await this.checkNeedsDownload();

            if (!needsDownload) {
                console.log('[ZipPreloader] 本地缓存有效，跳过下载');
                this.reportProgress(1, '资源缓存已就绪');
                return this.localCachePath;
            }

            // 2. 下载 ZIP
            this.reportProgress(0.1, '正在下载资源包...');
            const zipPath = await this.downloadZip();

            // 3. 解压 ZIP
            this.reportProgress(0.7, '正在解压资源...');
            await this.unzipToCache(zipPath);

            // 4. 清理临时文件
            await this.cleanupTempFile(zipPath);

            // 5. 保存版本信息
            await this.saveVersionInfo();

            this.reportProgress(1, '资源准备完成');
            console.log('[ZipPreloader] ZIP 预加载完成');

            return this.localCachePath;

        } catch (error) {
            console.error('[ZipPreloader] ZIP 预加载失败:', error);
            // 返回空字符串，让调用方回退到远程加载
            return '';
        }
    }

    /**
     * 检查是否需要下载
     */
    private async checkNeedsDownload(): Promise<boolean> {
        try {
            const fs = wx.getFileSystemManager();
            const versionPath = `${this.localCachePath}/${this.VERSION_FILE}`;

            // 检查版本文件是否存在
            try {
                fs.accessSync(versionPath);
            } catch (e) {
                console.log('[ZipPreloader] 版本文件不存在，需要下载');
                return true;
            }

            // 读取本地版本
            const localVersionStr = fs.readFileSync(versionPath, 'utf8') as string;
            const localVersion: VersionInfo = JSON.parse(localVersionStr);

            // 检查本地文件完整性
            const bundleConfigPath = `${this.localCachePath}/bundle/config.json`;
            try {
                fs.accessSync(bundleConfigPath);
                console.log('[ZipPreloader] 本地缓存完整，版本:', localVersion.version);
                return false;
            } catch (e) {
                console.log('[ZipPreloader] 本地缓存不完整，需要重新下载');
                return true;
            }

        } catch (error) {
            console.warn('[ZipPreloader] 检查缓存失败，将重新下载:', error);
            return true;
        }
    }

    /**
     * 下载 ZIP 文件
     */
    private downloadZip(): Promise<string> {
        return new Promise((resolve, reject) => {
            const zipUrl = `${this.REMOTE_BASE_URL}/${this.ZIP_FILENAME}`;
            console.log('[ZipPreloader] 开始下载:', zipUrl);

            const downloadTask = wx.downloadFile({
                url: zipUrl,
                success: (res: any) => {
                    if (res.statusCode === 200) {
                        console.log('[ZipPreloader] ZIP 下载完成:', res.tempFilePath);
                        resolve(res.tempFilePath);
                    } else {
                        reject(new Error(`下载失败，状态码: ${res.statusCode}`));
                    }
                },
                fail: (err: any) => {
                    reject(new Error(`下载失败: ${err.errMsg}`));
                }
            });

            // 监听下载进度
            downloadTask.onProgressUpdate((res: any) => {
                // 下载进度映射到 0.1 - 0.7
                const progress = 0.1 + (res.progress / 100) * 0.6;
                this.reportProgress(progress, `正在下载资源包 ${res.progress}%`);
            });
        });
    }

    /**
     * 解压 ZIP 到缓存目录
     */
    private unzipToCache(zipPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const fs = wx.getFileSystemManager();

            // 先清理旧缓存
            try {
                this.removeDirectory(this.localCachePath);
            } catch (e) {
                // 目录不存在，忽略
            }

            // 创建缓存目录
            try {
                fs.mkdirSync(this.localCachePath, true);
            } catch (e) {
                // 目录已存在，忽略
            }

            console.log('[ZipPreloader] 开始解压到:', this.localCachePath);

            fs.unzip({
                zipFilePath: zipPath,
                targetPath: this.localCachePath,
                success: () => {
                    console.log('[ZipPreloader] 解压完成');
                    resolve();
                },
                fail: (err: any) => {
                    reject(new Error(`解压失败: ${err.errMsg}`));
                }
            });
        });
    }

    /**
     * 递归删除目录
     */
    private removeDirectory(dirPath: string): void {
        const fs = wx.getFileSystemManager();

        try {
            const files = fs.readdirSync(dirPath);
            files.forEach((file: string) => {
                const filePath = `${dirPath}/${file}`;
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    this.removeDirectory(filePath);
                } else {
                    fs.unlinkSync(filePath);
                }
            });
            fs.rmdirSync(dirPath);
        } catch (e) {
            // 忽略错误
        }
    }

    /**
     * 清理临时文件
     */
    private cleanupTempFile(tempPath: string): Promise<void> {
        return new Promise((resolve) => {
            try {
                const fs = wx.getFileSystemManager();
                fs.unlinkSync(tempPath);
                console.log('[ZipPreloader] 临时文件已清理');
            } catch (e) {
                // 忽略错误
            }
            resolve();
        });
    }

    /**
     * 保存版本信息
     */
    private saveVersionInfo(): Promise<void> {
        return new Promise((resolve) => {
            try {
                const fs = wx.getFileSystemManager();
                const versionInfo: VersionInfo = {
                    version: '1.0.0',
                    buildTime: new Date().toISOString(),
                    zipHash: ''  // 可选：ZIP 文件 MD5
                };

                const versionPath = `${this.localCachePath}/${this.VERSION_FILE}`;
                fs.writeFileSync(versionPath, JSON.stringify(versionInfo), 'utf8');
                console.log('[ZipPreloader] 版本信息已保存');
            } catch (e) {
                console.warn('[ZipPreloader] 保存版本信息失败:', e);
            }
            resolve();
        });
    }

    /**
     * 报告进度
     */
    private reportProgress(progress: number, message: string): void {
        if (this.progressCallback) {
            this.progressCallback(progress, message);
        }
    }

    /**
     * 获取本地缓存路径（供其他模块使用）
     */
    public getLocalCachePath(): string {
        return this.localCachePath;
    }

    /**
     * 检查是否有本地缓存
     */
    public hasLocalCache(): boolean {
        if (!this.isWeChatEnv) return false;

        try {
            const fs = wx.getFileSystemManager();
            const bundleConfigPath = `${this.localCachePath}/bundle/config.json`;
            fs.accessSync(bundleConfigPath);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 清除本地缓存（用于调试或强制更新）
     */
    public clearCache(): void {
        if (!this.isWeChatEnv) return;

        try {
            this.removeDirectory(this.localCachePath);
            console.log('[ZipPreloader] 缓存已清除');
        } catch (e) {
            console.warn('[ZipPreloader] 清除缓存失败:', e);
        }
    }

    /**
     * 检查是否为微信环境
     */
    public isWeChat(): boolean {
        return this.isWeChatEnv;
    }

    /**
     * 获取 Bundle 的本地路径
     * @param bundleName Bundle 名称
     * @returns 本地路径或空字符串
     */
    public getBundleLocalPath(bundleName: string): string {
        if (!this.isWeChatEnv || !this.hasLocalCache()) {
            return '';
        }
        return `${this.localCachePath}/${bundleName}`;
    }
}

// 导出单例获取函数
export function getZipPreloader(): ZipPreloader {
    return ZipPreloader.getInstance();
}
