# Cocos Creator 卡片PNG图片处理工具

## 📋 概述

这个工具集用于**自动去除Cocos Creator卡片PNG图片的透明边缘**，解决游戏中卡片排列时产生的不必要间隙问题。

### 核心功能

- ✅ 自动检测并裁剪PNG的透明区域
- ✅ 批量处理所有卡片图片
- ✅ 自动备份原始文件
- ✅ 生成详细的处理报告
- ✅ 支持Python和Node.js两种方案

## 🔍 问题背景

### 现象
游戏中卡片排列时出现不必要的间隙。

### 根本原因
当前的5张卡片PNG存在过大的透明边缘：

| 卡片文件 | 原始尺寸 | 被裁剪掉 | 实际渲染 | 问题 |
|---------|---------|---------|---------|------|
| tile_correct.png | 512×512 | 上下左右各31px | 449×449 | 尺寸缩小6% |
| tile_highlight.png | 512×512 | 上下左右各31px | 449×449 | 尺寸缩小6% |
| tile_disabled.png | 512×512 | 上下左右各31px | 449×449 | 尺寸缩小6% |
| tile_wrong.png | 512×512 | 上下各5px | 512×502 | 尺寸不一致 |
| tile_selectable.png | 512×512 | 上下各5px | 512×502 | 尺寸不一致 |

**问题**：3张卡片被裁剪成449×449，2张保持512×502，导致渲染时尺寸不一致，产生视觉间隙。

## 🚀 快速开始

### 方案A: 使用Bash脚本（推荐）

最简单的方式，一键处理所有卡片。

#### 前提条件
- Python 3.6+ （脚本会自动检查）
- macOS / Linux / WSL（Windows需使用Git Bash）

#### 执行步骤

```bash
# 1. 进入脚本目录
cd tools/image_processing/

# 2. 执行一键处理脚本
./process_all_tiles.sh

# 脚本会自动：
# - 检查Python环境
# - 检查并安装Pillow库（如需）
# - 处理所有PNG文件
# - 生成处理报告
```

**输出示例**：
```
╔════════════════════════════════════════════════════════════╗
║           Cocos Creator 卡片PNG处理一键脚本              ║
║                  Process All Tiles v1.0                   ║
╚════════════════════════════════════════════════════════════╝

📍 卡片目录: /path/to/src/cocos/assets/bundle/tiles
✓ Python 版本: 3.11.5
✓ Pillow库已安装
✓ 卡片目录存在
✓ 找到 5 个卡片PNG文件

🚀 开始处理PNG文件...

处理: tile_correct.png
  ✓ 已备份到: .../backup/20250101_120000/tile_correct.png
  ✓ 裁剪成功
    原始尺寸: 512×512px
    裁剪后:   449×449px
    透明比例: 24.2%
    文件大小: 45.2KB → 38.1KB
...

📊 处理摘要
============================================================
总数:     5 个文件
成功:     5 ✓
失败:     0 ✗

最大裁剪后尺寸: 512×502px
备份目录:       /path/to/backup/20250101_120000
============================================================
```

### 方案B: 直接运行Python脚本

如果你只有Python环境。

```bash
# 1. 安装依赖
pip install Pillow

# 2. 运行处理脚本
python3 tools/image_processing/trim_tiles.py

# 或指定目录
python3 tools/image_processing/trim_tiles.py /path/to/tiles
```

### 方案C: 使用Node.js脚本

如果你没有Python但有Node.js。

```bash
# 1. 安装依赖
npm install sharp

# 2. 运行处理脚本
node tools/image_processing/trim_tiles.js
```

## 📊 处理结果

### 生成的文件

执行脚本后，会生成：

1. **处理后的PNG**
   - 位置：`src/cocos/assets/bundle/tiles/`
   - 所有透明边缘已去除
   - 所有卡片尺寸统一（512×502px）

2. **备份文件**
   - 位置：`tools/image_processing/backup/YYYYMMDD_HHMMSS/`
   - 原始PNG的完整备份
   - 用于回滚（如果需要）

3. **处理报告**
   - 文件：`trim_report.json`
   - 位置：`tools/image_processing/`
   - 详细的处理日志和统计数据

### 验证处理结果

```bash
# 查看处理报告
cat tools/image_processing/trim_report.json

# 检查备份是否完整
ls -lah tools/image_processing/backup/

# 对比文件大小
ls -lh src/cocos/assets/bundle/tiles/tile_*.png
```

## ⚙️ 在Cocos Creator中配置

处理完PNG后，还需要在Cocos Creator编辑器中进行配置，确保引擎不再自动裁剪。

### 步骤1: 刷新资源

1. 打开Cocos Creator
2. 打开项目 `src/cocos/`
3. 等待资源自动重新导入

或手动触发：
- 菜单 → Assets → Reimport All

### 步骤2: 修改所有卡片的trim配置

对于每张卡片PNG（tile_*.png）：

1. 在Assets面板中选中卡片PNG
2. 在Inspector面板中找到**Sprite Frame**部分
3. 修改**Trim Type**：
   - 改为：`none`（而不是`auto`）
4. 点击右上角的**保存**按钮

**修改前后对比**：
```
修改前: Trim Type: auto (自动裁剪)
修改后: Trim Type: none (不裁剪)
```

### 步骤3: 验证配置

查看meta文件确认修改生效：

```bash
cat src/cocos/assets/bundle/tiles/tile_correct.png.meta | grep -A 5 "spriteFrame"
```

应该看到：
```json
"userData": {
  "trimType": "none",  // ← 改为none
  "width": 512,
  "height": 502,
  // ...
}
```

## 🧪 测试验证

### 场景测试

1. 在Cocos Creator中打开游戏场景
2. 进入StackBoard或GameBoard的场景
3. 观察卡片排列：
   - ✅ 卡片之间无间隙
   - ✅ 所有卡片对齐紧密
   - ✅ 没有视觉缝隙

### 代码验证

检查StackBoard的布局代码是否正确：

```typescript
// src/cocos/assets/scripts/ui/StackBoard.ts
const CARD_WIDTH = 90;  // 卡片宽度
const CARD_HEIGHT = 90; // 卡片高度
const SPACING = 0;      // 卡片间距

// 获取卡片的实际宽度应该等于CARD_WIDTH
const actualWidth = card.getComponent(UITransform).contentSize.width;
console.log('卡片宽度:', actualWidth); // 应该是90
```

## 📝 常见问题

### Q: 处理后的PNG是否会失真？
**A**: 不会。我们使用PNG的无损裁剪，仅去除透明区域，保留所有有色像素。

### Q: 如何回滚到原始PNG？
**A**: 脚本会自动备份原始PNG。如果需要回滚：
```bash
# 查看备份
ls tools/image_processing/backup/

# 恢复（替换为你的备份时间戳）
cp tools/image_processing/backup/20250101_120000/*.png src/cocos/assets/bundle/tiles/
```

### Q: 为什么还要修改Cocos Creator的trim配置？
**A**: 即使PNG已处理，Cocos Creator仍可能对新导入的PNG进行自动裁剪。设置`trimType: none`可以防止引擎再次裁剪。

### Q: 多次运行脚本会怎样？
**A**: 安全。脚本每次运行都会创建新的备份目录。如果PNG已经是最小化（无透明边缘），脚本会正常完成但不会进行任何改变。

### Q: 是否会影响其他资源？
**A**: 不会。脚本仅处理`tile_*.png`文件，其他资源不受影响。

## 🔧 高级用法

### 自定义处理目录

```bash
# Python版本
python3 tools/image_processing/trim_tiles.py /custom/path/to/tiles

# Node.js版本
# 编辑trim_tiles.js，修改tilesDir变量
```

### 查看处理报告详情

```bash
# 格式化显示报告
python3 -m json.tool tools/image_processing/trim_report.json

# 或使用jq
cat tools/image_processing/trim_report.json | jq '.'

# 查看处理统计
cat tools/image_processing/trim_report.json | jq '.summary'
```

### 处理新卡片

如果设计师提供了新的卡片PNG：

```bash
# 1. 将新PNG放到 src/cocos/assets/bundle/tiles/
cp my_new_tile.png src/cocos/assets/bundle/tiles/tile_newtype.png

# 2. 重新运行脚本
./process_all_tiles.sh

# 3. 在Cocos Creator中配置新卡片的trim设置
```

## 📚 技术细节

### 裁剪算法

1. **读取PNG**：使用Pillow/sharp库读取RGBA图片
2. **检测边界**：使用`getbbox()`找到最小非透明区域
3. **裁剪**：使用`crop(bbox)`裁剪到边界
4. **保存**：使用PNG无损格式保存

### 处理流程

```
输入PNG
  ↓
读取RGBA图片
  ↓
检测透明区域边界
  ↓
提取有色像素区域
  ↓
备份原始文件
  ↓
保存处理后的PNG
  ↓
记录处理结果
  ↓
输出报告
```

## 📖 相关文档

- [Cocos Creator官方文档 - Sprite组件](https://docs.cocos.com/creator/manual/)
- [PNG图片格式规范](https://www.w3.org/TR/png/)
- [项目设计文档 - 叠叠乐布局系统](../../docs/design/dev/grid_layout_system_design.md)

## 🎯 后续优化

处理完PNG后，建议进一步优化：

1. **UI渲染优化**
   - 确认所有卡片使用相同的纹理图集（texture atlas）
   - 减少draw call次数

2. **内存优化**
   - 检查是否所有卡片共用一个Bundle
   - 考虑是否可以使用精灵图（sprite sheet）

3. **性能测试**
   - 在真实设备上测试帧率
   - 检查内存使用是否正常

## 📞 支持

如果遇到问题：

1. 查看 `trim_report.json` 中的错误信息
2. 检查备份是否完整
3. 查看Cocos Creator的Console输出是否有错误
4. 确认Python/Node.js版本是否符合要求

## 📄 许可证

这个工具集是项目内部工具，仅供w-game项目使用。

---

**最后更新**: 2025-01-01
**维护者**: Elvis
**版本**: 1.0
