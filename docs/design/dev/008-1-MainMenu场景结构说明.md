# MainMenu 场景结构说明文档

## 文档信息
- **创建日期**: 2025-10-30
- **版本**: v3.0
- **关联设计文档**: [008-游戏模式选择系统设计方案.md](./008-游戏模式选择系统设计方案.md)
- **Cocos Creator 版本**: 3.8.7

---

## 1. 场景概述

MainMenu 场景是游戏的主菜单界面，本次改造新增游戏模式选择功能。

---

## 2. 完整节点树结构（3.8.7）

```
MainMenu (Scene)
└── Canvas
    ├── Camera
    ├── Background (Sprite)
    ├── Title (Sprite)
    ├── StartButton (Button)
    └── SettingsPanel (Node)
        ├── GameModeSection (Node) 【新增整个区域】
        │   ├── SectionTitle (Label: "🎮 玩法模式")
        │   └── ToggleGroup (Node + ToggleContainer)
        │       ├── BasicModeToggleRow (Node + Layout[Horizontal])
        │       │   ├── BasicModeToggle (Node + Toggle + Sprite)
        │       │   │   └── Checkmark (Sprite)
        │       │   └── Label (Label: "小试牛刀")
        │       └── StackModeToggleRow (Node + Layout[Horizontal])
        │           ├── StackModeToggle (Node + Toggle + Sprite)
        │           │   └── Checkmark (Sprite)
        │           └── Label (Label: "叠叠乐")
        └── DictionarySection (Node) 【新增区域容器，原有 Toggle 移入】
            ├── SectionTitle (Label: "📚 词库设置")
            └── UseFullToggleRow (Node + Layout[Horizontal])
                ├── UseFullToggle (Node + Toggle + Sprite) 【原有节点，移动位置】
                │   └── Checkmark (Sprite)
                └── Label (Label: "进阶词库 (8-10字母挑战)") 【新增】
```

---

## 3. Cocos Creator 编辑器操作步骤

### 第一步：创建 GameModeSection 区域【新增】

#### 1.1 创建区域容器

1. 在「层级管理器」中选中 `SettingsPanel` 节点
2. 右键 → 创建 → 创建空节点
3. 重命名为 `GameModeSection`
4. 在「属性检查器」中添加 `UITransform` 组件
   - Content Size: Width = `400`, Height = `150`

#### 1.2 创建区域标题

1. 选中 `GameModeSection`
2. 右键 → 创建 → 创建 UI 节点 → Label
3. 重命名为 `SectionTitle`
4. 在「属性检查器」中配置 `Label` 组件：
   - String: `🎮 玩法模式`
   - Font Size: `24`
   - Color: 白色
   - Horizontal Align: `Left`

---

### 第二步：创建 ToggleGroup 容器【新增】

1. 选中 `GameModeSection`
2. 右键 → 创建 → 创建空节点
3. 重命名为 `ToggleGroup`
4. 在「属性检查器」中点击「添加组件」
5. 选择 `UI/ToggleContainer`
6. 在 `ToggleContainer` 组件中设置：
   - **Allow Switch Off**: `false`（取消勾选，确保始终有一个被选中）

---

### 第三步：创建 BasicModeToggleRow（小试牛刀）【新增】

#### 3.1 创建行容器

1. 选中 `ToggleGroup`
2. 右键 → 创建 → 创建空节点
3. 重命名为 `BasicModeToggleRow`
4. 添加组件 `Layout`：
   - Type: `HORIZONTAL`
   - Spacing X: `10`
   - Resize Mode: `NONE`
5. 添加组件 `UITransform`：
   - Content Size: Width = `350`, Height = `40`

#### 3.2 创建 BasicModeToggle（Toggle 本体）

1. 选中 `BasicModeToggleRow`
2. 右键 → 创建 → 创建空节点
3. **重命名为 `BasicModeToggle`**（严格匹配，大小写敏感）
4. 添加组件 `UITransform`：
   - Content Size: Width = `40`, Height = `40`
5. 添加组件 `Sprite`：
   - Sprite Frame: 选择背景图（可以先用默认白色）
   - Type: `SLICED`
   - Color: 设置背景颜色
6. 添加组件 `Toggle`：
   - **Is Checked**: `true`（勾选，默认选中）
   - Check Mark: 暂时留空，稍后绑定

#### 3.3 创建 Checkmark（选中标记）

1. 选中 `BasicModeToggle`
2. 右键 → 创建 → 创建 UI 节点 → Sprite
3. 重命名为 `Checkmark`
4. 在「属性检查器」中配置：
   - UITransform: Width = `24`, Height = `24`
   - Sprite: 选择勾选图标（如 `toggle_checkmark`）
5. **回到 `BasicModeToggle` 节点**
6. 在 `Toggle` 组件中，将 `Checkmark` 节点**拖拽**到 `Check Mark` 属性框

#### 3.4 创建 Label（文字说明）

1. 选中 `BasicModeToggleRow`（注意：是行容器，不是 Toggle 节点）
2. 右键 → 创建 → 创建 UI 节点 → Label
3. 保持名称为 `Label`
4. 在「属性检查器」中配置：
   - String: `小试牛刀`
   - Font Size: `20`
   - Color: 白色
   - Horizontal Align: `LEFT`
   - Vertical Align: `CENTER`

---

### 第四步：创建 StackModeToggleRow（叠叠乐）【新增】

#### 4.1 快速创建（复制）

1. 选中 `BasicModeToggleRow` 节点
2. Ctrl+D (Windows) 或 Cmd+D (Mac) 复制
3. 重命名为 `StackModeToggleRow`

#### 4.2 修改子节点

1. 展开 `StackModeToggleRow`
2. 选中子节点 `BasicModeToggle`
3. **重命名为 `StackModeToggle`**（严格匹配）
4. 在 `Toggle` 组件中：
   - **Is Checked**: `false`（取消勾选）
5. 选中子节点 `Label`
6. 在 `Label` 组件中：
   - String: `叠叠乐`

---

### 第五步：调整 DictionarySection 区域【新增容器 + 调整原有节点】

#### 5.1 创建 DictionarySection 容器【新增】

1. 选中 `SettingsPanel`
2. 右键 → 创建 → 创建空节点
3. 重命名为 `DictionarySection`
4. 添加 `UITransform` 组件：Content Size = `400 × 100`

#### 5.2 创建区域标题【新增】

1. 选中 `DictionarySection`
2. 右键 → 创建 → 创建 UI 节点 → Label
3. 重命名为 `SectionTitle`
4. 配置 `Label` 组件：
   - String: `📚 词库设置`
   - Font Size: `24`

#### 5.3 创建 UseFullToggleRow 容器【新增】

1. 选中 `DictionarySection`
2. 右键 → 创建 → 创建空节点
3. 重命名为 `UseFullToggleRow`
4. 添加组件 `Layout`：Type = `HORIZONTAL`, Spacing X = `10`
5. 添加组件 `UITransform`：Content Size = `350 × 40`

#### 5.4 移动原有 UseFullToggle【修改位置】

1. 在「层级管理器」中找到原来的 `UseFullToggle` 节点（在 `SettingsPanel` 下）
2. **拖拽**到 `UseFullToggleRow` 节点下，成为其子节点
3. 确认 `UseFullToggle` 已经有 `Checkmark` 子节点，如果没有则按照 3.3 的步骤创建

#### 5.5 为 UseFullToggle 添加 Label【新增】

1. 选中 `UseFullToggleRow`（注意：是行容器）
2. 右键 → 创建 → 创建 UI 节点 → Label
3. 保持名称为 `Label`
4. 配置 `Label` 组件：
   - String: `进阶词库 (8-10字母挑战)`
   - Font Size: `20`

---

### 第六步：绑定脚本属性【修改】

1. 在「层级管理器」中选中 `Canvas` 节点
2. 在「属性检查器」中找到 `MainMenu` 组件
3. 绑定以下属性（将节点拖拽到对应属性框）：

#### 新增属性绑定：
- **Game Mode Toggle Container**: 拖拽 `ToggleGroup` 节点
- **Basic Mode Toggle**: 拖拽 `BasicModeToggle` 节点（注意：是 Toggle 节点本身，不是 Row）
- **Stack Mode Toggle**: 拖拽 `StackModeToggle` 节点

#### 确认原有属性：
- Start Button: `StartButton`
- Use Full Toggle: `UseFullToggle`
- Title Sprite: `Title`
- Settings Panel: `SettingsPanel`
- Background Sprite: `Background`

---

### 第七步：保存场景

1. Ctrl+S (Windows) 或 Cmd+S (Mac) 保存场景
2. 等待编译完成
3. 检查 Console 是否有错误

---

## 4. 关键注意事项

### 4.1 为什么 Toggle 不能直接加 Label 子节点？

在 Cocos Creator 3.8.7 中，`Toggle` 组件只识别 `Check Mark` 属性指定的 Sprite 作为选中标记。如果在 Toggle 节点下直接添加 Label，会导致：
- Label 被 Toggle 的交互逻辑影响
- 布局混乱
- 无法正确响应点击事件

**正确做法**：创建一个容器节点（Row），用 `Layout[Horizontal]` 将 Toggle 和 Label 横向排列。

### 4.2 节点命名严格要求

MainMenu.ts 根据节点名称判断选中的模式：

```typescript
if (toggleName === 'BasicModeToggle') {
    this.selectedGameMode = GameMode.BASIC;
} else if (toggleName === 'StackModeToggle') {
    this.selectedGameMode = GameMode.STACK;
}
```

**必须确保节点名称完全匹配**（大小写敏感）：
- `BasicModeToggle`
- `StackModeToggle`

### 4.3 ToggleContainer 自动分组

3.8.7 中，`ToggleContainer` 会自动将**所有一级子节点中的 Toggle 组件**加入互斥组。因此：
- Toggle 必须是 `ToggleGroup` 的**孙子节点**（通过 Row 容器间接包含）
- 设置 `Allow Switch Off = false` 确保始终有一个被选中

### 4.4 Checkmark 必须绑定

如果忘记将 `Checkmark` 节点拖拽到 Toggle 的 `Check Mark` 属性，选中状态将不可见。

---

## 5. 验证清单

### 编辑器内检查

- [ ] `ToggleGroup` 有 `ToggleContainer` 组件，`Allow Switch Off = false`
- [ ] `BasicModeToggleRow` 和 `StackModeToggleRow` 是 `ToggleGroup` 的子节点
- [ ] `BasicModeToggle` 的 `Is Checked = true`
- [ ] 每个 Toggle 的 `Check Mark` 属性已绑定 `Checkmark` 节点
- [ ] 每个 Row 容器都有 `Layout[Horizontal]` 组件
- [ ] 节点名称严格匹配：`BasicModeToggle`、`StackModeToggle`
- [ ] Canvas 的 `MainMenu` 组件所有属性已绑定

### 运行时验证

1. 点击预览按钮
2. 观察 Console 日志：`[MainMenu] 已加载设置 - 游戏模式: basic`
3. 点击「叠叠乐」，观察「小试牛刀」是否自动取消
4. 点击「开始游戏」，验证场景跳转是否正确

---

## 6. 常见问题

| 问题 | 原因 | 解决方法 |
|------|------|---------|
| Toggle 不互斥 | Row 容器不是 ToggleGroup 的子节点 | 检查层级结构 |
| Checkmark 不显示 | Check Mark 属性未绑定 | 将 Checkmark 拖到 Check Mark 属性 |
| Label 位置错误 | Label 放在 Toggle 下而不是 Row 下 | 移动 Label 到 Row 容器 |
| 场景跳转失败 | 节点名称不匹配 | 确保名称为 BasicModeToggle/StackModeToggle |
| Console 报错 | 脚本属性未绑定或绑定错误 | 检查 Canvas 的 MainMenu 组件 |

---

## 7. 总结

本次改造的核心结构：

**Row 容器（Layout[Horizontal]）包含：**
1. **Toggle 节点**（Toggle + Sprite）
   - 子节点：Checkmark（Sprite）
2. **Label 节点**（Label）

通过 `Layout[Horizontal]` 将 Toggle 和 Label 横向排列，实现"选择框 + 文字说明"的效果。

**分组机制**：父节点 `ToggleContainer` 自动管理所有子孙节点中的 Toggle 组件，实现互斥单选。
