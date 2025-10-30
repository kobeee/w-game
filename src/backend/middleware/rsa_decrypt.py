"""
RSA-OAEP 解密中间件

从 X-Encrypted-Payload 请求头中提取加密数据，解密后注入请求体。

加密方式：
  客户端使用公钥加密：RSA-OAEP-SHA256
  密文结构: { word, client_ts, nonce, client_id, key_id }
  传输方式: X-Encrypted-Payload 请求头 (Base64 编码)

服务器验证：
  1. 从 X-Encrypted-Payload 头获取 Base64 密文
  2. 使用私钥解密
  3. 检查时间戳有效期（±90秒）
  4. 检查 nonce 防重放（使用 Redis 存储）
  5. 验证通过后，注入解密后的单词到请求体
"""

from fastapi import Request
from fastapi.responses import JSONResponse
import logging
import json
import os
import base64
import time
from datetime import datetime, timedelta
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend
import pytz
import redis

logger = logging.getLogger(__name__)

# ===== RSA 私钥配置 =====
import os.path
_current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RSA_PRIVATE_KEY_PATH = os.path.join(_current_dir, "private.pem")
RSA_PUBLIC_KEY_PATH = os.path.join(_current_dir, "public.pem")

# 加载私钥
try:
    with open(RSA_PRIVATE_KEY_PATH, 'rb') as f:
        private_key_pem = f.read()
    private_key = serialization.load_pem_private_key(
        private_key_pem,
        password=None,
        backend=default_backend()
    )
    logger.info(f"✅ RSA 私钥加载成功: {RSA_PRIVATE_KEY_PATH}")
except Exception as e:
    logger.error(f"❌ RSA 私钥加载失败: {e}")
    private_key = None

# ===== Redis 客户端（用于存储 nonce） =====
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
NONCE_KEY_PREFIX = "rsa_nonce:"
NONCE_EXPIRY_SECONDS = 120  # nonce 有效期 120 秒

try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_keepalive=True
    )
    redis_client.ping()
    logger.info(f"✅ Redis 连接成功（用于 nonce 存储）: {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.warning(f"⚠️ Redis 连接失败，nonce 防重放将不工作: {e}")
    redis_client = None


def get_server_public_key_b64() -> str:
    """
    获取服务器公钥（Base64 格式），供客户端使用

    Returns:
        Base64 编码的 PEM 格式公钥
    """
    try:
        with open(RSA_PUBLIC_KEY_PATH, 'rb') as f:
            public_key_pem = f.read()
        return base64.b64encode(public_key_pem).decode('utf-8')
    except Exception as e:
        logger.error(f"⚠️ 读取公钥失败: {e}")
        return ""


def decrypt_rsa_payload(ciphertext: bytes) -> dict:
    """
    使用 RSA 私钥解密密文

    Args:
        ciphertext: RSA-OAEP 加密的密文（二进制）

    Returns:
        解密后的字典 {"word", "client_ts", "nonce", "client_id", "key_id"} 或 None
    """
    if not private_key:
        logger.error("RSA 私钥未加载")
        return None

    try:
        plaintext = private_key.decrypt(
            ciphertext,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )

        payload = json.loads(plaintext.decode('utf-8'))
        logger.debug(f"[RSA] ✅ 解密成功: {payload.keys()}")
        return payload

    except Exception as e:
        logger.error(f"[RSA] ❌ 解密失败: {e}")
        return None


def check_timestamp(client_ts_ms: int, tolerance_ms: int = 90000) -> bool:
    """
    验证时间戳是否在有效期内（默认 ±90秒）

    Args:
        client_ts_ms: 客户端时间戳（毫秒）
        tolerance_ms: 容许误差（毫秒，默认90秒）

    Returns:
        True 表示有效，False 表示过期
    """
    try:
        shanghai_tz = pytz.timezone('Asia/Shanghai')
        now = datetime.now(shanghai_tz)
        server_ts = int(now.timestamp() * 1000)

        delta = abs(server_ts - client_ts_ms)
        is_valid = delta < tolerance_ms

        if not is_valid:
            logger.warning(
                f"[RSA] ⚠️ 时间戳过期: "
                f"client={client_ts_ms}, server={server_ts}, delta={delta}ms, tolerance={tolerance_ms}ms"
            )
        else:
            logger.info(f"[RSA] ✅ 时间戳验证通过: delta={delta}ms")

        return is_valid

    except Exception as e:
        logger.error(f"[RSA] 时间戳验证异常: {e}")
        return False


def check_nonce(nonce: str) -> bool:
    """
    验证 nonce 防止重放攻击（使用 Redis 存储）

    Args:
        nonce: 客户端生成的随机字符串（通常为 UUID）

    Returns:
        True 表示有效（未使用过），False 表示无效（已使用过或格式错误）
    """
    try:
        if not nonce or len(nonce) < 16:
            logger.warning(f"[RSA] ⚠️ Nonce 格式无效")
            return False

        # 如果 Redis 不可用，降级处理（允许通过，但记录警告）
        if not redis_client:
            logger.warning(f"[RSA] ⚠️ Redis 不可用，无法检查 nonce 重放: {nonce}")
            return True  # 允许通过，防止服务中断

        # 构造 nonce 键
        nonce_key = f"{NONCE_KEY_PREFIX}{nonce}"

        # 检查 nonce 是否已存在
        if redis_client.exists(nonce_key):
            logger.warning(f"[RSA] ⚠️ Nonce 已使用过（重放攻击）: {nonce}")
            return False

        # 记录 nonce（设置过期时间）
        redis_client.setex(nonce_key, NONCE_EXPIRY_SECONDS, "1")
        logger.info(f"[RSA] ✅ Nonce 验证通过并已记录")
        return True

    except Exception as e:
        logger.error(f"[RSA] Nonce 验证异常: {e}")
        # 降级处理：允许通过，防止因 Redis 故障导致服务不可用
        logger.warning(f"[RSA] ⚠️ Nonce 验证异常，允许请求通过")
        return True


async def rsa_decryption_middleware(request: Request, call_next):
    """
    RSA-OAEP 解密中间件

    此中间件执行以下步骤：
    1. 从 X-Encrypted-Payload 头提取 Base64 密文
    2. Base64 解码
    3. 使用 RSA 私钥解密
    4. 验证时间戳（±90秒）
    5. 验证 nonce（防重放，使用 Redis）
    6. 将解密后的 word 注入请求体

    Args:
        request: FastAPI 请求对象
        call_next: 下一个中间件或路由处理器

    Returns:
        响应对象或错误响应
    """

    # 跳过 GET 请求和无需加密的端点
    if request.method != "POST":
        return await call_next(request)

    if request.url.path in ["/health", "/api/public-key"]:
        return await call_next(request)

    logger.info(f"[Middleware] 🔐 处理 POST 请求: {request.url.path}")

    # ===== 1. 从请求头获取密文 =====
    encrypted_payload_b64 = request.headers.get("X-Encrypted-Payload")

    if not encrypted_payload_b64:
        logger.warning(f"[Security] ⚠️ 缺少加密载荷头: {request.url.path}")
        return JSONResponse(
            status_code=401,
            content={"error": "UNAUTHORIZED", "message": "Missing X-Encrypted-Payload header"}
        )

    logger.info(f"[Middleware] ✅ 找到 X-Encrypted-Payload 头，长度: {len(encrypted_payload_b64)}")

    # ===== 2. Base64 解码密文 =====
    try:
        ciphertext = base64.b64decode(encrypted_payload_b64)
        logger.info(f"[Middleware] ✅ Base64 解码成功，密文长度: {len(ciphertext)}")
    except Exception as e:
        logger.error(f"[RSA] ⚠️ Base64 解码失败: {e}")
        return JSONResponse(
            status_code=401,
            content={"error": "INVALID_PAYLOAD", "message": "Invalid Base64 encoding"}
        )

    # ===== 3. 解密密文 =====
    payload = decrypt_rsa_payload(ciphertext)
    if not payload:
        logger.error("[Middleware] ❌ 解密失败")
        return JSONResponse(
            status_code=401,
            content={"error": "DECRYPT_FAILED", "message": "Failed to decrypt payload"}
        )

    logger.info(f"[Middleware] ✅ 解密成功: {payload.keys()}")

    # ===== 4. 验证时间戳 =====
    client_ts = payload.get("client_ts")
    if not client_ts or not isinstance(client_ts, int):
        logger.warning(f"[RSA] ⚠️ 时间戳格式错误")
        return JSONResponse(
            status_code=401,
            content={"error": "INVALID_TIMESTAMP", "message": "Invalid timestamp format"}
        )

    if not check_timestamp(client_ts):
        logger.error("[Middleware] ❌ 时间戳验证失败")
        return JSONResponse(
            status_code=401,
            content={"error": "TIMESTAMP_EXPIRED", "message": "Timestamp expired"}
        )

    # ===== 5. 验证 nonce =====
    nonce = payload.get("nonce")
    logger.info(f"[Middleware] 🔒 检查 nonce: {nonce}")

    if not check_nonce(nonce):
        logger.error(f"[Middleware] ❌ Nonce 验证失败: {nonce}")
        return JSONResponse(
            status_code=401,
            content={"error": "INVALID_NONCE", "message": "Invalid or reused nonce"}
        )

    logger.info(f"[Middleware] ✅ Nonce 验证通过")

    # ===== 6. 验证通过，准备请求体 =====
    word = payload.get("word", "").strip()
    if not word:
        logger.warning(f"[RSA] ⚠️ 缺少单词数据")
        return JSONResponse(
            status_code=400,
            content={"error": "MISSING_WORD", "message": "Missing word in payload"}
        )

    # 构造新的请求体（只包含 word 字段）
    request_body = json.dumps({"word": word}).encode('utf-8')

    # 创建新的请求对象，注入解密后的请求体
    async def receive():
        return {"type": "http.request", "body": request_body}

    new_request = Request(
        scope=request.scope,
        receive=receive
    )

    logger.info(f"[Security] ✅ RSA 验证通过: word={word}, client_id={payload.get('client_id')}")

    response = await call_next(new_request)
    return response
