import { _decorator, AudioClip, AudioSource, director, Node, sys } from 'cc';
import { AssetLoader } from '../core/AssetLoader';

const { ccclass } = _decorator;

// 微信小游戏类型声明（用于环境分支避免429）
declare const wx: any;

// 音频管理器配置接口
interface AudioConfig {
    path: string;
    volume: number;
    loop: boolean;
}

@ccclass('AudioMgr')
export class AudioMgr {
    private static instance: AudioMgr | null = null;
    private audioSource: AudioSource | null = null;
    private audioClips: Map<string, AudioClip> = new Map();
    private isInitialized: boolean = false;
    private isEnabled: boolean = true;
    private masterVolume: number = 1.0;
    // 统一使用远程bundle名称（与 PreloadManager / AssetLoader 保持一致）
    private readonly BUNDLE_NAME: string = 'bundle';
    
    // 缓存用户设置
    private cachedSoundEnabled: boolean | null = null;
    private readonly SOUND_ENABLED_KEY: string = 'sound_enabled';

    /**
     * 获取单例实例
     */
    public static getInstance(): AudioMgr {
        if (!AudioMgr.instance) {
            AudioMgr.instance = new AudioMgr();
        }
        return AudioMgr.instance;
    }

    // 音效配置
    private audioConfigs: { [key: string]: AudioConfig } = {
        'correct': {
            path: 'audio/sfx/correct',
            volume: 0.7,
            loop: false
        },
        'wrong': {
            path: 'audio/sfx/wrong',
            volume: 0.6,
            loop: false
        },
        'tick': {
            path: 'audio/sfx/tick',
            volume: 0.4,
            loop: false
        },
        'click': {
            path: 'audio/sfx/click',
            volume: 0.5,
            loop: false
        },
        'bg_music': {
            path: 'audio/music/background',
            volume: 0.3,
            loop: true
        },
        'shuffle': {
            path: 'audio/sfx/shuffle',
            volume: 0.6,
            loop: false
        },
        'pop_up': {
            path: 'audio/sfx/popup',
            volume: 0.5,
            loop: false
        },
        'star': {
            path: 'audio/sfx/star',
            volume: 0.8,
            loop: false
        },
        'match_found': {
            path: 'audio/sfx/match_found',
            volume: 0.7,
            loop: false
        },
        'word_clear': {
            path: 'audio/sfx/word_clear',
            volume: 0.8,
            loop: false
        },
        'game_over': {
            path: 'audio/sfx/game_over',
            volume: 0.7,
            loop: false
        }
    };

    /**
     * 初始化音频管理器
     */
    init(): void {
        if (this.isInitialized) {
            // 即使已经初始化，也要重新读取设置并应用
            this.loadSettingsFromStorage();
            return;
        }

        // 从本地存储读取音效设置（默认开启）
        this.loadSettingsFromStorage();
        
        this.createAudioSource();
        this.loadAudioClips();
        
        this.isInitialized = true;
    }

    /**
     * 从本地存储读取音效设置
     */
    private loadSettingsFromStorage(): void {
        const soundEnabled = sys.localStorage.getItem(this.SOUND_ENABLED_KEY);
        
        // 如果有缓存设置，优先使用缓存
        if (this.cachedSoundEnabled !== null) {
            this.isEnabled = this.cachedSoundEnabled;
            console.log(`[AudioMgr] 使用缓存的音效设置: ${this.isEnabled}`);
            return;
        }
        
        // 否则从 localStorage 读取并缓存
        this.isEnabled = soundEnabled !== 'false'; // 默认开启
        this.cachedSoundEnabled = this.isEnabled;
        console.log(`[AudioMgr] 从存储加载音效设置并缓存: ${this.isEnabled}`);
    }

    /**
     * 强制从存储重新加载设置（场景切换时使用）
     */
    public forceReloadSettings(): void {
        const soundEnabled = sys.localStorage.getItem(this.SOUND_ENABLED_KEY);
        const newEnabled = soundEnabled !== 'false'; // 默认开启
        
        // 只有当设置真正改变时才更新
        if (this.cachedSoundEnabled !== newEnabled) {
            this.cachedSoundEnabled = newEnabled;
            this.isEnabled = newEnabled;
            console.log(`[AudioMgr] 强制重新加载音效设置: ${this.isEnabled}`);
            
            // 如果关闭音效，立即停止所有声音
            if (!this.isEnabled && this.audioSource) {
                this.audioSource.stop();
            }
        }
    }

    /**
     * 播放正确音效
     */
    playCorrect(): void {
        this.playSound('correct');
    }

    /**
     * 播放错误音效
     */
    playWrong(): void {
        this.playSound('wrong');
    }

    /**
     * 播放时钟滴答声
     */
    playTick(): void {
        this.playSound('tick');
    }

    /**
     * 播放点击音效
     */
    playClick(): void {
        this.playSound('click');
    }

    /**
     * 播放洗牌音效
     */
    playShuffle(): void {
        this.playSound('shuffle');
    }

    /**
     * 播放弹出音效
     */
    playPopUp(): void {
        this.playSound('pop_up');
    }

    /**
     * 播放星星收集音效
     */
    playStar(): void {
        this.playSound('star');
    }

    /**
     * 播放匹配发现音效 (闪烁开始)
     */
    playMatchFound(): void {
        this.playSound('match_found');
    }

    /**
     * 播放单词消除音效
     */
    playWordClear(): void {
        this.playSound('word_clear');
    }

    /**
     * 播放游戏结束音效
     */
    playGameOver(): void {
        this.playSound('game_over');
    }

    /**
     * 播放背景音乐
     */
    playBackgroundMusic(): void {
        this.playSound('bg_music');
    }

    /**
     * 停止背景音乐
     */
    stopBackgroundMusic(): void {
        this.stopSound('bg_music');
    }

    /**
     * 设置主音量
     * @param volume 音量值 (0.0 - 1.0)
     */
    setMasterVolume(volume: number): void {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        
    }

    /**
     * 获取主音量
     */
    getMasterVolume(): number {
        return this.masterVolume;
    }

    /**
     * 启用/禁用音频
     * @param enabled 是否启用音频
     */
    setEnabled(enabled: boolean): void {
        // 只有当设置真正改变时才更新
        if (this.cachedSoundEnabled !== enabled) {
            this.isEnabled = enabled;
            this.cachedSoundEnabled = enabled;
            
            // 保存到本地存储
            sys.localStorage.setItem(this.SOUND_ENABLED_KEY, enabled ? 'true' : 'false');
            
            if (!enabled) {
                this.stopAllSounds();
            }
            
            console.log(`[AudioMgr] 音效设置已更新并缓存: ${enabled}`);
        } else {
            console.log(`[AudioMgr] 音效设置无变化: ${enabled}`);
        }
    }

    /**
     * 检查音频是否启用
     */
    getEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * 停止所有声音
     */
    stopAllSounds(): void {
        if (this.audioSource) {
            this.audioSource.stop();
        }
    }

    private createAudioSource(): void {
        const scene = director.getScene();
        if (!scene) {
            console.warn('[AudioMgr] 无法获取当前场景，音频功能将被禁用');
            return;
        }

        // 先清理旧的音频源
        if (this.audioSource) {
            this.audioSource.stop();
            this.audioSource = null;
        }

        // 在场景根节点创建音频源节点
        const audioNode = scene.getChildByName('AudioMgrNode') || new Node('AudioMgrNode');
        
        if (!audioNode.parent) {
            scene.addChild(audioNode);
        }

        this.audioSource = audioNode.getComponent(AudioSource) || audioNode.addComponent(AudioSource);
        
        if (this.audioSource) {
            console.log('[AudioMgr] 音频源创建成功');
        } else {
            console.error('[AudioMgr] 音频源创建失败');
        }
    }

    private async loadAudioClips(): Promise<void> {
        const keys = Object.keys(this.audioConfigs);
        if (keys.length === 0) {
            return;
        }

        const isWeChat = typeof wx !== 'undefined';

        try {
            if (isWeChat) {
                // 微信环境：串行加载，进一步降低瞬时并发，配合底层 WXNetworkGate 避免429
                console.log('[AudioMgr] 📱 微信环境：串行预加载音频资源');
                for (const key of keys) {
                    const config = this.audioConfigs[key];
                    await this.loadSingleAudioClip(key, config.path);
                    // 轻微间隔，避免与其他资源尖峰重叠
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } else {
                // 其他环境：并行加载，加快启动速度
                console.log('[AudioMgr] 🌐 非微信环境：并行预加载音频资源');
                await Promise.all(
                    keys.map(key => {
                        const config = this.audioConfigs[key];
                        return this.loadSingleAudioClip(key, config.path);
                    })
                );
            }
        } catch (error) {
            console.warn('[AudioMgr] 部分音频加载失败（已忽略，运行时将按需重试）', error);
        }
    }

    private async loadSingleAudioClip(key: string, path: string): Promise<void> {
        const assetPath = path; // 在bundle中的资源路径，例如 audio/sfx/click
        const assetLoader = AssetLoader.getInstance();

        console.log(`[AudioMgr] 开始通过bundle加载音频: ${key} -> ${this.BUNDLE_NAME}/${assetPath}`);

        try {
            const clip = await assetLoader.loadAudioClip(this.BUNDLE_NAME, assetPath);
            if (clip) {
                this.audioClips.set(key, clip);
                console.log(`[AudioMgr] ✅ 音频加载成功: ${key}`);
            } else {
                console.warn(`[AudioMgr] 音频加载结果为空: ${this.BUNDLE_NAME}/${assetPath}`);
            }
        } catch (error) {
            console.warn(`[AudioMgr] 加载音频失败: ${this.BUNDLE_NAME}/${assetPath}`, error);
        }
    }

    private playSound(key: string): void {
        console.log(`[AudioMgr] 尝试播放音效: ${key}`);
        console.log(`[AudioMgr] isEnabled: ${this.isEnabled}, isInitialized: ${this.isInitialized}, audioSource存在: ${!!this.audioSource}`);
        
        if (!this.isEnabled || !this.isInitialized || !this.audioSource) {
            console.warn(`[AudioMgr] 音效播放条件不满足: ${key}`);
            return;
        }

        // 检查音频源是否有效（场景切换可能已销毁）
        if (!this.audioSource.node || !this.audioSource.node.isValid) {
            console.warn('[AudioMgr] 音频源已失效，重新创建');
            this.createAudioSource();
            if (!this.audioSource) {
                console.error('[AudioMgr] 音频源创建失败，无法播放音效');
                return;
            }
        }

        const clip = this.audioClips.get(key);
        const config = this.audioConfigs[key];

        if (!clip) {
            console.warn(`[AudioMgr] 音效不存在: ${key}`);
            return;
        }

        if (!config) {
            console.warn(`[AudioMgr] 音效配置不存在: ${key}`);
            return;
        }

        try {
            // 如果是背景音乐且已在播放，不重复播放
            if (key === 'bg_music' && this.audioSource.playing) {
                console.log('[AudioMgr] 背景音乐已在播放，跳过');
                return;
            }

            // 设置音频剪辑和参数
            this.audioSource.clip = clip;
            this.audioSource.loop = config.loop;
            this.audioSource.volume = config.volume * this.masterVolume;

            // 播放音频
            this.audioSource.play();
            console.log(`[AudioMgr] ✅ 音效播放命令已发送: ${key}`);
        } catch (error) {
            console.error(`[AudioMgr] 播放音效失败: ${key}`, error);
            // 尝试重新创建音频源
            this.createAudioSource();
        }
    }

    private stopSound(key: string): void {
        if (!this.audioSource || !this.audioSource.playing) {
            return;
        }

        const currentClip = this.audioSource.clip;
        const targetClip = this.audioClips.get(key);

        if (currentClip === targetClip) {
            this.audioSource.stop();
        }
    }

    /**
     * 预加载指定音效
     * @param key 音效键名
     */
    preloadAudio(key: string): Promise<void> {
        const config = this.audioConfigs[key];
        if (!config) {
            console.warn(`[AudioMgr] 音效配置不存在: ${key}`);
            return Promise.resolve();
        }

        return this.loadSingleAudioClip(key, config.path);
    }

    /**
     * 添加自定义音效配置
     * @param key 音效键名
     * @param config 音效配置
     */
    addAudioConfig(key: string, config: AudioConfig): void {
        this.audioConfigs[key] = config;
    }

    /**
     * 移除音效配置
     * @param key 音效键名
     */
    removeAudioConfig(key: string): void {
        delete this.audioConfigs[key];
        this.audioClips.delete(key);
    }

    /**
     * 获取当前加载的音效列表
     */
    getLoadedAudio(): string[] {
        return Array.from(this.audioClips.keys());
    }

    /**
     * 检查指定音效是否已加载
     * @param key 音效键名
     */
    isAudioLoaded(key: string): boolean {
        return this.audioClips.has(key);
    }

    /**
     * 获取音效统计信息
     */
    getStatistics(): { total: number; loaded: number; enabled: boolean } {
        return {
            total: Object.keys(this.audioConfigs).length,
            loaded: this.audioClips.size,
            enabled: this.isEnabled
        };
    }

    /**
     * 销毁音频管理器
     */
    destroy(): void {
        this.stopAllSounds();
        this.audioClips.clear();
        this.audioSource = null;
        this.isInitialized = false;
        
        
    }
}