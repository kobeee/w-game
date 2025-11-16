# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 团队约定（必读）
- **省token**: 不啰嗦、不生成无用文档、读代码跳注释、非必要不读 docs/archive
- **不自动提交**: 禁止 git push 或 git commit，需要用户明确同意
- **不追求完美**: 谦虚务实，实践检验，有疑问就问
- **代码有效**: 不添加调试用的无效日志，调试完后主动清除

## 快速开始

### Cocos Creator 工作流
```bash
# 1. 在 Cocos Creator 中打开项目
#    路径: src/cocos/
#    版本: 3.8.7

# 2. 开发调试
#    - 在编辑器中点 Play 按钮预览
#    - 查看 Console 检查日志
#    - 修改脚本后自动热重载

# 3. 构建微信小游戏
#    菜单: 项目 → 构建发布
#    - 选择 "WeChat Mini Game" 平台
#    - 竖屏方向
#    - 如需远程资源，填写资源服务器地址（如 http://localhost:9090）
#    - 点击"构建"，完成后用微信开发者工具打开 src/cocos/build/wechatgame/

# 4. 启动资源服务器（解决4MB包体限制）
cd tools/remote-resources/
./deploy.sh
# 或 Docker:
docker-compose up -d
```

### 常用快捷任务
| 任务 | 位置 | 操作 |
|------|------|------|
| 查看游戏日志 | src/cocos/assets/scripts/ | 编辑器 Console 标签页 |
| 修改场景 | src/cocos/assets/scenes/ | Cocos Creator 场景编辑器 |
| 添加词库 | src/cocos/assets/resources/words/ | 直接编辑 JSON 或上传新文件 |
| 查看开发记录 | CHANGELOG.md | 末尾为最新记录 |
| 调试网格布局 | src/cocos/assets/scripts/ui/GameBoard.ts | 查看纯数学定位法 |

### 关键路径
- **Cocos 项目根**: `src/cocos/`
- **脚本源码**: `src/cocos/assets/scripts/`
- **场景文件**: `src/cocos/assets/scenes/` (Boot → Menu → Game/StackGameScene → Result)
- **远程资源**: `tools/remote-resources/remote/` (Bundle 资源部署目录)
- **词库数据**: `src/cocos/assets/resources/words/words_core.json`
- **Cloudflare Worker**: `tools/cloudflare/worker.js` (RSA 加密、请求转发、边缘缓存)
- **后端服务**: `src/backend/` (FastAPI、Gemini 调用、单词验证)
- **开发日志**: `CHANGELOG.md` (末尾为最新记录)

### 快速找代码
| 功能 | 文件路径 | 说明 |
|------|--------|------|
| 主菜单逻辑 | `src/cocos/.../MainMenu.ts` | 玩法模式选择、配置管理 |
| 小试牛刀 | `src/cocos/.../GameApp.ts` + `GameBoard.ts` | 5×5 网格、拼词验证 |
| 叠叠乐 | `src/cocos/.../StackGameApp.ts` + `StackBoard.ts` | 堆叠消除、关卡递增 |
| 字符匹配 | `src/cocos/.../core/WordMatcher.ts` | 后缀验证算法（ABCD → BCD → CD） |
| 词汇服务 | `src/cocos/.../data/GlossService.ts` | 词库加载、生词本管理 |
| 网络验证 | `src/cocos/.../services/NetworkService.ts` | 后端请求、会话缓存、单飞去重 |
| Worker 加密转发 | `tools/cloudflare/worker.js` | RSA 加密、请求转发、边缘缓存 |
| 后端验证 | `src/backend/word_validator.py` | Gemini 调用、单词验证、防重放检查 |

## 项目概述

这是一个名为"拯救萌宠·猜单词"（w-game）的微信小游戏项目，使用 Cocos Creator 3.8.7 + TypeScript 开发。游戏拥有 **2 种玩法模式**：
- **小试牛刀**（BASIC）：5×5 字母网格单词拼写，60秒时间限制
- **叠叠乐**（STACK）：字母堆叠消除玩法，无限关卡递增难度

V0.1 已完成核心离线单机版，V0.2+ 接入后端单词验证、排行榜等功能。

## 技术架构

### 前端（主要开发重点）
- **引擎**: Cocos Creator 3.x
- **语言**: TypeScript (严格模式，ES2020)
- **构建目标**: 微信小游戏（竖屏）
- **状态机**: Boot → Menu → Play → Result
- **目录结构**:
  - `src/cocos/` - Cocos Creator项目根目录
  - `src/cocos/assets/` - 资源文件（场景、脚本、UI、音效等）
  - `src/cocos/assets/scripts/` - TypeScript脚本文件
    - `app/` - 应用层逻辑
    - `core/` - 核心游戏逻辑
    - `ui/` - UI相关脚本
    - `data/` - 数据管理
  - `assets/ui/` - UI资源（按钮、背景、图标等）

### 后端和边缘计算
- **Cloudflare Worker**（边缘层）：RSA-OAEP 加密、请求转发、边缘缓存
  - 负责客户端请求的 RSA-2048 公钥加密
  - 转发加密请求到海外后端服务
  - 边缘缓存单词验证结果
- **Python FastAPI 后端**（海外部署，当前活跃）：`src/backend/`
  - 负责 RSA 解密、Nonce 防重放、时间戳校验
  - 调用 Gemini API（规避地理位置限制）
  - 单词验证结果缓存与响应标准化
- **词库验证流程**：客户端 → Worker（RSA 加密）→ 后端（Gemini 调用 + 缓存）

## 核心架构设计

### 关键组件与职责

#### 应用层 (`assets/scripts/app/`)
- **LoadingScene.ts**: 启动场景，初始化预加载管理器
- **PreloadManager.ts**: 远程 Bundle 预加载系统（bg/title/tiles/modal），采用 `bundle.load()` 完全加载策略
- **MainMenu.ts**: 主菜单场景，游戏入口，支持两种玩法模式切换（BASIC/STACK）
- **GameApp.ts**: 小试牛刀玩法主逻辑，管理游戏循环、目标词生成、答题判定
- **StackGameApp.ts**: 叠叠乐玩法主逻辑，管理堆叠消除、关卡递增、实时单词验证
- **ResultPage.ts**: 结果页面，显示成绩和生词本

#### 核心逻辑层 (`assets/scripts/core/`)
- **AssetLoader.ts**: 统一资源加载器单例，三级缓存检查（Bundle缓存 → 资源缓存 → 网络加载）

#### UI层 (`assets/scripts/ui/`)
- **GameBoard.ts**: 小试牛刀 5×5 字母网格管理器
  - 使用纯数学定位法，以中心格子(2,2)为原点计算瓦片位置
  - 4 方向连接算法（无斜线，提升可见性）
- **StackBoard.ts**: 叠叠乐堆叠网格管理器，支持卡牌消除和重力下落
- **LetterTile.ts**: 单个字母瓦片组件，多种状态（selectable/highlight/correct/wrong/disabled）
- **SlotQueue.ts**: 选择槽队列，管理已选字母的显示和清空
- **HUD.ts**: 游戏 HUD，显示目标词、倒计时、分数、难度等
- **LoadingUI.ts**: 加载页面 UI，显示资源加载进度
- **GlossSheet.ts**: 词义弹窗（Bottom Sheet），支持自动/手动展示、收藏功能

#### 数据层 (`assets/scripts/data/`)
- **GlossService.ts**: 词汇服务
  - 词库加载和查询（支持内嵌/外部 JSON）
  - 词义解释和归一化
  - 生词本管理（localStorage 持久化）
- **WordBank.ts**: 单词银行，按长度分桶存储，支持目标词随机选择
- **GameMode.ts**: 游戏模式枚举和配置（BASIC/STACK）
- **StackTypes.ts**: 叠叠乐数据结构定义（Card、WordMatch、Level 等）

#### 工具层 (`assets/scripts/util/`)
- **AudioMgr.ts**: 音效管理器

### 关键数据流

#### 游戏主循环
```
GameApp.startGame()
  → 生成目标词 (4-7字母)
  → GameBoard.spawnGrid(targetWord)
    → 生成可达路径算法
    → 纯数学计算瓦片位置（中心原点坐标系）
  → 玩家点击字母
  → GameBoard.onTileSelect() → 路径验证
  → GameApp.submit() → 答题判定
    → 正确: onCorrectAnswer() → 显示词义卡 → 保存生词本
    → 错误: onWrongAnswer() → 清空选择
  → 时间到/完成 → ResultPage
```

#### 资源加载流程（解决4MB包体限制）
```
LoadingScene.onLoad()
  → PreloadManager.preloadAllBundles()
    → bundle.load() 完全加载（非preload）
    → 资源立即可用，零延迟
  → 场景切换
    → AssetLoader.loadSpriteFrame()
      → 检查Bundle缓存 (assetManager.getBundle)
      → 检查资源缓存 (bundle.get)
      → 立即返回或动态加载
```

#### 生词本数据流
```
GameApp.onCorrectAnswer()
  → GlossService.star(word)
    → sessionNotebook数组去重
    → JSON.stringify保存到localStorage
  → ResultPage.loadNotebookData()
    → 读取localStorage['notebook_session']
    → 类型安全过滤（防止Set对象污染）
    → 动态创建WordItem预制体列表
```

### 关键技术突破

#### 1. 5×5网格纯数学定位法
- **问题**: Layout Grid组件对奇数网格存在算法缺陷
- **解决**: 以中心格子为原点，纯数学计算每个位置
  ```typescript
  const step = tileSize + spacing; // 95px
  const offsetX = (col - centerCol) * step;
  const offsetY = (centerRow - row) * step;
  tileNode.setPosition(offsetX, offsetY, 0);
  ```

#### 2. 远程Bundle完全加载机制
- **问题**: `bundle.preload()`仅下载，后续`bundle.load()`仍需反序列化时间
- **解决**: 预加载阶段直接使用`bundle.load()`完全加载，使用阶段`bundle.get()`立即获取（<1ms）

#### 3. 微信小游戏平台兼容性
- **Set对象序列化问题**: 使用`Array.from(set)`替代扩展运算符`[...set]`
- **事件监听器防护**: 所有`onDestroy()`添加空指针和有效性检查
- **TypeScript降级**: 避免ES2017+语法（如`padStart`）

#### 4. 叠叠乐网格布局与遮挡判定（**重要：后续布局 JSON 必看**）
- **整体设计目标**  
  - 玩法参考“羊了个羊”：堆叠的字母牌在视觉上可以 1/4、1/2 或完全遮挡；**只要有任意一块区域被上层牌覆盖，下层牌就必须不可点击**。  
  - 布局使用固定的 7×7 网格（`gridRow/gridCol`），在此基础上允许 ±45px 半格偏移构成丰富形状。
- **坐标与尺寸约定**  
  - 逻辑网格：`gridSize=7×7`，中心在 (3,3)，使用 `CoordinateMapper.gridToWorld()` 统一从网格坐标 + offset 映射到世界坐标。  
  - 卡片尺寸：逻辑上视为 90×90（`GRID_UNIT=90`），但**实际遮挡判定必须使用 `LetterTile` 的 `UITransform.contentSize`**，避免与美术尺寸不一致。  
  - 允许偏移：`offset.x/offset.y ∈ {-45, 0, 45}`，即 1/2 卡片偏移，保证所有中心点落在 45 像素网格上。  
  - 层级：`layer` 为非负整数，`0` 为最底层；数值越大越上层。
- **1/4 网格 + 子网格栈模型（BlockDetector 核心思想）**  
  - 将整个世界坐标平面划分为 **45×45 的细网格**（CELL=45），这相当于“卡片的四分之一”；一张 90×90 卡片刚好覆盖 2×2=4 个子网格。  
  - 对于每张未移除的卡片，计算其覆盖的 4 个子网格 `(x,y)`，并把这张牌加入 `cellMap["x,y"]` 的列表中。  
  - 在每个子网格内部，按 `layer` 升序排序：  
    - 视这一列牌为一根“**栈**”：底层在栈底，层级最大的在栈顶。  
    - 该子格内**只有栈顶那张牌在这个 1/4 区域是可见/可点击的**；栈中所有更低层的牌在这个子格上都视为被遮挡。  
  - 全局遮挡规则：  
    - 一张牌只要在它覆盖的 4 个子网格中**有任意一个子格不是栈顶**，就被标记为 `blocked=true`；  
    - 只有当 4 个子格里它都是栈顶（且自身未 `removed`）时，才会被视为完全不被遮挡，可以点击。  
  - 实现位置：`src/cocos/assets/scripts/core/BlockDetector.ts` 的 `getOccupiedCells()` + `updateAllBlockStatus()`。
- **布局 JSON 编写要点（以 `sheep_style_complex.json` 为模板）**  
  - 统一结构：
    ```json
    {
      "layoutName": "sheep_style_complex",
      "gridSize": { "rows": 7, "cols": 7 },
      "cards": [
        { "layer": 0, "gridRow": 0, "gridCol": 0, "offset": { "x": 0, "y": 0 } },
        ...
      ]
    }
    ```  
  - 所有 `gridRow/gridCol` 必须在 `[0,6]` 范围内；`layer >= 0` 且按需要堆叠即可（不要求连续）。  
  - 偏移必须是 `{x,y} ∈ {-45,0,45}`，**禁止**使用 22.5 等非整数半格，以免破坏 45 网格对齐。  
  - 相同 `(gridRow,gridCol)` 允许多张牌（多层堆叠），也允许通过 offset 在附近半格位置形成“中心簇”和“斜线遮挡”。  
  - 推荐：新布局尽量以 `sheep_style_complex.json` 为参考，先画出 7×7 网格草图，再按层从底到顶堆叠，确保视觉上合理且每一步都有明显“栈顶牌”。
- **调试与验证流程**  
  - 使用 `scripts/debug_block_detector.js` 在 Node 环境离线验证布局：  
    - 该脚本会读取指定布局 JSON（默认 `sheep_style_complex.json`），通过与 `BlockDetector` 相同的算法恢复所有卡片，打印每张牌的：  
      - 逻辑 `rect`、占用的 4 个子网格坐标、以及 `blocked`（是否被遮挡）。  
    - 可传入目标 `gridRow/gridCol`，只查看某一竖/某一堆上的所有层级，验证“上层移除前后，下层牌的 blocked 状态是否符合预期”。  
  - 理想调试策略：  
    1. 在脚本中固定一个极端场景（如 X/U/G 连续 3 层 + 侧面再挡 G 半块），先跑通“理论上绝不会提前解锁”的行为。  
    2. 将同样结构写进布局 JSON，在游戏里用固定 seed 打出来观察，若有偏差，优先检查：  
       - 布局中的 `layer/gridRow/gridCol/offset` 是否与脚本一致；  
       - `StackBoard.updateCardRects()` 是否正确使用真实 `UITransform.contentSize`。  
  - 一旦新布局通过脚本验证，再在 Cocos 中预览实际效果，减少“肉眼试错”的轮数。

> 小结：**今后在改布局或写新布局 JSON 时，要把“1/4 网格 + 子格栈顶可见”当成唯一权威规则。**  
> 只要布局保证所有偏移是 45 的倍数，并且视觉上“谁压在谁上面”在网格上也能解释得通，BlockDetector 的遮挡结果就会和肉眼看到的完全一致。

## 开发流程

### 构建和运行
```bash
# 在 Cocos Creator 中打开项目
# 项目路径: src/cocos/

# 构建为微信小游戏
# 使用微信开发者工具预览
```

### 游戏配置参数（V0.1固定值）
- **网格大小**: 5×5（优化后）
- **连接方式**: 仅水平和垂直连接（移除斜线连接）
- **游戏时长**: 60秒
- **目标词长度**: 4-7个字母（扩展后）
- **缓冲槽**: 3格，溢出扣5秒
- **词库**: 支持3-6字母单词，将扩展至7字母

### 核心游戏机制（玩法对比）

#### 小试牛刀（BASIC）
1. **字母网格**: 5×5 叠层显示，只有无遮挡字母可点击
2. **拼词规则**: 必须按正确顺序点击字母，4 方向连接（上下左右）
3. **时间限制**: 60 秒游戏时长
4. **错误处理**: 误点字母进入缓冲槽，满 3 格扣 5 秒
5. **提示系统**: 顶部常驻显示下一个应选字母

#### 叠叠乐（STACK）
1. **堆叠消除**: 下落的字母卡与目标单词匹配则消除
2. **关卡递增**: 难度逐关递增，关卡数量无限
3. **后缀匹配**: 支持单词后缀验证（如 ABCD 匹配 BCD、CD）
4. **实时网络验证**: 可选接入后端 Gemini 词库验证（V0.2+）
5. **堆积限制**: 堆积过高则游戏结束

## 版本规划

### V0.1（✅ 已完成）
- ✅ 两种玩法模式（小试牛刀 + 叠叠乐）
- ✅ 纯离线单机版本
- ✅ 基础 UI 和音效
- ✅ 生词本管理（localStorage 持久化）

### V0.2（当前进行中）
- ✅ Cloudflare Worker Gemini 代理（密钥注入、边缘缓存）
- ✅ 客户端网络服务（会话缓存、单飞去重、防抖）
- ✅ 后缀验证算法（ABCD → BCD → CD）
- 性能优化迭代：边缘缓存命中率、网络延迟优化

### V0.3+
- 每日关卡种子、排行榜系统
- 萌宠角色系统
- 完整后端服务

## 测试和验证

### 内测标准
- 首局完成率 ≥ 65%
- 5个固定种子中至少4个可通关
- 平均帧率 ≥ 60fps（低端机≥50fps）
- 无"无牌可点"的死局

### 固定测试种子
使用 `20250911A/B/C/D/E` 作为回归测试种子

## 词库和数据

### 词库格式
```json
{
  "term": "单词",
  "cn": "中文释义", 
  "confuse": ["混淆字母列表"]
}
```

### 易混淆字母对
- `i/l`, `b/d`, `p/q`, `u/v`, `m/n`, `g/q`

## UI设计原则

- **色弱友好**: 正确/错误不仅用颜色，还用描边/形状区分
- **触控优化**: 按钮最小44×44px
- **关键信息**: 目标词、下一字母提示、倒计时、缓冲槽状态

## 埋点数据（V0.1本地记录）
- `start_time`, `end_time` - 游戏时长
- `win` - 通关状态 (0/1)
- `misclicks` - 误点数量和位置
- `seed` - 关卡种子

## 开发优先级

1. **核心玩法循环** - 字母生成、点击判定、拼词验证
2. **可见性系统** - 遮挡判定、高亮反馈
3. **缓冲槽机制** - 错误容错、时间惩罚
4. **UI/UX** - 清晰的状态提示和反馈
5. **性能优化** - 保证流畅的点击响应

## 当前重点和约束

### V0.2 开发重点（进行中）
- Worker 边缘缓存命中率优化
- 客户端网络延迟优化（防抖调参、缓存策略）
- 本地词库 + Gemini 混合验证稳定性
- 移动网络环境下的超时和重试优化

### 关键约束
- **不依赖外部库**: 仅用 Cocos Creator 原生 API
- **微信小游戏兼容**: 避免 ES2017+ 语法（如 `padStart`）
- **包体积控制**: 本地包体 < 4MB（远程 Bundle 分离）
- **零密钥暴露**: Gemini API Key 仅在后端存储，客户端无感知
- **加密传输**: 客户端 → Worker 走 RSA-OAEP 加密，规避地理限制

---

## 开发规范与约定

### 核心开发原则
> **详细规则文件**: `.cursor/rules/base/core.mdc`

#### 研发首则
- **研发流程**：接需求→写PRD→需求分析→系统设计和分析→测试设计和分析→研发→测试
- **先设计后开发**：接到每个需求，不要着急写代码，按照**研发流程**一步步推进
- 设计应该包含测试case
- 实际开发过程中，应该先将测试代码写好，因为测试就是验证既定的输入可以得到预期的结果

#### 通用开发原则
- **可测试性**：编写可测试的代码，组件应保持单一职责
- **DRY 原则**：避免重复代码，提取共用逻辑到单独的函数或类
- **代码简洁**：保持代码简洁明了，遵循 KISS 原则（保持简单直接）
- **命名规范**：使用描述性的变量、函数和类名，反映其用途和含义
- **注释文档**：为复杂逻辑添加注释
- **风格一致**：遵循项目或语言的官方风格指南和代码约定
- **利用生态**：优先使用成熟的库和工具，避免不必要的自定义实现
- **架构设计**：考虑代码的可维护性、可扩展性和性能需求
- **版本控制**：编写有意义的提交信息，保持逻辑相关的更改在同一提交中
- **异常处理**：正确处理边缘情况和错误，提供有用的错误信息
- **代码行数**：如果单个文件的代码函数过长了，就应该重构拆分，避免文件代码行数过长，导致难以理解

### TypeScript 开发规范
> **详细规则文件**: `.cursor/rules/languages/typescript.mdc`

#### 类型系统
- 对于对象定义，优先使用接口而非类型
- 对于联合类型、交叉类型和映射类型，使用 type
- 避免使用 `any`，对于未知类型优先使用 `unknown`
- 使用严格的 TypeScript 配置
- 充分利用 TypeScript 的内置工具类型
- 使用泛型实现可复用的类型模式

#### 命名约定
- 类型名称和接口使用 PascalCase
- 变量和函数使用 camelCase
- 常量使用 UPPER_CASE
- 使用带有辅助动词的描述性名称（例如，isLoading, hasError）

#### 代码组织
- 类型定义应靠近使用它们的地方
- 共享的类型和接口从专用类型文件导出
- 使用桶导出（index.ts）组织导出
- 将共享类型放在 `types` 目录中

#### 函数
- 为公共函数使用显式返回类型
- 回调和方法使用箭头函数
- 实现带有自定义错误类型的适当错误处理
- 复杂类型场景使用函数重载
- 优先使用 async/await 而非 Promises

#### 最佳实践
- 在 tsconfig.json 中启用严格模式
- 不可变属性使用 readonly
- 利用可辨识联合类型提高类型安全性
- 使用类型守卫进行运行时类型检查
- 实现适当的空值检查
- 避免不必要的类型断言

### Python 开发规范（用于后端开发）
> **详细规则文件**: `.cursor/rules/languages/python.mdc`

- 遵循 PEP 8 风格指南和命名约定
- 使用类型注解增强代码可读性和类型安全性
- 使用虚拟环境管理依赖：优先使用 `venv` 或 `poetry` 进行环境隔离
- 使用上下文管理器处理资源（如文件操作）
- 优先使用列表推导式、生成器表达式和字典推导式
- 使用 `pytest` 进行测试，保持高测试覆盖率
- 使用文档字符串（docstrings）记录函数、类和模块
- 遵循面向对象设计原则（SOLID）
- 使用异常处理保证程序健壮性
- 使用 `dataclasses` 或 `pydantic` 模型表示数据

### Cocos Creator 开发规范（主要技术栈）
> **详细规则文件**: `.cursor/rules/frameworks/cocos_creator.md`

#### 工程与场景规范
- **UI 节点必须在 Canvas 下**：Canvas 承担 2D 渲染与屏幕适配；可多 Canvas，但勿嵌套
- **多分辨率适配**：设置 Design Resolution，按产品选择 Fit Height / Fit Width，并用 Widget 对齐
- **场景切换与常驻节点**：`director.loadScene` 切场景；跨场景共享用常驻节点

#### 资源系统规范
- **统一用 Asset Manager**（取代旧 loader）
- **resources 目录动态加载规则**：
  - 仅"脚本会直接加载"的资源放 `assets/resources/**`
  - `resources.load('相对路径', 类型)` 时不带扩展名，且相对 `resources/`
  - 加载 SpriteFrame 要指向 `image/spriteFrame` 子资源路径
- **资源释放与引用计数**：启用场景自动释放或在合适时机手动 `addRef/decRef`
- **JSON 配置（JsonAsset）**：`.json` 导入为 JsonAsset；可 `resources.load('folder/name', JsonAsset)`

#### 输入与事件规范
- **全局输入**：`input.on(Input.EventType.XXX, cb)` 监听全局；`systemEvent` 已逐步废弃
- **节点事件（UI 命中）**：UI 节点需有 UITransform 才能命中触摸；事件走捕获→目标→冒泡

#### 微信小游戏发布规范
- 在构建发布选择 WeChat Mini Game，设置起始场景、方向（Portrait）、MD5/远程包策略
- 构建后用微信开发者工具打开构建目录

#### 实战避坑清单
1. **`resources.load` 找不到**：资源必须在 `assets/resources/**`；路径相对 `resources/` 且不带扩展名
2. **图片加载后不显示**：记得拿 `SpriteFrame` 子资源，或 `Texture2D`→组装 `SpriteFrame`
3. **切场景内存不降**：启用自动释放或手动 `decRef()`；不要滥用 `resources/`
4. **UI 触摸不响应/穿透**：确保在 Canvas 下且挂 UITransform；检查 Button/BlockInputEvents 拦截
5. **不同机型显示参差**：正确设置设计分辨率，勾选 Fit Height/Width，关键 UI 用 Widget 对齐
6. **小游戏构建后空白**：检查 Start Scene、方向、MD5/远程包；用开发者工具打开构建目录

#### 项目内建议规范（v0.1）
- `assets/resources/words/` 仅放运行时会 `resources.load` 的 JSON；其它资源按模块分类
- 所有异步加载封装为 Promise/await；集中处理错误与超时
- 场景切换时释放不再使用的资源：`decRef()` + 释放检查
- UI 动效尽量不要直接改有 `Widget(AlignMode.ALWAYS)` 的节点
- 统一使用枚举事件常量（`Node.EventType.*` / `Input.EventType.*`）
- 首场景轻量；必要时用 Asset Bundle 拆重资源并 `preload`

### FastAPI 开发规范
> **详细规则文件**: `.cursor/rules/frameworks/fastapi.mdc`

- 为所有函数参数和返回值使用类型提示
- 使用 Pydantic 模型进行请求和响应验证
- 在路径操作装饰器中使用适当的 HTTP 方法（@app.get、@app.post 等）
- 使用依赖注入实现共享逻辑，如数据库连接和身份验证
- 使用后台任务（background tasks）进行非阻塞操作
- 使用适当的状态码进行响应（201 表示创建，404 表示未找到等）
- 使用 APIRouter 按功能或资源组织路由
- 适当使用路径参数、查询参数和请求体

### 项目结构规范
> **详细规则文件**: `.cursor/rules/base/project-structure.mdc` 和 `.cursor/rules/base/general.mdc`

- **分层组织**：按功能或领域划分目录，遵循"关注点分离"原则
- **命名一致**：使用一致且描述性的目录和文件命名，反映其用途和内容
- **模块化**：相关功能放在同一模块，减少跨模块依赖
- **适当嵌套**：避免过深的目录嵌套，一般不超过3-4层
- **资源分类**：区分代码、资源、配置和测试文件
- **依赖管理**：集中管理依赖，避免多处声明
- **约定优先**：遵循语言或框架的标准项目结构约定
- **测试代码路径约束**：所有以`test_`或`*_test`命名的测试文件，必须存放在各自模块的`tests/`目录下，禁止出现在`app/`、`scripts/`等源码目录

### 文档规范
> **详细规则文件**: `.cursor/rules/base/document.mdc`

#### 通用要求
- 所有文档使用Markdown格式
- 使用简洁、清晰的语言
- 文档内容应保持最新
- 避免拼写和语法错误
- 使用中文作为主要语言

#### 开发记录规范
- 使用 `CHANGELOG.md` 记录每次开发的内容，包括做了什么事情、加了什么功能、修复了什么问题、改了哪些文件和代码等等
- **每次都以换行插入到文件头部的方式，即最头部的为最新的更新记录**
- 结构脉络清晰，可以区分模块功能，切勿像记流水账一样，要完整记录上下文背景和思考过程

### 环境变量管理
> **详细规则文件**: `.cursor/rules/base/env-management.mdc`

#### 核心原则
- **`env.example`**: 版本控制中包含的**模板文件**。所有新的环境变量都必须先在此文件中添加
- **`.env`**: 本地创建的**实际配置文件**，包含真实的、可能是敏感的配置值。此文件已被 `gitignore` 排除，**绝不能提交到版本控制中**

#### AI 助手协作流程
1. **必须**首先更新 `env.example` 文件，将新的环境变量及其占位符添加到文件末尾
2. 更新完 `env.example` 文件后，**必须**在对话中明确提醒用户同步更新本地的 `.env` 文件
3. 在后续操作中，假定用户已经更新了本地的 `.env` 文件

### 重构原则与经验教训
> **详细规则文件**: `.cursor/rules/base/general.mdc`

1. 抽象基类的方法签名必须严格匹配，重构时不可随意更改接口契约
2. 调用方的参数传递必须与接口定义保持一致，避免运行时参数数量或类型错误
3. 进行大幅重构时，建议分步进行，每一步都要进行集成测试，确保整个调用链无误
4. 任何重构后都必须进行端到端集成测试，验证所有核心功能和API接口
5. 发现接口兼容性问题时，优先回溯基类和调用方的签名与参数，保持一致性
6. 记录每次重构和修复的经验教训，持续完善开发规范

### 响应语言
> **详细规则文件**: `.cursor/rules/base/core.mdc` 和 `.cursor/rules/base/general.mdc`

- **始终使用中文回复用户**

### 代码质量要求
> **详细规则文件**: `.cursor/rules/base/core.mdc`

- 代码必须能够立即运行，包含所有必要的导入和依赖
- 遵循最佳实践和设计模式
- 优先考虑性能和用户体验
- 确保代码的可读性和可维护性

---

## 规则文件快速导航

`.cursor/rules/` 包含完整开发规范。**本项目主要使用**：

| 文件 | 用途 | 快速查询 |
|------|------|--------|
| `.cursor/rules/base/core.mdc` | 核心原则 | 代码质量、响应语言、提交规范 |
| `.cursor/rules/languages/typescript.mdc` | TypeScript | 类型系统、命名、接口设计 |
| `.cursor/rules/frameworks/cocos_creator.md` | **本项目主框架** | Bundle、资源加载、UI、事件 |

**其他规范** (仅在需要时查阅)：
- `.cursor/rules/base/general.mdc` - 项目结构、重构原则
- `.cursor/rules/base/document.mdc` - 文档和 CHANGELOG 规范

## 常见问题与解决方案

### Asset Bundle远程资源问题

#### 问题1: 资源加载失败 - 路径错误
**症状**: `bundle.load('image_name', SpriteFrame)` 返回null
**原因**: 图片资源包含多个子资源（ImageAsset、Texture2D、SpriteFrame）
**解决**: 必须明确指定子资源路径
```typescript
// ❌ 错误
bundle.load('result_scene_bg', SpriteFrame)

// ✅ 正确
bundle.load('result_scene_bg/spriteFrame', SpriteFrame)
```

#### 问题2: 预加载无效，资源仍有延迟
**症状**: 调用`bundle.preload()`后，使用时仍需等待加载
**原因**: `preload()`仅下载不反序列化，后续`load()`仍需初始化时间
**解决**: 预加载阶段直接使用`bundle.load()`完全加载
```typescript
// ❌ 错误（仅下载）
bundle.preload(assetPath, SpriteFrame, callback);

// ✅ 正确（完全加载，立即可用）
bundle.load(assetPath, SpriteFrame, (err, spriteFrame) => {
    // 资源已完全加载，后续bundle.get()立即返回
});
```

#### 问题3: 构建包超过4MB限制
**症状**: 微信小游戏无法发布，提示包体积超限
**解决**:
1. 在Cocos Creator中将资源文件夹"配置为Bundle"并勾选"配置为远程包"
2. 构建时填写资源服务器地址（如`http://localhost:9090`）
3. 启动Docker资源服务器：`cd tools/remote-resources/ && ./deploy.sh`

### 网格布局问题

#### 问题: 5×5网格显示偏移，不居中
**症状**: 奇数网格（5×5）布局右偏或位置异常
**原因**: Layout Grid组件对奇数网格的内部计算存在偏差
**解决**: 使用纯数学定位法，以中心格子为原点
```typescript
// 移除Layout组件
const existingLayout = this.container.getComponent(Layout);
if (existingLayout) {
    existingLayout.destroy();
}

// 纯数学计算位置
const tileSize = 90;
const spacing = 5;
const step = tileSize + spacing;
const centerRow = Math.floor(this.rows / 2); // 2
const centerCol = Math.floor(this.cols / 2); // 2

const offsetX = (col - centerCol) * step;
const offsetY = (centerRow - row) * step;
tileNode.setPosition(offsetX, offsetY, 0);
```

### 微信小游戏平台兼容性

#### 问题1: 扩展运算符在微信环境失效
**症状**: `[...new Set(array)]` 在Cocos预览正常，微信小游戏中异常
**原因**: 微信小游戏环境对ES6扩展运算符支持存在差异
**解决**: 使用`Array.from()`替代
```typescript
// ❌ 微信小游戏不兼容
this.array = [...new Set(filteredArray)];

// ✅ 跨平台兼容
const uniqueSet = new Set(filteredArray);
this.array = Array.from(uniqueSet);
```

#### 问题2: localStorage数据类型污染
**症状**: `JSON.parse()`后数据包含非字符串元素，调用`.toUpperCase()`报错
**原因**: Set对象被错误序列化，或包含undefined/null
**解决**: 添加类型安全过滤
```typescript
const parsed = JSON.parse(stored);
if (Array.isArray(parsed)) {
    this.sessionNotebook = parsed.filter(item =>
        typeof item === 'string' && item.trim() !== ''
    );
}
```

#### 问题3: 组件销毁时空指针错误
**症状**: `Cannot read properties of null (reading 'off')`
**原因**: `onDestroy()`时组件属性可能已被销毁为null
**解决**: 添加空指针检查
```typescript
protected onDestroy(): void {
    if (this.button && this.button.node) {
        this.button.node.off(Button.EventType.CLICK, this.onClick, this);
    }
}
```

### 开发调试技巧

#### 查看Bundle缓存状态
```typescript
// 检查Bundle是否已缓存
const bundle = assetManager.getBundle('bundleName');
console.log('Bundle已缓存:', !!bundle);

// 检查资源是否已加载
const asset = bundle?.get('assetPath/spriteFrame', SpriteFrame);
console.log('资源已加载:', !!asset);
```

#### 调试生词本数据
```typescript
// 查看localStorage原始数据
const raw = sys.localStorage.getItem('notebook_session');
console.log('localStorage原始数据:', raw);

// 验证JSON解析结果
const parsed = JSON.parse(raw);
console.log('解析后的数据:', parsed, '是数组:', Array.isArray(parsed));
```

#### 测试远程资源服务器
```bash
# 检查服务器是否运行
curl http://localhost:9090/remote/bg/

# 查看Bundle文件列表
ls tools/remote-resources/remote/bg/

# 查看Docker容器日志
docker-compose -f tools/remote-resources/docker-compose.yml logs
```

## Git 工作流

### 提交规范
- **禁止自动提交**: 所有 commit/push 需要用户明确同意
- **提交信息格式**:
  ```
  类型: 描述

  - 详细内容 1
  - 详细内容 2

  修改文件:
  - src/cocos/assets/scripts/app/GameApp.ts
  - src/cocos/assets/scripts/ui/GameBoard.ts
  ```
- **提交前检查**:
  - 无调试日志
  - 所有修改都被提及
  - CHANGELOG.md 已更新（插入到文件头部）

### 当前分支
- 当前分支: `v1`
- 合并目标: `main`

---

## 编码任务模板

你是我的游戏项目协作程序员。环境：Cocos Creator 3.8.7（TypeScript, 2D, 微信小游戏）。
从现在起，你对每个任务必须做到：

1. **完整代码** - 在**指定路径**新建/修改文件，**给出完整代码**（从 import 到文件结尾）
2. **绑定说明** - 解释如何在**场景层级**上绑定组件/节点（序列化属性 @property）
3. **无外部依赖** - 不引入第三方库，只用 Creator 自带 API
4. **资源路径** - 基于 assets/resources/，用 resources.load("folder/name", JsonAsset)
5. **严格 TS** - 严格 TypeScript 模式，export 组件类
6. **自测步骤** - 输出后附自测步骤（编辑器里点几下看日志/UI行为）
