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
            path: 'audio/sfx/star_collect',
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
            return;
        }

        
        
        this.createAudioSource();
        this.loadAudioClips();
        
        this.isInitialized = true;
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
        this.isEnabled = enabled;
        
        if (!enabled) {
            this.stopAllSounds();
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

        // 在场景根节点创建音频源节点
        const audioNode = scene.getChildByName('AudioMgrNode') || new Node('AudioMgrNode');
        
        if (!audioNode.parent) {
            scene.addChild(audioNode);
        }

        this.audioSource = audioNode.getComponent(AudioSource) || audioNode.addComponent(AudioSource);
        
        if (this.audioSource) {
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
        
        
    }

    private loadSingleAudioClip(key: string, path: string): Promise<void> {
        return new Promise((resolve) => {
            console.log(`[AudioMgr] 开始加载音频: ${key} -> ${path}`);
            resources.load(path, AudioClip, (err, clip) => {
                if (err) {
                    console.warn(`[AudioMgr] 加载音频失败: ${path}`, err.message || err);
                    console.warn(`[AudioMgr] 错误详情:`, err);
                } else if (clip) {
                    this.audioClips.set(key, clip);
                    console.log(`[AudioMgr] ✅ 音频加载成功: ${key}`);
                } else {
                    console.warn(`[AudioMgr] 音频加载返回null: ${path}`);
                }
                resolve();
            });
        });
    }

    private playSound(key: string): void {
        console.log(`[AudioMgr] 尝试播放音效: ${key}`);
        console.log(`[AudioMgr] isEnabled: ${this.isEnabled}, isInitialized: ${this.isInitialized}, audioSource存在: ${!!this.audioSource}`);
        
        if (!this.isEnabled || !this.isInitialized || !this.audioSource) {
            console.warn(`[AudioMgr] 音效播放条件不满足: ${key}`);
            return;
        }

        const clip = this.audioClips.get(key);
        const config = this.audioConfigs[key];

        console.log(`[AudioMgr] 已加载的音效数量: ${this.audioClips.size}`);
        console.log(`[AudioMgr] 音效列表: ${Array.from(this.audioClips.keys()).join(', ')}`);

        if (!clip) {
            console.warn(`[AudioMgr] 音效不存在: ${key}`);
            return;
        }

        if (!config) {
            console.warn(`[AudioMgr] 音效配置不存在: ${key}`);
            return;
        }

        try {
            console.log(`[AudioMgr] 音效Clip存在: ${!!clip}, 音效配置存在: ${!!config}`);
            
            // 如果是背景音乐且已在播放，不重复播放
            if (key === 'bg_music' && this.audioSource.playing) {
                console.log('[AudioMgr] 背景音乐已在播放，跳过');
                return;
            }

            // 设置音频剪辑和参数
            this.audioSource.clip = clip;
            this.audioSource.loop = config.loop;
            this.audioSource.volume = config.volume * this.masterVolume;

            console.log(`[AudioMgr] 设置完成 - loop: ${config.loop}, volume: ${config.volume * this.masterVolume}`);

            // 播放音频
            this.audioSource.play();
            console.log(`[AudioMgr] ✅ 音效播放命令已发送: ${key}`);
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