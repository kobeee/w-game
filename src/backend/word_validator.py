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
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os
import logging
import httpx
import asyncio
from collections import OrderedDict
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

# ===== WS 配置 =====
EDGE_SHARED_TOKEN = os.getenv("EDGE_SHARED_TOKEN", "")
WS_HEARTBEAT_SEC = int(os.getenv("WS_HEARTBEAT_SEC", "20"))
WS_ROTATE_SEC = int(os.getenv("WS_ROTATE_SEC", "90"))
WS_IDLE_SEC = int(os.getenv("WS_IDLE_SEC", "45"))

try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=0.5,
        retry_on_timeout=True,
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


# ===== 本地 LRU 缓存（进程内）与单飞去重 =====
MAX_LOCAL_CACHE_SIZE = int(os.getenv("LOCAL_CACHE_SIZE", "8000"))
_local_cache: "OrderedDict[str, dict]" = OrderedDict()

def _cache_get(word: str) -> Optional[dict]:
    key = word.upper()
    if key in _local_cache:
        _local_cache.move_to_end(key)
        return _local_cache[key]
    return None

def _cache_set(word: str, result: dict) -> None:
    key = word.upper()
    _local_cache[key] = result
    _local_cache.move_to_end(key)
    if len(_local_cache) > MAX_LOCAL_CACHE_SIZE:
        _local_cache.popitem(last=False)

# 单飞：同一单词的并发请求仅触发一次下游调用
_inflight: dict[str, asyncio.Future] = {}

async def _singleflight(word: str, coro_factory):
    key = word.upper()
    fut = _inflight.get(key)
    if fut is not None:
        return await fut
    loop = asyncio.get_running_loop()
    fut = loop.create_task(coro_factory())
    _inflight[key] = fut
    try:
        return await fut
    finally:
        _inflight.pop(key, None)


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
    # 先查进程内 LRU
    local_hit = _cache_get(word)
    if local_hit is not None:
        logger.info(f"[Cache] ✅ Local 缓存命中: {word}")
        return local_hit

    if not redis_client:
        return None

    try:
        cache_key = f"{WORD_CACHE_PREFIX}{word.upper()}"
        cached = redis_client.get(cache_key)
        if cached:
            logger.info(f"[Cache] ✅ Redis 缓存命中: {word}")
            data = json.loads(cached)
            _cache_set(word, data)
            return data
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
    # 先写入本地 LRU
    _cache_set(word, result)
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


# ===== Gemini HTTP 客户端（HTTP/2 连接池） =====
_http_client: Optional[httpx.AsyncClient] = None


# ===== Gemini API 调用 =====
async def call_gemini_api(word: str) -> dict:
    """
    调用 Gemini API 翻译已验证的英文单词

    重要：此函数假设单词已经过客户端验证，仅负责翻译

    Args:
        word: 已验证的英文单词（大写）

    Returns:
        {"valid": bool, "definition": str}
    """
    logger.info(f"[TRANSLATE] 开始翻译已验证单词: {word}")

    # ✅ 终极提示词v2：更严格的验证和翻译限制
    prompt = (
        f"翻译任务：将已通过权威字典验证的英文单词\"{word}\"翻译为简体中文。\n"
        f"\n"
        f"【严格约束】（必须遵守）：\n"
        f"1. 该单词已通过dictionaryapi.dev验证，100%确认为有效英文单词\n"
        f"2. 你只能翻译，绝对不能质疑或判断单词有效性\n"
        f"3. 如果你觉得这不是单词，返回空字符串而非任何解释\n"
        f"4. 禁止翻译缩写、拼音、专有名词缩写（如BAS、BAI等）\n"
        f"5. 只翻译常见英文单词，3字母以下的缩写一律返回空\n"
        f"\n"
        f"翻译规则：\n"
        f"- 仅返回最常用中文释义（≤8字）\n"
        f"- 有疑问时返回空字符串，不要猜测\n"
        f"- 绝不翻译非标准英文组合\n"
        f"\n"
        f"JSON格式输出：{{\"definition\": \"中文释义或空字符串\"}}\n"
        f"无其他任何文字！"
    )

    try:
        assert _http_client is not None, "HTTP client not initialized"
        response = await _http_client.post(
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
                    "temperature": 0.0,
                    "maxOutputTokens": 64,
                    "candidateCount": 1,
                    # 强制结构化 JSON，避免 markdown 包裹
                    "responseMimeType": "application/json",
                    "responseSchema": {
                        "type": "OBJECT",
                        "properties": {
                            "definition": {"type": "STRING"}
                        },
                        "required": ["definition"]
                    }
                }
            }
        )

        response.raise_for_status()
        result = response.json()

        # 结构化输出：优先直接 JSON，其次容错提取
        text = result["candidates"][0]["content"]["parts"][0]["text"]
        text = (text or "").strip()

        def _try_parse(s: str):
            try:
                return json.loads(s)
            except Exception:
                return None

        parsed = _try_parse(text)
        if parsed is None:
            # 去除代码块围栏
            if text.startswith("```json") and text.endswith("```"):
                parsed = _try_parse(text[7:-3].strip())
            if parsed is None and "```" in text:
                inner = text.split("```")[1] if len(text.split("```")) > 1 else text
                parsed = _try_parse(inner.strip())
        if parsed is None:
            # 从第一个 { 到最后一个 } 截取
            l = text.find('{')
            r = text.rfind('}')
            if l != -1 and r != -1 and r > l:
                parsed = _try_parse(text[l:r+1])
        if parsed is None:
            raise json.JSONDecodeError("Failed to parse Gemini JSON", text, 0)

        definition = parsed.get("definition", "").strip()
        
        # ✅ 验证释义质量：不为空且不是拒绝回答
        if not definition:
            logger.warning(f"[GEMINI] 返回空释义: {word}")
            return {"valid": True, "definition": ""}
        
        # ✅ 检查可能的幻觉回答
        hallucination_indicators = [
            "不是", "无效", "不存在", "无法翻译", "未知", "抱歉", 
            "sorry", "invalid", "not", "exist", "unknown"
        ]
        lower_def = definition.lower()
        if any(indicator in lower_def for indicator in hallucination_indicators):
            logger.warning(f"[GEMINI] 疑似幻觉回答: {word} → {definition}")
            return {"valid": True, "definition": ""}

        logger.info(f"[TRANSLATE] 翻译成功: {word} → {definition}")
        return {"valid": True, "definition": definition}

    except httpx.TimeoutException:
        logger.error(f"[GEMINI] 请求超时: {word}")
        return {"valid": True, "definition": "", "error": "GEMINI_TIMEOUT"}
    except httpx.HTTPStatusError as e:
        logger.error(f"[GEMINI] HTTP错误 {e.response.status_code}: {word}")
        return {"valid": True, "definition": "", "error": f"GEMINI_HTTP_{e.response.status_code}"}
    except (KeyError, json.JSONDecodeError) as e:
        logger.error(f"[GEMINI] 解析失败: {e}")
        return {"valid": True, "definition": "", "error": "GEMINI_PARSE_ERROR"}
    except Exception as e:
        logger.error(f"[GEMINI] 未知错误: {e}")
        return {"valid": True, "definition": "", "error": "INTERNAL_ERROR"}


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
    # 单飞去重，减少并发相同单词的重复调用
    result = await _singleflight(word, lambda: call_gemini_api(word))

    # 写入缓存（成功返回即缓存，无错误字段时）
    if "error" not in result:
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


# ===== WebSocket: /ws/word =====
@app.websocket("/ws/word")
async def ws_word(websocket: WebSocket):
    """最小可用 WebSocket 通道：hello/ping/validate。

    安全：若配置 EDGE_SHARED_TOKEN，则要求握手头 X-Edge-Token 一致。
    心跳：收到 ping 回复 pong；后台基于空闲超时/旋转时间控制关闭。
    验证：复用现有缓存/SingleFlight/Gemini 逻辑，并返回 latencyMs 与 source。
    """
    # 简单鉴权：仅当设置 EDGE_SHARED_TOKEN 时校验
    edge_token = websocket.headers.get("x-edge-token") or websocket.headers.get("X-Edge-Token")
    if EDGE_SHARED_TOKEN and edge_token != EDGE_SHARED_TOKEN:
        await websocket.close(code=4403)
        return

    await websocket.accept()

    connected_at = time.time()
    last_active = time.time()
    session_id = generate_request_id()

    logger.info(f"[WS] connect session={session_id} ua={websocket.headers.get('user-agent','-')}")

    async def send_json(msg: dict):
        try:
            await websocket.send_text(json.dumps(msg, ensure_ascii=False))
        except Exception:
            raise

    # 发送 hello-ack
    try:
        await send_json({
            "type": "hello-ack",
            "sessionId": session_id,
            "heartbeatSec": WS_HEARTBEAT_SEC,
            "rotateSec": WS_ROTATE_SEC,
            "rateLimit": {"maxConnPerIp": int(os.getenv("WS_MAX_CONN_PER_IP", "5"))},
        })
    except Exception:
        await websocket.close(code=1011)
        return

    async def should_close() -> bool:
        now = time.time()
        if WS_IDLE_SEC > 0 and now - last_active > WS_IDLE_SEC:
            return True
        if WS_ROTATE_SEC > 0 and now - connected_at > WS_ROTATE_SEC:
            return True
        return False

    # 仅保留最后一次验证：维护一个当前任务
    current_task: Optional[asyncio.Task] = None

    while True:
        # 检查是否需要因空闲/旋转关闭
        if await asyncio.to_thread(should_close):
            # 先发 notice.rotate 或 closing
            try:
                if time.time() - connected_at > WS_ROTATE_SEC:
                    await send_json({"type": "notice", "noticeType": "rotate", "detail": "server_rotate"})
                else:
                    await send_json({"type": "notice", "noticeType": "closing", "detail": "idle_timeout"})
            finally:
                await websocket.close(code=4000)
                logger.info(f"[WS] close session={session_id} code=4000 reason=rotate_or_idle")
                return

        try:
            # 等待消息，设置一个较短的超时以便周期性检查 idle/rotate
            msg_text = await asyncio.wait_for(websocket.receive_text(), timeout=WS_HEARTBEAT_SEC)
            last_active = time.time()
        except asyncio.TimeoutError:
            # 超时仅用于触发上面的 idle/rotate 检查，同时回一个 pong 作为心跳
            try:
                await send_json({"type": "pong"})
                continue
            except Exception:
                await websocket.close(code=1011)
                return
        except WebSocketDisconnect:
            return
        except Exception:
            await websocket.close(code=1011)
            return

        # 解析消息
        try:
            msg = json.loads(msg_text)
        except Exception:
            await send_json({"type": "notice", "event": "error", "code": 400, "message": "INVALID_JSON"})
            continue

        mtype = msg.get("type")
        if mtype == "ping":
            await send_json({"type": "pong"})
            continue
        if mtype == "hello":
            await send_json({
                "type": "hello-ack",
                "sessionId": session_id,
                "heartbeatSec": WS_HEARTBEAT_SEC,
                "rotateSec": WS_ROTATE_SEC,
                "rateLimit": {"maxConnPerIp": int(os.getenv("WS_MAX_CONN_PER_IP", "5"))},
            })
            continue
        if mtype != "validate":
            await send_json({"type": "notice", "noticeType": "error", "code": 422, "detail": "UNSUPPORTED_TYPE"})
            continue

        # validate
        rid = msg.get("rid") or generate_request_id()
        word = (msg.get("word") or "").strip().upper()

        # 基础校验
        if not word or len(word) < 3 or len(word) > 20 or not word.isalpha():
            await send_json({
                "type": "validate-res",
                "rid": rid,
                "word": word,
                "valid": False,
                "source": "validation",
                "latencyMs": 0,
                "cache": False,
                "error_code": 42201,
                "message": "invalid word",
            })
            continue

        # 取消上一个待处理任务，仅保留最后一次
        if current_task and not current_task.done():
            current_task.cancel()

        async def process_validate(rid0: str, word0: str):
            t0 = time.time()
            try:
                # 先查缓存
                cached0 = get_word_from_cache(word0)
                if cached0 is not None:
                    latency_ms0 = int((time.time() - t0) * 1000)
                    logger.info(f"[WS] validate session={session_id} rid={rid0} word={word0} source=cache latencyMs={latency_ms0}")
                    await send_json({
                        "type": "validate-res",
                        "rid": rid0,
                        "word": word0,
                        "valid": bool(cached0.get("valid")),
                        "definition": cached0.get("definition"),
                        "source": "cache",
                        "latencyMs": latency_ms0,
                        "cache": True,
                        "checked_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    })
                    return

                logger.info(f"[WS] call_gemini session={session_id} rid={rid0} word={word0}")
                result0 = await _singleflight(word0, lambda: call_gemini_api(word0))
                if "error" not in result0:
                    save_word_to_cache(word0, result0)

                latency_ms0 = int((time.time() - t0) * 1000)
                logger.info(f"[WS] validate session={session_id} rid={rid0} word={word0} source={'gemini' if 'error' not in result0 else 'fallback'} latencyMs={latency_ms0}")
                await send_json({
                    "type": "validate-res",
                    "rid": rid0,
                    "word": word0,
                    "valid": bool(result0.get("valid")),
                    "definition": result0.get("definition"),
                    "source": "gemini" if "error" not in result0 else "fallback",
                    "latencyMs": latency_ms0,
                    "cache": False,
                    "checked_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "error_code": None if "error" not in result0 else 50001,
                    "message": None if "error" not in result0 else result0.get("error"),
                })
            except asyncio.CancelledError:
                # 被新请求取代，静默取消
                return

        current_task = asyncio.create_task(process_validate(rid, word))


@app.on_event("startup")
async def startup_event():
    """应用启动事件"""
    logger.info("🚀 单词验证服务启动")
    logger.info(f"📋 Gemini 端点: {GEMINI_ENDPOINT}")
    logger.info(f"🔓 CORS 允许来源: {ALLOWED_ORIGINS}")
    if redis_client:
        logger.info(f"💾 Redis 配置: {REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}")
    # 初始化全局 HTTP 客户端（HTTP/2 + 连接池）
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            http2=True,
            timeout=httpx.Timeout(connect=1.0, read=2.5, write=1.0, pool=2.5),
            limits=httpx.Limits(max_connections=64, max_keepalive_connections=16),
            headers={"Content-Type": "application/json"},
        )


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭事件"""
    logger.info("🛑 单词验证服务关闭")
    if redis_client:
        redis_client.close()
    # 关闭全局 HTTP 客户端
    global _http_client
    if _http_client is not None:
        try:
            await _http_client.aclose()
        finally:
            _http_client = None


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
