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
from middleware.signature_verify import signature_verification_middleware

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
# 1. Cloudflare 验证中间件（最先执行）
app.middleware("http")(cloudflare_verification_middleware)

# 2. 签名验证中间件
app.middleware("http")(signature_verification_middleware)


# ===== 数据模型 =====
class ValidateRequest(BaseModel):
    """单词验证请求"""
    word: str


class ValidateResponse(BaseModel):
    """单词验证响应"""
    valid: bool
    definition: Optional[str] = None
    source: str = "gemini"  # 数据来源: local/redis/gemini
    error: Optional[str] = None


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


# ===== 路由 =====
@app.post("/api/validate-word", response_model=ValidateResponse)
async def validate_word(request: ValidateRequest):
    """
    单词验证接口

    三层验证策略：
    1. 本地词库（客户端离线）
    2. Redis 全局缓存（<5ms）
    3. Gemini API（200-400ms）

    请求:
      POST /api/validate-word
      {
        "word": "CAT"
      }

    响应:
      {
        "valid": true,
        "definition": "猫",
        "source": "gemini"
      }
    """
    word = request.word.strip().upper()

    # ===== 输入验证 =====
    if not word or len(word) < 2 or len(word) > 20:
        logger.warning(f"[Validate] ⚠️ 无效输入: {request.word}")
        return ValidateResponse(
            valid=False,
            error="INVALID_INPUT"
        )

    if not word.isalpha():
        logger.warning(f"[Validate] ⚠️ 包含非字母字符: {word}")
        return ValidateResponse(
            valid=False,
            error="NON_ALPHA_CHARACTERS"
        )

    # ===== 第2层：检查 Redis 全局缓存 =====
    cached_result = get_word_from_cache(word)
    if cached_result:
        return ValidateResponse(
            **cached_result,
            source="redis"
        )

    # ===== 第3层：调用 Gemini API =====
    logger.info(f"[Validate] 📡 调用 Gemini API: {word}")
    result = await call_gemini_api(word)

    # 验证通过后，自动存入 Redis 缓存
    if result.get("valid"):
        save_word_to_cache(word, result)

    return ValidateResponse(
        **result,
        source="gemini"
    )


@app.get("/api/config")
async def get_config():
    """
    获取客户端配置（包括 API 密钥）

    此端点无需签名验证，客户端可直接调用
    返回当前有效的 API 签名密钥

    响应:
      {
        "secretKey": "a1b2c3d4...",
        "expiresAt": 1698567890000,
        "serverTime": 1698567890000,
        "timezone": "Asia/Shanghai"
      }
    """
    from middleware.signature_verify import SECRET_KEY
    
    # 使用Asia/Shanghai时区
    shanghai_tz = pytz.timezone('Asia/Shanghai')
    now = datetime.now(shanghai_tz)
    timestamp_ms = int(now.timestamp() * 1000)
    
    return {
        "secretKey": SECRET_KEY,
        "expiresAt": timestamp_ms + 3600000,  # 1小时后过期
        "serverTime": timestamp_ms,
        "timezone": "Asia/Shanghai"
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
