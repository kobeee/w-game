"""
Cloudflare 请求验证中间件

验证请求是否来自 Cloudflare，包括：
- 检查必须的 Cloudflare 请求头（CF-RAY、CF-Connecting-IP）
- IP 限流（每分钟 15 次）
- 全局限流（每天 2000 次）
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from collections import defaultdict
from datetime import datetime, timedelta
import time
import logging

logger = logging.getLogger(__name__)

# ===== IP 限流配置 =====
IP_RATE_LIMIT = 15  # 每分钟 15 次
ip_request_log: dict[str, list[float]] = defaultdict(list)

# ===== 全局限流配置 =====
GLOBAL_RATE_LIMIT = 2000  # 每天 2000 次（适应 Redis 缓存后的低调用量）
global_request_count = 0
global_reset_time = datetime.now() + timedelta(days=1)


def check_ip_rate_limit(ip: str) -> bool:
    """
    检查 IP 限流

    Args:
        ip: 客户端 IP 地址

    Returns:
        True 表示未触发限流，False 表示触发限流
    """
    now = time.time()
    # 清理 60 秒前的记录
    ip_request_log[ip] = [t for t in ip_request_log[ip] if now - t < 60]

    if len(ip_request_log[ip]) >= IP_RATE_LIMIT:
        return False

    ip_request_log[ip].append(now)
    return True


def check_global_rate_limit() -> bool:
    """
    检查全局限流

    Returns:
        True 表示未触发限流，False 表示触发限流
    """
    global global_request_count, global_reset_time

    # 每天重置计数器
    if datetime.now() > global_reset_time:
        global_request_count = 0
        global_reset_time = datetime.now() + timedelta(days=1)

    if global_request_count >= GLOBAL_RATE_LIMIT:
        return False

    global_request_count += 1
    return True


async def cloudflare_verification_middleware(request: Request, call_next):
    """
    验证请求是否来自 Cloudflare

    此中间件执行以下验证：
    1. 检查必须的 Cloudflare 请求头（CF-RAY、CF-Connecting-IP）
    2. IP 限流检查（每分钟 15 次）
    3. 全局限流检查（每天 2000 次）

    Args:
        request: FastAPI 请求对象
        call_next: 下一个中间件或路由处理器

    Returns:
        响应对象或错误响应
    """

    # 跳过健康检查
    if request.url.path == "/health":
        return await call_next(request)

    # ===== 1. 获取客户端 IP（Nginx 传递的真实 IP） =====
    client_ip = request.headers.get("X-Real-IP") or request.client.host

    # ===== 2. 验证必须的 Cloudflare 请求头 =====
    cf_ray = request.headers.get("CF-RAY")  # Cloudflare 唯一请求 ID
    cf_connecting_ip = request.headers.get("CF-Connecting-IP")  # 真实客户端 IP

    if not cf_ray or not cf_connecting_ip:
        logger.warning(
            f"[Security] ⚠️ 缺少 Cloudflare 请求头: "
            f"IP={client_ip}, CF-RAY={cf_ray}, CF-Connecting-IP={cf_connecting_ip}"
        )
        return JSONResponse(
            status_code=403,
            content={"error": "FORBIDDEN", "message": "Invalid request headers"}
        )

    # ===== 3. IP 限流检查 =====
    if not check_ip_rate_limit(cf_connecting_ip):
        logger.warning(f"[Security] ⚠️ IP 限流触发: {cf_connecting_ip}")
        return JSONResponse(
            status_code=429,
            content={"error": "RATE_LIMIT_EXCEEDED", "message": "Too many requests"}
        )

    # ===== 4. 全局限流检查 =====
    if not check_global_rate_limit():
        logger.warning(f"[Security] ⚠️ 全局限流触发")
        return JSONResponse(
            status_code=429,
            content={"error": "DAILY_QUOTA_EXCEEDED", "message": "Daily quota exceeded"}
        )

    # ===== 5. 通过验证 =====
    logger.info(
        f"[Security] ✅ Cloudflare 请求验证通过: "
        f"CF-RAY={cf_ray}, Client-IP={cf_connecting_ip}"
    )

    response = await call_next(request)
    return response
