#!/bin/bash
# tools/deploy-assets.sh
# 推送 remote 资源到 GitHub Pages 仓库
# 
# 新增功能：支持 ZIP 预下载方案
# 1. 先生成 remote.zip
# 2. 将 ZIP 文件和 remote 目录一起上传

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/../src/cocos/build/wechatgame"
REMOTE_DIR="$BUILD_DIR/remote"
ZIP_FILE="$BUILD_DIR/remote.zip"
GITHUB_REPO="https://github.com/kobeee/w-game-assets.git"
BRANCH="main"

echo ""
echo "========================================"
echo "   W-Game 资源部署脚本 v2.0"
echo "   支持 ZIP 预下载方案"
echo "========================================"
echo ""

# 检查 remote 目录是否存在
if [ ! -d "$REMOTE_DIR" ]; then
    echo "❌ remote 目录不存在: $REMOTE_DIR"
    echo "请先在 Cocos Creator 中构建微信小游戏"
    exit 1
fi

# Step 1: 生成 ZIP 文件
echo "📦 Step 1: 生成 ZIP 文件..."
cd "$SCRIPT_DIR"

# 检查 node_modules 是否存在
if [ ! -d "node_modules" ]; then
    echo "⚠️ 未找到 node_modules，正在安装依赖..."
    npm install
fi

node build-zip.js

# 检查 ZIP 文件是否生成成功
if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ ZIP 文件生成失败"
    exit 1
fi

echo ""
echo "✅ ZIP 文件生成成功: $ZIP_FILE"

# Step 2: 复制 ZIP 文件到 remote 目录（这样可以一起上传）
echo ""
echo "📦 Step 2: 复制 ZIP 文件到 remote 目录..."
cp "$ZIP_FILE" "$REMOTE_DIR/remote.zip"
echo "✅ 已复制 remote.zip 到 $REMOTE_DIR/"

# Step 3: 推送到 GitHub
echo ""
echo "📦 Step 3: 推送到 GitHub..."
cd "$REMOTE_DIR"

# 检查是否已经是 git 仓库
if [ -d ".git" ]; then
    echo "📦 已存在 Git 仓库，执行增量更新..."
    git add -A
    if git status --short | grep -q .; then
        git commit -m "Update assets + ZIP $(date '+%Y-%m-%d %H:%M')"
        git push "$GITHUB_REPO" "$BRANCH"
        echo "✅ 已推送更新"
    else
        echo "✅ 没有新变更"
    fi
else
    echo "🚀 首次初始化，推送整个目录..."
    git init -b "$BRANCH"
    git add -A
    git commit -m "Initial assets + ZIP $(date '+%Y-%m-%d %H:%M')"
    git remote add origin "$GITHUB_REPO"
    git push -u "$GITHUB_REPO" "$BRANCH"
    echo "✅ 已创建新仓库并推送"
fi

echo ""
echo "========================================"
echo "   部署完成！"
echo "========================================"
echo ""
echo "资源访问地址:"
echo "  ZIP: https://ai.elvis1949.cloudns.pro/w-game-remote/remote.zip"
echo "  目录: https://ai.elvis1949.cloudns.pro/w-game-remote/"
echo ""
echo "🎉 完成!"
