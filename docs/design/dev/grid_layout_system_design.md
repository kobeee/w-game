# 网格布局系统设计方案

> **文档版本**: v1.0
> **创建日期**: 2025-01-16
> **适用玩法**: 字母叠叠乐 (Stack Word Mode)
> **设计目标**: 解决字母卡片堆叠渲染混乱问题,实现配置化、可预测的网格布局系统

---

## 📚 目录

1. [问题背景与动机](#1-问题背景与动机)
2. [核心设计思想](#2-核心设计思想)
3. [网格坐标系统](#3-网格坐标系统)
4. [严格偏移约束规则](#4-严格偏移约束规则)
5. [JSON配置格式规范](#5-json配置格式规范)
6. [坐标转换算法](#6-坐标转换算法)
7. [十字区域遮挡判定](#7-十字区域遮挡判定)
8. [系统架构设计](#8-系统架构设计)
9. [布局生成器设计](#9-布局生成器设计)
10. [配置文件示例](#10-配置文件示例)
11. [实施路线图](#11-实施路线图)

---

## 1. 问题背景与动机

### 1.1 现有问题

当前的 `LayerBasedLayoutGenerator` 和 `SmartLayoutGenerator` 存在以下问题:

1. **视觉混乱**: 运行时实时生成布局导致卡片位置不可预测,视觉上杂乱无章
2. **遮挡关系复杂**: 十字区域遮挡判定虽然准确,但布局生成时没有充分利用这一规则
3. **调试困难**: 无法直观预览布局效果,只能运行后才能看到结果
4. **难以优化**: 无法针对特定布局进行微调和优化

### 1.2 参考案例

**Cocos论坛案例**: [羊了个羊遮挡算法](https://forum.cocos.org/t/topic/141131)
- 使用网格化布局,每个卡片对齐到网格单元
- 预先计算遮挡关系,避免运行时复杂计算

**matchjong开源项目**: [GitHub链接](https://github.com/yiding-he/matchjong)
- 使用JSON配置文件定义布局
- 支持多种布局模板
- 清晰的坐标系统和偏移规则

### 1.3 解决方案概述

**核心策略**: 从"运行时生成"转变为"配置驱动渲染"

```
旧模式: 运行时计算位置 → 实时遮挡判定 → 渲染
新模式: 预定义配置 → 坐标转换 → 遮挡判定 → 渲染
```

**优势**:
- ✅ 布局可预测、可复现
- ✅ 可视化编辑(未来可开发编辑器工具)
- ✅ 方便调试和优化
- ✅ 降低运行时计算开销

---

## 2. 核心设计思想

### 2.1 "十字区域 + 网格对齐"双重原则

本设计方案建立在两个核心原则之上:

#### 原则1: 4象限遮挡判定 (已实现) ✅

当前 `BlockDetector.ts` 已实现的4象限法:

```
卡片以中心点为原点，用横线+竖线划分为4个象限:
      ┌─────────┬─────────┐
      │         │         │
      │    2    │    1    │  象限2(左上)  象限1(右上)
      │  (左上)  │  (右上)  │  45×45px     45×45px
(0,0) ├─────────┼─────────┤  ← 中心点（横线+竖线）
      │    3    │    4    │  象限3(左下)  象限4(右下)
      │  (左下)  │  (右下)  │  45×45px     45×45px
      │         │         │
      └─────────┴─────────┘

规则: 只要任意一个象限被上层卡片遮挡（任意重叠），整个卡片就不可点击！
```

**关键特性**:
- 每个象限尺寸 = 45px × 45px（卡片的1/4）
- 遮挡判定：任意象限与上层卡片有重叠即算遮挡
- 只有4个象限全部可见，卡片才可点击

#### 原则2: 网格对齐 + 严格偏移约束 (本方案核心)

为了让布局**充分利用**十字区域判定规则,我们引入网格系统:

```
网格单元尺寸 = 卡片宽度 = 90px

允许的偏移量:
- ±45px (半卡偏移, 对应十字区域的LEFT/RIGHT/TOP/BOTTOM)
- 0px   (无偏移, 完全对齐网格)
```

**设计理念**:
> 通过将卡片位置限制在"网格基准 + 严格偏移"的模式下,
> 确保遮挡关系始终符合十字区域判定规则,
> 从而实现**可预测的遮挡效果**。

### 2.2 配置驱动架构

```
┌─────────────────┐
│  JSON配置文件   │  ← 人工设计或工具生成
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ GridLayoutLoader│  ← 加载并解析配置
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ CoordinateMapper│  ← 网格坐标 → 世界坐标
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  BlockDetector  │  ← 遮挡判定(已有)
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   StackBoard    │  ← 渲染卡片
└─────────────────┘
```

---

## 3. 网格坐标系统

### 3.1 网格规格

| 参数 | 数值 | 说明 |
|------|------|------|
| **网格单元尺寸** | 90px × 90px | 等于 `CARD_WIDTH` 常量 |
| **推荐网格范围** | 7×7 (49格) | 覆盖470×470px区域,与现有GameBoard一致 |
| **坐标原点** | (0, 0) | 网格左下角(Cocos坐标系) |
| **索引范围** | row: 0-6, col: 0-6 | 共49个网格单元 |

### 3.2 网格坐标定义

```typescript
interface GridCoordinate {
    row: number;    // 行索引 (0-6, 从下往上)
    col: number;    // 列索引 (0-6, 从左往右)
}
```

**网格编号示例** (7×7网格):

```
行索引(Y轴向上)
6  [ 42][ 43][ 44][ 45][ 46][ 47][ 48]
5  [ 35][ 36][ 37][ 38][ 39][ 40][ 41]
4  [ 28][ 29][ 30][ 31][ 32][ 33][ 34]
3  [ 21][ 22][ 23][ 24][ 25][ 26][ 27]
2  [ 14][ 15][ 16][ 17][ 18][ 19][ 20]
1  [  7][  8][  9][ 10][ 11][ 12][ 13]
0  [  0][  1][  2][  3][  4][  5][  6]
    0    1    2    3    4    5    6    列索引(X轴向右)

中心格子: (row:3, col:3) → 编号24
```

### 3.3 坐标系对比

| 坐标系类型 | 原点位置 | X轴方向 | Y轴方向 | 用途 |
|-----------|---------|---------|---------|------|
| **网格坐标** | 左下角(0,0) | 向右递增 | 向上递增 | 配置文件中使用 |
| **世界坐标** | 屏幕中心(0,0) | 向右为正 | 向上为正 | Cocos节点坐标 |

---

## 4. 严格偏移约束规则

### 4.1 允许的偏移值

**基本原则**: 偏移量只能是 45px 的整数倍（网格单元90px的1/2）

```typescript
enum AllowedOffset {
    HALF_LEFT = -45,    // 向左/下偏移半卡
    ZERO = 0,           // 完全对齐网格
    HALF_RIGHT = 45,    // 向右/上偏移半卡
}

// 允许的X轴偏移: -45, 0, 45
// 允许的Y轴偏移: -45, 0, 45
```

**设计理由**:
- 网格单元 = 90px（硬性要求）
- 十字区域 = 卡片的1/2 = 45px
- 偏移量只能是90px的1/2、1/4...但**必须保持坐标的整数性和可预测性**
- 为了简化系统，**只允许±45px（半卡偏移）**

### 4.2 偏移的物理意义

| 偏移量 | 物理含义 | 对应十字区域 | 遮挡效果 |
|--------|----------|--------------|----------|
| **offsetX = 45** | 向右偏移半卡 | LEFT区域暴露 | 上层卡需覆盖LEFT区域才能遮挡 |
| **offsetX = -45** | 向左偏移半卡 | RIGHT区域暴露 | 上层卡需覆盖RIGHT区域才能遮挡 |
| **offsetY = 45** | 向上偏移半卡 | BOTTOM区域暴露 | 上层卡需覆盖BOTTOM区域才能遮挡 |
| **offsetY = -45** | 向下偏移半卡 | TOP区域暴露 | 上层卡需覆盖TOP区域才能遮挡 |
| **offset = 0** | 无偏移，完全对齐网格 | 四个十字区域均匀分布 | 标准遮挡判定 |

### 4.3 组合偏移示例

```
示例1: 网格(3,3) + 偏移(0, 0)
→ 完全对齐网格,四个十字区域均匀分布

示例2: 网格(3,3) + 偏移(45, 0)
→ 向右偏移半卡,LEFT区域完全暴露,RIGHT区域完全隐藏

示例3: 网格(3,3) + 偏移(0, 45)
→ 向上偏移半卡,BOTTOM区域暴露,TOP区域隐藏

示例4: 网格(3,3) + 偏移(-45, 45)
→ 向左上偏移,形成对角线效果
```

### 4.4 偏移约束验证

```typescript
function validateOffset(offset: Vec2): boolean {
    const allowedValues = [-45, 0, 45];
    return allowedValues.includes(offset.x) && allowedValues.includes(offset.y);
}
```

---

## 5. JSON配置格式规范

### 5.1 配置文件结构

```typescript
interface LayoutConfig {
    layoutName: string;       // 布局名称 (如 "pyramid_easy")
    gridSize: {
        rows: number;         // 网格行数 (建议7)
        cols: number;         // 网格列数 (建议7)
    };
    cards: CardConfig[];      // 卡片配置数组
}

interface CardConfig {
    layer: number;            // 层级 (0为最底层)
    gridRow: number;          // 网格行索引 (0-6)
    gridCol: number;          // 网格列索引 (0-6)
    offset: {
        x: number;            // X轴偏移 (必须是 -45, 0, 45)
        y: number;            // Y轴偏移 (必须是 -45, 0, 45)
    };
    letter?: string;          // 可选:预定义字母(用于测试)
}
```

### 5.2 配置文件示例 (简化版)

```json
{
    "layoutName": "pyramid_basic",
    "gridSize": {
        "rows": 7,
        "cols": 7
    },
    "cards": [
        // 底层 (layer 0): 5×5网格,完全对齐
        {"layer": 0, "gridRow": 1, "gridCol": 1, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 1, "gridCol": 2, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 1, "gridCol": 3, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 1, "gridCol": 4, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 1, "gridCol": 5, "offset": {"x": 0, "y": 0}},

        {"layer": 0, "gridRow": 2, "gridCol": 1, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 2, "gridCol": 2, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 2, "gridCol": 3, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 2, "gridCol": 4, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 2, "gridCol": 5, "offset": {"x": 0, "y": 0}},

        // ... 更多底层卡片

        // 第1层 (layer 1): 部分卡片偏移半卡
        {"layer": 1, "gridRow": 2, "gridCol": 2, "offset": {"x": 45, "y": 0}},
        {"layer": 1, "gridRow": 2, "gridCol": 3, "offset": {"x": 0, "y": 45}},
        {"layer": 1, "gridRow": 2, "gridCol": 4, "offset": {"x": -45, "y": 0}},

        // 第2层 (layer 2): 顶层卡片
        {"layer": 2, "gridRow": 3, "gridCol": 3, "offset": {"x": 0, "y": 0}}
    ]
}
```

### 5.3 配置验证规则

加载配置文件时必须验证:

1. **网格索引合法性**: `0 <= gridRow < rows`, `0 <= gridCol < cols`
2. **偏移值合法性**: `offset.x` 和 `offset.y` 必须在 `[-45, 0, 45]` 范围内（仅允许三个值）
3. **层级连续性**: 层级编号从0开始,不允许跳层
4. **同层无重叠**: 同一层的卡片,转换为世界坐标后不能完全重叠(允许部分重叠)

```typescript
function validateLayoutConfig(config: LayoutConfig): ValidationResult {
    const errors: string[] = [];

    for (const card of config.cards) {
        // 验证网格索引
        if (card.gridRow < 0 || card.gridRow >= config.gridSize.rows) {
            errors.push(`Invalid gridRow: ${card.gridRow}`);
        }

        // 验证偏移值
        if (!validateOffset(new Vec2(card.offset.x, card.offset.y))) {
            errors.push(`Invalid offset: (${card.offset.x}, ${card.offset.y})`);
        }

        // 验证层级
        if (card.layer < 0) {
            errors.push(`Invalid layer: ${card.layer}`);
        }
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
}
```

---

## 6. 坐标转换算法

### 6.1 核心转换公式

**网格坐标 → 世界坐标**:

```typescript
function gridToWorld(
    gridRow: number,
    gridCol: number,
    offset: Vec2,
    gridSize: { rows: number; cols: number }
): Vec3 {
    const GRID_UNIT = 90; // 网格单元尺寸

    // 计算网格中心在世界坐标系中的位置
    const centerRow = (gridSize.rows - 1) / 2;  // 3 (对于7×7网格)
    const centerCol = (gridSize.cols - 1) / 2;  // 3

    // 计算相对中心的偏移量(网格单位)
    const rowOffsetFromCenter = gridRow - centerRow;
    const colOffsetFromCenter = gridCol - centerCol;

    // 转换为世界坐标(像素单位)
    const worldX = colOffsetFromCenter * GRID_UNIT + offset.x;
    const worldY = rowOffsetFromCenter * GRID_UNIT + offset.y;

    return new Vec3(worldX, worldY, 0);
}
```

### 6.2 转换示例

**案例1**: 7×7网格,中心格子无偏移

```
输入:
- gridRow: 3, gridCol: 3
- offset: (0, 0)
- gridSize: {rows: 7, cols: 7}

计算过程:
- centerRow = 3, centerCol = 3
- rowOffsetFromCenter = 3 - 3 = 0
- colOffsetFromCenter = 3 - 3 = 0
- worldX = 0 * 90 + 0 = 0
- worldY = 0 * 90 + 0 = 0

输出: (0, 0, 0)  ← 世界坐标系中心
```

**案例2**: 左下角格子

```
输入:
- gridRow: 0, gridCol: 0
- offset: (0, 0)

计算过程:
- rowOffsetFromCenter = 0 - 3 = -3
- colOffsetFromCenter = 0 - 3 = -3
- worldX = -3 * 90 + 0 = -270
- worldY = -3 * 90 + 0 = -270

输出: (-270, -270, 0)
```

**案例3**: 中心格子向右偏移半卡

```
输入:
- gridRow: 3, gridCol: 3
- offset: (45, 0)

计算过程:
- rowOffsetFromCenter = 0
- colOffsetFromCenter = 0
- worldX = 0 * 90 + 45 = 45
- worldY = 0 * 90 + 0 = 0

输出: (45, 0, 0)  ← 向右偏移半卡
```

### 6.3 Z轴坐标计算

```typescript
function calculateZIndex(layer: number): number {
    const Z_STEP = 10; // 每层间隔10单位
    return layer * Z_STEP;
}

// 示例:
// layer 0 → z = 0
// layer 1 → z = 10
// layer 2 → z = 20
```

---

## 7. 十字区域遮挡判定

### 7.1 复用现有算法

本方案**完全复用** `BlockDetector.ts` 中已实现的十字区域遮挡判定算法,无需修改。

**现有算法核心逻辑**:

```typescript
// 已有代码 (BlockDetector.ts)
static isCardBlocked(card: Card, upperCards: Card[]): boolean {
    for (const direction of [
        CrossDirection.TOP,
        CrossDirection.BOTTOM,
        CrossDirection.LEFT,
        CrossDirection.RIGHT
    ]) {
        const crossRegion = this.getCrossRegion(card, direction);
        let isThisDirectionBlocked = false;

        for (const upperCard of upperCards) {
            if (this.isCrossRegionBlocked(crossRegion, upperCard)) {
                isThisDirectionBlocked = true;
                break;
            }
        }

        // 只要有一个十字区域未被遮挡,卡片就可点击
        if (!isThisDirectionBlocked) {
            return false;
        }
    }

    return true; // 所有十字区域都被遮挡
}
```

### 7.2 网格系统与遮挡判定的协同

**关键洞察**:

```
通过严格的偏移约束(仅允许-45/0/45),我们确保:
1. 卡片的位置始终对齐到90px网格或45px半偏移
2. 遮挡判定时,卡片边界也对齐到90px或45px
3. 因此遮挡关系是"离散化"的,不会出现"遮挡99%但判定为未遮挡"的边界情况
```

**示例**:

```
底层卡片A: 网格(3,3) + 偏移(45, 0)
→ 世界坐标(45, 0)
→ 卡片矩形: (0, -45) 宽90 高90
→ LEFT十字区域: 被暴露（因为向右偏移）
→ RIGHT十字区域: 被隐藏

上层卡片B: 网格(3,3) + 偏移(0, 0)
→ 世界坐标(0, 0)
→ 卡片矩形: (-45, -45) 宽90 高90

判定:
- A的LEFT区域是否被B的矩形覆盖?
- B的矩形范围: X[−45, 45], Y[−45, 45]
- A的LEFT十字区域范围: X[0, 45], Y[−45, 45]
- 判定结果: 是 (LEFT区域完全在B矩形内)
- 结论: A的LEFT方向被遮挡

继续检查A的其他十字区域...
```

### 7.3 遮挡判定的优化建议 (未来)

虽然现有算法已足够准确,但在网格系统下可以进一步优化:

```typescript
// 优化方案: 预计算遮挡表
class OcclusionTable {
    // key: "layer_row_col_offsetX_offsetY"
    // value: 被哪些上层卡片遮挡
    private table: Map<string, Set<string>>;

    constructor(config: LayoutConfig) {
        this.table = new Map();
        this.precomputeOcclusions(config);
    }

    private precomputeOcclusions(config: LayoutConfig) {
        // 遍历所有卡片,计算遮挡关系
        // 结果存储在table中,运行时直接查表
    }

    isBlocked(card: CardConfig): boolean {
        const key = this.getKey(card);
        return this.table.has(key);
    }
}
```

**优势**:
- 配置文件加载时一次性计算,运行时O(1)查询
- 适用于固定布局(如每日挑战关卡)

---

## 8. 系统架构设计

### 8.1 核心类职责划分

```
┌─────────────────────────────────────────────────────┐
│              StackGameApp.ts                        │
│  ┌─────────────────────────────────────────┐       │
│  │  1. 加载关卡配置 (JSON)                 │       │
│  │  2. 调用 GridLayoutLoader 解析配置      │       │
│  │  3. 将 Level 数据传递给 StackBoard       │       │
│  └─────────────────────────────────────────┘       │
└─────────────────┬───────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────┐
│         GridLayoutLoader.ts (新增)                  │
│  ┌─────────────────────────────────────────┐       │
│  │  - loadLayout(jsonPath): LayoutConfig   │       │
│  │  - validateConfig(config): boolean      │       │
│  │  - configToLevel(config): Level         │       │
│  └─────────────────────────────────────────┘       │
└─────────────────┬───────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────┐
│       CoordinateMapper.ts (新增)                    │
│  ┌─────────────────────────────────────────┐       │
│  │  - gridToWorld(row, col, offset): Vec3  │       │
│  │  - worldToGrid(worldPos): GridCoord     │       │
│  │  - calculateZIndex(layer): number       │       │
│  └─────────────────────────────────────────┘       │
└─────────────────┬───────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────┐
│             StackBoard.ts (修改)                    │
│  ┌─────────────────────────────────────────┐       │
│  │  - init(level: Level): void             │       │
│  │  - spawnCards(cards: Card[]): void      │       │
│  │  - setCardPosition(card, worldPos)      │       │
│  └─────────────────────────────────────────┘       │
└─────────────────┬───────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────┐
│          BlockDetector.ts (保持不变)                │
│  ┌─────────────────────────────────────────┐       │
│  │  - isCardBlocked(card, upperCards)      │       │
│  │  - getCrossRegion(card, direction)      │       │
│  │  - updateAllBlockStatus(cards)          │       │
│  └─────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

### 8.2 数据流转

```
[JSON配置文件]
    ↓ resources.load()
[LayoutConfig对象]
    ↓ GridLayoutLoader.configToLevel()
[Level对象]
    ↓ StackBoard.init()
[Card实例数组]
    ↓ CoordinateMapper.gridToWorld()
[节点位置设置]
    ↓ BlockDetector.updateAllBlockStatus()
[可点击状态更新]
    ↓
[渲染完成]
```

### 8.3 类型定义汇总

```typescript
// ========== 配置相关类型 ==========
interface LayoutConfig {
    layoutName: string;
    gridSize: {
        rows: number;
        cols: number;
    };
    cards: CardConfig[];
}

interface CardConfig {
    layer: number;
    gridRow: number;
    gridCol: number;
    offset: {
        x: number;
        y: number;
    };
    letter?: string;
}

// ========== 网格坐标类型 ==========
interface GridCoordinate {
    row: number;
    col: number;
}

// ========== 运行时类型 (已有) ==========
// 复用现有的 Level, Card, Rect 等类型定义
```

---

## 9. 布局生成器设计

### 9.1 生成器分类

虽然运行时使用配置文件,但我们仍需要**工具**来生成配置文件:

| 生成器类型 | 输入 | 输出 | 用途 |
|-----------|------|------|------|
| **TemplateGenerator** | 布局模板名称 | LayoutConfig JSON | 生成金字塔、螺旋等预设布局 |
| **RandomGenerator** | 难度参数 | LayoutConfig JSON | 生成随机布局(用于每日挑战) |
| **VisualEditor** | 可视化拖拽 | LayoutConfig JSON | 手动设计布局(未来工具) |

### 9.2 模板生成器实现思路

```typescript
class TemplateGenerator {
    /**
     * 生成金字塔布局
     * @param layers 层数 (3-5)
     * @returns LayoutConfig
     */
    static generatePyramid(layers: number): LayoutConfig {
        const config: LayoutConfig = {
            layoutName: `pyramid_${layers}layers`,
            gridSize: { rows: 7, cols: 7 },
            cards: []
        };

        // 底层: 5×5 网格,完全对齐
        for (let row = 1; row <= 5; row++) {
            for (let col = 1; col <= 5; col++) {
                config.cards.push({
                    layer: 0,
                    gridRow: row,
                    gridCol: col,
                    offset: { x: 0, y: 0 }
                });
            }
        }

        // 第1层: 3×3 网格,偏移半卡
        const offsetsLayer1 = [
            { x: 45, y: 0 },
            { x: 0, y: 45 },
            { x: -45, y: 0 },
            { x: 0, y: -45 }
        ];

        let offsetIndex = 0;
        for (let row = 2; row <= 4; row++) {
            for (let col = 2; col <= 4; col++) {
                config.cards.push({
                    layer: 1,
                    gridRow: row,
                    gridCol: col,
                    offset: offsetsLayer1[offsetIndex % 4]
                });
                offsetIndex++;
            }
        }

        // 顶层: 中心一张卡
        if (layers >= 3) {
            config.cards.push({
                layer: 2,
                gridRow: 3,
                gridCol: 3,
                offset: { x: 0, y: 0 }
            });
        }

        return config;
    }

    /**
     * 生成螺旋布局
     */
    static generateSpiral(layers: number): LayoutConfig {
        // 从中心开始,螺旋向外扩展
        // 使用偏移量制造"错位"效果
        // ...
    }
}
```

### 9.3 随机生成器约束

```typescript
class RandomGenerator {
    static generateRandomLayout(
        totalCards: number,
        layers: number,
        seed: string
    ): LayoutConfig {
        const rng = new SeededRandom(seed);
        const config: LayoutConfig = {
            layoutName: `random_${seed}`,
            gridSize: { rows: 7, cols: 7 },
            cards: []
        };

        // 约束1: 底层至少占50%卡片
        const layer0Count = Math.ceil(totalCards * 0.5);

        // 约束2: 每层卡片数递减
        const layerDistribution = this.distributeCards(
            totalCards,
            layers,
            [0.5, 0.3, 0.2] // 底层:中层:顶层比例
        );

        // 约束3: 底层优先填充中心区域
        const layer0Positions = this.generateCenterBiasedPositions(
            layer0Count,
            rng
        );

        for (const pos of layer0Positions) {
            config.cards.push({
                layer: 0,
                gridRow: pos.row,
                gridCol: pos.col,
                offset: this.randomOffset(rng) // 随机选择允许的偏移值
            });
        }

        // 生成上层...

        return config;
    }

    private static randomOffset(rng: SeededRandom): { x: number; y: number } {
        const offsets = [-45, 0, 45];  // 仅允许三个值
        return {
            x: offsets[rng.nextInt(0, offsets.length - 1)],
            y: offsets[rng.nextInt(0, offsets.length - 1)]
        };
    }
}
```

---

## 10. 配置文件示例

### 10.1 简单测试布局 (3层共9张卡)

**文件路径**: `assets/resources/layouts/test_simple.json`

```json
{
    "layoutName": "test_simple",
    "gridSize": {
        "rows": 7,
        "cols": 7
    },
    "cards": [
        {
            "layer": 0,
            "gridRow": 3,
            "gridCol": 2,
            "offset": {"x": 0, "y": 0},
            "letter": "C"
        },
        {
            "layer": 0,
            "gridRow": 3,
            "gridCol": 3,
            "offset": {"x": 0, "y": 0},
            "letter": "A"
        },
        {
            "layer": 0,
            "gridRow": 3,
            "gridCol": 4,
            "offset": {"x": 0, "y": 0},
            "letter": "T"
        },
        {
            "layer": 1,
            "gridRow": 3,
            "gridCol": 2,
            "offset": {"x": 45, "y": 0},
            "letter": "D"
        },
        {
            "layer": 1,
            "gridRow": 3,
            "gridCol": 3,
            "offset": {"x": 0, "y": 45},
            "letter": "O"
        },
        {
            "layer": 1,
            "gridRow": 3,
            "gridCol": 4,
            "offset": {"x": -45, "y": 0},
            "letter": "G"
        },
        {
            "layer": 2,
            "gridRow": 3,
            "gridCol": 3,
            "offset": {"x": 45, "y": 0},
            "letter": "X"
        },
        {
            "layer": 2,
            "gridRow": 3,
            "gridCol": 3,
            "offset": {"x": -45, "y": 0},
            "letter": "Y"
        },
        {
            "layer": 2,
            "gridRow": 3,
            "gridCol": 3,
            "offset": {"x": 0, "y": 0},
            "letter": "Z"
        }
    ]
}
```

**预期效果**:
- 底层: C-A-T 水平排列,可拼出单词 "CAT"
- 第1层: D(右偏移), O(上偏移), G(左偏移) 遮挡部分底层卡片
- 顶层: X, Y, Z 三张卡片围绕中心,形成"品"字形

### 10.2 金字塔布局 (3层共35张卡)

**文件路径**: `assets/resources/layouts/pyramid_medium.json`

```json
{
    "layoutName": "pyramid_medium",
    "gridSize": {
        "rows": 7,
        "cols": 7
    },
    "cards": [
        // 底层: 5×5 = 25张
        {"layer": 0, "gridRow": 1, "gridCol": 1, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 1, "gridCol": 2, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 1, "gridCol": 3, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 1, "gridCol": 4, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 1, "gridCol": 5, "offset": {"x": 0, "y": 0}},

        {"layer": 0, "gridRow": 2, "gridCol": 1, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 2, "gridCol": 2, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 2, "gridCol": 3, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 2, "gridCol": 4, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 2, "gridCol": 5, "offset": {"x": 0, "y": 0}},

        {"layer": 0, "gridRow": 3, "gridCol": 1, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 3, "gridCol": 2, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 3, "gridCol": 3, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 3, "gridCol": 4, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 3, "gridCol": 5, "offset": {"x": 0, "y": 0}},

        {"layer": 0, "gridRow": 4, "gridCol": 1, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 4, "gridCol": 2, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 4, "gridCol": 3, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 4, "gridCol": 4, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 4, "gridCol": 5, "offset": {"x": 0, "y": 0}},

        {"layer": 0, "gridRow": 5, "gridCol": 1, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 5, "gridCol": 2, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 5, "gridCol": 3, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 5, "gridCol": 4, "offset": {"x": 0, "y": 0}},
        {"layer": 0, "gridRow": 5, "gridCol": 5, "offset": {"x": 0, "y": 0}},

        // 第1层: 3×3 = 9张,带偏移
        {"layer": 1, "gridRow": 2, "gridCol": 2, "offset": {"x": 45, "y": 0}},
        {"layer": 1, "gridRow": 2, "gridCol": 3, "offset": {"x": 0, "y": 45}},
        {"layer": 1, "gridRow": 2, "gridCol": 4, "offset": {"x": -45, "y": 0}},

        {"layer": 1, "gridRow": 3, "gridCol": 2, "offset": {"x": 0, "y": -45}},
        {"layer": 1, "gridRow": 3, "gridCol": 3, "offset": {"x": 45, "y": 45}},
        {"layer": 1, "gridRow": 3, "gridCol": 4, "offset": {"x": -45, "y": 45}},

        {"layer": 1, "gridRow": 4, "gridCol": 2, "offset": {"x": 45, "y": -45}},
        {"layer": 1, "gridRow": 4, "gridCol": 3, "offset": {"x": -45, "y": -45}},
        {"layer": 1, "gridRow": 4, "gridCol": 4, "offset": {"x": 0, "y": 0}},

        // 顶层: 1张,中心无偏移
        {"layer": 2, "gridRow": 3, "gridCol": 3, "offset": {"x": 0, "y": 0}}
    ]
}
```

---

## 11. 实施路线图

### 11.1 第一阶段: 核心基础设施 (优先级: 🔴 极高)

#### 任务1: 定义数据结构
- [ ] 创建 `StackTypes.ts`,定义 `LayoutConfig`, `CardConfig`, `GridCoordinate` 接口
- [ ] 添加偏移值常量 `AllowedOffset` 枚举
- [ ] 编写配置验证函数 `validateLayoutConfig()`

**验收标准**:
- TypeScript 编译无错误
- 单元测试覆盖所有验证规则

---

#### 任务2: 实现坐标转换器
- [ ] 创建 `CoordinateMapper.ts`
- [ ] 实现 `gridToWorld()` 方法
- [ ] 实现 `calculateZIndex()` 方法
- [ ] (可选) 实现 `worldToGrid()` 反向转换

**验收标准**:
- 单元测试验证转换公式正确性
- 测试用例覆盖边界情况(左下角、右上角、中心等)

**测试用例示例**:
```typescript
describe('CoordinateMapper', () => {
    it('中心格子无偏移应返回(0,0,0)', () => {
        const result = CoordinateMapper.gridToWorld(
            3, 3, new Vec2(0, 0), { rows: 7, cols: 7 }
        );
        expect(result).toEqual(new Vec3(0, 0, 0));
    });

    it('左下角格子应返回(-270,-270,0)', () => {
        const result = CoordinateMapper.gridToWorld(
            0, 0, new Vec2(0, 0), { rows: 7, cols: 7 }
        );
        expect(result).toEqual(new Vec3(-270, -270, 0));
    });
});
```

---

#### 任务3: 实现配置加载器
- [ ] 创建 `GridLayoutLoader.ts`
- [ ] 实现 `loadLayout(jsonPath: string): Promise<LayoutConfig>`
- [ ] 实现 `configToLevel(config: LayoutConfig, words: string[]): Level`
- [ ] 集成配置验证逻辑

**验收标准**:
- 能成功加载JSON文件
- 加载后自动验证配置合法性
- 非法配置抛出明确的错误信息

---

### 11.2 第二阶段: 集成现有系统 (优先级: 🟠 高)

#### 任务4: 修改 StackBoard
- [ ] 修改 `StackBoard.init(level: Level)` 方法
- [ ] 调用 `CoordinateMapper` 设置卡片位置
- [ ] 调用 `BlockDetector.updateAllBlockStatus()` 更新遮挡状态
- [ ] 移除对旧的 `LayerBasedLayoutGenerator` 的依赖

**验收标准**:
- 加载测试配置文件后,卡片位置正确
- 遮挡判定正确(顶层卡片高亮,被遮挡卡片半透明)

---

#### 任务5: 修改 StackGameApp
- [ ] 在 `startGame()` 中调用 `GridLayoutLoader.loadLayout()`
- [ ] 将加载的 `Level` 传递给 `StackBoard.init()`
- [ ] 添加错误处理(配置文件不存在、格式错误等)

**验收标准**:
- 能成功启动游戏并渲染配置文件中的布局
- 错误场景有友好的提示信息

---

### 11.3 第三阶段: 布局生成工具 (优先级: 🟡 中)

#### 任务6: 实现模板生成器
- [ ] 创建 `TemplateGenerator.ts`
- [ ] 实现 `generatePyramid(layers: number): LayoutConfig`
- [ ] 实现 `generateSpiral(layers: number): LayoutConfig`
- [ ] 生成5种预设布局的JSON文件

**验收标准**:
- 生成的JSON文件通过 `validateLayoutConfig()` 验证
- 在游戏中加载生成的布局,视觉效果符合预期

---

#### 任务7: 实现随机生成器
- [ ] 创建 `RandomGenerator.ts`
- [ ] 实现基于种子的随机生成算法
- [ ] 添加难度参数控制(总卡片数、层数、偏移频率)

**验收标准**:
- 相同种子生成相同布局(可复现性)
- 不同种子生成不同但合法的布局

---

### 11.4 第四阶段: 优化与工具 (优先级: 🟢 低)

#### 任务8: 可视化编辑器 (未来)
- [ ] 创建独立的Cocos场景 `LayoutEditor.scene`
- [ ] 实现拖拽放置卡片
- [ ] 实时预览遮挡关系
- [ ] 导出为JSON配置文件

---

#### 任务9: 性能优化
- [ ] 实现遮挡关系预计算表 `OcclusionTable`
- [ ] 缓存 `gridToWorld()` 转换结果
- [ ] 优化配置文件加载(使用AssetManager缓存)

---

### 11.5 里程碑时间线

| 阶段 | 预计耗时 | 关键产出 |
|------|---------|----------|
| **阶段1: 核心基础** | 2-3天 | `CoordinateMapper`, `GridLayoutLoader` |
| **阶段2: 系统集成** | 1-2天 | 修改后的 `StackBoard`, `StackGameApp` |
| **阶段3: 生成工具** | 2-3天 | `TemplateGenerator`, 5种预设布局 |
| **阶段4: 优化工具** | 按需 | 可视化编辑器, 性能优化 |

**总计**: 约 5-8 天完成核心功能(阶段1-3)

---

## 12. 附录

### 12.1 配置文件目录结构

```
assets/resources/layouts/
├── test/
│   ├── test_simple.json        (9张卡,用于单元测试)
│   └── test_occlusion.json     (遮挡判定测试)
├── templates/
│   ├── pyramid_easy.json       (3层,35张卡)
│   ├── pyramid_medium.json     (4层,50张卡)
│   ├── spiral_medium.json      (螺旋布局)
│   ├── ring_medium.json        (环形布局)
│   └── wave_medium.json        (波浪布局)
└── daily/
    ├── 2025-01-16.json         (每日挑战关卡)
    ├── 2025-01-17.json
    └── ...
```

### 12.2 关键常量定义

```typescript
// ========== 网格系统常量 ==========
export const GRID_UNIT = 90;              // 网格单元尺寸 (px)
export const DEFAULT_GRID_SIZE = 7;       // 默认网格大小 (7×7)

// ========== 偏移值常量 ==========
export const OFFSET_ZERO = 0;             // 无偏移
export const OFFSET_HALF = 45;            // 1/2卡偏移

export const ALLOWED_OFFSETS = [
    -OFFSET_HALF,
    OFFSET_ZERO,
    OFFSET_HALF
];

// ========== Z轴常量 ==========
export const Z_STEP = 10;                 // 层级间Z轴间隔
```

### 12.3 错误码定义

```typescript
enum LayoutError {
    INVALID_GRID_INDEX = 'E001',      // 网格索引越界
    INVALID_OFFSET = 'E002',          // 偏移值不合法
    INVALID_LAYER = 'E003',           // 层级编号错误
    FILE_NOT_FOUND = 'E004',          // 配置文件不存在
    JSON_PARSE_ERROR = 'E005',        // JSON格式错误
    VALIDATION_FAILED = 'E006',       // 配置验证失败
}
```

### 12.4 参考资料

1. **Cocos论坛**: [羊了个羊遮挡算法讨论](https://forum.cocos.org/t/topic/141131)
2. **GitHub项目**: [matchjong - 麻将消除游戏](https://github.com/yiding-he/matchjong)
3. **十字区域遮挡原理**: 现有 `BlockDetector.ts` 实现
4. **网格坐标系统**: 参考现有 `GameBoard.ts` 的纯数学定位法

---

## 13. 总结

### 13.1 核心优势

1. **可预测性**: 布局效果完全由配置文件决定,运行结果可复现
2. **可调试性**: 配置文件可读性强,便于手动调整和优化
3. **可扩展性**: 通过生成工具可快速创建新布局
4. **性能优化**: 运行时计算量减少,可预计算遮挡关系
5. **设计友好**: 未来可开发可视化编辑器,降低设计门槛

### 13.2 与现有系统的兼容性

- **完全复用** `BlockDetector.ts` 的十字区域遮挡判定
- **完全复用** `StackBoard.ts` 的卡片渲染逻辑
- **完全复用** 现有的 `Level`, `Card` 数据结构
- **仅新增** 配置加载和坐标转换逻辑,不影响现有代码

### 13.3 后续优化方向

1. **可视化编辑器**: 拖拽式布局设计工具
2. **布局验证器**: 检测是否存在"无解"布局
3. **难度评估器**: 自动评估布局难度等级
4. **遮挡关系可视化**: 调试工具,高亮显示遮挡区域
5. **布局库扩展**: 收集社区优秀布局,建立布局库

---

**文档结束**

如有疑问或需要补充,请随时反馈。
