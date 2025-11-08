import { NetworkService } from './NetworkService';
import { sys } from 'cc';
declare const wx: any;

export type WsValidateResult = {
    valid: boolean;
    definition?: string;
    source: 'cache' | 'gemini' | 'fallback';
    latencyMs: number;
    cache?: boolean;
};

export class WebSocketWordChannel {
    private ws: WebSocket | null = null;
    private connected = false;
    private pending: Map<string, { resolve: (v: WsValidateResult) => void; reject: (e: any) => void; timer: any }> = new Map();
    private sessionId: string = '';

    async connect(clientId: string): Promise<void> {
        if (this.connected && this.ws) return;

        const base = NetworkService.getBaseUrl(); // e.g. https://domain/w-game-service
        const url = new URL(base);
        const proto = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${url.host}/w-game-service/ws/word?clientId=${encodeURIComponent(clientId)}`;

        return new Promise((resolve, reject) => {
            // 微信小游戏：使用 wx.connectSocket
            if (sys.platform === sys.Platform.WECHAT_GAME && typeof wx !== 'undefined' && wx && wx.connectSocket) {
                try {
                    const task = wx.connectSocket({ url: wsUrl, header: {} });
                    // 模拟 WebSocket 接口
                    this.ws = {
                        send: (data: any) => task.send({ data: String(data) }),
                        close: () => task.close({ code: 1000, reason: 'client_close' })
                    } as unknown as WebSocket;

                    task.onOpen(() => {
                        this.connected = true;
                        try { task.send({ data: JSON.stringify({ type: 'hello', clientId, scene: 'stack', ts: Date.now() }) }); } catch (_) {}
                        resolve();
                    });
                    task.onMessage((evt: any) => {
                        try {
                            const raw = typeof evt.data === 'string' ? evt.data : (evt.data ? String(evt.data) : '');
                            const msg = JSON.parse(raw);
                            if (msg.type === 'hello-ack') {
                                this.sessionId = msg.sessionId || '';
                                return;
                            }
                            if (msg.type === 'validate-res') {
                                const rid = msg.rid as string;
                                const rec = this.pending.get(rid);
                                if (rec) {
                                    clearTimeout(rec.timer);
                                    this.pending.delete(rid);
                                    rec.resolve({
                                        valid: !!msg.valid,
                                        definition: msg.definition,
                                        source: (msg.source || 'gemini'),
                                        latencyMs: Number(msg.latencyMs || 0),
                                        cache: !!msg.cache,
                                    });
                                }
                                return;
                            }
                        } catch (_) {}
                    });
                    const onCloseOrError = (reason: string) => {
                        this.connected = false;
                        try { task.close({ code: 1000, reason }); } catch (_) {}
                        this.ws = null;
                        this.pending.forEach((rec) => { clearTimeout(rec.timer); rec.reject(new Error(reason)); });
                        this.pending.clear();
                    };
                    task.onClose(() => onCloseOrError('WS_CLOSED'));
                    task.onError(() => onCloseOrError('WS_ERROR'));
                } catch (e) {
                    this.connected = false;
                    this.ws = null;
                    reject(e);
                }
                return;
            }

            // 浏览器 / 桌面：标准 WebSocket
            try {
                const ws = new WebSocket(wsUrl);
                this.ws = ws;
                ws.onopen = () => {
                    this.connected = true;
                    try { ws.send(JSON.stringify({ type: 'hello', clientId, scene: 'stack', ts: Date.now() })); } catch (_) {}
                    resolve();
                };
                ws.onmessage = (evt) => {
                    try {
                        const msg = JSON.parse(evt.data);
                        if (msg.type === 'hello-ack') { this.sessionId = msg.sessionId || ''; return; }
                        if (msg.type === 'validate-res') {
                            const rid = msg.rid as string;
                            const rec = this.pending.get(rid);
                            if (rec) {
                                clearTimeout(rec.timer);
                                this.pending.delete(rid);
                                rec.resolve({
                                    valid: !!msg.valid,
                                    definition: msg.definition,
                                    source: (msg.source || 'gemini'),
                                    latencyMs: Number(msg.latencyMs || 0),
                                    cache: !!msg.cache,
                                });
                            }
                            return;
                        }
                    } catch (_) {}
                };
                const onCloseOrError = (reason: string) => {
                    this.connected = false;
                    try { this.ws && this.ws.close(); } catch (_) {}
                    this.ws = null;
                    this.pending.forEach((rec) => { clearTimeout(rec.timer); rec.reject(new Error(reason)); });
                    this.pending.clear();
                };
                ws.onclose = () => onCloseOrError('WS_CLOSED');
                ws.onerror = () => onCloseOrError('WS_ERROR');
            } catch (e) {
                this.connected = false;
                this.ws = null;
                reject(e);
            }
        });
    }

    isConnected(): boolean { return this.connected && !!this.ws; }

    async validate(word: string, timeoutMs: number = 2500): Promise<WsValidateResult> {
        if (!this.isConnected() || !this.ws) throw new Error('WS_NOT_CONNECTED');
        const rid = this.generateRid();
        const payload = { type: 'validate', rid, word: word.toUpperCase() };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(rid);
                reject(new Error('WS_VALIDATE_TIMEOUT'));
            }, timeoutMs);
            this.pending.set(rid, { resolve, reject, timer });
            try {
                this.ws!.send(JSON.stringify(payload));
            } catch (e) {
                clearTimeout(timer);
                this.pending.delete(rid);
                reject(e);
            }
        });
    }

    private generateRid(): string {
        const n = Math.floor(Math.random() * 0xffff);
        return n.toString(16).padStart(4, '0');
    }
}


