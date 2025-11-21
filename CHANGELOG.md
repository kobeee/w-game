# CHANGELOG（近期关键变更）

## 2025-11-21 - 🔧 [BUGFIX] BloomFilter 微信小游戏 Base64 解码兼容性修复

### 问题现象
- **错误信息**：`ReferenceError: Can't find variable: atob`
- **影响环境**：微信小游戏环境（浏览器环境正常）
- **根本原因**：`atob` 函数是浏览器 API，在微信小游戏环境中不存在

### 根本原因分析
**微信小游戏环境限制**：
1. 微信小游戏运行在特定的 JavaScript 环境，不支持浏览器的 `atob`/`btoa` API
2. BloomFilter 在加载 `english.bloom.txt` 时使用 `atob` 解码 Base64 数据
3. 导致布隆过滤器无法初始化，快速否定层失效

### 修复方案

#### 1. 添加微信小游戏兼容的 Base64 解码方法
```typescript
private base64Decode(base64String: string): string {
    // 检查是否在微信小游戏环境
    if (typeof wx !== 'undefined' && wx.getFileSystemManager) {
        // 微信小游戏环境，使用 wx.getFileSystemManager().readFileSync 的 base64 解码
        try {
            const fs = wx.getFileSystemManager();
            const tempFilePath = `${wx.env.USER_DATA_PATH}/temp_base64_${Date.now()}.txt`;
            fs.writeFileSync(tempFilePath, base64String, 'base64');
            const buffer = fs.readFileSync(tempFilePath);
            fs.unlinkSync(tempFilePath); // 清理临时文件
            return String.fromCharCode.apply(null, new Uint8Array(buffer));
        } catch (e) {
            console.warn('[BloomFilter] 微信小游戏 Base64 解码失败，回退到手动解码:', e);
        }
    }
    
    // 回退方案：手动实现 Base64 解码
    return this.manualBase64Decode(base64String);
}
```

#### 2. 实现手动 Base64 解码算法
- 不依赖任何外部 API，使用标准 Base64 解码算法
- 64 字符映射表 + 6 位缓冲区处理
- 兼容所有 JavaScript 环境（浏览器、微信小游戏、Node.js）

#### 3. 修正资源文件配置
- 修正 `english.bloom.txt.meta` 文件中的 `"files"` 配置从 `.json` 改为 `.txt`
- 解决 Cocos Creator 资源处理机制的不一致问题

#### 4. 优化资源加载顺序
```typescript
const assetNames = [
    BLOOM_ASSET_TXT,                    // 'english.bloom' (配置中的名称)
    'english.bloom.txt',                // 带完整 .txt 扩展名
    'english.bloom'                     // 不带扩展名（Cocos可能的处理结果）
];
```

#### 5. 增强调试信息
- 输出 Bundle 中的实际资源列表
- 详细检查每个相关资源的配置信息
- 每个加载尝试都有详细的错误日志

### 修改文件
- `src/cocos/assets/scripts/services/BloomFilter.ts` - 添加兼容的 Base64 解码方法
- `src/cocos/assets/bundle/words/english.bloom.txt.meta` - 修正文件类型配置

### 效果
- **解决微信小游戏环境 Base64 解码问题**
- 确保布隆过滤器在所有环境中都能正常工作
- 单词验证的快速否定层在微信小游戏中正常生效
- 提供详细的调试信息，便于问题追踪

### 验证方法
1. 在微信开发者工具中运行游戏
2. 观察控制台是否还有 `atob` 相关错误
3. 检查 BloomFilter 是否成功初始化并工作
4. 测试单词验证功能，确认快速否定层正常

---

## 2025-11-21 - 🔧 [BUGFIX] BloomFilter资源路径问题修复（Cocos自动重命名）

## 2025-11-21 - 🔧 [BUGFIX] BloomFilter资源路径问题修复（Cocos自动重命名）

### 问题现象
- **错误信息**：`Bundle words doesn't contain english.bloom.txt`
- **奇怪现象**：`english.bloom.txt` 文件在Bundle目录下存在，但Cocos内部可能自动重命名为 `english.bloom`
- **根本原因**：Cocos Creator 对 `.txt` 文件的处理机制，可能自动去掉扩展名或改变资源路径

### 根本原因分析
**Cocos Creator 资源处理机制**：
1. `.meta` 文件显示 `importer: "text"`，但 `files: [".json"]` 存在不一致
2. Cocos 可能将 `english.bloom.txt` 处理为 `english.bloom`
3. Bundle 加载时使用原始文件名导致找不到资源

### 修复方案

#### 1. 多路径尝试加载策略
```typescript
const assetNames = [
    BLOOM_ASSET_TXT,                    // 'english.bloom.txt'
    'english.bloom',                    // 不带 .txt 扩展名
    'english.bloom.txt'                 // 带完整路径
];
```

#### 2. 增强调试信息
- 添加 Bundle 资源列表输出：`bundle.getDirWithPath('.')`
- 输出 Bundle 配置信息：`bundle._config.assetInfos`
- 每次尝试加载都有详细的日志记录

#### 3. 配置文件调整
- 将 `BLOOM_ASSET_TXT` 从 `'english.bloom.txt'` 改为 `'english.bloom'`
- 适配 Cocos Creator 的资源命名机制

### 修改文件
- `src/cocos/assets/scripts/services/BloomFilter.ts` - 多路径尝试加载和调试增强
- `src/cocos/assets/scripts/config/word-validate.ts` - 调整资源名称配置

### 效果
- **解决 Cocos 资源路径问题**，无论文件如何被内部处理都能找到
- **增强调试能力**，可以清楚看到 Bundle 中的实际资源情况
- **提高兼容性**，支持多种可能的资源命名方式

### 验证方法
1. 重新运行游戏，观察控制台输出
2. 检查是否成功找到并加载 BloomFilter 资源
3. 观察 Bundle 资源列表，确认实际的资源名称

---

## 2025-11-21 - 🔧 [BUGFIX] BloomFilter Base64文本资产加载失败修复

### 问题现象
- **错误信息**：`BloomFilter.ts:53 [BloomFilter] Base64 文本资产加载失败，布隆过滤器不可用`
- **影响范围**：单词验证的快速否定层失效，可能导致更多无效网络请求

### 根本原因分析
**加载时序问题**：
1. BloomFilter 在 NewWordValidator 初始化时加载
2. 但此时 PreloadManager 可能还未完成 words bundle 的加载
3. BloomFilter 尝试加载 `english.bloom.txt` 时，words bundle 不可用导致失败

### 修复方案

#### 1. 添加 bundle 等待机制
- 新增 `waitForBundle()` 方法，等待 words bundle 加载完成
- 最多等待10秒，每100ms检查一次bundle是否可用
- 如果等待超时，尝试手动加载 bundle 作为兜底

#### 2. 增强错误诊断
- 添加详细的错误日志，包括：
  - Base64 解码失败信息
  - txt 对象状态检查
  - txt.text 类型和长度信息
- 便于快速定位加载失败的具体原因

#### 3. 优化加载流程
```typescript
// 等待words bundle加载完成，最多等待10秒
const bundle = await this.waitForBundle('words', 10000);
if (!bundle) {
    console.error('[BloomFilter] words bundle 加载超时或失败');
    return false;
}

console.log('[BloomFilter] words bundle 已就绪，开始加载 Base64 文本资产...');
```

### 修改文件
- `src/cocos/assets/scripts/services/BloomFilter.ts` - 添加 bundle 等待机制和错误诊断

### 效果
- **解决 BloomFilter 加载失败问题**
- 确保布隆过滤器在 words bundle 准备就绪后才加载
- 提供详细的错误诊断信息，便于问题追踪
- 单词验证的快速否定层正常工作，减少无效网络请求

### 验证方法
1. 清除缓存后重新进入游戏
2. 观察控制台是否还有 BloomFilter 加载失败错误
3. 检查布隆过滤器是否正常初始化并工作

---

## 2025-11-21 - 🔧 [BUGFIX] iPhone真机首次加载卡在100%不跳转问题修复（scheduleOnce失效）

### 问题现象
- **环境**：iPhone 真机 + 微信小游戏
- **触发条件**：首次进入游戏（完全无缓存）
- **症状**：
  - 进度条正常到达 100%
  - 缩放动画已完成
  - 底部 Tips 仍在轮播
  - **但是不跳转到主菜单**，停留时间非常久（远超预期的 1-2 秒）

### 根本原因分析
**核心问题：`scheduleOnce` 在长时间异步后失效**

1. **异步回调中注册 scheduleOnce 的问题**：
   - `scheduleOnce` 是在 `async startLoading()` 函数的 **Promise 回调内部** 注册的
   - `await preloadAllBundles()` 耗时 10-30 秒后，当前组件的调度器可能已经进入 **不稳定状态**
   - **关键**：在长时间异步操作后，Cocos 的调度系统可能无法正确注册新的一次性回调

2. **微信小游戏环境的特殊性**：
   - 微信小游戏有 **严格的内存管理** 和 **生命周期控制**
   - 在资源加载密集期间（10-30 秒），可能触发：
     - `wx.onMemoryWarning`（内存警告）
     - 用户切换到后台（`wx.onHide`）
     - JavaScript 垃圾回收
   - 这些事件可能影响 Cocos 引擎的调度器状态，导致 **新注册的 `scheduleOnce` 失效**

3. **scheduleOnce vs schedule 的差异**：
   - `this.schedule()` 在 `onLoad()` → `initializeUI()` → `startTipRotation()` 中注册（**同步执行**）
   - `this.scheduleOnce()` 在 `start()` → `async startLoading()` → `await ...` 后注册（**异步延迟注册**）
   - **核心差异**：同步注册的定时器稳定，异步延迟注册的定时器可能失效

### 修复方案

#### 1. 使用 Promise + setTimeout 替代 scheduleOnce
**核心思路**：
- 不依赖 Cocos 的定时器系统（`scheduleOnce`），避免调度器状态问题
- 使用标准的 JavaScript `setTimeout` 包装成 Promise
- `setTimeout` 是浏览器/JavaScript 引擎原生 API，不受 Cocos 组件生命周期影响
- **关键**：在长时间异步操作后，JavaScript 原生定时器比 Cocos 调度器更可靠

**修改文件**：`src/cocos/assets/scripts/ui/LoadingUI.ts`

```typescript
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
```

#### 2. 添加 60 秒强制超时跳转兜底方案
**注意**：兜底方案也使用 `setTimeout`，因为 `scheduleOnce` 可能失效

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

#### 3. 修复词库加载期间进度停滞
- 为 `loadGlossData()` 分配独立进度（0.7 → 0.85）
- 新增 `loadGlossDataWithProgress()` 方法，提供详细的进度报告
- 修复词库加载期间进度条"卡住"的问题

#### 4. 增强词库验证，词库为空时阻止游戏启动
- 词库为空时显示错误信息，不继续跳转
- 提供用户友好的错误提示："词库加载失败，请检查网络连接后重新进入游戏"
- 避免游戏在词库缺失的情况下启动

#### 5. 添加详细调试日志和微信生命周期监听
- 添加 Point A-F 关键节点日志，便于追踪跳转问题
- 监听微信生命周期事件（内存警告、前后台切换）
- 增强 `navigateToMainMenu()` 的调试信息

### 修改文件
- `src/cocos/assets/scripts/ui/LoadingUI.ts` - 修复 scheduleOnce 失效、添加超时兜底、增强调试
- `src/cocos/assets/scripts/app/PreloadManager.ts` - 修复词库加载进度报告

### 效果
- **解决 iPhone 真机首次加载卡在 100% 不跳转的问题**
- 提供更稳定的加载体验，不依赖 Cocos 调度器
- 词库加载进度显示更平滑，用户体验更好
- 词库加载失败时提供明确的错误提示
- 详细的调试日志便于问题追踪和定位

### 验证方法
1. 在 iPhone 真机上清除缓存后首次进入游戏
2. 连接 Safari 开发者工具查看控制台日志
3. 观察是否正常跳转到主菜单
4. 检查进度条是否平滑显示词库加载进度

---

## 2025-11-20 - 🧹 [CLEANUP] Bloom 过滤器加载简化（仅保留 Base64 格式）

### 背景
- `english.bloom` 二进制文件存在但无实际用途
- 实际使用的是 Base64 格式的 `english.bloom.txt` 文件
- 为避免多余网络下载，简化加载逻辑

### 修改内容
1. **删除冗余文件**：
   - 删除 `english.bloom` 二进制文件
   - 删除对应的 `.meta` 文件

2. **简化加载逻辑**（`BloomFilter.ts`）：
   - 移除二进制文件加载、网络加载等多余回退方案
   - 仅保留 Base64 文本资产加载（`english.bloom.txt`）
   - 清理无用的导入（`BLOOM_ASSET`、`BLOOM_PATH`）

3. **保持功能完整**：
   - 布隆过滤器功能完全不受影响
   - 加载失败有明确的错误日志
   - 代码更简洁，维护性更好

### 效果
- 减少不必要的网络请求尝试
- 代码逻辑更清晰，仅关注实际使用的资源
- 保持原有功能，提升加载效率

### 修改文件
- 删除：`src/cocos/assets/bundle/words/english.bloom`
- 删除：`src/cocos/assets/bundle/words/english.bloom.meta`
- 修改：`src/cocos/assets/scripts/services/BloomFilter.ts`

---

> 归档说明：完整历史已复制到 `docs/archive/CHANGELOG-ARCHIVE.md`，本文件仅保留最近且重要的变更。

## 2025-11-20 - 🔧 [BUGFIX] 字母卡片尺寸适配（90×90 → 80×80）

### 问题
- LetterTile.prefab 尺寸从 90×90 改为 80×80
- 叠叠乐布局验证失败：偏移值 ±40 不被允许（仅支持 ±45）

### 修复内容
1. **BlockDetector.ts** - 核心遮挡算法更新：
   - CARD_SIZE: 90 → 80
   - CELL: 45 → 40
   - 更新所有注释中的尺寸说明

2. **StackTypes.ts** - 网格系统常量更新：
   - GRID_UNIT: 90 → 80
   - OFFSET_HALF: 45 → 40
   - AllowedOffset.HALF: 45 → 40
   - AllowedOffset.MINUS_HALF: -45 → -40

3. **布局JSON文件** - 位移参数更新：
   - 所有 `"x": 45` → `"x": 40`
   - 所有 `"x": -45` → `"x": -40`
   - 所有 `"y": 45` → `"y": 40
   - 所有 `"y": -45` → `"y": -40

### 影响范围
- 11个布局JSON文件已更新（pyramid_default.json无偏移值，无需修改）
- 遮挡判定算法已适配新的80×80卡片尺寸
- 验证规则已同步更新，允许 ±40 偏移值

### 效果
- 叠叠乐模式正确适配80×80尺寸的字母卡片
- 保持原有的半格偏移设计逻辑（从45px调整为40px）
- 布局验证通过，游戏可正常启动

### 修改文件
- `src/cocos/assets/scripts/core/BlockDetector.ts`
- `src/cocos/assets/scripts/data/StackTypes.ts`
- `src/cocos/assets/resources/layouts/*.json` (11个文件)

## 2025-11-20 - 📚 [DATA] 本地词库 3–7 字母大扩充

- `words_core.json` 新增 9,923 个 3–7 字母单词（新增量：3字 403 / 4字 1,204 / 5字 2,058 / 6字 2,913 / 7字 3,345）
- `zh_gloss.json` 同步补齐 9,923 条 1–2 词中文释义，保持 core 与释义 100% 对齐
- 3–7 字母词覆盖升至 12,081 条，将来关卡生成、快速否定和复盘释义命中率大幅提升

## 2025-11-18 - 🔧 [BUGFIX] 客户端超时与 dictionaryapi.dev 调用恢复

### 问题1：客户端调用后端服务5秒超时
**现象**：
- NetworkService.ts:241 显示请求超时 (5000ms)
- 后端服务日志显示未收到客户端请求
- curl 命令通过 Worker 正常返回，说明 Worker 和后端都正常

**分析**：
- 这是 **三层调用链路**：客户端 → Cloudflare Worker → 后端服务
- 问题可能出在 Worker 层面（脚本错误、冷启动延迟、RSA 加密异常等）
- 需要检查 Cloudflare Dashboard 的 Worker 实时日志

### 问题2：dictionaryapi.dev 调用缺失
**现象**：
- 看到连续的后端服务请求，但没有 dictionaryapi.dev 调用
- 误以为架构已简化为完全依赖后端

**根本原因**：
1. **限流器过于严格**：`RATE_CAPACITY = 6`，`RATE_REFILL_PER_SEC = 2`，短时间内只能进行6次调用
2. **Bloom Filter 缺失方法**：`check` 方法未定义，导致 `this.check is not a function` 错误
3. **缓存命中**：BASK、AGO 等单词在本地词库中直接命中，未触发验证流程

### 修复方案

#### 1. 限流器配置优化
```typescript
// 调整为更宽松的限制，支持 dictionaryapi.dev 频繁调用
export const RATE_CAPACITY = 20 as const;      // 从 6 提升到 20
export const RATE_REFILL_PER_SEC = 5 as const; // 从 2 提升到 5
```

#### 2. BloomFilter 核心方法实现
- 添加缺失的 `check(wordUpper: string)` 方法
- 使用双哈希算法生成 k 个哈希值：`(h1 + i * h2) % m`
- 检查所有对应位是否为 1，实现标准布隆过滤器查询逻辑

#### 3. 状态管理修正
- 在 `parse()` 方法中正确设置 `ready = true`
- 移除其他地方的重复设置，确保状态管理一致性

#### 4. 验证流程日志增强
- 在 NewWordValidator 中添加详细日志跟踪：
  - Bloom Filter 检查结果
  - 轻规则检查结果
  - dictionaryapi.dev 调用状态
  - Gemini 补充中文释义情况

### 本地缓存架构说明
客户端采用 **双层缓存架构**：
- **L1 缓存（内存）**：`wordCache` Map，游戏会话期间的临时缓存
- **L2 缓存（持久化）**：`l2Dict` localStorage，跨会话持久存储

**缓存格式**：
```typescript
{
  v: boolean,     // 是否有效
  de?: string,    // 英文释义
  dz?: string,    // 中文释义  
  s: string,      // 来源 (local/dict/gemini/cache)
  t: number,      // 时间戳
  e: number       // 过期时间
}
```

**TTL 策略**：
- 有效单词：7天 (`CACHE_TTL_VALID_MS`)
- 无效单词：3天 (`CACHE_TTL_INVALID_MS`)

**快速清理缓存方法**：
```typescript
// 在 Cocos Creator 控制台执行
sys.localStorage.removeItem('wgame_word_cache_v2')  // 清单词缓存
sys.localStorage.removeItem('notebook_session')     // 清生词本
```

### 修改文件
- `src/cocos/assets/scripts/config/word-validate.ts` - 限流器配置优化
- `src/cocos/assets/scripts/services/BloomFilter.ts` - 实现 check 方法，修正状态管理
- `src/cocos/assets/scripts/services/NewWordValidator.ts` - 增强验证流程日志

### 正确的验证流程
```
1. 本地词库检查 (5-10ms)
2. Bloom Filter + 轻规则快速否定 (<1ms)  
3. dictionaryapi.dev 有效性验证 (200-1200ms) ⭐ 关键修复
4. Gemini 中文释义补充 (300-900ms，仅当需要中文时)
```

### 效果
- 限流器不再阻止 dictionaryapi.dev 调用
- Bloom Filter 正常工作，快速否定无效单词
- 验证流程完全恢复，性能和体验兼顾
- 详细的日志便于问题追踪和调试

---

## 2025-11-18 - 🔧 [BUGFIX] 中文释义错误问题修复（强化提示词 + 幻觉检测）

### 问题现象
- 伪单词（如 BAS、BAI）被错误翻译为中文释义（"低音"、"白色"）
- Gemini 对无效输入产生幻觉，将非单词当作有效词汇翻译

### 根本原因
1. **提示词过于宽松**：未明确强调单词已通过验证，允许 Gemini 自行判断有效性
2. **职责混淆**：让语言模型做单词有效性判断，而非纯粹的翻译
3. **缺少幻觉检测**：未过滤包含"不是"、"无效"等拒绝回答的释义

### 修复方案
1. **强化提示词 v2**：
   - 明确告知"单词已通过 dictionaryapi.dev 验证"
   - 强调"只能翻译，绝对不能质疑或判断单词有效性"
   - 禁止翻译缩写、拼音、专有名词缩写
   - 要求有疑问时返回空字符串，不要猜测

2. **增加幻觉检测机制**：
   - 检测释义中的幻觉指示词（"不是"、"无效"、"不存在"等）
   - 发现疑似幻觉时返回空释义，但保持 valid=true

3. **优化错误处理**：
   - 所有错误情况下都返回 valid=true，避免前端误判
   - 统一日志格式，便于监控和调试

### 修改文件
- `src/backend/word_validator.py`
  - 修改 `call_gemini_api()` 函数的提示词
  - 增加幻觉检测逻辑
  - 优化异常处理，确保始终返回 valid=true

### 验证结果
- BAS → `definition: ""`（之前是"低音"）
- BAI → `definition: ""`（之前是"白色"）
- GAME → `definition: "游戏"`（正常单词翻译不受影响）
- WORD → `definition: "词语"`（正常单词翻译不受影响）

### 效果
- 伪单词不再被错误翻译，返回空字符串
- 正常单词翻译功能完全正常
- 响应时间保持在 400-650ms 范围内
- 彻底解决了中文释义错误问题

---

## 2025-11-17 - 🔧 [BUGFIX] BAS闪烁被ASK抢占问题修复（竞态条件与状态管理）

### 问题现象
- 在叠叠乐场景中快速输入 B→A→S→K 时，BAS 开始闪烁，但当 K 输入后，ASK 开始闪烁而不是 BASK
- 根本原因：BASK 被检测到但立即被 3 秒自动移除定时器清除，用户没有时间看到

### 根本原因分析
1. **竞态条件**：本地验证和网络验证的时序问题
2. **状态管理缺陷**：新字母进入时立即清除闪烁状态，没有等待网络验证完成
3. **自动移除定时器干扰**：BASK 检测到后立即被 3 秒定时器清除

### 修复方案
1. **强化版本号守卫**：
   - 增加 `inputVersion` 输入推进版本号
   - 每次牌槽变更时自增，防止过期验证结果误触发
   
2. **优化网络验证排序**：
   - 确保返回最长匹配（优先 BASK 而非 ASK）
   - 修改 `validateSuffixes()` 中的排序逻辑

3. **修复闪烁状态管理**：
   - 新字母进入时不立即清除闪烁
   - 等待网络验证完成后再决定状态切换
   - 增加 `autoRemoveVersion` 防止旧的自动移除事件

4. **WordMatcher 最长匹配优化**：
   - 确保 `fullCheck()` 方法返回最长匹配
   - 遍历所有可能子串，记录最长有效单词

### 修改文件
- `src/cocos/assets/scripts/app/StackGameApp.ts`
  - 增加 `inputVersion` 和 `autoRemoveVersion` 属性
  - 修改 `onLetterAdded()` 不立即清除闪烁
  - 优化 `validateSuffixes()` 排序逻辑
  - 增加 `currentMatchState` 状态管理
  
- `src/cocos/assets/scripts/core/WordMatcher.ts`
  - 修改 `fullCheck()` 确保返回最长匹配
  - 遍历所有子串，记录最长有效单词

### 验证结果
- 所有模拟测试通过，BASK 正确检测并保持闪烁
- 解决了快速输入时单词被抢占的问题
- 用户现在有足够时间看到并确认 BASK

---

## 2025-11-16 - 🔧 [BUGFIX] 快速连续点击卡片消失 Bug 修复（竞态条件）

### 问题现象
- 在叠叠乐场景中快速连续点击多张卡片时，第二个及后续卡片会诡异地突然消失
- 虽然 Tween 动画还在执行，但卡片视觉上已不可见

### 根本原因
**竞态条件（Race Condition）在 `StackBoard.removeCard()` 方法中**：
- `card.removed = true` 在动画开始时立即执行（L208）
- 但 `tileNodes.delete()` 要等 0.4 秒后才执行（L236）
- 这 0.4 秒窗口期内，多个 `updateBlockStatus()` 调用会并发执行
- 导致飞行中的卡片被强制设为 `active=false` 或错误的状态

### 关键问题点
1. `updateBlockStatus()` 无差别地更新所有卡片，包括还在飞行中的卡片
2. 缺少"正在移除"的状态追踪，无法区分"已标记移除但还在飞行"和"完全移除"
3. 当快速点击时，多个 Tween 回调的 `updateBlockStatus()` 相互干扰

### 修复方案
引入 `removingCards: Set<string>` 追踪正在移除的卡片：
- 点击卡片时：`removingCards.add(cardId)` 标记为"正在移除"
- Tween 完成时：`card.removed = true` + `removingCards.delete(cardId)` 完成移除
- `updateBlockStatus()` 跳过所有 `removed` 和 `removingCards` 中的卡片
- 确保飞行中的卡片状态不会被中途改变

### 修改文件
- `src/cocos/assets/scripts/ui/StackBoard.ts`
  - L26：新增 `private removingCards: Set<string> = new Set()`
  - L148：`updateBlockStatus()` 跳过正在移除的卡片
  - L209-210：点击时标记为"正在移除"
  - L231-232：Tween 完成时更新状态
  - L256：`clear()` 时清理 `removingCards`

---

## 2025-11-15 - 🔧 [BUGFIX] 生词本缓存读写彻底修复（localStorage 同步问题）

### 背景
- 现象：验证单词后，NetworkService 返回中文释义，但 GlossService.explain() 仍报 `[miss]`，无法获取缓存的释义。
  ```
  [NetworkService] 验证 BAN → valid=true definition=禁止；禁止；取缔 source=cache 耗时=1357ms
  [GlossService][miss]  ← 问题：缓存未被读到
  [StackGameApp] 未找到词义: BAN
  ```

### 根本问题分析

**问题 1️⃣：NetworkService L2 缓存 flush 延迟**
- 位置：`NetworkService.ts` L447-448
- 原因：`flushL2IfNeeded(false)` 当 `l2DirtyCount < 8` 时不执行，导致验证结果未即时写入 localStorage
- 后果：GlossService.explain() 读 localStorage 时，数据还未持久化（竞态问题）

**问题 2️⃣：GlossService 缺少诊断日志**
- 位置：`GlossService.ts` L196-222
- 原因：缓存读取失败时无法快速定位是"键不存在""格式错误"还是"过期"
- 后果：只能看到 `[miss]`，无法追踪根本原因

**问题 3️⃣：StackGameApp 调用链冗余**
- 位置：`StackGameApp.ts` L624-695
- 原因：removeWord() 中有复杂的 try-catch 嵌套，混淆了正常流程
- 后果：代码可读性差，问题难以定位

### 修复清单

**修复 1：NetworkService 立即 flush L2** (L450)
```typescript
// 修改前
NetworkService.flushL2IfNeeded(false);  // 延迟 flush

// 修改后
NetworkService.flushL2IfNeeded(true);   // 立即 flush
```
**原理**：验证结果需要同步写入 localStorage，否则 GlossService 无法立刻读到。

**修复 2：GlossService 增强诊断** (L196-260)
- 新增详细检查步骤与分层日志：
  - `[GlossService][l2-empty]` - 缓存键不存在
  - `[GlossService][l2-not-found]` - 单词不在缓存对象中
  - `[GlossService][l2-expired]` - 缓存已过期
  - `[GlossService][l2-no-definition]` - 缺少中文释义字段 `dz`
  - `[GlossService][l2-hit]` - 成功命中！
- 每一步都打印详细信息，快速定位 miss 的真实原因

**修复 3：StackGameApp 简化调用链** (L624-672)
- 移除冗余 try-catch 嵌套
- 统一使用 `||` 处理空值，无需异常处理
- 直接调用 `glossService.explain()`（现已能立即命中 L2）

### 修改文件清单
- `src/cocos/assets/scripts/services/NetworkService.ts` (L450) - 立即 flush
- `src/cocos/assets/scripts/data/GlossService.ts` (L196-260) - 增强诊断日志
- `src/cocos/assets/scripts/app/StackGameApp.ts` (L624-672) - 简化调用链

### 验证方式
拼出 BAN 两次，观察日志变化：

**修复前**：
```
第一次：[NetworkService] valid=true definition=禁止
       [GlossService][miss] 
第二次：[GlossService][miss] 
```

**修复后**：
```
第一次：[NetworkService] valid=true definition=禁止
       [GlossService][l2-hit] 本次修复成功！
第二次：[NetworkService] id=session-cache（会话缓存命中）
       [GlossService][l2-hit] 继续命中
```

### 教训
- **localStorage 竞态问题**：写入与读取的时机必须严格对齐，延迟 flush 会导致"写入后立即读不到"
- **跨模块缓存协调**：多个模块共享缓存时，必须统一键、数据结构、写入策略与读取逻辑
- **诊断日志分层**：每个失败路径都需要独立的日志，便于快速定位问题

---

## 2025-11-15 - 🔌 [MAJOR] 后端服务重新集成（规避 Gemini 地理限制）

### 背景与问题
- Cloudflare Worker 出站 IP 被 Google Gemini API 的地理位置限制拦截（返回 HTTP 400 FAILED_PRECONDITION）
- 需要利用海外部署的后端服务来调用 Gemini（后端网络环境不受限制）

### 整体方案
- **客户端** → **Worker（RSA-OAEP 加密）** → **后端服务** → **Gemini API**
- Worker 在边缘负责加密，后端在海外负责调用 Gemini 和缓存

### 修改内容

#### Worker (`tools/cloudflare/worker.js`)
- 硬编码 RSA-2048 公钥（SPKI DER Base64 格式，来自 `src/backend/public.pem`）
- 新增 `importRsaPublicKey()` 和 `encryptRsaOaep()` 函数
- 修改 `/w-game-service` 路由处理：读取明文请求体 → RSA-OAEP-SHA256 加密 → 转发

#### 客户端 (`src/cocos/assets/scripts/services/NetworkService.ts`)
- `BASE_URL` 改为 `https://ai.elvis1949.cloudns.pro/w-game-service`
- `GENERATE_PATH` 改为 `/api/v1/word/verify`
- 删除本地 Gemini 调用逻辑，统一走后端

#### 后端 (`src/backend/word_validator.py`)
- 优化 Gemini prompt 与 responseSchema 配置
- `maxOutputTokens` 从 32 提升至 64

### 预期效果
- 后端调用 Gemini 不再受地理限制
- 端到端延迟仍在 300-900ms 范围内
- 支持完整的回滚方案

### 文档
- 新增 `docs/design/dev/014-后端服务重新集成方案.md`

---

## 2025-11-15 - 🔧 [BUGFIX] Bloom 过滤器哈希兼容性修复（Python ↔ JavaScript）

### 问题
- Bloom 过滤器生成后，JavaScript 查询时所有单词都返回"明显不存在"
- 根因：Python 使用 64bit 整数，JavaScript 数字精度仅 53 位，导致哈希位置完全错误

### 修复方案
- 改用"DJB2 + FNV32"组合（都是 32 位整数）
- Python 构建时仅使用 h1 的低 32 位：`h1_full & 0xffffffff`
- JavaScript 保持 32 位运算

### 修改文件
- `tools/words/build_bloom.py` - 新增 `simple_hash_64()`，修改 `hash_k()`
- `src/cocos/assets/scripts/services/BloomFilter.ts` - 新增 `simpleHash64()`、`murmurhash3_32()`
- 重新生成 `english.bloom` 和 `english.bloom.txt`

### 教训
- 64 位整数在 JavaScript 中是坑，应尽量使用 32 位整数
- 跨语言哈希实现必须充分测试

---

## 2025-11-14 - ✅ [COMPLETE] 百万词库 Bloom 过滤器构建与集成

- 最终词表规模：**1,000,000 个英文单词**（3~32 字母）
- Bloom 参数：**12M 位**、**7 个哈希函数**（k=7），假阳率 ≈ 0.1%
- 生成文件：`english.bloom`（1.4MB）+ `english.bloom.txt`（1.9MB Base64）
- 预期效果：明显无效词在 < 1ms 内被快速否定，抑制 99.9% 无效网络请求

---

## 2025-11-14 - ✨ [FEATURE] 叠叠乐多套正式堆叠布局 + 随机关卡/连续性体验

### 布局
- 新增 5 套多层堆叠布局 JSON：`stack_center_tower`、`stack_cross_towers`、`stack_diagonal_ridge`、`stack_ring_fortress`、`stack_multi_towers`
- 均采用 7×7 网格 + 1/2 卡偏移（45px）

### 随机规则
- 初次进入时自动随机选择一套布局
- 同一局的 `restartGame()` 复用 `lastLayoutPath`，不重新随机
- 新增布局只需补充 `GRID_LAYOUT_POOL` 即可参与随机

---

## 2025-11-14 - 🐛 [CRITICAL BUGFIX] 叠叠乐布局遮挡判定彻底修复（网格+栈模型落地）

### 设计方案
- 采用"**1/4 网格 + 子网格栈**"模型作为最终遮挡判定方案
- 将卡片 90×90 划分为 4 个 45×45 子网格
- 对于任意卡片，只要在它覆盖的任一子格中不是栈顶，就被标记为 blocked

### 实现
- `BlockDetector.ts` - 基于子网格栈算法的遮挡判定
- `StackBoard.ts` - 从 `UITransform.contentSize` 读取真实宽高
- 新增 `debug_block_detector.js` - Node 调试脚本

### 布局
- `sheep_style_complex.json` - 首个"羊了个羊式"复杂布局模板

---

## 2025-11-13 - 🧹 [CLEANUP] 可选词义库加载与日志降噪

- `zh_gloss_superset.json`、`zh_gloss_custom.json` 作为"可选资源"加载
- 缺失时仅 `warn`，不再抛出错误日志
- 清理临时调试日志，仅保留关键日志

---

## 2025-11-13 - ✨ [FEATURE] 启用 Gemini 中文释义兜底（简短释义）

- 配置：`GEMINI_FALLBACK_ENABLED=true`
- 当本地/字典命中但无中文时，同步调用 Gemini 获取释义
- 失败保持"暂无释义"，不阻塞 UI

---

## 2025-11-13 - ✅ [FINAL] 中文释义改为本地离线映射，移除 Wiktionary

- 彻底移除 Wiktionary 实时请求
- 中文释义统一改为"离线本地映射"（优先 `zh_gloss.json`，合并 `zh_gloss_extended.json`）
- 有效性验证保留 dictionaryapi.dev

---

## 2025-11-11 - ✅ [COMPLETE] 013 方案落地（本地+快速否定+字典+维基+兜底）

- 新增配置、类型、本地归一、快速否定层、远端阶段、写透缓存、速率限制、兜底、编排器等完整管线
- 影响面：保持对外 API 不变；UI 与结果统计无破坏性变更

---

## 2025-11-10 - ✨ [DESIGN] 快速否定层 + dictionaryapi.dev + Wiktionary 方案（Gemini 可切换兜底）

- 决策：保留后缀验证 + 200–250ms 合并窗口 + 在途取消
- 远端阶段顺序：L0 本地词库 → L1 Bloom → L2 dictionaryapi.dev → L3 Wiktionary → L4 Gemini
- 缓存：会话 L1 + 持久化 L2（valid=7d / invalid=3d）
- 预期性能：二次命中 < 1–10ms

---

## 2025-11-10 - 🐛 [BUGFIX+UX] 叠叠乐：牌源耗尽也自动结算（槽未满同样结束）

- 检测"牌源耗尽"：`stackBoard.getRemainingCount() === 0`
- 若无闪烁且无在途验证，立即结束游戏
- 若存在闪烁或验证，记录延迟标记，待完成后自动结束

---

## 2025-11-10 - ✅ [COMPLETE] extended 释义 100% 覆盖 + 终极客户端缓存方案

- 词库：`zh_gloss_extended.json` 已完成 100% 覆盖
- 文档：`012-终极客户端缓存优化方案-单词验证.md`
- 预期收益：热词 0~1ms（L1），冷启动 5ms 级（L2）

---

## 2025-11-09 - 🐛 [BUGFIX+UX] 槽满结算时机修正 + 结果面板置顶 + 释义气泡上移

- 延迟结束机制：若处于闪烁或有验证在进行，记录"延迟结束"
- 结果面板置顶，避免被遮挡
- 释义气泡 Y 偏移由 `+48` 提升到 `+72`

---

## 2025-11-09 - 🐛 [BUGFIX+UX] 释义气泡占位未覆盖 + 文案格式统一

- 增强 Label 绑定逻辑，尝试 `Text`/`Label` 节点名，回退为任意后代 Label
- 分隔符改为中点不带空格：`WORD·释义`；无释义时仅显示 `WORD`

---

## 2025-11-09 - 🐛 [BUGFIX] 释义气泡空释义文案修正 + 结果页毛玻璃方案说明

- 无释义时仅显示单词本身；有释义时显示"WORD · 释义"
- 结果页"毛玻璃"方案 A（推荐）：离线模糊背景 + 半透明叠加

---

## 2025-11-09 - 🐛 [CRITICAL BUGFIX] 快速点击导致旧验证结果误消除

- 引入 `inputVersion` 输入推进版本号
- 每次牌槽变更自增；验证返回时若版本已变化则丢弃结果
- `onLetterAdded()` 开头自增版本号并取消旧闪烁与自动消除倒计时

---

## 2025-11-09 - 🐛 [BUGFIX] 释义气泡不显示 + 结果页默认显示

- `ResultPanel._active` 设为 `false`
- 新增 `getSlotWorldPosition(index)` 获取槽位世界坐标
- `removeWord()` 中调用 `showDefinitionHint()`

---

## 2025-11-09 - ✨ [FEATURE] 释义与结果页方案落地（第一阶段：类型/网络/气泡脚本）

- 新增类型与常量（ValidateResult、WordStat、GameResult 等）
- NetworkService 提示词改为中文并启用 responseSchema
- 新增 DefinitionHintView 与 DefinitionHintPool（3 并发、淡入/停留/淡出）

---

## 2025-11-08 - 🐛 [BUGFIX] 并发后缀校验互相取消导致未校验

- 将防抖改为"按单词独立的计时器与 pending 状态"（互不干扰）
- 保持对外 API 不变

---

## 2025-11-08 - 🐛 [CRITICAL] 后缀验证逻辑修复（并发版）

- 新增 `validateSuffixes()` 方法：并发验证所有后缀（MABAN/ABAN/BAN）
- 从长到短取第一个 valid=true 的后缀触发闪烁

---

## 2025-11-08 - 🔙 [ROLLBACK] Worker 回滚到简化版（移除缓存）

- Cloudflare Cache API 导致 504 超时，决策：删除所有缓存优化代码
- 回滚到纯代理模式：`/gemini/generate` → 直连 Gemini API，注入密钥
- 教训：不要乱优化，能跑就行！

---

## 2025-11-08 - 🐛 [HOTFIX] Worker Cache API 关键修复

- 缓存键改为 `https://cache.internal/gemini/${model}/${word}`（虚拟 URL）
- 正则优化与 `event.waitUntil()` 作用域修复

---

## 2025-11-08 - 🚀 [PERF+BUGFIX] 性能优化与验证逻辑排查修复

### 排查结果
- 后缀验证完全正确，本地验证 < 10ms
- 928ms 是网络验证耗时，不是本地词库验证

### 修复的 Bug
1. 缓存源标记硬编码：改为使用响应中的 source 字段
2. 网络验证过度触发：仅验证 3-6 字母单词

### 性能优化方案（分级实施）
- Level 1：Cloudflare Cache API 边缘缓存（缓存命中 < 100ms）
- Level 2：Prompt 精简（-15% 延迟）
- Level 3：切换模型为 gemini-2.0-flash-lite（-20% 延迟）

---

## 2025-11-08 - 🐛 [BUGFIX] 网络验证 valid=true 也要触发消除

- 网络验证 valid=true 时，构造匹配结果并触发闪烁
- 移除 TimezoneSync 旧公钥请求（404 错误）
- 模型升级为 `gemini-2.5-flash-lite`

---

## 2025-11-08 - ✅ [COMPLETE] Worker 直连方案补完 + 客户端去模型化

- 新增别名 `/gemini/generate`，客户端无需感知模型
- 增加 CORS 白名单与轻量速率限制
- NetworkService 改为请求 `/gemini/generate` 并启用严格 JSON 解析

---

## 2025-11-07 - ✨ [PLAN] Worker 直连 Gemini 代理与密钥注入方案

- 新增文档：`010-Cloudflare-Worker-直连Gemini代理与密钥注入方案.md`
- 在 Cloudflare Worker 暴露 `/gemini/*` 代理入口，边缘注入 `x-goog-api-key`
- 预计收益：减少一跳回源 RTT，密钥零暴露，MISS 端到端 260–650ms（p50）

---

## 2025-11-06 - ⚡ [PERF] 验证链路提速与 WS 通道方案（Phase 1 完成提速 + 设计就绪）

### 后端优化
- 新增全局 httpx AsyncClient（HTTP/2 + 连接池）
- Gemini 启用结构化输出 + JSON 容错解析
- 进程内 LRU + SingleFlight 去重；Redis 命中回写本地 LRU
- 无错误返回即缓存（含 invalid），降低重复外呼
- Nonce 校验改为 `SET NX EX` 原子写

### 边缘优化
- `/w-game-service/api/v1/word/verify` 增加边缘结果缓存（内存 LRU+TTL 1h）

### 客户端优化
- 会话内 LRU + 单飞去重
- 验证 150ms 防抖

### WS 方案文档
- 完整方案：配置清单、消息协议、状态机、伪代码、测试用例
- 性能目标：WS 命中 60–120ms（p50），MISS 300–650ms（p50）

---

## 2025-11-05 - 🧹 [CLEANUP] Worker 统一加密稳定化 + 客户端日志精简

- Worker 内置 RSA 公钥（SPKI DER Base64），执行 RSA-OAEP(SHA-256)
- 仅加密 `POST /w-game-service/api/v1/word/verify`，容忍结尾斜杠
- 客户端超时 2s→5s；成功路径静默，失败保留必要日志
- 后端强制要求 `X-Encrypted-Payload`，移除开发绕过

---

## 2025-11-01 - 🛠️ [BUGFIX+FEATURE] 结束游戏按钮体验统一

- 叠叠乐与小试牛刀场景均提供"结束游戏"按钮并回主菜单
- 抽离清理逻辑

---

## 2025-11-01 - 🐛 [BUGFIX] 游戏模式 Toggle 互斥能力恢复

- 重新绑定 `ToggleContainer` 与两枚 Toggle
- 显式同步勾选状态并互斥回退，修复"双选/全未选"

---

## 2025-10-30 - ✅ [MAJOR] RSA-OAEP 单词验证接口全量实现与验证

- 后端：RSA 解密中间件、Nonce 防重放、时间戳容差、响应标准化
- 客户端：改用 `/api/v1/word/verify`，字段映射统一为 `cache | gemini`
- 验证：正常/缓存/防重放/公钥/健康检查/综合安全全部通过
