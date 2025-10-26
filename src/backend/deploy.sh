#!/bin/bash

set -e

# ====================================
# W-Game 后端一键部署脚本
# ====================================
# 此脚本自动化以下操作：
# 1. 检查前置条件（Docker、Nginx、OpenSSL）
# 2. 验证配置参数（Gemini API Key、域名、服务器 IP）
# 3. 生成 API 签名密钥
# 4. 创建 .env 环境变量文件
# 5. 启动 Docker 服务（FastAPI + Redis）
# 6. 配置 Nginx IP 白名单和请求头验证
# 7. 设置 Cloudflare IP 自动更新定时任务
# 8. 验证所有服务运行正常
#
# 使用方法：./deploy.sh

echo ""
echo "======================================"
echo "🚀 W-Game 后端一键部署脚本 v1.0"
echo "======================================"
echo ""

# ====================================
# 第 1 部分：前置条件检查
# ====================================

echo "📋 [1/9] 前置条件检查..."
echo ""

# 检查操作系统
OS_TYPE=$(uname -s)
if [[ "$OS_TYPE" != "Linux" && "$OS_TYPE" != "Darwin" ]]; then
    echo "❌ 错误：仅支持 Linux 和 macOS，当前系统: $OS_TYPE"
    exit 1
fi
echo "  ✅ 操作系统: $OS_TYPE"

# 检查是否以 root 身份运行（Linux）
if [[ "$OS_TYPE" == "Linux" && "$EUID" -ne 0 ]]; then
    echo "❌ 错误：此脚本需要 root 权限，请使用 sudo 运行"
    exit 1
fi

# 检查必要工具
echo "  检查必要工具..."
MISSING_TOOLS=()
for cmd in docker docker-compose nginx openssl curl; do
    if ! command -v $cmd &> /dev/null; then
        MISSING_TOOLS+=($cmd)
    else
        echo "    ✅ $cmd"
    fi
done

if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
    echo ""
    echo "❌ 错误：缺少以下工具: ${MISSING_TOOLS[@]}"
    echo ""
    echo "请按以下步骤安装："
    if [[ "$OS_TYPE" == "Linux" ]]; then
        echo "  # Ubuntu/Debian"
        echo "  sudo apt update && sudo apt install -y docker.io docker-compose nginx curl"
        echo "  sudo systemctl start docker"
        echo "  sudo systemctl enable docker"
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        echo "  # macOS (使用 Homebrew)"
        echo "  brew install docker docker-compose nginx"
        echo "  brew services start docker"
    fi
    echo ""
    exit 1
fi

# 检查 Docker 守护进程
if ! docker ps &>/dev/null; then
    echo ""
    echo "❌ 错误：Docker 守护进程未运行"
    echo "   请运行: sudo systemctl start docker"
    exit 1
fi
echo "  ✅ Docker 守护进程运行正常"

# 检查 Nginx 是否已安装
if ! command -v nginx &>/dev/null; then
    echo ""
    echo "❌ 错误：Nginx 未安装"
    exit 1
fi
echo "  ✅ Nginx 已安装"

# 检查必要文件
echo "  检查必要文件..."
REQUIRED_FILES=(
    "Dockerfile"
    "docker-compose.yml"
    "requirements.txt"
    "word_validator.py"
    "middleware/cloudflare_verify.py"
    "middleware/signature_verify.py"
    "nginx/word-validator.conf"
    "nginx/update-cloudflare-ips.sh"
)

MISSING_FILES=()
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        MISSING_FILES+=($file)
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo ""
    echo "❌ 错误：缺少以下文件: ${MISSING_FILES[@]}"
    echo "   请确保在 src/backend 目录下运行此脚本"
    exit 1
fi
echo "  ✅ 所有必要文件已存在"
echo ""

# ====================================
# 第 2 部分：获取和验证配置参数
# ====================================

echo "⚙️  [2/9] 配置部署参数（交互式引导）..."
echo ""

# -------- 1. Gemini API Key --------
echo "【1/3】Gemini API Key 配置"
echo "  📖 用途：用来调用 Google Gemini API 验证单词"
echo "  📌 获取步骤："
echo "     1. 浏览器访问: https://aistudio.google.com/app/apikey"
echo "     2. 用 Google 账号登录"
echo "     3. 点击 'Create API key' 按钮"
echo "     4. 复制生成的密钥（以 AIza 开头）"
echo ""

while true; do
    read -p "  请粘贴你的 Gemini API Key: " GEMINI_API_KEY

    if [ -z "$GEMINI_API_KEY" ]; then
        echo "    ❌ API Key 不能为空，请重新输入"
        continue
    fi

    if [ ${#GEMINI_API_KEY} -lt 10 ]; then
        echo "    ❌ API Key 过短，请检查是否完整"
        continue
    fi

    echo "    ✅ API Key 已保存: ${GEMINI_API_KEY:0:10}***"
    break
done

echo ""

# -------- 2. 后端服务地址 --------
echo "【2/2】后端服务地址配置"
echo "  📖 用途：Cloudflare Worker 转发请求到此地址"
echo "  📌 格式说明："
echo "     • 域名:端口 (如: elvis1949.top:9100)"
echo "     • Nginx 将监听此端口接收 Worker 转发的请求"
echo ""

while true; do
    read -p "  请输入后端服务地址 (如: elvis1949.top:9100): " BACKEND_ADDR

    if [ -z "$BACKEND_ADDR" ]; then
        echo "    ❌ 地址不能为空"
        continue
    fi

    # 检查是否包含冒号和端口
    if [[ ! $BACKEND_ADDR =~ ^[a-zA-Z0-9.-]+:[0-9]+$ ]]; then
        echo "    ❌ 格式不对（需要 域名:端口，如 elvis1949.top:9100）"
        continue
    fi

    # 提取域名和端口
    BACKEND_DOMAIN="${BACKEND_ADDR%:*}"
    BACKEND_PORT="${BACKEND_ADDR##*:}"

    # 验证端口号范围
    if [ "$BACKEND_PORT" -lt 1 ] || [ "$BACKEND_PORT" -gt 65535 ]; then
        echo "    ❌ 端口号无效（应该在 1-65535 之间）"
        continue
    fi

    echo "    ✅ 后端服务地址已保存: $BACKEND_ADDR"
    break
done

echo ""
echo "======================================"
echo "✅ 所有参数已配置完成！"
echo "======================================"
echo ""
echo "📋 配置摘要："
echo "   • Gemini API Key: ${GEMINI_API_KEY:0:15}***"
echo "   • 后端服务地址: $BACKEND_ADDR"
echo ""

# ====================================
# 第 3 部分：生成密钥和环境变量
# ====================================

echo "🔑 [3/9] 生成 API 签名密钥..."

API_SECRET_KEY=$(openssl rand -hex 32)
echo "    ✅ 已生成密钥: ${API_SECRET_KEY:0:16}..."
echo ""

echo "📝 [4/9] 创建环境变量文件..."

# 检查 .env 是否已存在
if [ -f ".env" ]; then
    echo "    ⚠️  .env 文件已存在，将被覆盖"
    read -p "    继续? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "    ❌ 部署已取消"
        exit 1
    fi
fi

cat > .env <<EOF
# Gemini API 配置
GEMINI_API_KEY=$GEMINI_API_KEY

# Redis 配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0

# API 安全配置
API_SECRET_KEY=$API_SECRET_KEY
API_RATE_LIMIT=15
GLOBAL_RATE_LIMIT=2000

# CORS 配置
ALLOWED_ORIGINS=https://$DOMAIN

# 日志配置
LOG_LEVEL=INFO

# 服务端口
PORT=8000
EOF

# 设置 .env 文件权限（保护敏感信息）
chmod 600 .env

echo "    ✅ .env 文件已创建 (权限: 600)"
echo "    ✅ API 签名密钥已保存"
echo ""

# ====================================
# 第 5 部分：启动 Docker 服务
# ====================================

echo "🐳 [5/9] 启动 Docker 容器..."

# 检查是否已有运行的容器
if docker ps | grep -q "w-game-word-validator"; then
    echo "    ⚠️  FastAPI 容器已在运行，将重启..."
    docker-compose restart
else
    echo "    启动容器中..."
    docker-compose up -d
fi

# 等待容器启动
echo "    等待服务启动..."
sleep 10

# 检查容器状态
if ! docker-compose ps | grep -q "w-game-word-validator.*Up"; then
    echo "    ❌ FastAPI 容器启动失败"
    echo "    调试信息："
    docker-compose logs word-validator
    exit 1
fi

if ! docker-compose ps | grep -q "w-game-redis.*Up"; then
    echo "    ❌ Redis 容器启动失败"
    exit 1
fi

echo "    ✅ FastAPI 容器已启动"
echo "    ✅ Redis 容器已启动"
echo ""

# ====================================
# 第 6 部分：配置 Nginx
# ====================================

echo "⚙️  [6/9] 配置 Nginx..."

# 备份原配置
if [ -f "/etc/nginx/sites-available/word-validator.conf" ]; then
    echo "    备份已有配置..."
    cp /etc/nginx/sites-available/word-validator.conf /etc/nginx/sites-available/word-validator.conf.bak
fi

# 替换后端地址和端口
sed -i "s/your-backend-domain.com/$BACKEND_DOMAIN/g" nginx/word-validator.conf
sed -i "s/8000/$BACKEND_PORT/g" nginx/word-validator.conf

# 复制配置文件
cp nginx/word-validator.conf /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/word-validator.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试配置
if ! nginx -t &>/dev/null; then
    echo "    ❌ Nginx 配置验证失败"
    echo "    恢复备份配置..."
    if [ -f "/etc/nginx/sites-available/word-validator.conf.bak" ]; then
        cp /etc/nginx/sites-available/word-validator.conf.bak /etc/nginx/sites-available/word-validator.conf
    fi
    exit 1
fi

# 重载 Nginx
systemctl reload nginx

echo "    ✅ Nginx 已配置: $BACKEND_ADDR"
echo ""

# ====================================
# 第 7 部分：配置 Cloudflare IP 自动更新
# ====================================

echo "🌍 [7/9] 配置 Cloudflare IP 自动更新..."

cp nginx/update-cloudflare-ips.sh /usr/local/bin/
chmod +x /usr/local/bin/update-cloudflare-ips.sh

echo "    首次更新 IP 列表..."
/usr/local/bin/update-cloudflare-ips.sh

# 配置定时任务
CRON_JOB="0 3 * * 0 /usr/local/bin/update-cloudflare-ips.sh >> /var/log/cloudflare-ip-update.log 2>&1"
CRON_EXISTS=$(crontab -l 2>/dev/null | grep -c "update-cloudflare-ips.sh" || true)

if [ $CRON_EXISTS -eq 0 ]; then
    (crontab -l 2>/dev/null || echo ""; echo "$CRON_JOB") | crontab -
    echo "    ✅ 定时任务已配置 (每周日 3:00 自动更新)"
else
    echo "    ⚠️  定时任务已存在，跳过配置"
fi

echo ""

# ====================================
# 第 8 部分：验证服务
# ====================================

echo "✔️  [8/9] 验证服务..."

echo "    检查后端健康状态..."
sleep 3

if curl -s http://localhost:8000/health | grep -q "ok"; then
    echo "    ✅ 后端服务运行正常"
else
    echo "    ❌ 后端服务未响应"
    echo "    调试信息："
    docker-compose logs word-validator | tail -20
    exit 1
fi

echo "    检查 Nginx..."
if curl -s http://localhost/health &>/dev/null; then
    echo "    ✅ Nginx 代理正常"
else
    echo "    ⚠️  Nginx 代理可能有问题，请手动检查"
fi

echo ""

# ====================================
# 第 9 部分：输出部署结果
# ====================================

echo "======================================"
echo "✅ 部署完成！"
echo "======================================"
echo ""

# 保存配置信息到文件
DEPLOY_INFO="deployment_info_$(date +%s).txt"
cat > "$DEPLOY_INFO" <<EOF
=== W-Game 后端部署信息 ===
部署时间: $(date)

【网络配置】
后端服务地址: $BACKEND_ADDR
Nginx 配置: /etc/nginx/sites-available/word-validator.conf
Nginx 监听端口: $BACKEND_PORT

【服务信息】
FastAPI 容器: w-game-word-validator (http://localhost:8000)
Redis 容器: w-game-redis (localhost:6379)
环境变量文件: .env

【安全配置】
API 签名密钥: $API_SECRET_KEY
Cloudflare IP 更新脚本: /usr/local/bin/update-cloudflare-ips.sh
Cloudflare IP 更新日志: /var/log/cloudflare-ip-update.log
定时任务: 每周日 3:00 自动更新 Cloudflare IP 白名单

【三层防护】
第一层 - Nginx IP 白名单: 仅允许 Cloudflare IP 访问 9100 端口
第二层 - Cloudflare 请求头验证: 验证 CF-Connecting-IP 和 CF-RAY
第三层 - FastAPI 签名验证: 验证 HMAC-SHA256 签名和时间戳

【后续操作】
1. Cloudflare Worker 配置：
   - 已有 Worker 脚本路由 /w-game-service -> $BACKEND_ADDR
   - 无需额外配置，Worker 会转发所有请求头

2. 客户端配置：
   - 编辑 src/cocos/assets/scripts/services/NetworkService.ts
   - 设置: BASE_URL = 'https://你的Cloudflare域名/w-game-service'
   - 客户端会从 /api/config 动态获取签名密钥

3. 验证部署：
   - 本地测试: curl http://localhost:$BACKEND_PORT/health
   - 通过 Worker 测试: curl https://你的CF域名/w-game-service/health
   - 预期返回: {"status": "ok", ...}

【查看日志】
- FastAPI: docker-compose logs -f word-validator
- Nginx: tail -f /var/log/nginx/word-validator-access.log
- IP更新: tail -f /var/log/cloudflare-ip-update.log

【常用命令】
- 重启服务: docker-compose restart
- 停止服务: docker-compose down
- 查看状态: docker-compose ps
- 手动更新 CF IP: /usr/local/bin/update-cloudflare-ips.sh
EOF

echo "📋 配置信息已保存到: $DEPLOY_INFO"
echo ""
echo "🔑 API 签名密钥 (已保存到 .env):"
echo "   $API_SECRET_KEY"
echo ""
echo "⚠️  【重要】接下来请在 Cloudflare Dashboard 完成以下配置："
echo ""
echo "   1️⃣  进入 https://dash.cloudflare.com"
echo ""
echo "   2️⃣  添加站点（如未添加）:"
echo "       - 输入域名: $DOMAIN"
echo "       - 选择免费计划"
echo ""
echo "   3️⃣  配置 DNS:"
echo "       - 进入 DNS 标签页"
echo "       - 创建 A 记录:"
echo "         * 名称: $DOMAIN"
echo "         * 类型: A"
echo "         * 内容: $SERVER_IP"
echo "         * TTL: Auto"
echo "         * 代理状态: 已代理 (⚠️ 必须选择橙色云)"
echo ""
echo "   4️⃣  配置 SSL/TLS:"
echo "       - 进入 SSL/TLS 标签页"
echo "       - Encryption mode 选择: Flexible"
echo ""
echo "   5️⃣  等待 DNS 生效 (5-10 分钟)，验证:"
echo "       nslookup $DOMAIN"
echo "       # 应返回 Cloudflare IP (104.16.x.x)"
echo ""
echo "   6️⃣  更新客户端代码:"
echo "       编辑: src/cocos/assets/scripts/services/NetworkService.ts"
echo "       修改: BASE_URL = 'https://$DOMAIN'"
echo ""
echo "======================================"
echo ""
