"""
单词验证服务 - FastAPI 应用

功能：
1. 验证英文单词的有效性（使用 Gemini API）
2. Redis 全局单词缓存（自动增长）
3. 多级防护（Cloudflare + 签名验证 + 限流）
4. 健康检查接口

启动命令：
  uvicorn word_validator:app --host 0.0.0.0 --port 8000 --workers 4
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os
import logging
import httpx
import json
import redis
from typing import Optional
import sys
import time
from datetime import datetime
import pytz

# 导入中间件
from middleware.cloudflare_verify import cloudflare_verification_middleware
from middleware.rsa_decrypt import rsa_decryption_middleware

# ===== 日志配置 =====
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ===== FastAPI 应用初始化 =====
app = FastAPI(
    title="Word Validator Service",
    version="1.0.0",
    description="单词验证服务（Gemini AI + Redis 缓存 + Cloudflare 防护）"
)

# ===== 环境变量读取 =====
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.error("❌ 错误: GEMINI_API_KEY 环境变量未设置")
    sys.exit(1)

GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"

# ===== Redis 配置 =====
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
WORD_CACHE_PREFIX = "word:"
WORD_CACHE_TTL = 86400 * 365  # 1年过期

try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_keepalive=True,
        health_check_interval=30
    )
    # 测试连接
    redis_client.ping()
    logger.info(f"✅ Redis 连接成功: {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.warning(f"⚠️ Redis 连接失败，将使用内存缓存: {e}")
    redis_client = None

# ===== CORS 中间件 =====
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)

# ===== 中间件注册（顺序很重要！） =====
# 1. Cloudflare 验证中间件
app.middleware("http")(cloudflare_verification_middleware)

# 2. RSA 解密中间件（从 X-Encrypted-Payload 头提取密文）
app.middleware("http")(rsa_decryption_middleware)


# ===== 数据模型 =====
class VerifyRequest(BaseModel):
    """单词验证请求（注意：密文通过 X-Encrypted-Payload 头发送，此处仅用于接收明文单词）"""
    word: str  # 解密后的单词


class VerifyResponse(BaseModel):
    """单词验证响应"""
    request_id: str
    valid: bool
    definition: Optional[str] = None
    source: str = "gemini"  # 数据来源: cache/gemini/fallback
    word: Optional[str] = None
    latency_ms: int = 0
    checked_at: str = ""
    error_code: Optional[int] = None
    message: Optional[str] = None


# ===== Redis 缓存操作 =====
def get_word_from_cache(word: str) -> Optional[dict]:
    """
    从 Redis 全局缓存获取单词验证结果

    Args:
        word: 单词（大写）

    Returns:
        缓存结果或 None
    """
    if not redis_client:
        return None

    try:
        cache_key = f"{WORD_CACHE_PREFIX}{word.upper()}"
        cached = redis_client.get(cache_key)
        if cached:
            logger.info(f"[Cache] ✅ Redis 缓存命中: {word}")
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"[Cache] ⚠️ Redis 读取失败: {e}")

    return None


def save_word_to_cache(word: str, result: dict) -> None:
    """
    保存单词验证结果到 Redis 全局缓存

    Args:
        word: 单词（大写）
        result: 验证结果字典
    """
    if not redis_client:
        return

    try:
        cache_key = f"{WORD_CACHE_PREFIX}{word.upper()}"
        redis_client.setex(
            cache_key,
            WORD_CACHE_TTL,
            json.dumps(result)
        )
        logger.info(f"[Cache] 💾 已保存到 Redis: {word}")
    except Exception as e:
        logger.warning(f"[Cache] ⚠️ Redis 写入失败: {e}")


# ===== Gemini API 调用 =====
async def call_gemini_api(word: str) -> dict:
    """
    调用 Gemini API 验证单词

    Args:
        word: 单词（大写）

    Returns:
        验证结果 {"valid": bool, "definition": str}
    """
    prompt = f'''判断"{word}"是否是有效的英语单词（包括俚语、专有名词）。
如果是，用20字以内的中文解释其含义。
仅返回JSON格式: {{"valid": true/false, "definition": "释义"}}'''

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.post(
                GEMINI_ENDPOINT,
                headers={
                    "x-goog-api-key": GEMINI_API_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "contents": [{
                        "parts": [{"text": prompt}]
                    }],
                    "generationConfig": {
                        "temperature": 0.1,
                        "maxOutputTokens": 100,
                        "candidateCount": 1
                    }
                }
            )

            response.raise_for_status()
            result = response.json()

            # 解析 Gemini 返回
            text = result["candidates"][0]["content"]["parts"][0]["text"]

            # 提取 JSON（可能包含 markdown 代码块）
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()

            parsed = json.loads(text.strip())

            return {
                "valid": parsed.get("valid", False),
                "definition": parsed.get("definition", ""),
            }

    except httpx.TimeoutException:
        logger.error(f"[Gemini] ⚠️ 请求超时: {word}")
        return {"valid": False, "error": "GEMINI_TIMEOUT"}
    except httpx.HTTPStatusError as e:
        logger.error(f"[Gemini] ⚠️ HTTP 错误 {e.response.status_code}: {word}")
        return {"valid": False, "error": f"GEMINI_HTTP_{e.response.status_code}"}
    except (KeyError, json.JSONDecodeError) as e:
        logger.error(f"[Gemini] ⚠️ 解析返回失败: {e}")
        return {"valid": False, "error": "GEMINI_PARSE_ERROR"}
    except Exception as e:
        logger.error(f"[Gemini] ⚠️ 未知错误: {e}")
        return {"valid": False, "error": "INTERNAL_ERROR"}


# ===== 工具函数 =====
def generate_request_id() -> str:
    """生成请求 ID（格式: YYYY-MM-DD-4位随机十六进制）"""
    from datetime import datetime
    import random
    now = datetime.utcnow().strftime("%Y-%m-%d")
    rand = format(random.randint(0, 0xffff), '04x')
    return f"{now}-{rand}"


# ===== 路由 =====
@app.post("/api/v1/word/verify", response_model=VerifyResponse)
async def verify_word(request: VerifyRequest):
    """
    单词验证接口 - RSA-OAEP 加密版本

    请求:
      POST /api/v1/word/verify
      请求头: X-Encrypted-Payload: <RSA-OAEP 加密的 Base64 密文>

    密文内容（加密前的 JSON）:
      {
        "word": "STACK",
        "client_ts": 1730186400123,
        "nonce": "7b4f0f86-0d90-4df0-97f1-2c8e9c1beaf0",
        "client_id": "w-game-client",
        "key_id": "2025Q4-01"
      }

    响应:
      {
        "request_id": "2025-10-29-9f1c",
        "valid": true,
        "definition": "一叠/堆积",
        "source": "cache",
        "word": "STACK",
        "latency_ms": 108,
        "checked_at": "2025-10-29T12:00:31.482Z"
      }
    """
    start_time = time.time()
    request_id = generate_request_id()

    # 提取单词（由 RSA 中间件在解密后注入）
    word = request.word.strip().upper()

    # ===== 格式校验 =====
    if not word or len(word) < 3 or len(word) > 20:
        logger.warning(f"[{request_id}] 单词长度无效: {word}")
        return VerifyResponse(
            request_id=request_id,
            valid=False,
            error_code=42201,
            message="word length < 3 or > 20"
        )

    if not word.isalpha():
        logger.warning(f"[{request_id}] 单词包含非字母字符: {word}")
        return VerifyResponse(
            request_id=request_id,
            valid=False,
            error_code=42201,
            message="invalid characters in word"
        )

    # ===== 检查缓存 =====
    cached_result = get_word_from_cache(word)
    if cached_result:
        latency_ms = int((time.time() - start_time) * 1000)
        return VerifyResponse(
            request_id=request_id,
            word=word,
            source="cache",
            latency_ms=latency_ms,
            checked_at=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            **cached_result
        )

    # ===== 调用 Gemini API =====
    logger.info(f"[{request_id}] 调用 Gemini: {word}")
    result = await call_gemini_api(word)

    # 验证通过后写入缓存
    if result.get("valid"):
        save_word_to_cache(word, result)

    latency_ms = int((time.time() - start_time) * 1000)
    return VerifyResponse(
        request_id=request_id,
        word=word,
        source="gemini",
        latency_ms=latency_ms,
        checked_at=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        **result
    )


@app.get("/api/public-key")
async def get_public_key():
    """
    获取 RSA 公钥（供客户端使用）

    此端点无需加密验证，客户端可直接调用
    返回 Base64 编码的 RSA-2048 公钥

    响应:
      {
        "publicKey": "MIIBIj...",（Base64编码的PEM格式公钥）
        "serverTime": 1698567890000,
        "timezone": "Asia/Shanghai",
        "algorithm": "RSA-OAEP-SHA256"
      }
    """
    from middleware.rsa_decrypt import get_server_public_key_b64

    # 使用 Asia/Shanghai 时区
    shanghai_tz = pytz.timezone('Asia/Shanghai')
    now = datetime.now(shanghai_tz)
    timestamp_ms = int(now.timestamp() * 1000)

    public_key_b64 = get_server_public_key_b64()

    return {
        "publicKey": public_key_b64,
        "serverTime": timestamp_ms,
        "timezone": "Asia/Shanghai",
        "algorithm": "RSA-OAEP-SHA256"
    }


@app.get("/health")
async def health_check():
    """
    健康检查接口

    返回服务状态和依赖服务连接状态

    响应:
      {
        "status": "ok",
        "service": "word-validator",
        "redis": "connected" | "disconnected"
      }
    """
    redis_status = "connected"
    if redis_client:
        try:
            redis_client.ping()
        except Exception:
            redis_status = "disconnected"
    else:
        redis_status = "not_configured"

    return {
        "status": "ok",
        "service": "word-validator",
        "redis": redis_status,
    }


@app.on_event("startup")
async def startup_event():
    """应用启动事件"""
    logger.info("🚀 单词验证服务启动")
    logger.info(f"📋 Gemini 端点: {GEMINI_ENDPOINT}")
    logger.info(f"🔓 CORS 允许来源: {ALLOWED_ORIGINS}")
    if redis_client:
        logger.info(f"💾 Redis 配置: {REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}")


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭事件"""
    logger.info("🛑 单词验证服务关闭")
    if redis_client:
        redis_client.close()


# ===== 错误处理 =====
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """全局异常处理"""
    logger.error(f"❌ 未捕获的异常: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_ERROR", "message": "Internal server error"}
    )


if __name__ == "__main__":
    import uvicorn
    
    # 设置时区为Asia/Shanghai
    os.environ['TZ'] = 'Asia/Shanghai'
    try:
        import time
        time.tzset()
    except AttributeError:
        # Windows系统不支持tzset
        pass

    uvicorn.run(
        "word_validator:app",
        host="0.0.0.0",
        port=8000,
        workers=4,
        log_level="info",
        reload=False
    )
