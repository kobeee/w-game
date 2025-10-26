"""
客户端签名验证中间件

验证客户端请求的 HMAC-SHA256 签名和时间戳，防止重放攻击。

签名生成方式：
  payload = requestBody + timestamp
  signature = HMAC-SHA256(payload, SECRET_KEY)
"""

from fastapi import Request
from fastapi.responses import JSONResponse
import hashlib
import hmac
import time
import os
import logging

logger = logging.getLogger(__name__)

# 密钥配置（与客户端一致，从环境变量读取）
SECRET_KEY = os.getenv("API_SECRET_KEY", "your-secret-key-here")
SIGNATURE_EXPIRY_SECONDS = 300  # 签名有效期 5分钟（增加容错）


def verify_signature(data: bytes, timestamp: str, signature: str) -> bool:
    """
    验证 HMAC-SHA256 签名

    Args:
        data: 请求体二进制数据
        timestamp: 时间戳字符串（毫秒）
        signature: 客户端提供的签名

    Returns:
        True 表示签名有效，False 表示签名无效
    """
    try:
        payload = data.decode('utf-8') + timestamp
        expected_signature = hmac.new(
            SECRET_KEY.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        # 使用 compare_digest 防止时序攻击
        is_valid = hmac.compare_digest(signature, expected_signature)

        if not is_valid:
            logger.warning(
                f"[Security] ⚠️ 签名验证失败: "
                f"expected={expected_signature[:16]}..., got={signature[:16]}..."
            )

        return is_valid
    except Exception as e:
        logger.error(f"[Security] 签名验证异常: {e}")
        return False


def check_timestamp(timestamp: str) -> bool:
    """
    验证时间戳（防重放攻击）

    检查时间戳是否在有效期内（±5分钟），使用Asia/Shanghai时区

    Args:
        timestamp: 时间戳字符串（毫秒）

    Returns:
        True 表示时间戳有效，False 表示时间戳过期
    """
    try:
        import pytz
        from datetime import datetime
        
        # 解析客户端时间戳
        client_ts = int(timestamp)
        
        # 使用Asia/Shanghai时区获取当前时间
        shanghai_tz = pytz.timezone('Asia/Shanghai')
        now = datetime.now(shanghai_tz)
        server_ts = int(now.timestamp() * 1000)
        
        delta = abs(server_ts - client_ts)

        is_valid = delta < SIGNATURE_EXPIRY_SECONDS * 1000

        if not is_valid:
            logger.warning(
                f"[Security] ⚠️ 时间戳过期: "
                f"client_ts={client_ts}, server_ts={server_ts}, delta={delta}ms, "
                f"expiry={SIGNATURE_EXPIRY_SECONDS*1000}ms"
            )
        else:
            logger.info(f"[Security] ✅ 时间戳验证通过: delta={delta}ms")

        return is_valid
    except ValueError:
        logger.warning(f"[Security] ⚠️ 时间戳格式错误: {timestamp}")
        return False
    except Exception as e:
        logger.error(f"[Security] 时间戳验证异常: {e}")
        return False


async def signature_verification_middleware(request: Request, call_next):
    """
    验证客户端签名

    此中间件执行以下验证：
    1. 检查是否包含签名头（X-Signature、X-Timestamp）
    2. 验证时间戳是否在有效期内
    3. 验证 HMAC-SHA256 签名

    Args:
        request: FastAPI 请求对象
        call_next: 下一个中间件或路由处理器

    Returns:
        响应对象或错误响应
    """

    # 跳过健康检查
    if request.url.path == "/health":
        return await call_next(request)

    # 仅验证 POST 请求
    if request.method != "POST":
        return await call_next(request)

    # ===== 1. 获取签名头 =====
    timestamp = request.headers.get("X-Timestamp")
    signature = request.headers.get("X-Signature")

    if not timestamp or not signature:
        logger.warning(f"[Security] ⚠️ 缺少签名头")
        return JSONResponse(
            status_code=401,
            content={"error": "UNAUTHORIZED", "message": "Missing signature"}
        )

    # ===== 2. 验证时间戳 =====
    if not check_timestamp(timestamp):
        return JSONResponse(
            status_code=401,
            content={"error": "SIGNATURE_EXPIRED", "message": "Signature expired"}
        )

    # ===== 3. 验证签名 =====
    body = await request.body()
    if not verify_signature(body, timestamp, signature):
        return JSONResponse(
            status_code=401,
            content={"error": "INVALID_SIGNATURE", "message": "Invalid signature"}
        )

    # ===== 4. 通过验证，重新注入请求体 =====
    logger.info(f"[Security] ✅ 签名验证通过")

    # 创建新的请求对象，重新注入请求体
    async def receive():
        return {"type": "http.request", "body": body}
    
    new_request = Request(
        scope=request.scope,
        receive=receive
    )

    response = await call_next(new_request)
    return response
