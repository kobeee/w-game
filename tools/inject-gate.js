/**
 * WXNetworkGate.js v1.1
 * 究极429解决方案修正版
 * 
 * 功能：劫持 wx.request 和 wx.downloadFile，实现全局并发控制
 * 修复：Polyfill wx.onPerformanceEntry、降低并发至4、增强网络错误重试
 */

(function() {
    if (typeof wx === 'undefined') return;
    
    // ----------------------------------------------------------------
    // Fix 1: Polyfill wx.onPerformanceEntry to prevent engine crash
    // ----------------------------------------------------------------
    if (!wx.onPerformanceEntry) {
        console.log('[WXGate] Polyfill wx.onPerformanceEntry');
        wx.onPerformanceEntry = function() {};
    }
    // Prevent multiple injections
    if (wx.__network_gate_installed__) return;

    console.log('[WXGate] 初始化全局网络拦截器 v1.1...');

    // ================= 配置区 =================
    // Fix 2: Lower concurrency from 6 to 4 for absolute safety
    const MAX_CONCURRENCY = 4; 
    const RETRY_COUNT = 3;     
    const RETRY_DELAY = 1000;  
    // =========================================

    const _originalRequest = wx.request;
    const _originalDownload = wx.downloadFile;

    let _runningCount = 0;
    const _queue = [];

    function _scheduler() {
        if (_runningCount >= MAX_CONCURRENCY) return;
        if (_queue.length === 0) return;

        const taskParams = _queue.shift();
        if (taskParams._isAborted) {
            _scheduler();
            return;
        }

        _runningCount++;
        
        const { type, options, virtualTask, retry } = taskParams;
        const originalMethod = type === 'request' ? _originalRequest : _originalDownload;

        const originalSuccess = options.success;
        const originalFail = options.fail;
        const originalComplete = options.complete;

        // Fix 3: Enhanced Error Handling & Retry Logic
        const handleRetry = (reason, resOrErr) => {
            if (retry > 0) {
                const delay = RETRY_DELAY + Math.random() * 500; // Add jitter
                console.warn(`[WXGate] ${reason}, ${Math.floor(delay)}ms后重试... (剩余${retry}次) URL: ${options.url}`);
                
                // Critical: Decrement count immediately so we don't block while waiting
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
                }, delay);
                return true; // Retrying
            }
            return false; // No more retries
        };

        const newOptions = Object.assign({}, options, {
            success: (res) => {
                // Handle 429 strictly
                if (res.statusCode === 429) {
                    if (handleRetry('触发429', res)) return;
                }
                // Handle 5xx Server Errors (Optional, but good for stability)
                if (res.statusCode >= 500 && res.statusCode < 600) {
                    if (handleRetry(`服务器错误${res.statusCode}`, res)) return;
                }
                
                if (originalSuccess) originalSuccess(res);
            },
            fail: (err) => {
                const errMsg = err ? (err.errMsg || err.message || '') : '';
                
                // Handle Network Errors (Connection closed, timeout, etc.)
                // Fix 1 recurrence: ERR_CONNECTION_CLOSED
                if (
                    errMsg.indexOf('429') >= 0 || 
                    errMsg.indexOf('CONNECTION_CLOSED') >= 0 ||
                    errMsg.indexOf('timeout') >= 0 ||
                    errMsg.indexOf('fail') >= 0 // Generic fail often means network issue
                ) {
                    if (handleRetry(`网络错误(${errMsg})`, err)) return;
                }
                
                if (originalFail) originalFail(err);
            },
            complete: (res) => {
                // Only decrement if we are NOT retrying (retrying logic handles decrement itself)
                // We check this by inferring if success/fail handled it. 
                // Actually, safer way: handleRetry returns true, we skip decrement here? 
                // No, handleRetry already decremented. 
                // BUT, wait: if success calls handleRetry, it decrements. 
                // originalComplete should be called ONLY if we are finished (success/fail exhausted).
                // 
                // To simplify: We only call originalComplete if we are NOT retrying.
                // And we only decrement here if we are NOT retrying.
                
                const is429 = (res.statusCode === 429);
                const isNetErr = res.errMsg && (res.errMsg.indexOf('429') >= 0 || res.errMsg.indexOf('CONNECTION_CLOSED') >= 0);
                
                if ((is429 || isNetErr) && retry > 0) {
                    // Retrying, do nothing here (handleRetry did the work)
                } else {
                    _runningCount--;
                    _scheduler();
                    if (originalComplete) originalComplete(res);
                }
            }
        });

        const realTask = originalMethod.call(wx, newOptions);

        if (virtualTask && realTask) {
            virtualTask._bridgeTo(realTask);
        }
    }

    class VirtualTask {
        constructor(queueItem) {
            this._queueItem = queueItem;
            this._realTask = null;
            this._cbs = { progress: null, headers: null };
        }

        _bridgeTo(realTask) {
            this._realTask = realTask;
            if (this._cbs.progress) realTask.onProgressUpdate(this._cbs.progress);
            if (this._cbs.headers) realTask.onHeadersReceived(this._cbs.headers);
        }

        abort() {
            if (this._queueItem) this._queueItem._isAborted = true;
            if (this._realTask) this._realTask.abort();
        }

        onProgressUpdate(cb) { 
            this._cbs.progress = cb; 
            if (this._realTask) this._realTask.onProgressUpdate(cb); 
        }
        onHeadersReceived(cb) { 
            this._cbs.headers = cb; 
            if (this._realTask) this._realTask.onHeadersReceived(cb); 
        }
        offProgressUpdate(cb) { if(this._realTask) this._realTask.offProgressUpdate(cb); }
        offHeadersReceived(cb) { if(this._realTask) this._realTask.offHeadersReceived(cb); }
    }

    wx.request = function(options) {
        if (options.ignoreQueue) return _originalRequest.call(wx, options);
        const qItem = { type: 'request', options, virtualTask: null, retry: RETRY_COUNT, _isAborted: false };
        const task = new VirtualTask(qItem);
        qItem.virtualTask = task;
        _queue.push(qItem);
        _scheduler();
        return task;
    };

    wx.downloadFile = function(options) {
        const qItem = { type: 'download', options, virtualTask: null, retry: RETRY_COUNT, _isAborted: false };
        const task = new VirtualTask(qItem);
        qItem.virtualTask = task;
        _queue.push(qItem);
        _scheduler();
        return task;
    };

    wx.__network_gate_installed__ = true;
    console.log('[WXGate] 全局网络拦截器已激活 v1.1, 并发限制:', MAX_CONCURRENCY);
})();