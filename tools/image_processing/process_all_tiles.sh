#!/bin/bash

# 一键执行卡片PNG处理脚本
# Cocos Creator 卡片图片透明边缘自动裁剪

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║           Cocos Creator 卡片PNG处理一键脚本              ║"
echo "║                  Process All Tiles v1.0                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TILES_DIR="$SCRIPT_DIR/../../src/cocos/assets/bundle/tiles"

echo "📍 卡片目录: $TILES_DIR"
echo ""

# 检查Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到Python 3"
    echo "请先安装Python 3: https://www.python.org/downloads/"
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Python 版本: $PYTHON_VERSION"

# 检查Pillow库
echo ""
echo "📦 检查Python依赖..."
if ! python3 -c "import PIL" 2>/dev/null; then
    echo "⚠️  Pillow库未安装，正在安装..."
    python3 -m pip install --upgrade pip > /dev/null 2>&1
    python3 -m pip install Pillow > /dev/null 2>&1
    if python3 -c "import PIL" 2>/dev/null; then
        echo "✓ Pillow库安装成功"
    else
        echo "❌ Pillow库安装失败，请手动运行: pip install Pillow"
        exit 1
    fi
else
    echo "✓ Pillow库已安装"
fi

# 检查卡片目录
echo ""
if [ ! -d "$TILES_DIR" ]; then
    echo "❌ 错误: 卡片目录不存在"
    echo "预期路径: $TILES_DIR"
    exit 1
fi

echo "✓ 卡片目录存在"

# 检查PNG文件
PNG_COUNT=$(find "$TILES_DIR" -name "tile_*.png" | wc -l)
if [ "$PNG_COUNT" -eq 0 ]; then
    echo "❌ 错误: 未找到PNG文件"
    exit 1
fi

echo "✓ 找到 $PNG_COUNT 个卡片PNG文件"

# 执行Python脚本
echo ""
echo "🚀 开始处理PNG文件..."
echo ""

python3 "$SCRIPT_DIR/trim_tiles.py" "$TILES_DIR"

RESULT=$?

echo ""
if [ $RESULT -eq 0 ]; then
    echo "✅ PNG处理完成！"
    echo ""
    echo "📋 后续步骤:"
    echo "  1. 在Cocos Creator中打开该项目"
    echo "  2. 等待资源重新导入完成"
    echo "  3. 在Inspector中检查所有卡片的trimType是否为'none'"
    echo "  4. 在游戏场景中测试卡片排列，验证间隙已消失"
else
    echo "❌ PNG处理失败"
    exit 1
fi
