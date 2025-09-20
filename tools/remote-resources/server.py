#!/usr/bin/env python3
"""
W-Game 远程资源服务器
- 提供游戏资源的HTTP服务
- 防盗链保护
- 访问频率限制
- 安全防护
"""

import os
import hashlib
import time
import json
from pathlib import Path
from typing import Dict, Any
from urllib.parse import urlparse
from collections import defaultdict

from flask import Flask, send_file, request, jsonify, abort
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
import click

# ============================================================================
# 配置
# ============================================================================

class Config:
    # 服务器配置
    HOST = '0.0.0.0'
    PORT = 8080
    DEBUG = False
    
    # 安全配置
    ALLOWED_REFERERS = [
        'https://servicewechat.com',          # 微信小游戏
        'https://developers.weixin.qq.com',   # 微信开发者工具
        'http://localhost',                   # 本地开发
        'http://127.0.0.1',                  # 本地开发
    ]
    
    # 访问限制 (每分钟最大请求数)
    RATE_LIMIT_PER_IP = 60
    RATE_LIMIT_PER_REFERER = 300
    
    # 资源目录
    ASSETS_DIR = './remote'
    
    # 缓存设置 (秒)
    CACHE_MAX_AGE = 7 * 24 * 3600  # 7天
    
    # 安全Token (防止直接访问)
    SECRET_KEY = 'w-game-2025-secure-key'  # 生产环境请修改

# ============================================================================
# 安全中间件
# ============================================================================

class SecurityManager:
    def __init__(self):
        # IP访问计数 {ip: [(timestamp, count), ...]}
        self.ip_access_log: Dict[str, list] = defaultdict(list)
        # Referer访问计数
        self.referer_access_log: Dict[str, list] = defaultdict(list)
        
    def is_allowed_referer(self, referer: str) -> bool:
        """检查Referer是否允许"""
        if not referer:
            return False
            
        for allowed in Config.ALLOWED_REFERERS:
            if referer.startswith(allowed):
                return True
        return False
    
    def check_rate_limit(self, ip: str, referer: str = None) -> bool:
        """检查访问频率限制"""
        now = time.time()
        
        # 清理过期记录 (1分钟前)
        cutoff = now - 60
        
        # 检查IP限制
        ip_logs = self.ip_access_log[ip]
        ip_logs[:] = [log for log in ip_logs if log[0] > cutoff]
        
        if len(ip_logs) >= Config.RATE_LIMIT_PER_IP:
            return False
            
        # 检查Referer限制
        if referer:
            ref_logs = self.referer_access_log[referer]
            ref_logs[:] = [log for log in ref_logs if log[0] > cutoff]
            
            if len(ref_logs) >= Config.RATE_LIMIT_PER_REFERER:
                return False
                
        # 记录本次访问
        ip_logs.append((now, 1))
        if referer:
            self.referer_access_log[referer].append((now, 1))
            
        return True
    
    def generate_secure_token(self, resource_path: str) -> str:
        """生成资源访问Token"""
        timestamp = str(int(time.time()))
        data = f"{resource_path}:{timestamp}:{Config.SECRET_KEY}"
        token = hashlib.md5(data.encode()).hexdigest()[:16]
        return f"{timestamp}:{token}"
    
    def verify_secure_token(self, resource_path: str, token: str) -> bool:
        """验证资源访问Token"""
        try:
            timestamp_str, received_token = token.split(':', 1)
            timestamp = int(timestamp_str)
            
            # Token有效期：10分钟
            if time.time() - timestamp > 600:
                return False
                
            # 重新计算Token
            data = f"{resource_path}:{timestamp_str}:{Config.SECRET_KEY}"
            expected_token = hashlib.md5(data.encode()).hexdigest()[:16]
            
            return received_token == expected_token
        except:
            return False

# ============================================================================
# Flask应用
# ============================================================================

def create_app():
    app = Flask(__name__)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
    
    # CORS配置
    CORS(app, origins=Config.ALLOWED_REFERERS)
    
    # 安全管理器
    security = SecurityManager()
    
    # 资源目录
    remote_dir = Path(Config.ASSETS_DIR)
    if not remote_dir.exists():
        remote_dir.mkdir(parents=True)
        print(f"Created remote directory: {remote_dir}")
    
    @app.before_request
    def security_check():
        """请求前安全检查"""
        # 获取客户端信息
        ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
        referer = request.headers.get('Referer', '')
        user_agent = request.headers.get('User-Agent', '')
        
        # 健康检查接口跳过验证
        if request.path == '/health':
            return
            
        # 版本信息接口跳过验证
        if request.path == '/version':
            return
            
        # Referer检查 (开发环境可以放宽)
        if not Config.DEBUG and not security.is_allowed_referer(referer):
            app.logger.warning(f"Blocked request from invalid referer: {referer} (IP: {ip})")
            abort(403)
        
        # 频率限制检查
        if not security.check_rate_limit(ip, referer):
            app.logger.warning(f"Rate limit exceeded for IP: {ip}, Referer: {referer}")
            abort(429)
        
        # 记录访问日志
        app.logger.info(f"Request: {request.path} from {ip} (Referer: {referer})")
    
    @app.route('/health')
    def health_check():
        """健康检查"""
        return jsonify({
            'status': 'ok',
            'timestamp': int(time.time()),
            'service': 'w-game-assets'
        })
    
    @app.route('/version')
    def version_info():
        """版本信息"""
        version_file = remote_dir / 'version.json'
        if version_file.exists():
            with open(version_file, 'r', encoding='utf-8') as f:
                version_data = json.load(f)
        else:
            version_data = {
                'version': '1.0.0',
                'timestamp': int(time.time())
            }
        
        return jsonify(version_data)
    
    @app.route('/remote/<path:filename>')
    def serve_asset(filename):
        """提供资源文件"""
        file_path = remote_dir / filename
        
        # 文件存在性检查
        if not file_path.exists() or not file_path.is_file():
            app.logger.warning(f"File not found: {filename}")
            abort(404)
        
        # 路径安全检查 (防止目录遍历)
        try:
            file_path.resolve().relative_to(remote_dir.resolve())
        except ValueError:
            app.logger.warning(f"Path traversal attempt: {filename}")
            abort(403)
        
        # Token验证 (可选，用于高安全要求)
        token = request.args.get('token')
        if token:
            if not security.verify_secure_token(filename, token):
                app.logger.warning(f"Invalid token for file: {filename}")
                abort(403)
        
        # 设置缓存头
        response = send_file(
            file_path,
            as_attachment=False,
            conditional=True,
            etag=True,
            last_modified=file_path.stat().st_mtime
        )
        
        response.cache_control.public = True
        response.cache_control.max_age = Config.CACHE_MAX_AGE
        
        return response
    
    @app.route('/token/<path:filename>')
    def generate_token(filename):
        """生成文件访问Token (用于高安全要求)"""
        file_path = remote_dir / filename
        
        if not file_path.exists():
            abort(404)
        
        token = security.generate_secure_token(filename)
        return jsonify({
            'filename': filename,
            'token': token,
            'url': f"/remote/{filename}?token={token}",
            'expires_in': 600  # 10分钟
        })
    
    @app.errorhandler(403)
    def forbidden(error):
        return jsonify({'error': 'Access forbidden'}), 403
    
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({'error': 'Resource not found'}), 404
    
    @app.errorhandler(429)
    def rate_limit_exceeded(error):
        return jsonify({'error': 'Rate limit exceeded'}), 429
    
    return app

# ============================================================================
# 资源管理工具
# ============================================================================

def optimize_images(assets_dir: Path):
    """优化图片资源"""
    try:
        from PIL import Image
        print("优化图片资源...")
        
        for img_path in assets_dir.rglob('*.jpg'):
            with Image.open(img_path) as img:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                img.save(img_path, 'JPEG', quality=85, optimize=True)
                
        for img_path in assets_dir.rglob('*.png'):
            with Image.open(img_path) as img:
                img.save(img_path, 'PNG', optimize=True)
                
        print("图片优化完成")
    except ImportError:
        print("警告: 未安装PIL，跳过图片优化 (pip install Pillow)")

def generate_version_file(assets_dir: Path):
    """生成版本文件"""
    version_data = {
        'version': f"v{int(time.time())}",
        'timestamp': int(time.time()),
        'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'files': {}
    }
    
    # 遍历所有资源文件
    for file_path in assets_dir.rglob('*'):
        if file_path.is_file() and file_path.name != 'version.json':
            rel_path = file_path.relative_to(assets_dir)
            
            # 计算文件MD5
            with open(file_path, 'rb') as f:
                md5_hash = hashlib.md5(f.read()).hexdigest()
            
            version_data['files'][str(rel_path)] = {
                'md5': md5_hash,
                'size': file_path.stat().st_size,
                'modified': int(file_path.stat().st_mtime)
            }
    
    # 保存版本文件
    version_file = assets_dir / 'version.json'
    with open(version_file, 'w', encoding='utf-8') as f:
        json.dump(version_data, f, indent=2, ensure_ascii=False)
    
    print(f"Generated version file: {version_file}")
    print(f"Total files: {len(version_data['files'])}")

# ============================================================================
# CLI命令
# ============================================================================

@click.group()
def cli():
    """W-Game 远程资源服务器工具"""
    pass

@cli.command()
@click.option('--host', default=Config.HOST, help='服务器地址')
@click.option('--port', default=Config.PORT, help='服务器端口')
@click.option('--debug', is_flag=True, help='调试模式')
def serve(host, port, debug):
    """启动资源服务器"""
    Config.DEBUG = debug
    
    app = create_app()
    
    print(f"""
🚀 W-Game 资源服务器启动
📍 地址: http://{host}:{port}
📂 资源目录: {Config.ASSETS_DIR}
🔒 安全模式: {'关闭' if debug else '开启'}
    """)
    
    app.run(host=host, port=port, debug=debug)

@cli.command()
def optimize():
    """优化资源文件"""
    assets_dir = Path(Config.ASSETS_DIR)
    optimize_images(assets_dir)
    generate_version_file(assets_dir)

@cli.command()
@click.argument('source_dir')
def sync(source_dir):
    """同步资源文件"""
    import shutil
    
    source = Path(source_dir)
    target = Path(Config.ASSETS_DIR)
    
    if not source.exists():
        print(f"错误: 源目录不存在 {source}")
        return
    
    print(f"同步资源: {source} -> {target}")
    
    # 清空目标目录
    if target.exists():
        shutil.rmtree(target)
    
    # 复制文件
    shutil.copytree(source, target)
    
    # 优化和生成版本
    optimize_images(target)
    generate_version_file(target)
    
    print("✅ 资源同步完成")

if __name__ == '__main__':
    cli()