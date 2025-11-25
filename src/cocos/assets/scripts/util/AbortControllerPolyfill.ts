/**
 * 微信小游戏 AbortController polyfill
 * 解决微信小游戏环境不支持 AbortController 的问题
 */

// 检查是否已经支持 AbortController
if (typeof AbortController === 'undefined') {
    // 微信小游戏兼容的 Event polyfill
    if (typeof Event === 'undefined') {
        (globalThis as any).Event = class Event {
            public type: string;
            public bubbles: boolean;
            public cancelable: boolean;

            constructor(type: string, options?: { bubbles?: boolean; cancelable?: boolean }) {
                this.type = type;
                this.bubbles = options?.bubbles || false;
                this.cancelable = options?.cancelable || false;
            }
        };
    }

    // 简单的 AbortController 实现
    class AbortSignal {
        public aborted: boolean = false;
        private listeners: Array<() => void> = [];

        public addEventListener(type: string, listener: () => void) {
            if (type === 'abort') {
                this.listeners.push(listener);
            }
        }

        public removeEventListener(type: string, listener: () => void) {
            if (type === 'abort') {
                const index = this.listeners.indexOf(listener);
                if (index > -1) {
                    this.listeners.splice(index, 1);
                }
            }
        }

        public dispatchEvent(event: any) {
            if (event.type === 'abort' && !this.aborted) {
                this.aborted = true;
                this.listeners.forEach(listener => {
                    try {
                        listener();
                    } catch (e) {
                        console.error('AbortSignal listener error:', e);
                    }
                });
            }
        }
    }

    class AbortController {
        public signal: AbortSignal;

        constructor() {
            this.signal = new AbortSignal();
        }

        public abort() {
            const event = new (globalThis as any).Event('abort');
            this.signal.dispatchEvent(event);
        }
    }

    // 挂载到全局对象
    (globalThis as any).AbortController = AbortController;
    (globalThis as any).AbortSignal = AbortSignal;
}

export {};