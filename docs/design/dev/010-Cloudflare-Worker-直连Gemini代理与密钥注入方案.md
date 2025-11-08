### 目标
- 用 Cloudflare Worker 提供“与官方 Gemini API 等价”的代理入口 `/gemini/*`。
- 由 Worker 在边缘注入 `x-goog-api-key`（来自 Secrets），客户端无须携带密钥，且仓库中不出现密钥。
- 不影响其余既有路由；`/w-game-service/*` 进入“软弃用（deprecate）”，短期保留兼容，后续移除。

### 背景与约束
- 现状：客户端经 Worker 转发到后端，再由后端请求 Gemini，链路多一跳，时延偏高且解析有长尾。
- 诉求：直接在边缘调用 Gemini，省去回源 RTT；同时保持安全（密钥不下发）与最小改造。

### 环境变量/Secrets（Service-Worker 风格读取）
- 在 Cloudflare Workers 控制台“变量和机密”中配置（与你截图一致）：  
  - 机密（Secret）：`GEMINI_API_KEY`（必填）\n  - 变量（Text）：`GEMINI_DEFAULT_MODEL`（可选，默认 `gemini-2.5-flash-lite`）\n  - 变量（Text，可选）：`ALLOW_ORIGINS`（如 `https://ai.example.com,https://game.example.com`）\n  - 变量（Text，可选）：`EDGE_RATE_LIMIT_PER_MIN`（如 `120`）
- 在 Service-Worker 风格脚本中读取（无需 Modules）：\n
```js
// Service-Worker 语法（与当前 worker.js 一致）
const GEMINI_API_KEY = (globalThis && globalThis.GEMINI_API_KEY) || '';
const GEMINI_DEFAULT_MODEL = (globalThis && globalThis.GEMINI_DEFAULT_MODEL) || 'gemini-2.5-flash-lite';
const ALLOW_ORIGINS = (globalThis && globalThis.ALLOW_ORIGINS) || '*';
const EDGE_RATE_LIMIT_PER_MIN = Number((globalThis && globalThis.EDGE_RATE_LIMIT_PER_MIN) || 0);
```

### 路由与映射
- 入口 A：`/gemini/generate`（推荐给客户端使用，客户端无需感知模型）
  - Worker 逻辑：优先读取 query `model`，否则使用 `GEMINI_DEFAULT_MODEL`，再组装官方路径 `.../v1beta/models/<model>:generateContent` 后转发。
  - 客户端调用：`POST https://<your-worker-domain>/gemini/generate`
- 入口 B：`/gemini/*`（与官方路径等价，保留给调试/特殊用途）
  - 例如：`POST https://<your-worker-domain>/gemini/v1beta/models/gemini-1.5-flash-8b:generateContent`
- 请求映射（两入口一致）：
  - 方法/路径/查询参数/请求体：原样透传。
  - 移除一切来自客户端的 key 载体（禁止 query `key=` 与 header `x-goog-api-key` 来自客户端）。
  - Worker 注入：`x-goog-api-key: GEMINI_API_KEY`。
  - Header 规范化：`content-type: application/json; charset=utf-8`。
- 响应：
  - 原样转发 body & status。
  - CORS：依据 `ALLOW_ORIGINS` 输出 `Access-Control-Allow-Origin`（未配置则 `*`）。
  - 可选调试头：`X-Edge-Debug: gemini-proxy`，严禁输出任何密钥或敏感信息。

### 模型可配置（客户端无感知）
- 客户端统一走 `/gemini/generate`。
- Worker 行为：若 query 中有 `model` 则使用之；否则使用变量 `GEMINI_DEFAULT_MODEL`（面板可热切换），以便灰度/回滚。

### 安全与限流
- 密钥不落地：仅在 Worker 内部使用，不写日志/不进响应。
- 仅允许特定方法：`GET/POST/OPTIONS`（多数生成接口为 POST）。
- 速率限制（可选）：
  - 轻量级令牌桶：按 `CF-Connecting-IP` + `User-Agent` 维度限制 `EDGE_RATE_LIMIT_PER_MIN`。
  - 生产建议配合 Cloudflare WAF 速率限制策略（面板级），更稳妥。
- API Key 最小权限：在 GCP 控制台仅勾选“Generative Language API”，关闭其余服务；开启配额告警；定期轮换。

### 结构化输出建议（减少解析错误，提升稳定性）
- 客户端/服务可按需在请求体中使用：
  - `generationConfig.response_mime_type = "application/json"`
  - `generationConfig.response_schema = { valid: boolean, definition: string }`（OBJECT 形式，严格定义）
- 好处：避免 markdown/空串/截断导致的 JSON 解析失败；端内直接 `JSON.parse` 即可。

### 超时与重试
- Worker→Gemini：超时 2.5s–3s；只允许 idempotent 的“网络错误”重试 1 次；`HTTP 429/5xx` 直接透传给客户端处理。

### CORS 与速率限制
- 统一输出：`Access-Control-Allow-Origin: <ALLOW_ORIGINS|*>`，允许 `Content-Type, Authorization, X-Goog-Api-Key, *`。
- `OPTIONS` 直接 204，CORS 与正式请求保持一致来源判断。
- 速率限制（轻量内存令牌桶，默认关闭）：配置 `EDGE_RATE_LIMIT_PER_MIN`（如 `120`，按 `CF-Connecting-IP` 维度），超限返回 429（`{ error: \"RATE_LIMIT\" }`）。生产建议同时配合 Cloudflare WAF 速率限制。

### 监控与日志
- 记录字段（不含密钥）：`method, path, status, ttfb_ms, total_ms, ip_hash, ua_hash`。
- 错误：`UPSTREAM_TIMEOUT, UPSTREAM_5XX, RATE_LIMIT`。

### 与现有路由的关系
- `/w-game-service/*`：进入软弃用状态（deprecate）。短期保留以防回退；方案完成后可在一期清理。
- 其它既有路由（`/w-game-remote`、`/postcard*` 等）：保持原逻辑不变。

### 实施步骤（可直接执行）
1) 控制台配置变量/机密：\n   - 新增 Secret `GEMINI_API_KEY`；新增变量 `GEMINI_DEFAULT_MODEL`（如 `gemini-2.5-flash-lite`）；可选 `ALLOW_ORIGINS`、`EDGE_RATE_LIMIT_PER_MIN`。\n2) 在 `worker.js` 顶部读取变量（示例见上）。\n3) 在 `fetch` 处理函数中：\n   - 匹配 `/gemini/*`：构造上游 `https://generativelanguage.googleapis.com${path}${search}`，移除来路密钥相关字段，注入 `x-goog-api-key`，`Content-Type` 统一为 `application/json; charset=utf-8`，并透传流式响应；返回时设置 CORS 与 `X-Edge-Debug: gemini-proxy`。\n   - （可选）匹配 `/gemini/generate`：若缺 `model`，用 `GEMINI_DEFAULT_MODEL` 组装官方路径。\n4) 自测：使用本文 `curl`，确认 200 且 headers 无密钥泄露；压测 429/5xx 透传与超时行为。\n5) 客户端切换：把原直连 Google 的地址统一改为 Worker `/gemini/*`；无需携带 key。\n6) 观察：统计 `p50/p95` 时延、失败率与配额占用；如需换模，在面板修改 `GEMINI_DEFAULT_MODEL` 即可生效。\n

### 示例（curl）
```bash
curl -s 'https://<worker-domain>/gemini/generate' \
  -H 'content-type: application/json' \
  --data '{
    "contents": [{"parts": [{"text": "Return JSON only. Is \"CAT\" a valid English word? schema: {\\"valid\\": boolean, \\"definition\\": string}"}]}],
    "generationConfig": {"temperature": 0.0, "maxOutputTokens": 32, "response_mime_type": "application/json",
      "response_schema": {"type": "OBJECT", "properties": {"valid": {"type":"BOOLEAN"}, "definition": {"type":"STRING"}}, "required":["valid","definition"]}}
  }'
```

### 迁移与回滚
- Phase 1：新增 `/gemini/*` 代理并灰度接入（仅内部验证用）。
- Phase 2：前端/后端统一改为优先调用 `/gemini/*`；`/w-game-service/*` 只做兜底。
- 回滚：将调用切回后端/REST 旧路径即可（Worker 仍保留旧路由）。

### 验收标准
- 无密钥泄露（代码/日志/响应/URL）
- 请求在边缘直连 Gemini，TTFB 明显下降；
- 结构化输出下无 JSON 解析失败；
- 其余路由行为不变；
- 速率限制与 CORS 生效。
