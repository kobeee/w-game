/**
 * WXNetworkGate.js v1.2
 * 016-熔断与流量整形版
 * 核心目标：从根本上消除 429，通过全局熔断机制让服务器“冷静”。
 */

(function() {
    if (typeof wx === 'undefined') return;
    if (wx.__network_gate_installed__) return;

    console.log('[WXGate] 初始化 016 熔断防御系统...');

    // Polyfill
    if (!wx.onPerformanceEntry) {
        wx.onPerformanceEntry = function() {};
    }

    // ================= 核心配置 =================
    const MAX_CONCURRENCY = 3;      // 进一步降低并发，稳字当头
    const REQUEST_INTERVAL = 100;   // [新增] 两次请求发出的最小间隔(ms)，防止瞬时 QPS 过高
    const COOL_DOWN_TIME = 2000;    // [新增] 触发 429 后的全局暂停时间(ms)
    const MAX_RETRIES = 4;          // 最大重试次数
    // ===========================================

    const _originalRequest = wx.request;
    const _originalDownload = wx.downloadFile;

    const _queue = [];
    let _runningCount = 0;
    let _isPaused = false;          // 全局熔断开关
    let _lastRequestTime = 0;       // 上一次发送请求的时间戳

    // 核心调度器
    function _scheduler() {
        // 1. 熔断检查：如果处于暂停状态，绝对不发请求
        if (_isPaused) return;

        // 2. 并发检查
        if (_runningCount >= MAX_CONCURRENCY) return;

        // 3. 队列检查
        if (_queue.length === 0) return;

        // 4. 频控检查：确保请求之间有时间间隔
        const now = Date.now();
        const timeSinceLast = now - _lastRequestTime;
        if (timeSinceLast < REQUEST_INTERVAL) {
            // 没到时间，延迟调度
            setTimeout(_scheduler, REQUEST_INTERVAL - timeSinceLast);
            return;
        }

        // --- 发射请求 ---
        const taskParams = _queue.shift();
        if (taskParams._isAborted) {
            _scheduler();
            return;
        }

        _runningCount++;
        _lastRequestTime = Date.now(); // 更新发送时间

        const { type, options, virtualTask, retryCount } = taskParams;
        const originalMethod = type === 'request' ? _originalRequest : _originalDownload;

        // 封装 Success
        const newSuccess = (res) => {
            // === 触发 429 熔断 ===
            if (res.statusCode === 429) {
                console.error(`[WXGate] 🚨 触发 429！启用熔断机制，全局暂停 ${COOL_DOWN_TIME}ms`);
                
                // 1. 立即开启熔断，阻止后续请求
                _isPaused = true;
                
                // 2. 立即归还并发计数（因为这个请求实际上失败了，不算占用连接）
                _runningCount--;

                // 3. 设置指数退避冷却定时器（避免死循环）
                const backoffTime = COOL_DOWN_TIME * (MAX_RETRIES - retryCount + 1); // 逐次增加冷却时间
                console.log(`[WXGate] 🧊 指数退避冷却 ${backoffTime}ms`);
                
                setTimeout(() => {
                    console.log('[WXGate] 🧊 熔断结束，恢复传输');
                    _isPaused = false;
                    
                    // 4. 执行重试逻辑（在熔断结束后）
                    if (retryCount > 0) {
                        console.warn(`[WXGate] 重新入队 (剩余重试 ${retryCount}): ${options.url}`);
                        _queue.unshift({
                            type, options, virtualTask, retryCount: retryCount - 1, _isAborted: false
                        });
                    } else {
                        // 重试耗尽，真的失败了
                        console.error(`[WXGate] ❌ 重试耗尽，请求失败: ${options.url}`);
                        if (options.fail) options.fail({ errMsg: 'request:fail 429 limit exceeded' });
                    }
                    
                    _scheduler(); // 重新激活调度
                }, backoffTime);
                return;
            }

            // 正常成功
            _runningCount--;
            if (options.success) options.success(res);
            _scheduler();
        };

        // 封装 Fail
        const newFail = (err) => {
            const errMsg = err ? (err.errMsg || '') : '';
            // 检查是否是网络层面的拥堵/断开
            const isNetError = errMsg.indexOf('CONNECTION_CLOSED') >= 0 || errMsg.indexOf('timeout') >= 0;

            if (isNetError && retryCount > 0) {
                console.warn(`[WXGate] 网络波动 (${errMsg})，稍后重试...`);
                _runningCount--;
                
                // 网络错误通常也意味着拥堵，小憩一下
                setTimeout(() => {
                    _queue.unshift({
                        type, options, virtualTask, retryCount: retryCount - 1, _isAborted: false
                    });
                    _scheduler();
                }, 500);
                return;
            }

            _runningCount--;
            if (options.fail) options.fail(err);
            _scheduler();
        };

        const newOptions = Object.assign({}, options, { success: newSuccess, fail: newFail });
        
        // 调用原始 API
        const realTask = originalMethod.call(wx, newOptions);
        
        // 桥接 Task 对象（用于取消等操作）
        if (virtualTask && realTask) {
            virtualTask._bridgeTo(realTask);
        }
    }

    // 虚拟 Task 类
    class VirtualTask {
        constructor() {
            this._realTask = null;
            this._cbs = {};
        }
        _bridgeTo(realTask) {
            this._realTask = realTask;
            // 重新绑定之前的监听
            if (this._cbs.onProgressUpdate) realTask.onProgressUpdate(this._cbs.onProgressUpdate);
            if (this._cbs.onHeadersReceived) realTask.onHeadersReceived(this._cbs.onHeadersReceived);
        }
        abort() { if (this._realTask) this._realTask.abort(); }
        onProgressUpdate(cb) { this._cbs.onProgressUpdate = cb; if (this._realTask) this._realTask.onProgressUpdate(cb); }
        onHeadersReceived(cb) { this._cbs.onHeadersReceived = cb; if (this._realTask) this._realTask.onHeadersReceived(cb); }
        offProgressUpdate(cb) { if (this._realTask) this._realTask.offProgressUpdate(cb); }
        offHeadersReceived(cb) { if (this._realTask) this._realTask.offHeadersReceived(cb); }
    }

    // 劫持 wx.request
    wx.request = function(options) {
        if (options.ignoreQueue) return _originalRequest.call(wx, options);
        const virtualTask = new VirtualTask();
        _queue.push({ type: 'request', options, virtualTask, retryCount: MAX_RETRIES, _isAborted: false });
        _scheduler();
        return virtualTask;
    };

    // 劫持 wx.downloadFile
    wx.downloadFile = function(options) {
        const virtualTask = new VirtualTask();
        _queue.push({ type: 'download', options, virtualTask, retryCount: MAX_RETRIES, _isAborted: false });
        _scheduler();
        return virtualTask;
    };

    wx.__network_gate_installed__ = true;
    console.log(`[WXGate] 016版已激活 | 并发: ${MAX_CONCURRENCY} | 间隔: ${REQUEST_INTERVAL}ms | 熔断: ${COOL_DOWN_TIME}ms`);
})();
