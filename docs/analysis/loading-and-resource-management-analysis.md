# Loading 场景与资源管理系统深度分析报告

## 概述

本文档深度分析当前 Loading 场景及资源管理系统存在的关键问题，包括假 100% 进度、资源重复加载、缓存失效等多个严重缺陷。

---

## 问题1：Bloom 过滤器冗余文件与加载逻辑

### 问题描述
- `english.bloom` 二进制文件存在但无实际用途
- 实际使用的是 Base64 格式的 `english.bloom.txt`
- 存在多余的网络下载尝试

### 关键代码佐证

**BloomFilter.ts 中的加载优先级**：
```typescript
// 0) 优先：尝试加载 Base64 文本资产（编辑器/预览最稳妥）
const bufferFromTxt: ArrayBuffer | null = await new Promise((resolve) => {
    bundle.load(BLOOM_ASSET_TXT, TextAsset, (e: any, txt: TextAsset) => {
        if (!e && txt && typeof txt.text === 'string' && txt.text.length > 0) {
            try {
                const bin = atob(txt.text.trim());
                const arr = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                resolve(arr.buffer);
            } catch { resolve(null); }
        } else {
            resolve(null);
        }
    });
});

if (bufferFromTxt) {
    console.log('[BloomFilter] 从 Base64 文本资产加载成功');
    this.parse(bufferFromTxt);
    return true;
}
```

**配置文件定义**：
```typescript
// word-validate.ts
export const BLOOM_ASSET = 'english.bloom' as const; // 在 words Bundle 内的资源名（优先）
export const BLOOM_ASSET_TXT = 'english.bloom.txt' as const; // Base64 文本资产（编辑器/预览优先）
```

### 修复方案
- 删除冗余的 `english.bloom` 二进制文件
- 简化加载逻辑，仅保留 Base64 格式加载
- 移除多余的网络回退逻辑

---

## 问题2：进度条显示与实际加载不匹配

### 问题描述
- 进度条显示 100% 但实际资源仍在加载
- 词库加载期间进度停滞，然后突然跳到 100%
- LoadingUI 重复更新进度，造成跳跃

### 关键代码佐证

**PreloadManager 进度分配缺陷**：
```typescript
// 高优先级Bundle并行加载
await this.preloadBundleGroup(highPriorityBundles, 0, 0.7);

// ✅ 加载词库数据（确保WordMatcher初始化前完成）
await this.loadGlossData();  // ❌ 没有进度参数！

// 低优先级Bundle后续加载
await this.preloadBundleGroup(lowPriorityBundles, 0.7, 1.0);
```

**LoadingUI 重复进度更新**：
```typescript
// PreloadManager已在preloadAllBundles()中加载词库，无需重复
this.updateStatus(0.9, 'Bundle和词库加载完成');

// 验证词库是否加载成功
const glossService = GlossService.getInstance();
const allWords = glossService.getAllWords();

if (allWords.length === 0) {
    this.updateStatus(0.95, '正在修复词库加载...');
}

this.updateStatus(1.0, '所有资源加载完成！');  // ❌ 总是显示100%
```

**资源加载进度估算不准确**：
```typescript
const progressPerAsset = (endProgress - startProgress) / assetsToLoad.length;
// ❌ 按数量平均分配，但资源大小差异巨大
```

### 修复方案
- 为词库加载分配独立进度（70% → 85%）
- 移除 LoadingUI 中的重复进度更新
- 按资源大小加权分配进度

---

## 问题3：🔴 [重要] iPhone真机首次加载卡在100%不跳转（scheduleOnce失效）

### 问题现象（用户实际遇到的Bug）
- **环境**：iPhone 真机 + 微信小游戏
- **触发条件**：首次进入游戏（完全无缓存）
- **症状**：
  - 进度条正常到达 100%
  - 缩放动画已完成
  - 底部 Tips 仍在轮播
  - **但是不跳转到主菜单**，停留时间非常久（远超预期的 1-2 秒）

### 根本原因分析

**核心问题：`scheduleOnce` 在微信小游戏环境下可能失效**

#### 问题代码位置

**LoadingUI.ts L112-114**（正常流程）：
```typescript
this.updateStatus(1.0, '所有资源加载完成！');

// ⚠️ 使用 scheduleOnce 延迟跳转
this.scheduleOnce(() => {
    this.navigateToMainMenu();  // 可能不会执行！
}, 1.0);
```

**LoadingUI.ts L119-121**（错误处理分支）：
```typescript
} catch (error) {
    console.error('[LoadingUI] 预加载过程出现错误:', error);
    // ⚠️ 错误分支也使用 scheduleOnce
    this.scheduleOnce(() => {
        this.navigateToMainMenu();  // 可能不会执行！
    }, 2.0);
}
```

#### 为什么 scheduleOnce 会失效？

**关键观察**：
- `this.schedule()` 正常工作（Tips 一直在轮播，L181-196）
- `this.scheduleOnce()` 可能失效（跳转不执行）
- 说明组件本身没有被销毁，问题在于 `scheduleOnce` 的注册时机

**1. 异步回调中注册 scheduleOnce 的问题**：
- `scheduleOnce` 是在 `async startLoading()` 函数的 **Promise 回调内部** 注册的
- `await preloadAllBundles()` 耗时 10-30 秒后，当前组件的调度器可能已经进入 **不稳定状态**
- **关键**：在长时间异步操作后，Cocos 的调度系统可能无法正确注册新的一次性回调

**2. 微信小游戏环境的特殊性**：
- 微信小游戏有 **严格的内存管理** 和 **生命周期控制**
- 在资源加载密集期间（10-30 秒），可能触发：
  - `wx.onMemoryWarning`（内存警告）
  - 用户切换到后台（`wx.onHide`）
  - JavaScript 垃圾回收
- 这些事件可能影响 Cocos 引擎的调度器状态，导致 **新注册的 `scheduleOnce` 失效**

**3. scheduleOnce vs schedule 的差异**：
- `this.schedule()` 在 `onLoad()` → `initializeUI()` → `startTipRotation()` 中注册（**同步执行**）
- `this.scheduleOnce()` 在 `start()` → `async startLoading()` → `await ...` 后注册（**异步延迟注册**）
- **核心差异**：同步注册的定时器稳定，异步延迟注册的定时器可能失效

#### 实际卡住的时序分析

```
1. 用户首次打开游戏（无缓存）
2. LoadingScene.onLoad() 执行
   - LoadingUI.onLoad() → initializeUI()
   - startTipRotation() 注册 this.schedule()（✅ 定期轮播，同步注册）
3. LoadingScene.start() 执行
   - LoadingUI.start() → this.startLoading()（async 函数）
4. startLoading() 开始执行：
   - await preloadAllBundles() - 耗时 10-30 秒（下载远程资源）
   - await glossService.load() - 耗时 5-10 秒（加载词库）
5. 总耗时 15-40 秒后，await 完成，继续执行：
   - this.updateStatus(1.0, '所有资源加载完成！')
   - this.scheduleOnce(() => { ... }, 1.0) ← ⚠️ 异步延迟注册
6. 此时可能发生的问题：
   - 经过 15-40 秒的资源密集加载，微信环境可能已触发 GC/内存警告
   - Cocos 调度器在长时间异步后，可能无法正确处理新注册的 scheduleOnce
   - scheduleOnce 注册失败或被忽略，回调永远不执行
7. 结果：
   - this.schedule() 仍然正常（Tips 继续轮播）
   - this.scheduleOnce() 失效（不跳转）
   - 用户看到 100% 但卡住不动
```

### 关键证据

**证据 1：navigateToMainMenu 内部有节点有效性检查**

```typescript
// LoadingUI.ts L218-235
private navigateToMainMenu(): void {
    if (this.node && this.node.isValid) {  // ✅ 有效性检查
        tween(this.node)
            .to(0.5, {
                scale: new Vec3(0.8, 0.8, 1),
                position: new Vec3(0, 100, 0)
            }, { easing: 'sineIn' })
            .call(() => {
                director.loadScene('MainMenu');  // ⭐ 真正的跳转在这里
            })
            .start();
    } else {
        // fallback：直接跳转
        director.loadScene('MainMenu');
    }
}
```

**分析**：
- 如果 `scheduleOnce` 回调执行时，`this.node.isValid` 为 `false`，会走 fallback 分支
- **但如果回调根本没有执行**，则什么都不会发生

**证据 2：PreloadManager 的错误处理会吞噬异常但总会 resolve**

```typescript
// PreloadManager.ts L96-100
} catch (error) {
    console.error('[PreloadManager] Bundle完全加载失败:', error);
    this.reportProgress(0.8, '资源加载完成（部分资源使用缓存）');
    // ✅ 不抛出错误，允许游戏继续运行
}
```

**说明**：`preloadAllBundles()` 总会返回（不会永远卡住），所以问题不是"Promise不返回"，而是"scheduleOnce失效"

### 修复方案

#### 🎯 **推荐方案：使用 Promise + setTimeout 替代 scheduleOnce**

**核心思路**：
- 不依赖 Cocos 的定时器系统（`scheduleOnce`），避免调度器状态问题
- 使用标准的 JavaScript `setTimeout` 包装成 Promise
- `setTimeout` 是浏览器/JavaScript 引擎原生 API，不受 Cocos 组件生命周期影响
- **关键**：在长时间异步操作后，JavaScript 原生定时器比 Cocos 调度器更可靠

**为什么 setTimeout 更可靠？**
- `this.scheduleOnce()` 依赖 Cocos 组件的调度器（Scheduler）
- 调度器在长时间异步后可能进入不稳定状态
- `setTimeout` 是 JavaScript 引擎级别的，不受组件状态影响
- 微信小游戏环境底层是 V8/JSCore，原生支持 `setTimeout`

**修改文件**：`src/cocos/assets/scripts/ui/LoadingUI.ts`

```typescript
private async startLoading(): Promise<void> {
    console.log('[LoadingUI] 开始加载流程...');

    try {
        // 执行预加载
        await this.preloadManager.preloadAllBundles();

        // 验证词库
        const glossService = GlossService.getInstance();
        const allWords = glossService.getAllWords();

        if (allWords.length === 0) {
            console.error('[LoadingUI] ⚠️ 词库未加载，尝试手动加载...');
            this.updateStatus(0.95, '正在修复词库加载...');
            await glossService.load(false);

            const retryWords = glossService.getAllWords();
            if (retryWords.length === 0) {
                console.error('[LoadingUI] ❌ 词库修复失败，但仍继续');
            }
        }

        this.updateStatus(1.0, '所有资源加载完成！');

        // ✅ 使用 Promise + setTimeout 替代 scheduleOnce
        await new Promise<void>(resolve => {
            setTimeout(() => {
                console.log('[LoadingUI] 延迟结束，准备跳转...');
                resolve();
            }, 1000);
        });

        // ✅ 直接调用跳转，不依赖 scheduleOnce
        console.log('[LoadingUI] 调用 navigateToMainMenu()...');
        this.navigateToMainMenu();

    } catch (error) {
        console.error('[LoadingUI] 预加载过程出现错误:', error);

        // ✅ 错误分支也使用 Promise + setTimeout
        await new Promise<void>(resolve => {
            setTimeout(() => {
                console.log('[LoadingUI] 错误延迟结束，准备跳转...');
                resolve();
            }, 2000);
        });

        console.log('[LoadingUI] 出错后跳转...');
        this.navigateToMainMenu();
    }
}
```

#### 🛡️ **兜底方案：添加强制超时跳转**

**注意**：兜底方案也应该使用 `setTimeout`，因为 `scheduleOnce` 可能失效

在 `start()` 中添加：

```typescript
protected start(): void {
    // ✅ 强制超时跳转（60秒兜底）- 使用原生 setTimeout
    setTimeout(() => {
        if (this.node && this.node.isValid) {
            console.error('[LoadingUI] ⏰ 加载超时（60秒），强制跳转！');
            director.loadScene('MainMenu');
        }
    }, 60000); // 60秒 = 60000毫秒

    this.startLoading();
}
```

**为什么兜底也用 setTimeout？**
- 如果 `scheduleOnce` 在异步后失效，那么它在 `start()` 中注册也可能有同样的问题
- `setTimeout` 是 JavaScript 引擎级别的，更可靠
- 60 秒超时是最后的保险，必须确保能执行

#### 📊 **调试方案：添加详细日志追踪**

在关键位置添加日志：

```typescript
private async startLoading(): Promise<void> {
    console.log('[LoadingUI] Point A: 开始加载');

    try {
        console.log('[LoadingUI] Point B: preloadAllBundles 开始');
        await this.preloadManager.preloadAllBundles();
        console.log('[LoadingUI] Point C: preloadAllBundles 完成');

        // ... 词库验证 ...

        console.log('[LoadingUI] Point D: 更新进度到 100%');
        this.updateStatus(1.0, '所有资源加载完成！');

        console.log('[LoadingUI] Point E: 延迟开始（1秒）');
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('[LoadingUI] Point F: 延迟结束');

        console.log('[LoadingUI] Point G: 调用 navigateToMainMenu()');
        this.navigateToMainMenu();

    } catch (error) {
        console.error('[LoadingUI] Point ERROR:', error);
    }
}
```

**调试步骤**：
1. 在 iPhone 真机上重现问题
2. 连接 Safari 开发者工具查看控制台
3. 观察日志输出到哪个 Point 就停止了
4. 确定具体卡住的位置

### 验证方法

#### 方法 1：监听微信生命周期事件

```typescript
protected onLoad(): void {
    // 监听微信生命周期
    if (typeof wx !== 'undefined') {
        wx.onMemoryWarning(() => {
            console.warn('[LoadingUI] ⚠️ 微信内存警告触发！');
        });

        wx.onHide(() => {
            console.warn('[LoadingUI] ⚠️ 小游戏进入后台！');
        });

        wx.onShow(() => {
            console.log('[LoadingUI] ✅ 小游戏回到前台');
        });
    }

    this.preloadManager = PreloadManager.getInstance();
    this.initializeUI();
}
```

#### 方法 2：模拟慢网络测试

在微信开发者工具中：
1. 勾选"调试基础库" → 选择 3G 网络
2. 清除缓存后重新加载
3. 观察是否能正常跳转

#### 方法 3：检查节点有效性

在 `navigateToMainMenu()` 开头添加：

```typescript
private navigateToMainMenu(): void {
    console.log('[LoadingUI] navigateToMainMenu 被调用');
    console.log('[LoadingUI] this.node 有效性:', this.node ? 'valid' : 'null');
    console.log('[LoadingUI] this.node.isValid:', this.node?.isValid);

    // 原有逻辑...
}
```

---

## 问题4：100%假象与跳转条件过于宽松

### 问题描述
- 显示100%但核心资源可能完全缺失
- 跳转条件不检查实际资源加载状态
- 错误被吞噬，游戏带着缺失资源继续运行

### 关键代码佐证

**PreloadManager 吞噬关键错误**：
```typescript
try {
    // 加载逻辑...
} catch (error) {
    console.error('[PreloadManager] Bundle完全加载失败:', error);
    this.reportProgress(0.8, '资源加载完成（部分资源使用缓存）');
    // ❌ 不抛出错误，允许游戏继续运行
}
```

**LoadingUI 宽松的跳转条件**：
```typescript
try {
    await this.preloadManager.preloadAllBundles();  // 即使失败也继续
    
    const allWords = glossService.getAllWords();
    if (allWords.length === 0) {
        await glossService.load(false); // ❌ 修复失败也继续
    }
    
    this.updateStatus(1.0, '所有资源加载完成！');  // ❌ 总是显示100%
    
    this.scheduleOnce(() => {
        this.navigateToMainMenu();  // ❌ 总是会跳转
    }, 1.0);
    
} catch (error) {
    // ❌ 即使出错也跳转！
    this.scheduleOnce(() => {
        this.navigateToMainMenu();
    }, 2.0);
}
```

**词库验证失败无后果**：
```typescript
const retryWords = glossService.getAllWords();
if (retryWords.length > 0) {
    // 成功
} else {
    console.error('[LoadingUI] ❌ 词库修复失败，游戏可能无法正常运行');
    // ❌ 但仍然继续执行，没有阻止跳转
}
```

### 潜在后果
- 图片资源缺失（白块）
- 词库为空（无法生成单词）
- Bloom 过滤器不可用
- 各种功能异常但用户看到"加载完成"

---

## 问题5：资源重复加载与缓存失效

### 问题描述
- Loading 场景预加载的资源在游戏场景中无法复用
- 每次进入游戏都要重新加载资源
- 预加载时间被浪费，用户体验差

### 关键代码佐证

**预加载与使用路径不匹配**：
```typescript
// PreloadManager 配置
'tiles': [
    'tile_correct/spriteFrame',  // 注意带 /spriteFrame
    'tile_disabled/spriteFrame',
    // ...
]

// LetterTile 使用
const assetPath = `tile_${state}`;  // 可能是 'tile_correct'，不带 /spriteFrame
```

**AssetLoader 缓存检查失败**：
```typescript
public async loadSpriteFrame(bundleName: string, assetPath: string): Promise<SpriteFrame> {
    let bundle = assetManager.getBundle(bundleName);
    
    if (bundle) {
        // 第二步：使用bundle.get()获取已完全加载的资源（立即可用）
        const cachedAsset = bundle.get(assetPath, SpriteFrame);
        if (cachedAsset) {
            return cachedAsset;  // ❌ 很少命中这里
        }
        
        // 第三步：如果资源未完全加载，进行完全加载
        return await this.loadAssetFromBundle(bundle, assetPath);  // ❌ 总是重新加载
    }
}
```

**各组件都报告缓存未命中**：
```typescript
// LetterTile.ts
if (isCached) {
} else {
    // 缓存未命中，重新加载
}

// SlotQueue.ts  
if (isCached) {
} else {
    // 缓存未命中，重新加载
}

// StackGameApp.ts
if (!isCached) {
    console.warn('[StackGameApp] 场景背景图未预加载，开始动态加载');
}
```

### 根本原因
1. **路径不匹配**：预加载路径与使用路径不一致
2. **类型不匹配**：预加载时用的类型与获取时用的类型不一致
3. **Cocos Creator 缓存机制**：`bundle.load()` 完成的资源不一定能通过 `bundle.get()` 立即获取

---

## 问题6：LoadingScene 与 LoadingUI 设计不一致

### 问题描述
- LoadingScene 准备了 `onLoadingComplete()` 回调接口
- 但 LoadingUI 从未调用这个方法
- 两套跳转逻辑并存，容易产生混乱

### 关键代码佐证

**LoadingScene 未被使用的回调**：
```typescript
// LoadingScene.ts
public async onLoadingComplete(): Promise<void> {
    await this.ensureMinLoadingTime();  // 确保最短加载时间
    director.loadScene('MainMenu');
}
```

**LoadingUI 直接跳转**：
```typescript
// LoadingUI.ts
this.scheduleOnce(() => {
    this.navigateToMainMenu();  // ❌ 不调用 LoadingScene 的回调
}, 1.0);

private navigateToMainMenu(): void {
    // 复杂的动画逻辑
    if (this.node && this.node.isValid) {
        tween(this.node)
            .to(0.5, { /* 动画参数 */ })
            .call(() => {
                director.loadScene('MainMenu');  // 真正的跳转
            })
            .start();
    }
}
```

---

## 综合影响评估

### 用户体验影响
1. **加载体验差**：进度条跳跃、卡顿、假100%
2. **资源重复加载**：进入游戏慢，感觉预加载无效
3. **功能异常**：可能带着缺失资源进入游戏
4. **界面卡死**：100%但不跳转，需要强制重启

### 性能影响
1. **网络资源浪费**：重复下载相同资源
2. **内存占用增加**：重复加载导致内存碎片
3. **CPU 资源浪费**：重复解析和初始化

### 开发维护影响
1. **调试困难**：错误被吞噬，问题难以定位
2. **逻辑复杂**：多套跳转逻辑并存
3. **扩展困难**：资源管理混乱，添加新资源容易出错

---

## 修复优先级建议

### 🔴 高优先级（立即修复 - 影响首次用户体验）

1. **[问题3] 修复 iPhone 真机 100% 不跳转问题**（用户实际遇到的 Bug）
   - **方案**：用 `Promise + setTimeout` 替代 `scheduleOnce`
   - **兜底**：添加 60 秒强制超时跳转
   - **影响**：直接影响首次用户体验，优先级最高

2. **[问题2] 修复词库加载期间进度停滞**
   - **方案**：为 `loadGlossData()` 分配独立进度（0.7 → 0.85）
   - **影响**：用户看到进度条"卡住"，体验差

3. **[问题4] 词库加载失败应阻止游戏启动**
   - **方案**：检查 `allWords.length`，为空时不允许跳转
   - **影响**：避免游戏在词库缺失的情况下启动

### 🟡 中优先级（近期修复 - 影响开发维护）

4. **[问题6] 统一跳转接口**
   - **方案**：使用 LoadingScene 的 `onLoadingComplete()` 回调机制
   - **影响**：设计不一致，扩展困难

5. **[问题5] 资源路径规范化**（需验证）
   - **方案**：检查预加载路径与使用路径是否一致
   - **影响**：可能导致缓存失效，资源重复加载

6. **[问题2] 移除 LoadingUI 中的重复进度更新**
   - **方案**：清理 L89-109 的冗余代码
   - **影响**：代码可读性，维护性

### 🟢 低优先级（长期优化）

7. **[问题1] Bloom 过滤器冗余文件**
   - **状态**：✅ 已在 CHANGELOG 2025-11-20 中修复

8. **按资源大小加权分配进度**
   - **方案**：根据资源大小（而非数量）分配进度权重
   - **影响**：进度条更平滑

9. **增强缓存验证**
   - **方案**：预加载后立即验证资源可用性
   - **影响**：提前发现资源加载失败

---

## 总结

### 核心问题梳理

经过深入分析，当前 Loading 场景存在以下关键问题：

1. **🔴 [最严重] scheduleOnce 在长时间异步后失效**
   - **现象**：iPhone 真机首次加载卡在 100% 不跳转（Tips 仍在轮播，说明组件未销毁）
   - **根本原因**：
     - `scheduleOnce` 在长时间异步操作（15-40 秒）后注册，Cocos 调度器可能处于不稳定状态
     - 微信环境在资源密集加载期间可能触发 GC/内存警告，影响调度器
     - 异步延迟注册的定时器不如同步注册的稳定（Tips 的 `schedule` 是同步注册的，正常工作）
   - **修复**：用 JavaScript 原生 `Promise + setTimeout` 替代 `scheduleOnce`，不依赖 Cocos 调度器

2. **🟡 进度显示不准确**
   - **现象**：词库加载期间进度停滞，然后突然跳到 100%
   - **原因**：`loadGlossData()` 没有分配进度参数
   - **修复**：为词库加载分配独立进度（0.7 → 0.85）

3. **🟡 错误处理过于宽松**
   - **现象**：词库为空也允许游戏启动
   - **原因**：所有错误都被吞噬，总是跳转到主菜单
   - **修复**：词库为空时阻止跳转，提示用户

4. **🟢 设计不一致**
   - **现象**：LoadingScene 的回调未被使用
   - **原因**：LoadingUI 直接调用 `director.loadScene()`
   - **修复**：统一使用 LoadingScene 的回调机制

### 修正之前分析的误判

**之前分析错误的地方**：

1. ❌ **"Promise 既不 resolve 也不 reject，导致整个流程卡死"**
   - **实际情况**：
     - 所有 Promise 都有明确的 resolve/reject 分支（PreloadManager L176, L201）
     - 即使出错也会 resolve，不会永远卡住
     - `await preloadAllBundles()` 总会返回
   - **真正问题**：
     - 不是"Promise 卡住"，而是"Promise 返回后，scheduleOnce 注册失效"
     - 用户看到 100% 说明已经执行到 `updateStatus(1.0)`，证明 Promise 已返回

2. ❌ **"资源重复加载与缓存失效"**
   - **需要验证**：
     - 需要实际检查 LetterTile/SlotQueue 等组件调用时的路径
     - 是否与 PreloadManager 的配置一致
   - **不应盲目断定**：
     - AssetLoader 的三级缓存逻辑本身是正确的
     - 问题可能在调用方的路径拼接，而非 AssetLoader

3. ✅ **正确的分析**：
   - `scheduleOnce` 在异步延迟注册时可能失效
   - Tips 轮播正常证明组件未销毁，问题在于调度器状态
   - 需要用 JavaScript 原生定时器替代 Cocos 定时器

### 建议修复顺序

1. **立即修复**：问题3（用户实际遇到的 Bug）
2. **本周修复**：问题2、问题4（进度显示和词库验证）
3. **下周修复**：问题6、问题5（设计统一和路径验证）
4. **长期优化**：问题8、问题9（进度加权和缓存验证）

---

*文档更新时间：2025-11-21*
*分析范围：Loading 场景、PreloadManager、AssetLoader、BloomFilter、GlossService、微信小游戏环境*
*补充内容：iPhone 真机 100% 不跳转问题深度诊断（scheduleOnce 失效）*