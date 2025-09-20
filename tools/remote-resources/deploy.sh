#!/bin/bash
# W-Game 简单Docker部署脚本

set -e

echo "🐳 W-Game 资源服务器部署"
echo "========================"

# 检查Docker
if ! docker --version >/dev/null 2>&1; then
    echo "❌ Docker 未安装或无法访问，请先安装Docker"
    exit 1
fi

# 检查Docker Compose
if docker-compose --version >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
elif docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    echo "❌ Docker Compose 未安装，请先安装"
    exit 1
fi

echo "✅ Docker 检查通过"

# 创建目录
mkdir -p remote/{bg,ui,audio}
mkdir -p logs

# 生成简单配置
if [ ! -f .env ]; then
    cat > .env << EOF
FLASK_ENV=production
DEBUG=true
SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || echo "w-game-$(date +%s)")
RATE_LIMIT_PER_IP=60
CACHE_MAX_AGE=604800
EOF
    echo "✅ 配置文件已生成"
fi

# 生成简化的Flask应用
cat > server.py << 'EOF'
#!/usr/bin/env python3
"""
W-Game 简单资源服务器
"""

import os
import time
from pathlib import Path
from collections import defaultdict

from flask import Flask, send_file, request, jsonify, abort
from flask_cors import CORS

# 配置
ASSETS_DIR = '/app/remote'
RATE_LIMIT = int(os.getenv('RATE_LIMIT_PER_IP', '60'))
CACHE_MAX_AGE = int(os.getenv('CACHE_MAX_AGE', '604800'))
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'

# 微信小游戏允许的来源
ALLOWED_REFERERS = [
    'https://servicewechat.com',  # 微信小游戏标准格式: https://servicewechat.com/{appid}/{version}/page-frame.html
    'http://localhost',           # 本地测试
    'http://127.0.0.1',          # 本地测试
    ''                           # 空Referer (开发者工具可能为空)
]

# 简单的访问频率限制
ip_access_log = defaultdict(list)

def check_rate_limit(ip):
    now = time.time()
    cutoff = now - 60
    
    # 清理过期记录
    ip_logs = ip_access_log[ip]
    ip_logs[:] = [log for log in ip_logs if log > cutoff]
    
    if len(ip_logs) >= RATE_LIMIT:
        return False
        
    ip_logs.append(now)
    return True

def create_app():
    app = Flask(__name__)
    CORS(app, origins=ALLOWED_REFERERS)
    
    # 配置日志
    import logging
    if not DEBUG:
        app.logger.setLevel(logging.INFO)
    else:
        app.logger.setLevel(logging.DEBUG)
    
    remote_dir = Path(ASSETS_DIR)
    remote_dir.mkdir(parents=True, exist_ok=True)
    
    @app.before_request
    def security_check():
        ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
        referer = request.headers.get('Referer', '')
        user_agent = request.headers.get('User-Agent', '')
        
        # 详细访问日志
        app.logger.info(f"🔍 访问请求: IP={ip}, Path={request.path}, Referer='{referer}', UA='{user_agent[:100]}'")
        
        # 健康检查跳过
        if request.path == '/health':
            return
            
        # 检查来源 (调试模式跳过)
        if not DEBUG:
            allowed = False
            for allowed_ref in ALLOWED_REFERERS:
                if referer.startswith(allowed_ref) if allowed_ref else referer == '':
                    allowed = True
                    app.logger.info(f"✅ Referer验证通过: '{referer}' 匹配 '{allowed_ref}'")
                    break
            if not allowed:
                app.logger.warning(f"❌ Referer验证失败: '{referer}' 不在允许列表中")
                abort(403)
        else:
            app.logger.info(f"🔧 调试模式: 跳过Referer检查")
        
        # 检查频率限制
        if not check_rate_limit(ip):
            app.logger.warning(f"❌ 频率限制: IP {ip} 超过限制")
            abort(429)
    
    @app.route('/health')
    def health_check():
        return jsonify({'status': 'ok', 'timestamp': int(time.time())})
    
    @app.route('/remote/<path:filename>')
    def serve_asset(filename):
        file_path = remote_dir / filename
        
        if not file_path.exists() or not file_path.is_file():
            abort(404)
        
        # 防止路径遍历
        try:
            file_path.resolve().relative_to(remote_dir.resolve())
        except ValueError:
            abort(403)
        
        response = send_file(file_path, conditional=True)
        response.cache_control.public = True
        response.cache_control.max_age = CACHE_MAX_AGE
        
        return response
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=8080, debug=DEBUG)
EOF

# 检查资源文件
echo "📂 检查资源文件..."
if [ -d "../../assets" ]; then
    echo "发现项目资源目录，是否同步？[y/N]"
    read -r sync_assets
    if [ "$sync_assets" = "y" ] || [ "$sync_assets" = "Y" ]; then
        cp -r ../../assets/* ./remote/ 2>/dev/null || echo "⚠️  资源同步失败"
        echo "✅ 资源同步完成"
    fi
fi

# 构建并启动
echo "🔨 构建和启动..."
$COMPOSE_CMD build
$COMPOSE_CMD up -d

echo "⏳ 等待服务启动..."
sleep 5

# 健康检查
if curl -s http://localhost:9090/health > /dev/null; then
    echo "✅ 部署成功！"
    echo ""
    echo "🔗 服务地址: http://localhost:9090"
    echo "📋 健康检查: http://localhost:9090/health"
    echo "📁 资源访问: http://localhost:9090/remote/[文件名]"
    echo ""
    echo "🛠️  管理命令:"
    echo "  启动: docker-compose up -d"
    echo "  停止: docker-compose down"
    echo "  日志: docker-compose logs -f"
else
    echo "❌ 启动失败，查看日志:"
    $COMPOSE_CMD logs
    exit 1
fi

