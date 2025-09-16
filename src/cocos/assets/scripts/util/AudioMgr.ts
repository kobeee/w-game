import { _decorator, AudioClip, AudioSource, resources, director, Node } from 'cc';

const { ccclass } = _decorator;

// 音频管理器配置接口
interface AudioConfig {
    path: string;
    volume: number;
    loop: boolean;
}

@ccclass('AudioMgr')
export class AudioMgr {
    private audioSource: AudioSource | null = null;
    private audioClips: Map<string, AudioClip> = new Map();
    private isInitialized: boolean = false;
    private isEnabled: boolean = true;
    private masterVolume: number = 1.0;

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
        }
    };

    /**
     * 初始化音频管理器
     */
    init(): void {
        if (this.isInitialized) {
            console.log('[AudioMgr] 音频管理器已初始化');
            return;
        }

        console.log('[AudioMgr] 开始初始化音频管理器');
        
        this.createAudioSource();
        this.loadAudioClips();
        
        this.isInitialized = true;
        console.log('[AudioMgr] 音频管理器初始化完成');
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
        console.log('[AudioMgr] 主音量设置为:', this.masterVolume);
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
        this.isEnabled = enabled;
        
        if (!enabled) {
            this.stopAllSounds();
        }
        
        console.log('[AudioMgr] 音频', enabled ? '已启用' : '已禁用');
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
        const loadPromises: Promise<void>[] = [];

        for (const key in this.audioConfigs) {
            if (this.audioConfigs.hasOwnProperty(key)) {
                const config = this.audioConfigs[key];
                loadPromises.push(this.loadSingleAudioClip(key, config.path));
            }
        }

        try {
            await Promise.all(loadPromises);
        } catch (error) {
            console.warn('[AudioMgr] 部分音频加载失败', error);
        }
        
        console.log('[AudioMgr] 音频资源加载完成，成功加载', this.audioClips.size, '个音效');
    }

    private loadSingleAudioClip(key: string, path: string): Promise<void> {
        return new Promise((resolve) => {
            resources.load(path, AudioClip, (err, clip) => {
                if (err) {
                    console.warn(`[AudioMgr] 加载音频失败: ${path}`, err.message || err);
                } else {
                    this.audioClips.set(key, clip);
                    console.log(`[AudioMgr] 成功加载音频: ${key}`);
                }
                resolve();
            });
        });
    }

    private playSound(key: string): void {
        if (!this.isEnabled || !this.isInitialized || !this.audioSource) {
            return;
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
                return;
            }

            // 设置音频剪辑和参数
            this.audioSource.clip = clip;
            this.audioSource.loop = config.loop;
            this.audioSource.volume = config.volume * this.masterVolume;

            // 播放音频
            this.audioSource.play();

            console.log(`[AudioMgr] 播放音效: ${key}`);
        } catch (error) {
            console.error(`[AudioMgr] 播放音效失败: ${key}`, error);
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
            console.log(`[AudioMgr] 停止音效: ${key}`);
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
        console.log(`[AudioMgr] 添加音效配置: ${key}`);
    }

    /**
     * 移除音效配置
     * @param key 音效键名
     */
    removeAudioConfig(key: string): void {
        delete this.audioConfigs[key];
        this.audioClips.delete(key);
        console.log(`[AudioMgr] 移除音效配置: ${key}`);
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
        
        console.log('[AudioMgr] 音频管理器已销毁');
    }
}