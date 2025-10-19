## 2025-10-19 - 🎯 牌槽缩放比例微调 + 布局定位修正完成

### 修复概述

按照 `docs/design/fix/006-牌槽缩放比例微调方案.md` 完成了两项关键修正：
1. **缩放档位从三档改为四档**：更激进的缩放策略，确保10格不超屏
2. **布局定位系统修正**：消除spacing干扰，baseSlotWidth改为实际宽度

### 核心修正

#### 修正1：SlotQueue.ts - 四档式缩放系统

**修改位置**：`getSlotScale()` 方法（第122-132行）

**原方案 → 新方案**：
- 7格：100% (1.0) → **100% (1.0)** ✓ 不变
- 8格：87.5% (0.875) → **85% (0.85)** ↑ 缩小15%
- 9格：71% (0.71) → **75% (0.75)** ↑ 新增档位（避免过早缩小）
- 10格：71% (0.71) → **68% (0.68)** ↑ 更激进（确保不超屏）

**设计理由**：
- 8格缩小幅度更温和（1% vs 原12.5%）
- 9格新增，平滑过渡到10格
- 10格68%更激进，应对最坏情况下的超屏风险

---

#### 修正2：SlotQueue.ts - 布局定位系统修正

**修改位置**：`layoutSlotsWithPureMath()` 方法（第150-152行）

**问题诊断**：
- Layout组件spacingX被设为0，但代码仍使用97px作为基准宽度
- 97 = 85(实际槽位宽度) + 12(之前的spacing计算残留)
- 导致牌槽显示不居中且有间隙

**修正方案**：
```typescript
// 修改前
const baseSlotWidth = 97;  // 包含了spacing

// 修改后
const baseSlotWidth = 85;  // SlotItem预制体的实际宽度（无spacing）
```

**场景文件修正**（StackGameScene.scene）：
- 禁用SlotItemsContainer的Layout组件（`_enabled: false`）
- 将Layout的spacingX改为0
- 彻底消除Layout的自动布局干扰

**效果验证**：
- ✅ 牌槽完全居中显示
- ✅ 格子之间无间隙（紧密排列）
- ✅ 所有容量下都在屏幕范围内

---

### 修改文件清单

1. **[SlotQueue.ts:122-132](src/cocos/assets/scripts/ui/SlotQueue.ts#L122-L132)** - 四档式缩放系统
2. **[SlotQueue.ts:150-152](src/cocos/assets/scripts/ui/SlotQueue.ts#L150-L152)** - baseSlotWidth修正
3. **[StackGameScene.scene](src/cocos/assets/scenes/StackGameScene.scene)** - Layout组件禁用

### 技术要点

**关键认识**：
- 编辑器UI和场景文件的同步问题：修改UI后需要强制保存或直接编辑JSON
- 布局算法中的"基准值"必须与实际资源宽度相符
- spacing=0不意味着代码也要改成0，关键是baseSlotWidth要准确

### 预期效果

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 牌槽对齐 | 偏左 | 完全居中 ✅ |
| 格子间隙 | 有5px间隙 | 紧密无缝 ✅ |
| 10格显示 | 超屏或间隙 | 68%缩放，适配屏幕 ✅ |

---

## 2025-10-19 - 🎬 牌槽动态缩放系统实现完成

### 实现概述

按照 `docs/design/fix/005-牌槽动态缩放系统设计方案.md` 完整实现了牌槽从7格扩展到10格的动态缩放系统。解决了扩容后格子超出屏幕的问题，实现了平滑的缩放动画和字母卡片同步缩放。

---

### 技术亮点

1. **避免双重缩放**：动画期间slot的localScale重置为1.0，仅container参与缩放动画
2. **字母自动同步**：利用Cocos的节点缩放继承机制，子节点自动跟随父节点缩放
3. **闪烁反馈**：3次闪烁循环，让玩家明显感知到容量变化
4. **方案可扩展**：未来可轻松添加11、12格的支持，只需修改缩放比例表

---

### 测试验证指南

- **7格初始化**：观察console日志中的缩放=1，slot宽度=97px
- **7→8格扩容**：观察闪烁3次动画，缩放从1.0→0.875
- **8→9格扩容**：观察闪烁3次动画，缩放从0.875→0.71
- **字母飞入**：不同容量下，字母缩放与槽位一致
- **屏幕范围**：所有容量下，牌槽完全显示在屏幕内

---

## 2025-10-18 - 🎮 叠叠乐游戏核心交互问题修复完成

### 修复概述

根据 `docs/design/fix/004-叠叠乐游戏核心交互问题深度分析与修复方案.md` 执行了5个关键修复，解决了单词匹配、动画反馈、自动消除等核心交互问题。

### 修复清单

#### 修复1：卡片点击事件统一化 - StackBoard.ts
**位置**：[StackBoard.ts:106-109](src/cocos/assets/scripts/ui/StackBoard.ts#L106-L109) 和 [StackBoard.ts:224](src/cocos/assets/scripts/ui/StackBoard.ts#L224)

**问题**：直接监听 TOUCH_END 事件，导致多个监听器竞争，且状态检查在 LetterTile 组件内无法执行

**修复**：
- 改为监听 LetterTile 发射的自定义 `tile:clicked` 事件
- LetterTile 内部负责状态检查（selectable/highlight 才发射事件）
- clear() 方法移除 `tile:clicked` 监听而非 TOUCH_END

**效果**：事件流清晰，状态检查集中化

---

#### 修复2：单词闪烁动画重构 - SlotQueue.ts
**位置**：[SlotQueue.ts:276-356](src/cocos/assets/scripts/ui/SlotQueue.ts#L276-L356)

**问题**：
- 动画作用于 slot 根节点，而非实际的字母牌节点
- 使用 repeatForever() 导致动画无法停止
- findLetterTileNode() 缺失

**修复**：
- 新增 `findLetterTileNode()` 方法，查找 slot 中的字母牌节点
- `playBlinkAnimation()` 改为 5 次有限循环，使用 `Tween.tag(1001)` 标记便于停止
- `stopBlink()` 使用 `Tween.stopAllByTag(1001)` 停止动画并恢复缩放

**效果**：闪烁动画可靠停止，动画作用对象正确

---

#### 修复3：清除按钮调试增强 - SlotQueue.ts
**位置**：[SlotQueue.ts:47-66](src/cocos/assets/scripts/ui/SlotQueue.ts#L47-L66)、[SlotQueue.ts:225-247](src/cocos/assets/scripts/ui/SlotQueue.ts#L225-L247)、[SlotQueue.ts:446-460](src/cocos/assets/scripts/ui/SlotQueue.ts#L446-L460)

**改进**：
- onLoad() 添加按钮节点检查日志
- startBlink() 添加状态验证日志
- onConfirmClick() 添加详细的状态和触发日志

**效果**：快速定位按钮绑定和状态问题

---

#### 修复4：自动清除时序优化 - SlotQueue.ts
**位置**：[SlotQueue.ts:579-601](src/cocos/assets/scripts/ui/SlotQueue.ts#L579-L601)、[SlotQueue.ts:373-399](src/cocos/assets/scripts/ui/SlotQueue.ts#L373-L399)、[SlotQueue.ts:405-445](src/cocos/assets/scripts/ui/SlotQueue.ts#L405-L445)

**问题**：update() 倒计时到期立即调用 stopBlink()，导致动画在播放前被停止

**修复**：
- update() 倒计时到期时仅触发 `auto-remove` 事件，不直接 stopBlink()
- removeWord() 开始前先调用 stopBlink()，确保时序：**停止闪烁 → 播放消除动画 → 销毁字母节点**
- playRemoveAnimation() 对字母牌节点播放动画，并在完成后销毁节点

**效果**：倒计时 → 停止闪烁 → 播放消除动画 → 字母消失，时序完全正确

---

#### 修复5：词义查询方法名修正 - StackGameApp.ts
**位置**：[StackGameApp.ts:424-446](src/cocos/assets/scripts/app/StackGameApp.ts#L424-L446)

**问题**：调用不存在的 `getGloss()` 方法，应为 `explain()`

**修复**：改用 `glossService.explain(word)` 查询中文释义

**效果**：词义查询功能可用

---

### 核心技术突破

1. **事件流清晰化**：LetterTile 内部负责状态检查，父组件监听自定义事件，避免多层状态冲突

2. **Tween 标记管理**：使用 `tag()` 标记不同类型的动画，`stopAllByTag()` 精准停止特定动画

3. **时序设计**：明确的三段式流程（停止 → 动画 → 销毁），避免竞态条件

### 修改文件

- [StackBoard.ts](src/cocos/assets/scripts/ui/StackBoard.ts) - 事件统一化
- [SlotQueue.ts](src/cocos/assets/scripts/ui/SlotQueue.ts) - 闪烁重构、调试增强、时序优化
- [StackGameApp.ts](src/cocos/assets/scripts/app/StackGameApp.ts) - 方法名修正

---

## 2025-10-18 - 🐛 词库重复加载和初始化时序问题深度修复

### 问题诊断

按照修复方案 `docs/design/fix/003-词库重复加载和初始化时序问题深度分析.md` 实施后，出现新的时序问题：

**核心问题**：Cocos Creator 生命周期中，`onLoad()` 是 `async` 的，但 **`start()` 不会等待 `onLoad()` 完成就执行**！

**实际时序**：
```
1. StackGameApp.onLoad() 开始
   → 调用 await glossService.load(false)
   → loadJsonFromBundle() 开始异步加载 words Bundle

2. ⚠️ start() 立即被调用（不等待 onLoad() 完成）
   → startGame() 执行
   → initWordMatcher() 调用 getAllWords()
   → 词库还未加载完成 → 返回空数组

3. 稍后，Bundle 异步加载完成
   → 但游戏已经用空词库初始化了
```

**日志证据**：
```
[GlossService] ========== 开始加载词库 ==========
[GlossService.loadJsonFromBundle] >>> 开始加载 words/words_core
[GlossService.loadJsonFromBundle] ❌ Bundle 'words' 未缓存！
[GlossService.loadJsonFromBundle] 尝试重新加载 Bundle 'words'...
[GlossService] 词库未加载或格式错误  // ← start() 已执行
...
[GlossService.loadJsonFromBundle] ✅ Bundle加载成功  // ← 但已经晚了
```

### 修复方案

#### 1. StackGameApp.ts - start() 生命周期改造

**修改位置**：[StackGameApp.ts:106-126](src/cocos/assets/scripts/app/StackGameApp.ts#L106-L126)

**关键改动**：
```typescript
// 修改前
protected start(): void {
    this.startGame();
}

// 修改后
protected async start(): Promise<void> {
    const glossService = GlossService.getInstance();

    console.log('[StackGameApp] start() 开始，等待词库加载完成...');

    // ⚠️ 关键：无论 onLoad() 中是否已经开始加载，这里都再次调用 load()
    // load() 方法内部会处理并发控制，如果已经在加载，会等待完成
    try {
        await glossService.load(false);
        console.log('[StackGameApp] start() 词库加载完成');
    } catch (error) {
        console.error('[StackGameApp] start() 词库加载失败:', error);
    }

    // 最终验证
    const loadStatus = glossService.getLoadStatus();
    console.log(`[StackGameApp] start() 最终状态检查: 核心=${loadStatus.core}, 扩展=${loadStatus.extended}`);

    this.startGame();
}
```

**核心原理**：
- `start()` 改为 `async`，主动等待词库加载完成
- 利用 `GlossService.load()` 的内置并发控制机制
- 如果 `onLoad()` 中已开始加载，`start()` 会等待同一个 Promise 完成
- 如果 `onLoad()` 未执行（直接预览 Game 场景），`start()` 会触发加载

#### 2. GlossService.ts - 并发加载保护机制验证

**现有机制**（已存在，无需修改）：
```typescript
async load(useExtended: boolean = false): Promise<void> {
    // 如果正在加载中，等待之前的加载完成
    if (this.loadingPromise) {
        console.log('[GlossService] 词库正在加载中，等待之前的加载完成...');
        await this.loadingPromise;
        return;
    }

    // 创建加载Promise（防止并发加载）
    this.loadingPromise = this.performLoad(useExtended);

    try {
        await this.loadingPromise;
    } finally {
        this.loadingPromise = null;
    }
}
```

**保护效果**：
- `onLoad()` 和 `start()` 同时调用 `load()` 时
- 第二个调用会自动等待第一个完成
- 避免重复加载和资源竞争

#### 3. 调试日志增强（临时）

**修改位置**：[GlossService.ts:92-124](src/cocos/assets/scripts/data/GlossService.ts#L92-L124)

添加详细的 `coreWordsAsset` 对象检查日志：
```typescript
console.log('[GlossService] coreWordsAsset 对象:', coreWordsAsset);
console.log('[GlossService] coreWordsAsset 类型:', typeof coreWordsAsset);

// 兼容性处理：检查多种可能的 JSON 数据位置
let jsonData = null;
if (coreWordsAsset) {
    if (coreWordsAsset.json) {
        jsonData = coreWordsAsset.json;
    } else if ((coreWordsAsset as any)._nativeAsset) {
        jsonData = (coreWordsAsset as any)._nativeAsset;
    } else if (typeof coreWordsAsset === 'object' && (coreWordsAsset as any).by_len) {
        jsonData = coreWordsAsset;
    }
}
```

### 核心技术洞察

#### 1. Cocos Creator 生命周期陷阱

**错误认知**：
```typescript
// ❌ 以为 start() 会等待 async onLoad() 完成
protected async onLoad() {
    await someAsyncOperation();
}

protected start() {
    // 假设 onLoad() 已完成 ← 错误！
    useLoadedData();
}
```

**正确做法**：
```typescript
// ✅ start() 中主动等待异步操作完成
protected async start() {
    await ensureDataLoaded();
    useLoadedData();
}
```

#### 2. 异步资源加载的并发控制

**问题**：多个组件生命周期同时触发资源加载
- `onLoad()` 开始加载
- `start()` 也尝试加载
- 导致重复请求和竞态条件

**解决**：单例 + Promise 缓存
```typescript
private loadingPromise: Promise<void> | null = null;

async load() {
    // 已经有加载中的 Promise，直接等待它
    if (this.loadingPromise) {
        await this.loadingPromise;
        return;
    }

    // 创建新的加载 Promise
    this.loadingPromise = this.performLoad();
    await this.loadingPromise;
    this.loadingPromise = null;
}
```

#### 3. Bundle 加载的异步特性

**问题**：`assetManager.loadBundle()` 是**完全异步**的回调
- 即使使用 `await`，也只是等待 Promise resolve
- Bundle 的加载、反序列化需要时间
- 过早访问会返回 null

**解决**：在真正使用数据前，必须验证加载状态
```typescript
await glossService.load(false);

// 验证是否真的加载成功
const loadStatus = glossService.getLoadStatus();
if (!loadStatus.core) {
    console.error('词库加载失败');
}
```

### 影响范围

- ✅ **修复时序问题**：确保 `startGame()` 执行时词库已完全加载
- ✅ **降级兼容**：直接预览 Game 场景时，`start()` 会触发词库加载
- ✅ **并发安全**：多次调用 `load()` 不会重复加载
- ✅ **调试增强**：详细日志帮助排查 Bundle 加载问题

### 预期效果

**成功日志**：
```
[StackGameApp] start() 开始，等待词库加载完成...
[GlossService] 词库正在加载中，等待之前的加载完成...（如果 onLoad() 已触发）
[GlossService] ✅ 核心词库加载成功
[GlossService] wordBank结构: ['by_len']
[StackGameApp] start() 词库加载完成
[StackGameApp] start() 最终状态检查: 核心=true, 扩展=false
[WordMatcher] ✅ 词库初始化完成，共 XXX 个单词
```

### 修改文件

1. **StackGameApp.ts** - `start()` 改为 `async`，主动等待词库加载
2. **GlossService.ts** - 增强调试日志，验证并发控制机制

### 测试验证

在 Cocos Creator 编辑器中：
1. **正常流程**：Boot → Menu → Game，词库应在 Menu 预加载
2. **降级场景**：直接预览 Game 场景，`start()` 应触发加载
3. **日志验证**：查看控制台，确认词库加载完成后才执行 `startGame()`
4. **功能验证**：游戏应能正常生成目标词并开始游戏

---

## 2025-10-18 - 🔧 金字塔堆叠布局重构 + 渲染顺序全面修复

### 问题诊断

修复后出现中间卡片全部display-disabled的现象。经排查发现**不是代码bug，而是布局配置设计问题**！

**根本原因**：
- 旧配置的Layer 1（9张卡片）集中在中心区域，带各种偏移量
- 这9张卡片遮挡了Layer 0大部分中间卡片的至少一个象限
- 按照"任意象限被遮挡=整张卡片disabled"规则，中间卡片全灰

### 修复方案

#### 1. 配置文件重新设计（pyramid_default.json）

从之前的布局改为**完整的35张卡片金字塔堆叠**：
```
Layer 0: 25张卡片（5×5完整区域）
  grid(1,1) ~ grid(5,5)

Layer 1: 9张卡片（3×3中心区域）
  grid(2,2)~(2,4), grid(3,2)~(3,4), grid(4,2)~(4,4)

Layer 2: 1张卡片（正中心）
  grid(3,3)
```

**关键改动**：
- 所有卡片offset都改为(0,0)，去掉所有偏移
- Layer 0: 25张卡片完整铺满5×5，内层会被上层遮挡
- Layer 1: 9张卡片在3×3中心区域，其中心卡片被Layer 2遮挡
- Layer 2: 1张卡片在正中心，完全无遮挡
- 总计：25 + 9 + 1 = **35张卡片**

**遮挡关系**：
- Layer 0的25张中，外圈16张无遮挡(selectable)，内圈9张被Layer 1遮挡(disabled)
- Layer 1的9张中，外圈8张无遮挡(selectable)，中心1张被Layer 2遮挡(disabled)
- Layer 2的1张完全无遮挡(selectable)
- **总计可点击：16 + 8 + 1 = 25张，disabled：9 + 1 = 10张**

#### 2. 渲染顺序完全重构（StackBoard.ts）

**新增方法** `reorderTilesByLayer()`：
```typescript
// 按layer排序后，为每张卡片分配唯一的siblingIndex
// Layer 0的25张: index 0-24
// Layer 1的9张: index 25-33
// Layer 2的1张: index 34
```

**关键改进**：
- 之前每个layer内所有卡片都用同样的layer作为index，导致同层卡片互相挤占
- 现在为所有35张卡片分配唯一的index，严格按layer从下到上排列
- 解决了"同layer内卡片渲染顺序不确定"的问题

**修改流程**：
1. init() 先创建所有节点 addChild()
2. 调用 reorderTilesByLayer() 统一设置siblingIndex
3. 再调用 updateCardRects() 和 updateBlockStatus()

#### 3. 清理调试日志

**移除的日志**：
- StackBoard.ts: 删除rect更新的详细日志（10+行）
- BlockDetector.ts: 删除象限检查详情日志（30+行）
- GridLayoutLoader.ts: 删除卡片加载日志

**保留的日志**：仅保留必要的错误提示

### 预期效果

| 项目 | 数量 | 状态 |
|------|------|------|
| Layer 0外圈卡片 | 16张 | selectable ✅ |
| Layer 0内圈卡片 | 9张 | disabled（被Layer 1遮挡） ✅ |
| Layer 1外圈卡片 | 8张 | selectable ✅ |
| Layer 1中心卡片 | 1张 | disabled（被Layer 2遮挡） ✅ |
| Layer 2中心卡片 | 1张 | selectable ✅ |
| **总计可点击** | **25张** | selectable ✅ |
| **总计被遮挡** | **10张** | disabled ✅ |

### 修改文件

1. **pyramid_default.json** - 35张卡片完整金字塔布局
2. **StackBoard.ts** - 新增reorderTilesByLayer()，清理日志
3. **BlockDetector.ts** - 简化遮挡判定逻辑，清理日志
4. **GridLayoutLoader.ts** - 清理日志

### 测试验证步骤

在Cocos Creator编辑器中：
1. 打开Game场景
2. 运行预览，应该看到：
   - 蓝色(selectable)卡片25张
   - 灰色(disabled)卡片10张
   - 明显的三层金字塔堆叠效果
3. 点击外层蓝色卡片→响应 ✅
4. 点击中间蓝色卡片→响应 ✅
5. 点击灰色卡片→无响应 ✅

---

## 2025-10-17 - 🎨 关键Bug修复完成：渲染顺序 + 布局坐标 + 遮挡判定

### 第三层修复：渲染顺序bug（Z-order问题）

**问题诊断**：disabled态卡片（下层）visually渲染在上方，selectable态卡片（上层或无遮挡）反而在下方。用户截图明确显示灰色disabled卡片压在蓝色selectable卡片上面。

**根本原因**：[StackBoard.ts:111](src/cocos/assets/scripts/ui/StackBoard.ts#L111) 中 `setSiblingIndex()` 在 `addChild()` **之前**调用

```typescript
// ❌ 错误顺序（setSiblingIndex在addChild之前）
tileNode.setSiblingIndex(card.layer);  // 此时节点无父节点，调用无效
this.container.addChild(tileNode);     // 导致节点按addChild顺序渲染，而非按layer排序
```

**Cocos Creator关键规则**：
- `setSiblingIndex(index)` 仅在节点已有父节点时才生效
- `setSiblingIndex(index)` 的index越小，越先渲染（在下层）
- 违反这个顺序会导致渲染顺序完全错乱

**实际现象**：
- Layer 0卡片（25张）先addChild → 默认siblingIndex=0-24 → 渲染在底层（虽然setSiblingIndex被忽略）
- Layer 1卡片（9张）后addChild → 默认siblingIndex=25-33 → 渲染在中层
- Layer 2卡片（1张）最后addChild → 默认siblingIndex=34 → 渲染在顶层

但由于setiblingIndex全部失效，实际渲染顺序反而是：Layer 0最底 → Layer 1中 → Layer 2最顶，虽然看起来符合预期，但这是偶然巧合，不是代码控制的结果。问题在于：disabled状态的卡片（下层需要被遮挡的）visually显示在上方。

**修复方案**：调整代码顺序，先addChild再setSiblingIndex

```typescript
// ✅ 正确顺序
this.container.addChild(tileNode);      // 先添加，让节点有父节点
tileNode.setSiblingIndex(card.layer);   // 再设置，此时才生效
```

**修改文件**：[StackBoard.ts:104-116](src/cocos/assets/scripts/ui/StackBoard.ts#L104-L116)

**修改内容**：
- 将`setSiblingIndex()`移到`addChild()`之后
- 添加详细注释说明Cocos Creator的siblingIndex机制

**预期效果**：
- Layer 0卡片 siblingIndex=0 → 最下层
- Layer 1卡片 siblingIndex=1 → 中层
- Layer 2卡片 siblingIndex=2 → 最上层
- disabled态卡片visually在下方，selectable态卡片在上方 ✅
- 视觉表现与游戏逻辑完全一致 ✅

---

## 2025-10-17 - 🐛 布局配置重复坐标Bug修复 + 遮挡判定算法修复

### 布局配置问题修复

**问题诊断**：通过详细日志分析发现 `pyramid_default.json` 中存在 **2组重复卡片坐标**

**具体问题**：
- card_43(Layer 1) 和 card_44(Layer 1) 的世界坐标都是 (45, 45) ❌
- card_46(Layer 1) 和 card_47(Layer 1) 的世界坐标都是 (-45, 45) ❌

**根本原因**：网格坐标+偏移量的组合计算错误
```
错误配置导致的坐标重复：
- gridRow=3, gridCol=3, offset=(45,45)   → (45, 45)
- gridRow=3, gridCol=4, offset=(-45,45)  → (45, 45)  ❌重复！
```

**修复方案**：重新设计Layer 1配置，确保所有9张卡片坐标唯一

**修改内容**（pyramid_default.json 第42-48行）：
```json
// 修改前 → 修改后
第42行: offset: (0, -45)   → (-45, 0)
第43行: offset: (45, 45)   → (0, 0)
第44行: offset: (-45, 45)  → (45, 0)
第46行: offset: (45, -45)  → (0, 45)
第47行: offset: (-45, -45) → (0, -45)
第48行: 无变化
```

**验证结果**：修复后Layer 1的9张卡片世界坐标全部唯一 ✅

---

## 2025-10-17 - 🔧 遮挡判定算法关键Bug修复

### 问题诊断

发现 BlockDetector.ts 中的**致命层级判定错误**：

**原错误逻辑**（第159-161行）：
```typescript
// ❌ 只检查相邻上一层（layer+1）
const upperLayerCards = cards.filter(
    c => c.layer === card.layer + 1 && !c.removed
);
```

**问题场景**：多层堆叠时（Layer 0 → Layer 1 → Layer 2）
- Layer 0卡片只检查Layer 1的遮挡
- 完全忽略Layer 2的遮挡
- 导致底层卡片即使被顶层卡片遮挡，仍错误显示为可点击

**示例**：pyramid_default.json中，Layer 2的卡片可以直接遮挡Layer 0的中心卡片，但当前算法会误判

### 修复方案

#### 核心修复：BlockDetector.ts

修改第153-155行，改为检查所有更高层级：

```typescript
// ✅ 检查所有更高层级（layer > 当前层）
const upperLayerCards = cards.filter(
    c => c.layer > card.layer && !c.removed
);
```

#### 文档更新

1. **BlockDetector.ts**：更新文件头注释（第1-23行）
   - 删除"只有相邻上层"的错误说法
   - 强调"检查所有更高层级"的正确原理

2. **grid_layout_system_design.md**：更新第7章（第447-497行）
   - 添加"关键修正"表格
   - 标注错误观点vs正确观点
   - 给出修正后的算法代码

3. **stack_word_game_design_complete.md**：更新第10章（第885-931行）
   - 标注早期"重叠面积法"为过时方案
   - 强调实际采用"4象限法"
   - 解释关键修正：检查所有上层，而非仅相邻层

### 影响范围

- ✅ **时间复杂度**：O(n) 不变
- ✅ **性能**：无负面影响
- ✅ **兼容性**：不影响现有布局配置
- ⚠️ **行为变化**：某些原本"可点击"的卡片会变成"被遮挡"（这是正确的修复）

### 预期效果

- ✅ 修复了多层堆叠场景中的跨层遮挡误判
- ✅ 遮挡判定与玩家视觉直觉完全一致
- ✅ 不再出现"明明被遮挡却显示可点击"的Bug

---

## 2025-10-17 - 🎯 卡片空隙问题三层修复完整总结

### 问题演进与最终解决

这是围绕"卡片之间存在视觉间隙"问题的三层修复过程：

#### **第1层修复：PNG图片深度优化（21:48）**
- **问题根源**：5张卡片PNG包含不一致的透明边缘（3张449×449，2张512×502）
- **解决方案**：
  - 创建图片处理工具链（`tools/image_processing/`）
  - 自动裁剪所有透明区域，统一trimType为`none`
  - 所有PNG处理完成，原始文件备份

#### **第2层修复：SpriteFrame Offset归零（23:30）**
- **新发现**：PNG处理后，Cocos Creator仍为这些不对称的图片计算Offset偏移
  - `tile_selectable/wrong`: offsetY=-5（浮点偏移0.88px）
  - `tile_correct/disabled/highlight`: offsetX=0.5, offsetY=-0.5（浮点偏移0.39px）
- **根本解决**：
  - 用脚本重新制作所有PNG为512×512对称格式
  - 内容完美居中，所有Offset置零
  - 创建完整的修复工具套件（`tools/fix_tiles/`）

#### **第3层修复：坐标系统整数化（22:45）**
- **关键发现**：布局算法中存在22.5px非整数偏移，间距也是5px
- **彻底规范化**：
  - 删除所有22.5px定义，保留仅[-45, 0, 45]三个整数偏移
  - 修改SmartLayoutGenerator和StackTypes
  - **最关键**：修复StackBoard.updateCardRects()中的浮点误差
    - 原：使用`convertToWorldSpaceAR()`导致坐标变成195.11这样的小数
    - 新：直接使用`card.position`保持整数坐标系
  - 卡片间隙改为0（CARD_SPACING = 0）

### ✅ 最终验收标准

| 项目 | 修改前 | 修改后 |
|------|--------|--------|
| 坐标精度 | 195.11（小数） | 180.00（纯整数） |
| 卡片间隙 | 5px | 0px（紧密无缝） |
| 偏移值规范 | 混乱，包含22.5px | 统一[-45, 0, 45] |
| 浮点误差 | 0.88px × 25卡 = 明显缝隙 | 完全消除 |

### 📊 涉及修改文件

| 文件 | 修改内容 | 效果 |
|------|--------|------|
| SmartLayoutGenerator.ts | 删除22.5px、移除5px间隙 | 布局规范化 |
| StackTypes.ts | 类型定义修复 | 约束验证一致 |
| StackBoard.ts | 修复convertToWorldSpaceAR | 消除浮点误差 |
| 5张PNG文件 | 重新制作为对称格式 | Offset全零 |

### 💡 核心经验

1. **视觉问题往往涉及多个技术层面**：资源本身 → 引擎处理 → 坐标计算
2. **浮点数累积误差不可忽视**：0.88px × 25个卡片 = 明显视觉缝隙
3. **整数坐标系统的重要性**：网格单元必须使用整数，确保精确性和可预测性

---

## 2025-09-20 - 重大功能完成与优化

### 🎯 5×5网格布局终极解决方案

**问题**：4→5网格升级后，Layout Grid组件对奇数网格计算存在缺陷，导致整体右偏

**创新方案**：基于用户洞察，实现纯数学定位法
- 以中心格子(2,2)为原点(0,0)，建立相对坐标系
- 完全移除Layout组件，直接计算每个瓦片位置
- 公式：`offsetX = (col - centerCol) * 95`，`offsetY = (centerRow - row) * 95`

**核心改进**：
- ✅ 完美居中：中心格子精确位于屏幕中心
- ✅ 跨平台一致：编辑器、微信开发者工具、真机表现完全一致
- ✅ 性能提升：避免Layout复杂计算，直接定位

### 🎮 游戏玩法核心优化

| 项目 | 修改前 | 修改后 |
|------|--------|--------|
| 棋盘规模 | 4×4 | 5×5（增加56%空间） |
| 单词长度 | 4-6字母 | 4-7字母 |
| 连接方式 | 8方向（含斜线） | 4方向（仅上下左右） |

**设计权衡**：更大棋盘+更长单词→增强挑战性；简化连接方式→提升可见性

### 🚀 Asset Bundle远程资源完整方案

**问题**：构建包19MB，严重超过微信小游戏4MB限制

**解决**：采用Cocos Creator 3.8.7官方Asset Bundle系统
- Bundle配置：`assets/bundle/` 目录下配置bg、title、tiles、modal四个Bundle
- 远程部署：Docker化资源服务器，一键启动
- 包体优化：本地<4MB，远程资源~2MB，按需下载

**关键技术**：
- 必须使用 `bundle.load('imageName/spriteFrame', SpriteFrame)` 正确指定子资源
- 预加载改用 `bundle.load()` 完全加载而非 `preload()` 仅下载
- 后续使用 `bundle.get()` 立即获取资源（<1ms）

### ✅ 预加载与缓存机制优化

创建统一AssetLoader单例，实现三级缓存检查：
1. Bundle是否已缓存（`assetManager.getBundle()`）
2. 资源是否已缓存（`bundle.get()`）
3. 利用预加载的网络缓存

预加载覆盖所有游戏资源：
- bg Bundle：场景背景 (704KB)
- title Bundle：标题资源 (536KB)
- tiles Bundle：5种字母瓦片 (新增)
- modal Bundle：弹窗背景 (740KB)

---

## 2025-09-18 - 生词本系统修复与平台兼容性

### 🐛 关键Bug修复

**问题1：结果页面生词本为空**
- **原因**：不同组件创建不同的GlossService实例，数据隔离
- **修复**：直接从localStorage读取持久化数据而非依赖内存数据

**问题2：微信小游戏Set对象序列化失败**
- **原因**：`[...new Set()]` 在微信环境下不兼容
- **修复**：改用 `Array.from(new Set())` 确保跨平台兼容

**问题3：localStorage数据类型污染**
- **原因**：JSON.parse后包含undefined/null，调用.toUpperCase()报错
- **修复**：添加严格的类型检查和数据自愈机制

### 🛡️ 防御性编程增强

所有组件 `onDestroy()` 添加空指针检查：
```typescript
if (this.button && this.button.node) {
    this.button.node.off(Button.EventType.CLICK, this.onClick, this);
}
```

数据加载添加类型验证：
```typescript
const parsed = JSON.parse(stored);
if (Array.isArray(parsed)) {
    this.sessionNotebook = parsed.filter(item =>
        typeof item === 'string' && item.trim() !== ''
    );
}
```

### 📚 生词本数据流整理

```
GameApp.onCorrectAnswer()
  → GlossService.star(word)
    → 保存到 localStorage['notebook_session']
      → ResultPage.loadNotebookData()
        → 显示 NotebookScrollView (WordItem列表)
```

**关键组件**：
- `GameApp` - 游戏主逻辑，答题判定
- `GlossService` - 词汇服务，生词本管理
- `ResultPage` - 结果展示，生词本显示
- `HUD` - 游戏UI，显示目标词
- `GameBoard` - 字母网格，选择逻辑

---

## 早期开发（2025-09-16 到 09-20 初期）

### 核心玩法实现
- ✅ 字母网格生成与可达路径算法
- ✅ 8方向连线选择机制（后优化为4方向）
- ✅ 目标词提示与答题判定
- ✅ 生词本系统与结果页面
- ✅ 基础UI和音效反馈
- ✅ 本地存储和数据持久化

### 早期架构优化
- **4MB包体限制解决**：从RemoteAssetManager手工方案→采用官方Asset Bundle系统
- **资源加载优化**：实现三级缓存检查和智能预加载
- **UI系统完善**：HUD组件重构、GlossSheet弹窗优化
- **代码质量**：统一错误处理、TypeScript兼容性修复

### 技术债务处理
- 删除废弃RemoteAssetManager.ts
- 修复padStart ES2017+兼容性问题
- 修复Tween API升级（stopAllActions→Tween.stopAllByTarget）
- 微信小游戏libVersion配置修复

---

## V0.1 版本目标进展

### ✅ 已完成
- 纯离线单机版本
- 单个目标词拼写玩法
- 基础UI和音效反馈
- 生词本收集和结果展示
- 微信小游戏发布适配
- 包体优化和资源加载优化

### 📊 关键数据
- 本地包体：<4MB（满足微信限制）
- 远程资源：~2MB（按需加载）
- 网格规模：5×5（25个位置）
- 单词长度：4-7字母
- 预加载覆盖率：100%（所有游戏资源）

### 🎯 V0.2+ 计划
- [ ] 萌宠元素集成
- [ ] 游戏难度动态调整
- [ ] 更丰富的词库（7字母+）
- [ ] 音效系统完善
- [ ] 动画效果优化

---

## 开发规范与工具

### 关键命令
```bash
# Cocos Creator项目
cd src/cocos/

# 启动远程资源服务器
cd tools/remote-resources/
./deploy.sh

# 图片处理工具
python3 tools/image_processing/trim_tiles.py
python3 tools/fix_tiles/fix_tile_images.py
```

### 关键文件位置
- **Cocos项目根**：`src/cocos/`
- **脚本源码**：`src/cocos/assets/scripts/`
- **场景文件**：`src/cocos/assets/scenes/`
- **词库数据**：`src/cocos/assets/resources/words/words_core.json`
- **远程资源目录**：`tools/remote-resources/remote/`

### 项目架构
```
应用层 (app/)
  ├─ LoadingScene - 启动预加载
  ├─ MainMenu - 主菜单
  ├─ GameApp - 游戏主控制器
  └─ ResultPage - 结果展示

核心逻辑 (core/)
  └─ AssetLoader - 统一资源加载

UI层 (ui/)
  ├─ GameBoard - 5×5网格管理
  ├─ LetterTile - 单个瓦片组件
  ├─ HUD - 游戏HUD
  └─ GlossSheet - 词义弹窗

数据层 (data/)
  ├─ GlossService - 词汇服务
  └─ WordBank - 单词银行
```

---

## 最重要的技术洞察

### 1. 纯数学网格定位系统
完全抛弃Layout组件复杂算法，用数学直接计算位置。这种方法：
- 可预测性强
- 跨平台一致
- 维护简单
- 可扩展到任意N×N网格

### 2. 浮点误差的隐蔽性
0.88px的微小误差在25个卡片累积后会产生明显的视觉缝隙。关键是：
- 认识到浮点误差的危害
- 避免不必要的坐标变换（如convertToWorldSpaceAR）
- 使用整数坐标系统

### 3. Asset Bundle的正确使用
微信小游戏包体限制问题不能用手工方案解决，必须：
- 使用官方Asset Bundle远程包功能
- 理解preload（仅下载）vs load（完全加载）的区别
- 使用正确的子资源路径（`imageName/spriteFrame`）

### 4. 平台差异处理
Cocos Creator与微信小游戏存在多个兼容性问题：
- 扩展运算符`[...]` 不可靠，改用`Array.from()`
- 某些ES2017+语法需要降级处理
- 需要额外的空指针和类型检查

