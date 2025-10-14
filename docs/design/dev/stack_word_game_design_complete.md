# 字母堆叠消除玩法 - 完整设计方案

> **文档版本**: v3.0 (合并版)
> **创建日期**: 2025-10-12
> **最后更新**: 2025-10-12
> **设计目标**: 为w-game项目新增一种基于"羊了个羊"式堆叠机制 + 每日挑战排行榜的单词拼写消除玩法
> **文档说明**: 本文档整合了概念设计、技术实现、测试规范的完整方案

---

## 📚 目录

### 第一部分：概念设计
1. [设计概述](#1-设计概述)
2. [核心玩法机制](#2-核心玩法机制)
3. [关键设计决策](#3-关键设计决策)
4. [每日挑战系统](#4-每日挑战系统)
5. [游戏规则详细说明](#5-游戏规则详细说明)
6. [评价标准与排行榜](#6-评价标准与排行榜)
7. [UI/UX设计](#7-uiux设计)

### 第二部分：技术实现
8. [技术架构概览](#8-技术架构概览)
9. [数据结构与接口定义](#9-数据结构与接口定义)
10. [遮挡判定算法详解](#10-遮挡判定算法详解)
11. [单词检测性能优化](#11-单词检测性能优化)
12. [牌堆生成与公平性保证](#12-牌堆生成与公平性保证)
13. [动态难度调节系统](#13-动态难度调节系统)
14. [布局模板系统](#14-布局模板系统)

### 第三部分：系统设计
15. [词库系统设计](#15-词库系统设计)
16. [新手引导系统](#16-新手引导系统)
17. [防作弊机制](#17-防作弊机制)
18. [性能基准与优化](#18-性能基准与优化)
19. [资源规格清单](#19-资源规格清单)

### 第四部分：开发落地
20. [难度平衡与调优](#20-难度平衡与调优)
21. [测试用例清单](#21-测试用例清单)
22. [实施路线图](#22-实施路线图)

---

# 第一部分：概念设计

## 1. 设计概述

### 1.1 玩法命名

- **现有玩法重命名**: "小试牛刀"（Classic Mode）
- **新玩法名称**: "字母叠叠乐"（Stack Word Mode）

### 1.2 核心创新点

| 维度 | 现有玩法（小试牛刀） | 新玩法（字母叠叠乐） |
|------|---------------------|---------------------|
| **核心机制** | 5×5网格按顺序点击拼词 | 堆叠牌堆 + 牌槽消除 |
| **难度来源** | 必须按正确顺序点击 | 遮挡关系 + 牌槽容量限制 |
| **策略深度** | 路径规划 | 字母收集顺序 + 消除时机选择 |
| **容错性** | 低（必须精确点击） | 高（可先收集字母再组词） |
| **单词长度限制** | 4-7字母 | 3-15字母（无上限） |
| **时间压力** | 60秒倒计时 | 牌槽容量压力（可选时间限制） |

### 1.3 设计目标

1. **降低上手门槛**: 相比"小试牛刀"的严格顺序要求，新玩法允许玩家自由收集字母
2. **增加策略深度**: 玩家需要规划"先点哪个字母"、"何时消除短单词"
3. **延长游戏时长**: 不限制单词长度，鼓励玩家拼出更长的单词
4. **提升视觉爽感**: 堆叠布局 + 消除动画 + 中文释义展示
5. **社交竞争性**: 每日挑战 + 排行榜，与微信好友PK清除率
6. **高留存率**: 每天0点刷新关卡和排行榜，激励玩家每日回归

### 1.4 核心亮点：每日挑战 + 清除率排行榜

本玩法的最大创新是**不强制要求100%清空牌堆**，而是：

- 📊 **记录清除率**: 玩家每局记录"消除字母数/初始字母数"的百分比
- 🏆 **每日最佳**: 每天可以玩无限次，只保存当天最高清除率
- 👥 **好友排行榜**: 显示微信好友中清除率前10名（需要用户授权）
- 🔄 **每日刷新**: 每天0点生成新关卡，排行榜清零，重新竞争

**优势**：
- ✅ 彻底解决"牌堆无法完全清空"的技术难题
- ✅ 玩家可以"尽力而为"，不会因为剩余几张牌而沮丧
- ✅ 无限重玩机制增加用户粘性（"再试一次能不能更高？"）
- ✅ 社交竞争激励每日登录（"好友A今天95%了，我要超越他！"）

---

## 2. 核心玩法机制

### 2.1 游戏流程概览

```
[游戏开始]
    ↓
[生成堆叠牌堆]
 - 3-5层不规则堆叠
 - 字母来自预选目标单词 + 干扰字母
    ↓
[玩家点击可点击的字母牌]
 - 只有"无遮挡"的牌可以点击
 - 点击后牌掉落到下方牌槽
    ↓
[牌槽实时检测单词]
 - 每次字母落入牌槽后立即检测
 - 检测所有≥3字母的连续子串
    ↓
[检测到有效单词]
 - 匹配的字母开始闪烁（3秒倒计时）
 - 玩家选择：
   * 点击"✓消除" → 立即消除
   * 点击"⏭继续拼" → 继续添加字母
   * 不操作 → 3秒后自动消除
    ↓
[消除动画]
 - 字母闪烁3-5次（0.5秒）
 - 缩放淡出（0.3秒）
 - 显示中文释义浮层（1秒）
 - 更新分数和牌槽容量
    ↓
[胜利/失败判定]
 - 胜利: 消除所有目标单词 OR 无法再组成单词
 - 失败: 牌槽满载（容量上限）
    ↓
[结果页面]
 - 显示消除单词数、总分、生词本
```

### 2.2 堆叠机制

#### 牌堆布局特点

1. **多层级结构**: 3-5层不规则堆叠（参考羊了个羊）
2. **遮挡关系**: 上层牌压住下层牌，只有无遮挡的牌可点击
3. **视觉深度**: 下层牌偏暗/缩小，突出可点击牌
4. **布局多样性**: 5种预设模板（螺旋、金字塔、环形、随机堆、波浪）

#### 遮挡判定规则

```
规则: 如果上层牌的边界框与下层牌重叠超过50% → 下层牌被遮挡

示例:
层级2: [A]
        ↓
层级1: [B] [C] [D]

如果A的位置覆盖B和C → B和C不可点击，D可点击
```

### 2.3 牌槽机制

#### 牌槽容量（动态扩容）

- **初始容量**: 7格
- **扩容条件**（满足任一即可）:
  - 每消除3个单词 → +1格
  - 消除7+字母的长单词 → 立即+1格（额外奖励）
  - **救济机制**: 牌槽占用率≥90%且冷却期满 → +1格
- **最大容量**: 15格

#### 扩容示例

```
初始状态: 容量7格，已消除2个单词

情况1: 消除第3个单词 CAT (3字母)
  → 触发"每消除3个单词"规则
  → 容量: 7 → 8格

情况2: 消除单词 BEAUTIFUL (9字母)
  → 触发"长单词额外奖励"规则
  → 容量: 7 → 8格
  → 同时计入单词数: 2 → 3
  → 再次触发"每消除3个单词"规则
  → 最终容量: 9格

情况3: 牌槽满载触发救济
  → 牌槽: [A, B, C, D, E, F, G] (7/7, 100%满载)
  → 消除 CAT → 剩余 [D, E, F, G] (4/7, 57%)
  → 触发救济检查: 消除前占用率100% ≥ 90% ✓
  → 扩容: 7 → 8格（防止螺旋死亡）
```

---

## 3. 关键设计决策

### 3.1 实时检测与闪烁消除机制

#### 设计问题

**矛盾点**: 如果检测到 `SUN` 立即消除，玩家将永远无法拼出 `SUNNY`

#### 解决方案：闪烁缓冲机制

```
状态机:
[字母落入牌槽]
    ↓
[检测是否有有效单词]
    ↓
[有效单词] → [进入闪烁状态]
    ↓
[锁定牌槽] (新字母悬浮等待)
    ↓
[玩家决策 - 3秒倒计时]
    ├─ 点击"✓消除"按钮 → [立即消除] → [解锁牌槽]
    ├─ 点击"⏭继续拼"按钮 → [取消闪烁] → [解锁牌槽] → [字母落入]
    └─ 3秒到期未操作 → [自动消除] → [解锁牌槽]
```

#### 详细流程示例

```
时间轴: 玩家想拼 SUNNY

t=0s: 牌槽 [S]
t=1s: 牌槽 [S, U]
t=2s: 牌槽 [S, U, N]
      → 检测到 SUN (有效单词)
      → SUN 开始闪烁，显示"✓消除"和"⏭继续拼"按钮
      → 牌槽锁定

t=3s: 玩家点击牌堆中的字母 N
      → 字母 N 悬浮在牌槽上方（未进入牌槽）
      → SUN 仍在闪烁（倒计时继续）

t=4s: 玩家点击"⏭继续拼"按钮
      → SUN 停止闪烁
      → 牌槽解锁
      → 悬浮的字母 N 落入牌槽 → [S, U, N, N]
      → 检测 SUNN (无效单词，无闪烁)

t=5s: 玩家点击字母 Y
      → 牌槽 [S, U, N, N, Y]
      → 检测 SUNNY (有效单词)
      → SUNNY 开始闪烁

t=7s: 玩家点击"✓消除"
      → SUNNY 消除（闪烁3次 + 淡出动画）
      → 显示释义浮层: "阳光明媚的"
      → 牌槽清空
```

#### 关键参数

| 参数 | 推荐值 | 可调范围 | 说明 |
|------|--------|----------|------|
| **闪烁倒计时** | 3秒 | 2-5秒 | 玩家决策时间 |
| **闪烁频率** | 0.3秒/次 | 0.2-0.5秒 | 视觉提示频率 |
| **消除动画时长** | 0.8秒 | 0.5-1.2秒 | 闪烁3次(0.5s) + 淡出(0.3s) |
| **释义浮层显示** | 1秒 | 0.8-2秒 | 自动消失时间 |

### 3.2 单词匹配规则

#### 核心原则：最长右侧匹配（从左向右逐步截断）

**关键规则**：
```
✅ 新字母永远追加到牌槽最右侧
✅ 每次检测从完整牌槽开始（所有字母）
✅ 逐步去掉最左侧的字母，向右缩短检测范围
✅ 一旦剩余字母少于3个就停止
✅ 找到第一个有效单词就停止（贪心最长）
```

#### 匹配算法详解

**核心逻辑**（伪代码）：
```typescript
function findWord(letters: string[]): WordMatch | null {
    const totalLen = letters.length;

    // 从完整牌槽开始，逐步去掉最左侧字母
    for (let leftCut = 0; leftCut <= totalLen - 3; leftCut++) {
        // 截取从 leftCut 到末尾的子串
        const substr = letters.slice(leftCut).join('').toUpperCase();

        // 查词库
        if (isValidWord(substr)) {
            return {
                word: substr,
                startIdx: leftCut,
                endIdx: totalLen - 1,  // 永远是最右侧
                length: substr.length
            };
        }

        // 如果剩余长度 < 3，停止检测
        if (totalLen - leftCut - 1 < 3) {
            break;
        }
    }

    return null;
}
```

#### 匹配示例（关键）

**示例1: 基础匹配**
```
牌槽: A B C D
新字母: E
牌槽变成: A B C D E

检测顺序:
1. ABCDE (5字母，完整) → 查词库 → ❌ 不是单词
2. BCDE  (4字母，去掉最左的A) → 查词库 → ❌ 不是单词
3. CDE   (3字母，去掉最左的AB) → 查词库 → ❌ 不是单词
4. DE    (2字母) → 停止！少于3字母

结论: 没有匹配到单词
```

**示例2: 需要截断左侧才能匹配**
```
牌槽: C A T S U
新字母: N
牌槽变成: C A T S U N

检测顺序:
1. CATSUN (6字母) → ❌ 不是单词
2. ATSUN  (5字母，去掉C) → ❌ 不是单词
3. TSUN   (4字母，去掉CA) → ❌ 不是单词
4. SUN    (3字母，去掉CAT) → ✅ 找到了！

结果: 触发闪烁，高亮右侧3个字母 S-U-N
```

**示例3: 完整匹配（无需截断）**
```
牌槽: S T A
新字母: R
牌槽变成: S T A R

检测顺序:
1. STAR (4字母，完整) → ✅ 找到了！

结果: 立即触发闪烁，不再继续检测 TAR / AR
```

**示例4: 闪烁后"继续拼"**
```
场景: 玩家想拼 SUNNY

步骤1:
牌槽: S U N
检测: SUN (3字母) → ✅ 找到！触发闪烁

步骤2: 玩家点击"继续拼"
牌槽: S U N (锁定，不消除)

步骤3: 新字母 N 加入
牌槽: S U N N
检测顺序:
1. SUNN (4字母) → ❌ 不是单词
2. UNN  (3字母) → ❌ 不是单词
停止
结果: 无闪烁

步骤4: 新字母 Y 加入
牌槽: S U N N Y
检测顺序:
1. SUNNY (5字母) → ✅ 找到了！

结果: 触发闪烁，高亮 SUNNY（不会检测到旧的 SUN）
```

#### 不允许的情况

**禁止间隔匹配**：
```
牌槽: C X A T
检测:
- CXAT (4字母) → ❌ 不是单词
- XAT (3字母) → ❌ 不是单词
- CAT（需要跳过X）→ ❌ 禁止！必须连续

结果: 无闪烁
```

---

## 4. 每日挑战系统

### 4.1 核心机制

#### 清除率（Completion Rate）

```
清除率 = (已消除的字母牌数量 / 初始牌堆总数量) × 100%

示例：
初始牌堆: 35张牌
玩家消除了: 30张牌
剩余: 5张牌
清除率: 30/35 = 85.71%
```

**说明**：
- 清除率是唯一评价指标（不再区分"胜利/失败"）
- 清除率越高 → 排名越高
- 100%清除率 = 完美通关（极罕见，可给予特殊奖励）

#### 每日最佳记录

```
规则:
- 每天可以玩无限次
- 只保存当天最高清除率
- 每天0点刷新记录

示例:
第1局: 75% → 记录: 75%
第2局: 88% → 记录: 88% (更新)
第3局: 82% → 记录: 88% (未更新)
```

### 4.2 每日种子生成

#### V0.1版本（本地种子，简化实现）

```typescript
// 生成每日关卡种子（V0.1版本）
function getDailySeed(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `w-game-stack-${year}-${month}-${day}`;
    // 示例: "w-game-stack-2025-10-12"
}
```

**V0.1版本说明**：
- ✅ 同一天所有玩家拿到相同的牌堆（公平）
- ✅ 每天0点自动切换到新关卡
- ⚠️ 基于本地日期，可能被修改系统时间作弊（V0.3+修复）

---

## 5. 游戏规则详细说明

### 5.1 完整游戏规则（玩家视角）

#### 目标
尽可能提高**清除率**，挑战每日排行榜第一名！

**清除率 = (消除的字母数 / 初始字母数) × 100%**

#### 操作方式
1. **点击字母牌**: 点击牌堆中**发光的字母牌**（无遮挡的牌），字母会掉落到下方牌槽
2. **自动检测**: 每次字母落入牌槽，游戏会自动检测是否能组成有效单词（至少3个字母）
3. **消除决策**: 检测到单词后，字母会**闪烁**，你有3秒时间选择：
   - 点击 **✓消除** 按钮 → 立即消除单词，获得分数
   - 点击 **⏭继续拼** 按钮 → 保留这些字母，继续拼更长的单词
   - 不操作 → 3秒后自动消除

#### 特殊规则
- **牌槽容量**: 初始只能容纳7个字母，满了游戏结束！
- **扩容奖励**:
  - 每消除3个单词 → 牌槽容量+1格
  - 消除7个字母以上的长单词 → 额外+1格
  - 牌槽占用率≥90% → 触发救济扩容+1格（有冷却期）
  - 最多扩展到15格
- **遮挡机制**: 被其他牌压住的牌无法点击（被压住的牌会变暗）
- **每日挑战**: 每天0点刷新关卡，所有玩家挑战同一个牌堆

#### 结算条件
游戏在以下情况下结束并结算清除率：
- 🔴 牌槽满载（达到容量上限）
- ✅ 牌堆完全清空（100%清除率，完美通关）
- 🏳️ 玩家主动认输（点击"结束游戏"按钮）

### 5.2 评分系统

#### 基础分数

| 单词长度 | 基础分 | 时间加成 | 总分范围 |
|---------|--------|----------|----------|
| 3字母 | 10分 | +5分 | 10-15分 |
| 4字母 | 20分 | +10分 | 20-30分 |
| 5字母 | 35分 | +15分 | 35-50分 |
| 6字母 | 50分 | +20分 | 50-70分 |
| 7字母 | 70分 | +30分 | 70-100分 |
| 8+字母 | 100分 | +50分 | 100-150分 |

---

## 6. 评价标准与排行榜

### 6.1 结算界面设计

```
┌──────────────────────────────┐
│     游戏结束                  │
│                              │
│  🎯 本局清除率: 88% ⬆️       │  ← 绿色↑表示超过历史最佳
│  📊 今日最佳: 88% (已更新)    │
│  🏆 今日排名: #2              │
│                              │
│  ─────────────────────       │
│  消除单词数: 12个             │
│  总分: 450分                 │
│  剩余字母: 4张 (Q X Z J)      │
│  ─────────────────────       │
│                              │
│  [再玩一次] [查看排行榜]      │
│  [分享成绩]                   │
└──────────────────────────────┘
```

### 6.2 排行榜界面

#### 每日排行榜

```
┌──────────────────────────────┐
│  今日挑战 - 2025/10/12        │
│  ⏰ 距离刷新: 6小时30分        │
├──────────────────────────────┤
│  你的最佳: 88%  排名 #2       │
├──────────────────────────────┤
│  🥇 好友A      96%  12:35     │
│  🥈 你         88%  14:20     │  ← 高亮显示
│  🥉 好友B      85%  09:15     │
│  4  好友C      82%  11:40     │
│  5  好友D      78%  13:50     │
│  ...                         │
│  10 好友I      65%  10:20     │
└──────────────────────────────┘
```

---

## 7. UI/UX设计

### 7.1 主界面布局（竖屏）

```
┌─────────────────────────┐
│  ┌───────────────────┐  │  ← 顶部HUD
│  │ 💎120  🏆#2  ⏰∞  │  │    钻石 排名 时间
│  └───────────────────┘  │
│                         │
│  ┌───────────────────┐  │  ← 堆叠牌堆区域
│  │     [A]   [B]     │  │    (占屏幕60%高度)
│  │   [C] [D] [E]     │  │
│  │ [F] [G] [H] [I]   │  │
│  │[J][K][L][M][N][O] │  │
│  └───────────────────┘  │
│                         │
│  ┌───────────────────┐  │  ← 牌槽区域
│  │ [_][_][_][_][_].. │  │    (7-15格可扩展)
│  └───────────────────┘  │
│                         │
│  [✓消除] [⏭继续拼]      │  ← 闪烁时显示的按钮
│                         │
│  [结束游戏]             │  ← 底部按钮
└─────────────────────────┘
```

### 7.2 视觉反馈规范

#### 卡片状态（基于 LetterTile 复用方案）

| 状态 | 使用资源 | 视觉效果 | 说明 |
|------|---------|---------|------|
| **可点击（无遮挡）** | `tile_selectable.png` | 白色背景、发光光圈、缩放呼吸 | 无遮挡的卡片 |
| **被遮挡** | `tile_disabled.png` | 灰色半透明（50%）、无光圈 | 被上层牌压住 |
| **悬浮中（飞向牌槽）** | `tile_highlight.png` | 黄色高亮、向上浮动 | 点击后飞向牌槽 |
| **在牌槽中** | `tile_highlight.png` | 黄色高亮 | 已进入牌槽的字母 |
| **闪烁（检测到单词）** | `tile_correct.png` | 黄色呼吸动画（0.3s频率） | 检测到单词，建议调色为黄色 |

**状态映射逻辑**（在 `LetterTile.ts` 中实现）：
```typescript
export type TileState =
    | 'selectable'  // 可点击（无遮挡）→ tile_selectable.png
    | 'disabled'    // 被遮挡 → tile_disabled.png
    | 'highlight'   // 悬浮中 + 在牌槽中 → tile_highlight.png
    | 'correct'     // 闪烁（检测到单词）→ tile_correct.png
    | 'wrong';      // 预留（暂不使用）→ tile_wrong.png
```

#### 动画时间轴

```
点击卡片:
  0.0s  → 卡片缩小到0.8倍
  0.1s  → 飞向牌槽（缓动曲线）
  0.3s  → 落入牌槽，弹跳效果
  0.4s  → 检测单词

闪烁消除:
  0.0s  → 开始闪烁（黄色高亮）
  3.0s  → 自动消除倒计时结束
  3.0s  → 闪烁加速（0.15s频率）
  3.5s  → 缩放至1.2倍
  3.8s  → 淡出（alpha: 1→0）
  3.8s  → 显示释义浮层
  4.8s  → 释义浮层消失
```

### 7.3 音效设计

| 触发事件 | 音效文件 | 音调 | 音量 |
|---------|---------|------|------|
| 点击卡片 | `click_card.mp3` | 清脆"啪" | 80% |
| 字母落入牌槽 | `drop_slot.mp3` | 低沉"咚" | 70% |
| 检测到单词 | `blink_start.mp3` | 提示"叮" | 90% |
| 闪烁持续 | `blink_loop.mp3` | 心跳声（循环） | 50% |
| 消除单词 | `clear_word.mp3` | 成功"啵" | 100% |
| 牌槽扩容 | `expand_slot.mp3` | 扩张"嘭" | 85% |
| 牌槽警告 | `warning.mp3` | 警告"嘟嘟" | 95% |
| 完美通关 | `perfect.mp3` | 胜利"哒哒哒" | 100% |

---

# 第二部分：技术实现

## 8. 技术架构概览

### 8.1 整体架构图

```
┌─────────────────────────────────────────────────┐
│                  GameApp.ts                     │  ← 游戏主控制器
│  - 关卡生成                                      │
│  - 游戏循环                                      │
│  - 结算逻辑                                      │
└─────────────┬───────────────────────────────────┘
              │
      ┌───────┴───────┐
      │               │
┌─────▼──────┐  ┌────▼─────────┐
│StackBoard  │  │  SlotQueue   │  ← 核心逻辑层
│堆叠棋盘管理 │  │  牌槽队列    │
│- 遮挡判定   │  │  - 扩容逻辑  │
│- 卡片点击   │  │  - 救济机制  │
└─────┬──────┘  └────┬─────────┘
      │               │
      └───────┬───────┘
              │
      ┌───────▼───────────────────┐
      │  IncrementalWordMatcher   │  ← 单词检测层
      │  - 增量检测优化            │
      │  - Trie树（V0.2+）        │
      └───────┬───────────────────┘
              │
      ┌───────▼───────────────────┐
      │    ProgressiveDictMgr     │  ← 词库系统
      │    - 核心词库（500）       │
      │    - 扩展词库（5000）      │
      │    - 完整词库（50000）     │
      └───────────────────────────┘
```

### 8.2 模块职责划分

> **📢 重要说明**: 本项目采用**分层架构**,脚本按职责分类,而非按玩法模块创建独立目录。

| 模块 | 职责 | 文件路径 | 所属层级 |
|------|------|---------|----------|
| **StackGameApp** | 堆叠模式游戏主循环、关卡生成、结算 | `assets/scripts/app/StackGameApp.ts` | 应用层 |
| **StackBoard** | 堆叠棋盘管理、遮挡判定 | `assets/scripts/ui/StackBoard.ts` | UI层 |
| **LetterCard** | 单个字母卡片组件（复用LetterTile） | `assets/scripts/ui/LetterTile.ts` | UI层 |
| **SlotQueue** | 牌槽队列、扩容逻辑 | `assets/scripts/ui/SlotQueue.ts` | UI层 |
| **WordMatcher** | 单词检测（增量/Trie树） | `assets/scripts/core/WordMatcher.ts` | 核心层 |
| **LevelGenerator** | 关卡生成、可解性验证 | `assets/scripts/core/LevelGenerator.ts` | 核心层 |
| **GlossService** | 词库管理、词义查询（复用现有） | `assets/scripts/data/GlossService.ts` | 数据层 |
| **AssetLoader** | 统一资源加载器（复用现有） | `assets/scripts/core/AssetLoader.ts` | 核心层 |
| **AudioMgr** | 音效管理器（复用现有） | `assets/scripts/util/AudioMgr.ts` | 工具层 |

**资源加载说明**:
- **Bundle远程加载**: 所有图片资源(背景、字母瓦片、牌槽)通过AssetLoader从远程Bundle加载
- **Bundle目录**: `assets/bundle/` (bg, tiles, slot, modal, title, words)
- **预制体**: `assets/resources/` (LetterTile.prefab, SlotItem.prefab等)
- **加载流程**: Loading场景 → PreloadManager批量加载Bundle → 游戏场景使用AssetLoader即时获取资源

---

## 9. 数据结构与接口定义

### 9.1 核心数据结构

```typescript
/**
 * 字母卡片
 */
interface Card {
    id: string;          // 唯一标识
    letter: string;      // 字母（A-Z）
    layer: number;       // 层级（0=底层，越大越上层）
    position: Vec3;      // 世界坐标
    blocked: boolean;    // 是否被遮挡
    removed: boolean;    // 是否已移除
}

/**
 * 牌槽队列
 */
interface SlotQueue {
    letters: string[];   // 当前字母序列
    capacity: number;    // 当前容量
    maxCapacity: number; // 最大容量
    blinking: boolean;   // 是否闪烁中
    matchedWord?: string; // 当前匹配的单词
}

/**
 * 单词匹配结果
 */
interface WordMatch {
    word: string;        // 匹配的单词
    startIdx: number;    // 起始索引
    endIdx: number;      // 结束索引
    length: number;      // 长度
}

/**
 * 关卡数据
 */
interface Level {
    seed: string;        // 关卡种子
    cards: Card[];       // 所有卡片
    layout: LayoutTemplate; // 布局模板
    wordPool: string[];  // 单词池（用于生成卡片）
    totalCards: number;  // 总卡片数
}

/**
 * 布局模板
 */
interface LayoutTemplate {
    id: string;          // 模板ID（如"spiral", "pyramid"）
    name: string;        // 模板名称
    cardCount: number;   // 卡片总数
    layers: LayerConfig[]; // 层级配置
}

/**
 * 层级配置
 */
interface LayerConfig {
    id: number;          // 层级ID
    positions: Vec3[];   // 卡片位置列表
    zIndex: number;      // 渲染层级（用于排序）
}

/**
 * 操作记录
 */
interface Operation {
    timestamp: number;   // 时间戳（相对游戏开始时间，单位ms）
    type: 'click' | 'clear' | 'continue'; // 操作类型
    data: string;        // 操作数据（卡片ID或单词）
}

/**
 * 游戏结果
 */
interface GameResult {
    seed: string;        // 关卡种子
    clearRate: number;   // 清除率（0-1）
    wordsCleared: string[]; // 消除的单词列表
    operations: Operation[]; // 操作序列
    fingerprint: string; // 操作指纹
    playDuration: number; // 游戏时长（ms）
}

/**
 * 排行榜数据
 */
interface LeaderboardEntry {
    userId: string;      // 用户ID
    username: string;    // 用户昵称
    avatar: string;      // 头像URL
    clearRate: number;   // 清除率
    rank: number;        // 排名
    playedAt: number;    // 游戏时间戳
}
```

### 9.2 关键接口定义

```typescript
/**
 * 堆叠棋盘管理器接口
 */
interface IStackBoard {
    /**
     * 初始化棋盘
     */
    init(level: Level): void;

    /**
     * 获取所有可点击的卡片
     */
    getClickableCards(): Card[];

    /**
     * 点击卡片
     */
    clickCard(cardId: string): Promise<void>;

    /**
     * 更新遮挡状态
     */
    updateBlockStatus(): void;

    /**
     * 销毁棋盘
     */
    destroy(): void;
}

/**
 * 单词匹配器接口
 */
interface IWordMatcher {
    /**
     * 查找最长匹配单词
     */
    findWord(letters: string[]): WordMatch | null;

    /**
     * 验证单词是否有效
     */
    isValidWord(word: string): boolean;
}

/**
 * 牌槽管理器接口
 */
interface ISlotQueue {
    /**
     * 添加字母
     */
    addLetter(letter: string): void;

    /**
     * 移除单词
     */
    removeWord(match: WordMatch): void;

    /**
     * 获取当前字母序列
     */
    getLetters(): string[];

    /**
     * 检查是否已满
     */
    isFull(): boolean;

    /**
     * 扩容
     */
    expand(amount: number): void;
}

/**
 * 关卡生成器接口
 */
interface ILevelGenerator {
    /**
     * 生成每日关卡
     */
    generateDailyLevel(seed: string): Level;

    /**
     * 验证关卡可解性
     */
    validateLevel(level: Level): ValidationResult;
}
```

---

## 10. 遮挡判定算法详解

### 10.1 核心算法：重叠面积法

```typescript
/**
 * 判断上层卡片是否遮挡下层卡片
 * 规则：重叠面积超过下层卡片面积的50%即视为遮挡
 */
function isBlocked(upperCard: Card, lowerCard: Card): boolean {
    const overlapRect = getOverlapRect(upperCard.rect, lowerCard.rect);

    if (!overlapRect) {
        return false; // 无重叠
    }

    const overlapArea = overlapRect.width * overlapRect.height;
    const lowerArea = lowerCard.rect.width * lowerCard.rect.height;
    const overlapRatio = overlapArea / lowerArea;

    return overlapRatio > 0.5; // 阈值：50%
}

/**
 * 计算两个矩形的重叠区域
 */
function getOverlapRect(rect1: Rect, rect2: Rect): Rect | null {
    const left = Math.max(rect1.x, rect2.x);
    const right = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
    const top = Math.max(rect1.y, rect2.y);
    const bottom = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);

    if (left >= right || top >= bottom) {
        return null; // 无重叠
    }

    return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
    };
}
```

### 10.2 批量更新优化

```typescript
class StackBoard {
    private cards: Card[] = [];

    /**
     * 更新所有卡片的遮挡状态
     * 时间复杂度: O(n²) - n为卡片总数
     */
    updateBlockStatus(): void {
        // 先重置所有卡片为可点击
        for (const card of this.cards) {
            card.blocked = false;
        }

        // 按层级从上到下遍历
        const layerMap = this.groupByLayer();
        const layers = Array.from(layerMap.keys()).sort((a, b) => b - a); // 降序

        for (let i = 0; i < layers.length; i++) {
            const upperLayer = layers[i];
            const upperCards = layerMap.get(upperLayer)!;

            // 检查所有更低的层级
            for (let j = i + 1; j < layers.length; j++) {
                const lowerLayer = layers[j];
                const lowerCards = layerMap.get(lowerLayer)!;

                // 检查每对卡片
                for (const upper of upperCards) {
                    for (const lower of lowerCards) {
                        if (isBlocked(upper, lower)) {
                            lower.blocked = true;
                        }
                    }
                }
            }
        }
    }

    /**
     * 按层级分组卡片
     */
    private groupByLayer(): Map<number, Card[]> {
        const map = new Map<number, Card[]>();

        for (const card of this.cards) {
            if (!map.has(card.layer)) {
                map.set(card.layer, []);
            }
            map.get(card.layer)!.push(card);
        }

        return map;
    }
}
```

### 10.3 性能优化：空间分区（V0.2+）

```typescript
/**
 * 空间分区优化（用于50+卡片场景）
 * 将游戏区域划分为网格，只检查相邻网格的卡片
 */
class SpatialHash {
    private cellSize: number = 100; // 网格大小100px
    private grid: Map<string, Card[]> = new Map();

    /**
     * 添加卡片到空间哈希
     */
    insert(card: Card): void {
        const cells = this.getCellsForRect(card.rect);

        for (const cell of cells) {
            const key = `${cell.x},${cell.y}`;
            if (!this.grid.has(key)) {
                this.grid.set(key, []);
            }
            this.grid.get(key)!.push(card);
        }
    }

    /**
     * 查询可能与给定矩形重叠的卡片
     */
    query(rect: Rect): Card[] {
        const cells = this.getCellsForRect(rect);
        const result = new Set<Card>();

        for (const cell of cells) {
            const key = `${cell.x},${cell.y}`;
            const cards = this.grid.get(key) || [];
            cards.forEach(card => result.add(card));
        }

        return Array.from(result);
    }

    /**
     * 计算矩形占据的网格单元
     */
    private getCellsForRect(rect: Rect): {x: number, y: number}[] {
        const minX = Math.floor(rect.x / this.cellSize);
        const maxX = Math.floor((rect.x + rect.width) / this.cellSize);
        const minY = Math.floor(rect.y / this.cellSize);
        const maxY = Math.floor((rect.y + rect.height) / this.cellSize);

        const cells: {x: number, y: number}[] = [];

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                cells.push({x, y});
            }
        }

        return cells;
    }
}
```

**性能对比**：
- 普通算法：O(n²) = 50×50 = 2500次比较
- 空间哈希：O(n×k) = 50×5 = 250次比较（k为平均相邻卡片数）
- **提升约10倍**

---

## 11. 单词检测性能优化

### 11.1 性能瓶颈分析

**最坏情况分析**：
- 牌槽15个字母
- 检测次数：15 - 3 + 1 = 13次
- 每次字符串拼接：`slice()` + `join()` = O(n)
- **总复杂度**：O(n²) = 13×15 = 195次操作

**高频触发**：
- 每次字母落入牌槽都触发
- 玩家快速点击时，1秒内可能触发5-10次

### 11.2 优化方案A：增量检测（推荐V0.1）

```typescript
/**
 * 增量检测优化
 * 利用"新字母总是追加到右侧"的特性，避免重复拼接
 */
class IncrementalWordMatcher {
    private lastCheckedStr: string = '';
    private wordBank: Set<string>;

    findWord(letters: string[]): WordMatch | null {
        const currentStr = letters.join('').toUpperCase();

        // 情况1: 只追加了1个字母（快速路径）
        if (currentStr.startsWith(this.lastCheckedStr)) {
            const newChar = currentStr[currentStr.length - 1];

            // 只检测以新字母结尾的子串
            for (let len = 3; len <= currentStr.length; len++) {
                const substr = currentStr.slice(-len); // 右侧len个字母

                if (this.wordBank.has(substr)) {
                    this.lastCheckedStr = currentStr;
                    return {
                        word: substr,
                        startIdx: currentStr.length - len,
                        endIdx: currentStr.length - 1
                    };
                }
            }

            this.lastCheckedStr = currentStr;
            return null;
        }

        // 情况2: 点击"继续拼"后（牌槽内容变化）
        // 降级到完整检测
        this.lastCheckedStr = currentStr;
        return this.fullCheck(letters);
    }

    /**
     * 完整检测（降级逻辑）
     */
    private fullCheck(letters: string[]): WordMatch | null {
        const totalLen = letters.length;

        for (let leftCut = 0; leftCut <= totalLen - 3; leftCut++) {
            const substr = letters.slice(leftCut).join('').toUpperCase();

            if (this.wordBank.has(substr)) {
                return {
                    word: substr,
                    startIdx: leftCut,
                    endIdx: totalLen - 1
                };
            }
        }

        return null;
    }
}
```

**性能提升**：
- 快速路径（90%的情况）：O(n) = 13次检测
- 降级路径（10%的情况）：O(n²) = 195次操作
- **平均提升约15倍**

### 11.3 优化方案B：Trie树（V0.2+）

```typescript
/**
 * Trie树节点
 */
class TrieNode {
    children: Map<string, TrieNode> = new Map();
    isWord: boolean = false;
    word?: string; // 存储完整单词
}

/**
 * 基于Trie树的单词匹配器
 * 优势：提前终止无效前缀
 */
class TrieWordMatcher {
    private root: TrieNode = new TrieNode();

    /**
     * 构建Trie树（初始化时执行一次）
     */
    buildTrie(words: string[]): void {
        for (const word of words) {
            let node = this.root;

            for (const char of word.toUpperCase()) {
                if (!node.children.has(char)) {
                    node.children.set(char, new TrieNode());
                }
                node = node.children.get(char)!;
            }

            node.isWord = true;
            node.word = word;
        }
    }

    /**
     * 查找最长匹配单词
     */
    findWord(letters: string[]): WordMatch | null {
        const totalLen = letters.length;
        let longestMatch: WordMatch | null = null;

        // 从每个起始位置开始检测
        for (let start = 0; start <= totalLen - 3; start++) {
            let node = this.root;

            // 沿Trie树向下走
            for (let end = start; end < totalLen; end++) {
                const char = letters[end].toUpperCase();

                if (!node.children.has(char)) {
                    break; // 前缀不存在，剪枝！
                }

                node = node.children.get(char)!;

                // 找到单词且长度≥3
                if (node.isWord && (end - start + 1) >= 3) {
                    // 记录最长匹配（右侧优先）
                    if (!longestMatch || end > longestMatch.endIdx) {
                        longestMatch = {
                            word: node.word!,
                            startIdx: start,
                            endIdx: end
                        };
                    }
                }
            }
        }

        return longestMatch;
    }
}
```

**性能对比**：

| 场景 | 普通算法 | 增量检测 | Trie树 |
|------|---------|---------|--------|
| 牌槽5字母 | 3次×5=15ops | 5次 | 3次×平均深度2=6ops |
| 牌槽10字母 | 8次×10=80ops | 10次 | 8次×平均深度2.5=20ops |
| 牌槽15字母 | 13次×15=195ops | 15次 | 13次×平均深度3=39ops |

---

## 12. 牌堆生成与公平性保证

### 12.1 字母频率均衡算法

```typescript
/**
 * 选择字母频率均衡的单词池
 * 目标：避免过多Q/X/Z等低频字母
 */
function selectBalancedWords(
    rng: SeededRandom,
    targetCardCount: number
): string[] {
    const selected: string[] = [];
    const letterCount: Map<string, number> = new Map();

    // 目标频率分布（参考英语自然频率）
    const TARGET_FREQ: Record<string, number> = {
        'E': 0.127, 'T': 0.091, 'A': 0.082, 'O': 0.075, 'I': 0.070,
        'N': 0.067, 'S': 0.063, 'H': 0.061, 'R': 0.060, 'D': 0.043,
        'L': 0.040, 'C': 0.028, 'U': 0.028, 'M': 0.024, 'W': 0.024,
        'F': 0.022, 'G': 0.020, 'Y': 0.020, 'P': 0.019, 'B': 0.015,
        'V': 0.010, 'K': 0.008, 'J': 0.0015, 'X': 0.0015, 'Q': 0.001, 'Z': 0.0007
    };

    // 候选单词按常用度排序
    const candidates = wordBank
        .slice()
        .sort((a, b) => getWordFrequency(b) - getWordFrequency(a));

    let totalLetters = 0;

    for (const word of candidates) {
        // 计算添加该单词后的字母频率偏差
        const wordLetters = word.toUpperCase().split('');
        const deviation = calculateDeviation(
            letterCount,
            wordLetters,
            totalLetters,
            TARGET_FREQ
        );

        // 如果偏差在可接受范围内，添加该单词
        if (deviation < 0.05) { // 阈值：5%
            selected.push(word);

            for (const char of wordLetters) {
                letterCount.set(char, (letterCount.get(char) || 0) + 1);
            }

            totalLetters += wordLetters.length;

            // 达到目标卡片数量，停止
            if (totalLetters >= targetCardCount) {
                break;
            }
        }
    }

    return selected;
}
```

### 12.2 可解性验证算法（核心！）

```typescript
/**
 * 验证关卡可解性
 * 使用AI模拟最优玩法，确保理论最高清除率在80-95%之间
 */
function validateLevel(level: Level): ValidationResult {
    const simulator = new AISimulator();

    // 模拟100次随机玩法（蒙特卡洛）
    const results: number[] = [];

    for (let i = 0; i < 100; i++) {
        const clearRate = simulator.simulate(level, {
            strategy: 'greedy', // 贪心策略：优先拼长单词
            randomness: 0.1     // 10%随机性
        });

        results.push(clearRate);
    }

    // 计算理论最高清除率（前10%的平均值）
    const sortedResults = results.sort((a, b) => b - a);
    const top10Percent = sortedResults.slice(0, 10);
    const theoreticalMax = top10Percent.reduce((sum, r) => sum + r, 0) / top10Percent.length;

    // 验证规则
    if (theoreticalMax < 0.80) {
        return {
            valid: false,
            reason: `理论最高清除率过低: ${theoreticalMax.toFixed(2)} < 0.80`,
            theoreticalMax
        };
    }

    if (theoreticalMax > 0.95) {
        return {
            valid: false,
            reason: `理论最高清除率过高: ${theoreticalMax.toFixed(2)} > 0.95（太简单）`,
            theoreticalMax
        };
    }

    return {
        valid: true,
        reason: 'OK',
        theoreticalMax
    };
}
```

**验证流程示例**：

```
生成关卡 → AI模拟100次 → 统计清除率分布

结果:
  最高清除率: 94.2%
  平均清除率: 78.5%
  最低清除率: 62.1%

理论最高（前10%均值）: 91.3%

验证结果: ✅ 通过（80% ≤ 91.3% ≤ 95%）
```

---

## 13. 动态难度调节系统

### 13.1 救济机制：防止"螺旋死亡"

```typescript
/**
 * 牌槽扩容规则（增强版）
 */
interface ExpandRule {
    // 基础规则
    everyNWords: number;      // 每消除N个单词+1格
    longWordBonus: number;    // N+字母单词额外+1格

    // 🆕 救济机制
    rescue: {
        trigger: number;       // 触发条件：牌槽占用率≥90%
        reward: number;        // 奖励1格
        cooldown: number;      // 冷却：消除5个单词后才能再次触发
    };
}

// 默认配置
const DEFAULT_EXPAND_RULE: ExpandRule = {
    everyNWords: 3,
    longWordBonus: 7,
    rescue: {
        trigger: 0.9,  // 90%满载
        reward: 1,
        cooldown: 5
    }
};

/**
 * 牌槽管理器
 */
class SlotQueue {
    private letters: string[] = [];
    private capacity: number = 7;
    private maxCapacity: number = 15;

    private wordsCleared: number = 0;
    private lastRescueAt: number = 0; // 上次救济时的消除数

    /**
     * 检查是否触发扩容
     */
    private checkExpand(): void {
        const rule = DEFAULT_EXPAND_RULE;

        // 规则1: 每消除N个单词+1格
        if (this.wordsCleared > 0 && this.wordsCleared % rule.everyNWords === 0) {
            this.expand(1, '常规扩容');
        }

        // 规则2: 救济机制
        const occupancy = this.letters.length / this.capacity;
        const cooldownPassed = (this.wordsCleared - this.lastRescueAt) >= rule.rescue.cooldown;

        if (occupancy >= rule.rescue.trigger && cooldownPassed) {
            this.expand(rule.rescue.reward, '救济扩容');
            this.lastRescueAt = this.wordsCleared;
        }
    }

    /**
     * 扩容
     */
    private expand(amount: number, reason: string): void {
        const oldCapacity = this.capacity;
        this.capacity = Math.min(this.capacity + amount, this.maxCapacity);

        console.log(`扩容: ${oldCapacity} → ${this.capacity} (原因: ${reason})`);

        // 触发UI动画
        EventManager.emit('slot:expand', {
            oldCapacity,
            newCapacity: this.capacity,
            reason
        });
    }

    /**
     * 消除单词后回调
     */
    onWordCleared(word: string): void {
        this.wordsCleared++;

        // 检查长单词奖励
        if (word.length >= DEFAULT_EXPAND_RULE.longWordBonus) {
            this.expand(1, `长单词奖励（${word}）`);
        }

        this.checkExpand();
    }
}
```

**效果示例**：

```
情况1: 正常玩法
牌槽: [A, B, C, D, E, F, _]  (6/7, 85%)
操作: 消除 CAT
结果: 无扩容（未满90%）

情况2: 触发救济
牌槽: [A, B, C, D, E, F, G]  (7/7, 100%满载)
操作: 消除 CAT
结果:
  - 牌槽: [D, E, F, G]  (4/7, 57%)
  - 触发救济检查: 消除前占用率100% ≥ 90% ✓
  - 扩容: 7 → 8格

情况3: 冷却中
牌槽: [A, B, C, D, E, F, G, H]  (8/8, 100%)
操作: 消除 AB
已消除单词数: 8个
上次救济: 第5个单词
冷却检查: 8 - 5 = 3 < 5 ✗
结果: 不触发救济（冷却中）
```

---

## 14. 布局模板系统

### 14.1 模板JSON格式

```json
{
  "id": "spiral",
  "name": "螺旋布局",
  "cardCount": 35,
  "layers": [
    {
      "id": 0,
      "zIndex": 1,
      "positions": [
        {"x": 0, "y": 0, "z": 0},
        {"x": 100, "y": 0, "z": 0},
        {"x": 200, "y": 0, "z": 0}
      ]
    },
    {
      "id": 1,
      "zIndex": 2,
      "positions": [
        {"x": 50, "y": 50, "z": 10},
        {"x": 150, "y": 50, "z": 10}
      ]
    }
  ]
}
```

### 14.2 五种预设模板

#### 1. 螺旋布局（Spiral）

```
层级2:     [2张]
         ╱   ╲
层级1:  [8张]
       ╱       ╲
层级0: [25张]

特点：中心向外螺旋扩散
难度：中等
```

#### 2. 金字塔布局（Pyramid）

```
层级3:     [1张]
层级2:    [3张]
层级1:   [6张]
层级0:  [10张]

特点：经典金字塔
难度：简单
```

#### 3. 环形布局（Ring）

```
    [外环 - 12张]
  [中环 - 8张]
   [核心 - 4张]

特点：同心圆环
难度：困难
```

#### 4. 随机堆（Random）

```
随机生成3-5层
每层5-12张不等

特点：不规则堆叠
难度：随机
```

#### 5. 波浪布局（Wave）

```
层级2: [  4张  ]
层级1:   [10张]
层级0: [  8张  ]

特点：波浪起伏
难度：中等
```

---

# 第三部分：系统设计

## 15. 词库系统设计

### 15.1 分级加载策略

```typescript
/**
 * 词库分级定义
 */
enum DictLevel {
    CORE = 'core',       // 核心词库（500词，50KB）
    EXPAND = 'expand',   // 扩展词库（5000词，500KB）
    FULL = 'full'        // 完整词库（50000词，5MB）
}

/**
 * 渐进式词库管理器
 */
class ProgressiveDictManager {
    private currentLevel: DictLevel = DictLevel.CORE;
    private wordSets: Map<DictLevel, Set<string>> = new Map();

    /**
     * 初始化（加载核心词库）
     */
    async init(): Promise<void> {
        // 核心词库内嵌在代码中（编译时打包）
        const coreWords = EMBEDDED_CORE_WORDS; // 预定义数组
        this.wordSets.set(DictLevel.CORE, new Set(coreWords));
        this.currentLevel = DictLevel.CORE;
    }

    /**
     * 升级到扩展词库
     */
    async upgradeToExpand(): Promise<void> {
        if (this.currentLevel >= DictLevel.EXPAND) {
            return; // 已加载
        }

        try {
            const bundle = await assetManager.loadBundle('dict_expand');
            const json = await bundle.load('words_expand', JsonAsset);
            const words = json.json as string[];

            this.wordSets.set(DictLevel.EXPAND, new Set(words));
            this.currentLevel = DictLevel.EXPAND;

            // 缓存到localStorage
            sys.localStorage.setItem('dict_expand', JSON.stringify(words));
        } catch (error) {
            console.warn('扩展词库加载失败，继续使用核心词库', error);
        }
    }

    /**
     * 升级到完整词库
     */
    async upgradeToFull(): Promise<void> {
        if (this.currentLevel >= DictLevel.FULL) {
            return;
        }

        try {
            // 先尝试从缓存加载
            const cached = sys.localStorage.getItem('dict_full');
            if (cached) {
                const words = JSON.parse(cached) as string[];
                this.wordSets.set(DictLevel.FULL, new Set(words));
                this.currentLevel = DictLevel.FULL;
                return;
            }

            // 从远程加载
            const bundle = await assetManager.loadBundle('dict_full', {
                url: REMOTE_DICT_URL
            });
            const json = await bundle.load('words_full', JsonAsset);
            const words = json.json as string[];

            this.wordSets.set(DictLevel.FULL, new Set(words));
            this.currentLevel = DictLevel.FULL;

            // 缓存
            sys.localStorage.setItem('dict_full', JSON.stringify(words));
        } catch (error) {
            console.warn('完整词库加载失败，降级使用扩展词库', error);
            await this.upgradeToExpand();
        }
    }

    /**
     * 查询单词是否有效
     */
    isValidWord(word: string): boolean {
        const wordSet = this.wordSets.get(this.currentLevel)!;
        return wordSet.has(word.toUpperCase());
    }
}
```

---

## 16. 新手引导系统

### 16.1 三步教学关卡

#### 关卡1: 基础消除（无闪烁）

```typescript
/**
 * 教学关卡1: 基础消除
 * 目标: 让玩家理解"点击字母 → 牌槽 → 自动消除"的核心流程
 */
const TUTORIAL_LEVEL_1: TutorialLevel = {
    id: 'tutorial_1',
    title: '基础消除',
    objective: '拼出单词 CAT',

    // 固定布局（仅1层3张牌）
    cards: [
        { letter: 'C', layer: 0, position: {x: -100, y: 0} },
        { letter: 'A', layer: 0, position: {x: 0, y: 0} },
        { letter: 'T', layer: 0, position: {x: 100, y: 0} }
    ],

    // 引导步骤
    steps: [
        {
            type: 'highlight',
            target: 'card_C',
            message: '点击字母 C',
            arrow: true
        },
        {
            type: 'highlight',
            target: 'card_A',
            message: '点击字母 A',
            arrow: true
        },
        {
            type: 'highlight',
            target: 'card_T',
            message: '点击字母 T',
            arrow: true
        },
        {
            type: 'message',
            message: '太棒了！CAT 被消除了！',
            icon: '🎉'
        }
    ],

    // 特殊规则
    rules: {
        disableBlink: true,     // 禁用闪烁机制
        autoComplete: true,     // 自动消除
        disableWrongClick: true // 禁止点击其他字母
    }
};
```

#### 关卡2: 闪烁决策（强制等待）

```typescript
/**
 * 教学关卡2: 闪烁决策
 * 目标: 让玩家理解闪烁倒计时机制
 */
const TUTORIAL_LEVEL_2: TutorialLevel = {
    id: 'tutorial_2',
    title: '闪烁倒计时',
    objective: '观察单词 SUN 的闪烁效果',

    cards: [
        { letter: 'S', layer: 0, position: {x: -100, y: 0} },
        { letter: 'U', layer: 0, position: {x: 0, y: 0} },
        { letter: 'N', layer: 0, position: {x: 100, y: 0} }
    ],

    steps: [
        {
            type: 'auto_click',
            targets: ['card_S', 'card_U', 'card_N'],
            delay: 800 // 每次点击间隔0.8秒
        },
        {
            type: 'message',
            message: '看！单词 SUN 开始闪烁了！',
            waitFor: 'blink_start'
        },
        {
            type: 'message',
            message: '倒计时3秒后会自动消除',
            highlight: 'countdown_timer'
        },
        {
            type: 'wait',
            duration: 3000 // 强制等待3秒
        },
        {
            type: 'message',
            message: '单词被自动消除了！',
            icon: '✅'
        }
    ],

    rules: {
        disableSkip: true,       // 禁止跳过（必须看完3秒）
        disableContinueBtn: true // 隐藏"继续拼"按钮
    }
};
```

#### 关卡3: 继续拼词（高级机制）

```typescript
/**
 * 教学关卡3: 继续拼词
 * 目标: 让玩家学会使用"继续拼"按钮拼出更长单词
 */
const TUTORIAL_LEVEL_3: TutorialLevel = {
    id: 'tutorial_3',
    title: '拼出更长的单词',
    objective: '拼出 SUNNY（而非 SUN）',

    cards: [
        { letter: 'S', layer: 0, position: {x: -150, y: 0} },
        { letter: 'U', layer: 0, position: {x: -75, y: 0} },
        { letter: 'N', layer: 0, position: {x: 0, y: 0} },
        { letter: 'N', layer: 0, position: {x: 75, y: 0} },
        { letter: 'Y', layer: 0, position: {x: 150, y: 0} }
    ],

    steps: [
        {
            type: 'auto_click',
            targets: ['card_S', 'card_U', 'card_N'],
            delay: 800
        },
        {
            type: 'message',
            message: 'SUN 开始闪烁！但我们想拼 SUNNY！',
            waitFor: 'blink_start'
        },
        {
            type: 'highlight',
            target: 'continue_btn',
            message: '点击"继续拼"按钮',
            arrow: true,
            mandatory: true // 必须点击才能继续
        },
        {
            type: 'message',
            message: '闪烁取消了！继续添加字母',
            waitFor: 'blink_cancel'
        },
        {
            type: 'highlight',
            target: 'card_N',
            message: '点击第二个 N',
            arrow: true
        },
        {
            type: 'highlight',
            target: 'card_Y',
            message: '点击 Y',
            arrow: true
        },
        {
            type: 'message',
            message: '太棒了！你拼出了 SUNNY！',
            icon: '🌞'
        }
    ],

    rules: {
        highlightContinueBtn: true, // 高亮"继续拼"按钮
        pauseTimerOnBlink: true     // 闪烁时暂停倒计时
    }
};
```

---

## 17. 防作弊机制

### 17.1 客户端操作指纹

```typescript
/**
 * 操作指纹生成器
 * 防止客户端伪造清除率
 */
class AntiCheatFingerprint {
    /**
     * 生成操作指纹
     * 原理：将关键操作数据哈希化，服务端可重新计算验证
     */
    static generate(operations: Operation[], seed: string): string {
        const key = [
            seed,                               // 关卡种子
            operations.length,                  // 操作总数
            operations[0]?.timestamp || 0,      // 首次操作时间
            operations[operations.length - 1]?.data || '' // 最后消除的单词
        ].join('|');

        // 使用HMAC-SHA256（需要引入crypto库）
        const SECRET_SALT = 'w-game-stack-secret-2025'; // 服务端同步配置
        return this.sha256(key + SECRET_SALT).slice(0, 16); // 取前16位
    }
}

/**
 * 操作记录器
 */
class OperationRecorder {
    private operations: Operation[] = [];
    private startTime: number = 0;

    start(seed: string): void {
        this.startTime = Date.now();
        this.operations = [];
    }

    /**
     * 记录点击卡片
     */
    recordClick(cardId: string): void {
        this.operations.push({
            timestamp: Date.now() - this.startTime,
            type: 'click',
            data: cardId
        });
    }

    /**
     * 记录消除单词
     */
    recordClear(word: string): void {
        this.operations.push({
            timestamp: Date.now() - this.startTime,
            type: 'clear',
            data: word
        });
    }

    /**
     * 生成提交数据
     */
    generateSubmission(seed: string, clearRate: number): ScoreSubmission {
        const fingerprint = AntiCheatFingerprint.generate(this.operations, seed);

        return {
            seed,
            clearRate,
            operations: this.operations,
            fingerprint,
            clientVersion: '1.0.0',
            playDuration: Date.now() - this.startTime
        };
    }
}
```

### 17.2 服务端重放验证（V0.3+）

```python
# FastAPI 后端
@app.post("/leaderboard/submit")
async def submit_score(data: ScoreSubmission):
    # 验证1: 指纹检查
    expected_fp = generate_fingerprint(data.operations, data.seed)
    if expected_fp != data.fingerprint:
        raise HTTPException(400, "操作指纹不匹配")

    # 验证2: 重放操作序列
    level = load_level(data.seed)
    replayer = OperationReplayer(level)

    try:
        replay_result = replayer.replay(data.operations)
    except ReplayError as e:
        raise HTTPException(400, f"重放失败: {e}")

    # 验证3: 清除率一致性
    if abs(replay_result.clearRate - data.clearRate) > 0.01:
        raise HTTPException(400, f"清除率不匹配")

    # 验证4: 时间合理性检查
    if data.playDuration < 10000:  # 少于10秒
        raise HTTPException(400, "游戏时长异常（过短）")

    # 保存到数据库
    await save_score(data.user_id, data.seed, data.clearRate)

    return {"success": True, "rank": await get_rank(data.user_id, data.seed)}
```

---

## 18. 性能基准与优化

### 18.1 性能目标

| 指标 | 目标值 | 最低要求 |
|------|--------|----------|
| 平均帧率 | ≥60 FPS | ≥50 FPS |
| 点击响应延迟 | ≤50ms | ≤100ms |
| 单词检测延迟 | ≤20ms | ≤50ms |
| 遮挡更新延迟 | ≤30ms | ≤80ms |
| 内存占用 | ≤100MB | ≤150MB |
| 首次加载时间 | ≤3s | ≤5s |

### 18.2 性能优化清单

#### 优化1: 对象池（Object Pool）

```typescript
/**
 * 卡片对象池
 * 避免频繁创建/销毁节点
 */
class CardPool {
    private pool: Node[] = [];
    private prefab: Prefab;

    constructor(prefab: Prefab, initialSize: number = 50) {
        this.prefab = prefab;

        // 预创建对象
        for (let i = 0; i < initialSize; i++) {
            const node = instantiate(this.prefab);
            node.active = false;
            this.pool.push(node);
        }
    }

    /**
     * 获取卡片节点
     */
    get(): Node {
        if (this.pool.length > 0) {
            const node = this.pool.pop()!;
            node.active = true;
            return node;
        }

        // 池耗尽，创建新对象
        return instantiate(this.prefab);
    }

    /**
     * 回收卡片节点
     */
    put(node: Node): void {
        node.active = false;
        node.removeFromParent();
        this.pool.push(node);
    }
}
```

#### 优化2: 延迟更新（Debounce）

```typescript
/**
 * 遮挡状态更新防抖
 * 避免连续点击时频繁重算
 */
class StackBoard {
    private updateTimer: number | null = null;

    requestUpdateBlockStatus(): void {
        if (this.updateTimer !== null) {
            clearTimeout(this.updateTimer);
        }

        this.updateTimer = setTimeout(() => {
            this.updateBlockStatus();
            this.updateTimer = null;
        }, 50); // 50ms延迟
    }
}
```

---

## 19. 资源规格清单

### 19.1 音效资源

| 文件名 | 格式 | 时长 | 触发时机 | 参考音调 |
|--------|------|------|----------|----------|
| `click_card.mp3` | MP3 | 0.1s | 点击卡片 | 清脆"啪"声 |
| `drop_slot.mp3` | MP3 | 0.2s | 字母落入牌槽 | 低沉"咚"声 |
| `blink_start.mp3` | MP3 | 0.3s | 检测到单词 | 提示音"叮" |
| `blink_loop.mp3` | MP3 | 0.5s（循环） | 闪烁持续期间 | 心跳声（低频） |
| `clear_word.mp3` | MP3 | 0.5s | 消除单词 | 成功音"啵" |
| `expand_slot.mp3` | MP3 | 0.3s | 牌槽扩容 | 扩张音"嘭" |
| `warning.mp3` | MP3 | 0.2s | 牌槽接近满载 | 警告音"嘟嘟" |
| `game_over.mp3` | MP3 | 1.0s | 游戏结束 | 失败音"哇哇" |
| `perfect.mp3` | MP3 | 1.5s | 100%清除率 | 胜利音"哒哒哒" |

### 19.2 粒子特效资源

| 文件名 | 格式 | 用途 | 参数 |
|--------|------|------|------|
| `star_burst.plist` | Plist | 消除时星星爆发 | 粒子数:20, 生命周期:0.5s |
| `glow_ring.plist` | Plist | 可点击卡片光圈 | 持续发光, 缩放1.0-1.2 |
| `slot_expand.plist` | Plist | 牌槽扩容特效 | 向外扩散, 金色光芒 |
| `blink_flash.plist` | Plist | 闪烁高亮效果 | 黄色闪光, 频率0.3s |

### 19.3 UI素材资源

#### 🔄 完全复用的资源（从"小试牛刀"玩法）

| 资源名称 | 位置 | 原用途 | 新玩法用途 | 说明 |
|---------|------|-------|-----------|------|
| `tile_selectable.png` | `assets/bundle/tiles/` | 可选择状态 | **可点击（无遮挡）** - 白色背景 | 零修改复用 |
| `tile_disabled.png` | `assets/bundle/tiles/` | 禁用状态 | **被遮挡** - 灰色半透明 | 零修改复用 |
| `tile_highlight.png` | `assets/bundle/tiles/` | 高亮状态 | **悬浮中（飞向牌槽）** + **在牌槽中** - 黄色光晕 | 零修改复用 |
| `tile_correct.png` | `assets/bundle/tiles/` | 正确状态 | **闪烁（检测到单词）** - 绿色（可改为黄色） | 建议调色为黄色 |
| `tile_wrong.png` | `assets/bundle/tiles/` | 错误状态 | 暂不使用（预留） | 预留 |
| `LetterTile.prefab` | `assets/resources/` | 字母瓦片预制体 | 字母卡片预制体 | 零修改复用 |
| `LetterTile.ts` | `assets/scripts/ui/` | 字母瓦片组件 | 字母卡片组件 | 添加状态映射逻辑 |
| 游戏背景 | `assets/bundle/bg/` | "小试牛刀"背景 | 堆叠游戏场景背景 | 零修改复用 |
| Button预制体 | `assets/prefabs/` | 现有按钮 | 消除/继续拼/结束按钮 | 代码设置颜色 |
| `GlossSheet.ts` | `assets/scripts/ui/` | 释义浮层组件 | 单词释义弹窗 | 零修改复用 |

**复用率统计**：
- 字母卡片相关：**100%复用**（5张贴图 + 1个预制体 + 1个组件）
- 背景与按钮：**100%复用**
- **总体资源复用率：93%**（更新后）

#### 🆕 必需新增的资源（仅1张贴图 + 1个预制体！）

> **🎯 采用方案B：独立格子拼接**
> - 优势：动态扩容极其灵活，代码简洁，仅需 1 张贴图
> - 原理：每个格子是独立节点，使用 Layout 组件自动排列
> - 字母牌直接嵌入格子内部，无需单独的填充状态
> - **SlotItem需制作成预制体**，支持动态实例化扩容

**必需的贴图资源**（已在项目中创建）：

| 文件名 | 格式 | 尺寸 | 实际位置 | 用途 | 加载方式 | 优先级 |
|--------|------|------|---------|------|---------|--------|
| `slot_item.png` | PNG | 85×85px | `assets/bundle/slot/slot_item.png` | 单个牌槽格子背景 | **Bundle远程加载** | ⭐⭐⭐ 必需 |

**必需的预制体资源**：

| 预制体名称 | 位置 | 用途 | 说明 |
|-----------|------|------|------|
| `SlotItem.prefab` | `assets/resources/` | 牌槽格子预制体 | 用于动态实例化扩容，包含slot_item.png背景和LetterSlot空节点 |

**资源加载代码示例**：
```typescript
// 在SlotQueue组件中加载牌槽贴图
import { AssetLoader } from '../core/AssetLoader';

protected async onLoad(): Promise<void> {
    // 从slot Bundle加载牌槽格子背景
    const slotBg = await AssetLoader.getInstance().loadSpriteFrame('slot', 'slot_item/spriteFrame');

    // 从resources加载预制体
    const prefab = await AssetLoader.getInstance().loadPrefab('resources', 'SlotItem');

    this.initSlots();
}
```

**设计规格详情**：
```yaml
slot_item.png:
  尺寸: 85×85px (比字母牌80×80大5px，留出视觉间隙)
  外观: 圆角矩形框
  描边: 2px，颜色 #7F8C8D (中灰色)
  背景: 透明
  圆角: 8px

说明:
  - 尺寸比 LetterTile (80×80) 大 5px
  - 字母牌嵌入时居中对齐，四周留出 2.5px 边距
  - 空格子显示描边框，有字母时字母牌覆盖在上方
```

**布局方案（方案B - 推荐）**：
```
独立格子拼接，使用 Layout 自动排列：

[A] [T] [ ] [ ] [ ] [ ] [ ]
 ↑   ↑   ↑   ↑   ↑   ↑   ↑
独立 独立 独立 独立 独立 独立 独立
格子 格子 格子 格子 格子 格子 格子

实现：
SlotQueueContainer [Layout Horizontal, spacing=5]
├── SlotItem1 [85×85, SlotItem.prefab实例]
│   ├── Frame [Sprite, slot_item.png]
│   └── LetterSlot [Node, 80×80空节点]
│       └── LetterTile [80×80, 嵌入居中] (动态addChild)
├── SlotItem2 [85×85, SlotItem.prefab实例]
│   ├── Frame [Sprite]
│   └── LetterSlot [Node]
│       └── LetterTile [80×80]
└── SlotItem3 [85×85, SlotItem.prefab实例] (空格子)
    ├── Frame [Sprite]
    └── LetterSlot [Node, 空]
```

**SlotItem.prefab 结构**：
```
SlotItem [Node, 85×85]
├── Frame [Sprite] ← slot_item.png (圆角矩形框)
│   - UITransform: 85×85
│   - Sprite: slot_item.png
│   - Color: #7F8C8D
└── LetterSlot [Node, 80×80] ← 空节点，用于嵌入LetterTile
    - UITransform: 80×80
    - Position: (0, 0) 居中对齐
    - 作用: 作为LetterTile的容器，动态addChild
```

**扩容代码示例**：
```typescript
/**
 * 扩容牌槽（方案B - 极其简洁）
 */
expandSlot(): void {
    if (this.capacity >= this.maxCapacity) return;

    // 直接实例化SlotItem预制体
    const newSlot = instantiate(this.slotItemPrefab);
    newSlot.setParent(this.itemsContainer);

    // 播放弹出动画
    newSlot.setScale(0, 0, 1);
    tween(newSlot)
        .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .start();

    this.capacity++;
    this.slotNodes.push(newSlot);

    // Layout 组件自动重新排列，无需手动计算位置
}

/**
 * 添加字母到牌槽（嵌入LetterTile）
 */
addLetterToSlot(slotIndex: number, letterTile: Node): void {
    const slotNode = this.slotNodes[slotIndex];
    const letterSlot = slotNode.getChildByName('LetterSlot');

    if (letterSlot) {
        // 将LetterTile嵌入到LetterSlot节点中
        letterTile.setParent(letterSlot);
        letterTile.setPosition(0, 0, 0);
    }
}
```

**临时替代方案**（零资源快速验证）：
```typescript
// 用纯色Sprite代替 slot_item.png
const slotItem = new Node('SlotItem');
const sprite = slotItem.addComponent(Sprite);
sprite.type = Sprite.Type.SIMPLE;
sprite.color = new Color(127, 140, 141, 255); // #7F8C8D
const transform = slotItem.getComponent(UITransform);
transform.setContentSize(85, 85);
```

**资源总数更新**：
- ✅ 字母卡片：100% 复用 `LetterTile.prefab` (5张贴图)
- 🆕 牌槽格子：仅需 1 张 `slot_item.png` (85×85px)
- 🆕 牌槽预制体：需制作 `SlotItem.prefab`（结构简单，5分钟完成）
- 🆕 装饰背景：可选（可用代码生成半透明Sprite）

**最终资源复用率：93%**（仅需新增 1 张贴图 + 1 个简单预制体）

**为何需要SlotItem预制体？**
1. ✅ 支持动态实例化扩容（`instantiate(slotItemPrefab)`）
2. ✅ 统一样式管理（所有槽位尺寸、颜色一致）
3. ✅ 便于后续迭代（如添加槽位编号、特效、状态指示）
4. ✅ 符合Cocos Creator最佳实践

---

# 第四部分：开发落地

## 20. 难度平衡与调优

### 20.1 关键配置参数表

| 参数名 | 默认值 | 可调范围 | 说明 |
|--------|--------|----------|------|
| `SLOT_INITIAL_CAPACITY` | 7 | 5-10 | 牌槽初始容量 |
| `SLOT_MAX_CAPACITY` | 15 | 12-20 | 牌槽最大容量 |
| `EXPAND_EVERY_N_WORDS` | 3 | 2-5 | 每N个单词扩容1格 |
| `LONG_WORD_BONUS_LEN` | 7 | 6-8 | 长单词奖励阈值 |
| `BLINK_COUNTDOWN` | 3000 | 2000-5000 | 闪烁倒计时（ms） |
| `BLINK_FREQUENCY` | 300 | 200-500 | 闪烁频率（ms） |
| `OVERLAP_THRESHOLD` | 0.5 | 0.3-0.7 | 遮挡判定阈值 |
| `RESCUE_TRIGGER` | 0.9 | 0.8-0.95 | 救济触发占用率 |
| `RESCUE_COOLDOWN` | 5 | 3-10 | 救济冷却（单词数） |
| `MIN_WORD_LENGTH` | 3 | 3-4 | 最短单词长度 |
| `THEORETICAL_CLEAR_RATE_MIN` | 0.80 | 0.75-0.85 | 理论最低清除率 |
| `THEORETICAL_CLEAR_RATE_MAX` | 0.95 | 0.90-0.98 | 理论最高清除率 |

### 20.2 难度曲线建议

```
内测数据目标:
- 首次体验清除率分布: 60-80%（中位数70%）
- 第5次游玩清除率分布: 75-90%（中位数82%）
- 理论最高清除率: 85-95%
- 完美通关率(100%): < 1%

调参策略:
1. 如果首次清除率中位数 < 65% → 提高初始牌槽容量至8格
2. 如果完美通关率 > 5% → 增加卡片总数至40张
3. 如果救济机制触发率 > 30% → 提高救济触发阈值至95%
4. 如果平均游戏时长 < 3分钟 → 增加闪烁倒计时至4秒
```

---

## 21. 测试用例清单

### 21.1 核心功能测试

```typescript
describe('基础消除', () => {
    it('应该正确检测并消除3字母单词CAT', () => {
        const matcher = new WordMatcher();
        const result = matcher.findWord(['C', 'A', 'T']);

        expect(result).not.toBeNull();
        expect(result.word).toBe('CAT');
        expect(result.startIdx).toBe(0);
        expect(result.endIdx).toBe(2);
    });
});

describe('最长右侧匹配', () => {
    it('应该从右侧截断找到SUN', () => {
        const matcher = new WordMatcher();
        const result = matcher.findWord(['C', 'A', 'T', 'S', 'U', 'N']);

        expect(result).not.toBeNull();
        expect(result.word).toBe('SUN');
        expect(result.startIdx).toBe(3);
        expect(result.endIdx).toBe(5);
    });
});

describe('闪烁缓冲', () => {
    it('应该允许点击"继续拼"取消闪烁', async () => {
        const game = new GameApp();
        game.addLetter('S');
        game.addLetter('U');
        game.addLetter('N');

        expect(game.isBlinking()).toBe(true);
        expect(game.getMatchedWord()).toBe('SUN');

        game.clickContinue();

        expect(game.isBlinking()).toBe(false);

        game.addLetter('N');
        game.addLetter('Y');

        expect(game.getMatchedWord()).toBe('SUNNY');
    });
});
```

### 21.2 边界测试

```typescript
describe('牌槽满载', () => {
    it('应该在牌槽满15格后禁止添加', () => {
        const slot = new SlotQueue();

        for (let i = 0; i < 15; i++) {
            slot.addLetter('A');
        }

        expect(slot.isFull()).toBe(true);
        expect(() => slot.addLetter('B')).toThrow();
    });
});

describe('遮挡判定', () => {
    it('应该正确标记被遮挡的卡片', () => {
        const board = new StackBoard();
        const upper = { layer: 1, rect: {x: 0, y: 0, width: 90, height: 120} };
        const lower = { layer: 0, rect: {x: 10, y: 10, width: 90, height: 120} };

        board.updateBlockStatus();

        expect(lower.blocked).toBe(true); // 重叠超过50%
    });
});
```

### 21.3 回归测试（固定种子）

```typescript
describe('回归测试', () => {
    it('种子20251012A应该生成35张牌的螺旋布局', () => {
        const generator = new LevelGenerator();
        const level = generator.generateDailyLevel('20251012A');

        expect(level.cards.length).toBe(35);
        expect(level.layout.id).toBe('spiral');
    });

    it('AI模拟种子20251012A应该达到85-95%清除率', () => {
        const generator = new LevelGenerator();
        const level = generator.generateDailyLevel('20251012A');
        const validation = generator.validateLevel(level);

        expect(validation.valid).toBe(true);
        expect(validation.theoreticalMax).toBeGreaterThanOrEqual(0.85);
        expect(validation.theoreticalMax).toBeLessThanOrEqual(0.95);
    });
});
```

---

## 22. 实施路线图

### 22.1 阶段划分

#### 阶段1: 核心玩法（2周）
- [ ] 堆叠布局系统（StackBoard + LetterCard）
- [ ] 遮挡判定算法（重叠面积法）
- [ ] 牌槽队列管理（SlotQueue + 扩容逻辑）
- [ ] 单词检测（增量优化版）
- [ ] 闪烁缓冲机制（状态机）
- [ ] 基础UI和音效
- [ ] 本地每日种子生成

#### 阶段2: 体验优化（1周）
- [ ] 新手引导（3个教学关卡）
- [ ] 动态难度调节（救济机制）
- [ ] 词库分级加载（核心→扩展）
- [ ] 性能优化（对象池、防抖）
- [ ] 抛光动画和音效
- [ ] 结算页和本地记录

#### 阶段3: 社交功能（1周，V0.3+）
- [ ] 服务端每日种子API
- [ ] 排行榜后端API（FastAPI）
- [ ] 防作弊验证（指纹 + 重放）
- [ ] 微信好友授权
- [ ] 分享功能
- [ ] 每周总榜

#### 阶段4: 高级功能（V0.4+）
- [ ] Trie树词库优化
- [ ] 录像回放系统
- [ ] 空间哈希遮挡优化（50+卡片）
- [ ] 虚拟化渲染
- [ ] 更多布局模板（10种）
- [ ] 道具系统

### 22.2 里程碑验收标准

#### M1: 核心玩法可玩（第2周末）
- ✅ 完成3局完整游戏流程（点击→消除→结算）
- ✅ 闪烁缓冲机制正常工作
- ✅ 遮挡判定准确率 ≥ 95%
- ✅ 单词检测延迟 ≤ 50ms
- ✅ 无阻断性bug

#### M2: 内测版本（第4周末）
- ✅ 完成新手引导
- ✅ 词库加载稳定（核心+扩展）
- ✅ 性能达标（≥50fps）
- ✅ 本地每日挑战可用
- ✅ 5个固定种子回归测试通过

#### M3: 公测版本（第6周末，V0.3）
- ✅ 排行榜系统上线
- ✅ 防作弊机制部署
- ✅ 微信分享功能
- ✅ 内测用户留存率 ≥ 40%（次日）
- ✅ 平均游戏时长 ≥ 5分钟

### 22.3 风险与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| **遮挡判定性能瓶颈** | 中 | 高 | 提前实现空间哈希优化，限制卡片数量≤40 |
| **单词检测误报** | 低 | 中 | 完善测试用例，覆盖100+单词组合 |
| **每日种子可解性验证失败率高** | 高 | 中 | 允许重试10次，降低理论清除率要求至75% |
| **微信小游戏包体超限** | 低 | 高 | 核心词库控制在50KB内，远程加载扩展词库 |
| **排行榜作弊严重** | 中 | 高 | 优先实现指纹验证，V0.4增加重放验证 |

---

## 附录A: 错误码定义

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| `E001` | 卡片不存在 | 忽略点击 |
| `E002` | 卡片被遮挡 | 显示提示"该卡片被遮挡" |
| `E003` | 牌槽已满 | 显示提示"牌槽已满，请先消除单词" |
| `E004` | 词库未加载 | 显示加载中提示 |
| `E005` | 关卡验证失败 | 重新生成关卡 |
| `E006` | 操作指纹不匹配 | 拒绝提交分数 |
| `E007` | 重放失败 | 拒绝提交分数 |
| `E008` | 游戏时长异常 | 标记为可疑，人工审核 |

---

## 附录B: 开发团队协作指南

### 代码模块分工建议

| 模块 | 难度 | 预计工时 | 前置依赖 |
|------|------|---------|---------|
| **StackBoard** | ⭐⭐⭐ | 3天 | 无 |
| **LetterCard** | ⭐⭐ | 1天 | 无 |
| **SlotQueue** | ⭐⭐ | 2天 | 无 |
| **WordMatcher** | ⭐⭐⭐ | 2天 | 词库系统 |
| **LevelGenerator** | ⭐⭐⭐⭐ | 4天 | 布局模板 |
| **TutorialManager** | ⭐⭐ | 2天 | 核心玩法完成 |
| **AntiCheat** | ⭐⭐⭐ | 2天 | 操作记录 |
| **ProgressiveDictMgr** | ⭐⭐ | 2天 | 无 |

### Git分支策略

```
main（主分支，仅合并经过测试的代码）
  ├─ dev（开发分支，日常开发）
  │   ├─ feature/stack-board（堆叠棋盘）
  │   ├─ feature/word-matcher（单词检测）
  │   ├─ feature/level-generator（关卡生成）
  │   └─ feature/tutorial（新手引导）
  └─ hotfix/（紧急修复分支）
```

### 每日站会检查点

1. 昨天完成了什么？
2. 今天计划做什么？
3. 有什么阻碍需要帮助？
4. 性能指标是否达标？（帧率、延迟）
5. 是否有新的技术风险？

---

**文档结束**

本文档提供了从概念设计到开发落地的完整方案。如有疑问，请参考对应章节或提交Issue讨论。

**快速导航**：
- 想了解核心玩法 → 第2节
- 想了解技术实现 → 第8-14节
- 想了解开发计划 → 第22节
- 想了解测试规范 → 第21节
