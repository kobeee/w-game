/**
 * WXNetworkGate.ts
 * 究极429解决方案 - 底层API拦截器
 * 
 * 功能：劫持 wx.request 和 wx.downloadFile，实现全局并发控制
 * 兼容性：完全兼容 wx 原生接口定义
 */

(function() {
    // 🛡️ 防御性检查
    if (typeof wx === 'undefined') return;
    if (wx.__network_gate_installed__) return;

    console.log('[WXGate] 正在初始化全局网络拦截器...');

    // ================= 配置区 =================
    const MAX_CONCURRENCY = 6; // 最大并发数 (保守值)
    const RETRY_COUNT = 3;     // 429重试次数
    const RETRY_DELAY = 1000;  // 重试延迟(ms)
    // =========================================

    // 原始方法备份
    const _originalRequest = wx.request;
    const _originalDownload = wx.downloadFile;

    // 状态管理
    let _runningCount = 0;
    const _queue: any[] = [];

    /**
     * 核心调度器
     */
    function _scheduler(): void {
        if (_runningCount >= MAX_CONCURRENCY) return;
        if (_queue.length === 0) return;

        // 取出下一个任务
        const taskParams = _queue.shift();
        
        // 如果任务已被取消（abort），则跳过
        if (taskParams._isAborted) {
            _scheduler(); // 递归处理下一个
            return;
        }

        _runningCount++;
        
        // 执行实际请求
        const { type, options, virtualTask, retry } = taskParams;
        const originalMethod = type === 'request' ? _originalRequest : _originalDownload;

        // 包装回调以处理并发计数和错误
        const originalSuccess = options.success;
        const originalFail = options.fail;
        const originalComplete = options.complete;

        const newOptions = Object.assign({}, options, {
            success: (res: any) => {
                // 拦截 429 错误
                if (res.statusCode === 429 && retry > 0) {
                    console.warn(`[WXGate] 触发429，${RETRY_DELAY}ms后重试... (剩余${retry}次)`);
                    _runningCount--; // 释放资源用于重试（虽然重试本身也要占用）
                    setTimeout(() => {
                        // 重新入队，高优先级插队
                        _queue.unshift({
                            type,
                            options,
                            virtualTask,
                            retry: retry - 1,
                            _isAborted: false
                        });
                        _scheduler();
                    }, RETRY_DELAY);
                    return;
                }
                if (originalSuccess) originalSuccess(res);
            },
            fail: (err: any) => {
                // 某些真机环境下 429 可能会走 fail 回调
                if (err && (err.errMsg || '').indexOf('429') >= 0 && retry > 0) {
                    console.warn(`[WXGate] 触发429(Fail)，重试...`);
                    _runningCount--;
                    setTimeout(() => {
                        _queue.unshift({
                            type,
                            options,
                            virtualTask,
                            retry: retry - 1,
                            _isAborted: false
                        });
                        _scheduler();
                    }, RETRY_DELAY);
                    return;
                }
                if (originalFail) originalFail(err);
            },
            complete: (res: any) => {
                // 只有非重试逻辑才减少计数
                if (!(res.statusCode === 429 && retry > 0)) {
                    _runningCount--;
                    _scheduler(); // 触发下一个
                }
                if (originalComplete) originalComplete(res);
            }
        });

        // 发起真实调用
        const realTask = originalMethod.call(wx, newOptions);

        // 桥接 realTask 的方法到 virtualTask
        if (virtualTask && realTask) {
            virtualTask._bridgeTo(realTask);
        }
    }

    /**
     * 虚拟任务类 (用于欺骗Cocos引擎)
     * 必须实现 abort, onProgressUpdate 等接口
     */
    class VirtualTask {
        private _queueItem: any;
        private _realTask: any = null;
        private _onProgressUpdateCallback: any = null;
        private _onHeadersReceivedCallback: any = null;

        constructor(queueItem: any) {
            this._queueItem = queueItem;
        }

        _bridgeTo(realTask: any): void {
            this._realTask = realTask;
            // 如果之前注册了回调，现在立即绑定
            if (this._onProgressUpdateCallback) realTask.onProgressUpdate(this._onProgressUpdateCallback);
            if (this._onHeadersReceivedCallback) realTask.onHeadersReceived(this._onHeadersReceivedCallback);
        }

        abort(): void {
            // 1. 如果还在队列中，标记为取消
            if (this._queueItem) {
                this._queueItem._isAborted = true;
            }
            // 2. 如果已经运行，调用真实的 abort
            if (this._realTask) {
                this._realTask.abort();
            }
        }

        onProgressUpdate(cb: any): void {
            this._onProgressUpdateCallback = cb;
            if (this._realTask) this._realTask.onProgressUpdate(cb);
        }

        onHeadersReceived(cb: any): void {
            this._onHeadersReceivedCallback = cb;
            if (this._realTask) this._realTask.onHeadersReceived(cb);
        }
        
        // 兼容 off 方法
        offProgressUpdate(cb: any): void { 
            if(this._realTask) this._realTask.offProgressUpdate(cb); 
        }
        
        offHeadersReceived(cb: any): void { 
            if(this._realTask) this._realTask.offHeadersReceived(cb); 
        }
    }

    // ================= 劫持入口 =================

    wx.request = function(options: any): any {
        // 并不是所有 request 都需要队列（比如上报），但为了绝对安全，全部拦截
        // 除非明确标记 ignoreQueue (仅限内部使用)
        if (options.ignoreQueue) {
            return _originalRequest.call(wx, options);
        }

        const queueItem = {
            type: 'request',
            options: options,
            virtualTask: null,
            retry: RETRY_COUNT,
            _isAborted: false
        };

        const task = new VirtualTask(queueItem);
        queueItem.virtualTask = task;

        _queue.push(queueItem);
        _scheduler();

        return task;
    };

    wx.downloadFile = function(options: any): any {
        const queueItem = {
            type: 'download',
            options: options,
            virtualTask: null,
            retry: RETRY_COUNT,
            _isAborted: false
        };

        const task = new VirtualTask(queueItem);
        queueItem.virtualTask = task;

        _queue.push(queueItem);
        _scheduler();

        return task;
    };

    wx.__network_gate_installed__ = true;
    console.log('[WXGate] 全局网络拦截器已激活，并发限制:', MAX_CONCURRENCY);

})();