# 《救救我的萌宠｜叠叠单词》技术选型说明（Cocos Creator + Python 后端）

> 目标：以 **Cocos Creator 3.x + TypeScript** 实现前端微信小游戏；以 **Python（FastAPI）** 实现后端能力（鉴权/榜单/救援码/遥测等）。  
> 原则：**先离线可玩**（V0.1 无后端），整体架构从一开始就为 Python 后端预留接口，后续按版本逐步接入。

---

## 1. 总体架构决策

- **前端（WeChat Mini Game）**
  - **引擎**：Cocos Creator 3.x（TypeScript）
  - **构建目标**：WeChat Mini Game（竖屏）
  - **资源策略**：主包极小 + 远程资源（后续启用）
  - **数据持久化**：本地存储为主；待接入后端后做“客户端优先+合并”策略
  - **与后端交互**：通过 HTTPS REST（wx.request/Creator适配），统一 JSON

- **后端（Python）**
  - **框架**：FastAPI（async、Pydantic 校验）
  - **运行**：Uvicorn（开发）/ Gunicorn+UvicornWorkers（生产）
  - **数据库**：PostgreSQL（关系数据）、Redis（缓存/限流，可选）
  - **对象存储**：COS/OSS/S3 兼容（用于海报/资源，后期）
  - **部署**：Docker 为基线；后续可迁 Serverless（云函数 Python 运行时）
  - **认证**：微信小程序 `code2Session` → openid/unionid；服务端签发短期 JWT/Session
  - **观测**：结构化日志 + 指标（Prometheus/StatsD）+ 错误追踪（Sentry 类）

> **V0.1**：只用前端；**V0.3~V0.4** 起接入“每日关种子/榜单/救援码/遥测”。

---

## 2. 前端技术栈与约定

- **语言/规范**：TypeScript、ES2020、严格模式
- **渲染层**：Cocos 2D UI + 自定义网格叠层渲染
- **状态机**：Boot → Menu → Play → Result（单场景或少场景）
- **适配/交互**
  - 触控：单指点击；按钮最小 44×44px
  - 震动：安全封装 `wx.vibrateShort`/`Long`（非微信环境降级为 no-op）
  - 音效：AudioSource，正确/误点/完成三件套
- **资源管理**
  - 占位美术+合图；后续远程资源启用版本校验与缓存
- **本地存储键位**
  - `seed_today`, `stats_session`, `word_familiarity`, `wrong_words_recent`
- **网络层（预留）**
  - 统一 `fetchJson(path, body, auth?)` 封装；超时/重试/错误码到文案映射

---

## 3. 后端技术栈与约定

- **语言/版本**：Python 3.11+
- **核心依赖**
  - FastAPI / Pydantic（数据校验）
  - SQLAlchemy/SQLModel（ORM）
  - Alembic（数据库迁移）
  - Redis（可选：限流/临时票据/排行榜缓存）
  - httpx/requests（微信 `code2Session`）
  - PyJWT（Token）
- **部署形态**
  - **基础版**：Docker（Gunicorn+UvicornWorkers，Nginx 反代）
  - **Serverless 选项**（后期）：云函数（Python），轻接口拆分
- **安全**
  - 强制 HTTPS；CORS 仅允许小游戏域
  - 签名/时间戳/重放保护（提交分数、救援码）
  - 速率限制（IP/OpenID 维度）

---

## 4. 功能切分与边界（前后端）

| 能力 | 前端（Cocos） | 后端（Python） |
|---|---|---|
| **离线对局** | 关卡生成、可见性/缓冲槽、结算 | —— |
| **每日关种子** | 若无网络用本地规则 | `/v1/seed/today` 返回当日 seed 与参数 |
| **用户鉴权** | 调用登录，缓存 token | `/v1/auth/login` 使用 `code` 换取 openid，签发 JWT |
| **分数提交/榜单** | 上传分数与局摘要 | `/v1/score/submit`、`/v1/leaderboard`（日/周） |
| **救援关（分享码）** | 生成/导入挑战 | `/v1/rescue/create`、`/v1/rescue/consume` |
| **遥测/埋点** | 批量缓存，空闲/结算时上报 | `/v1/telemetry/batch` |

> 断网场景下 **全部可玩**；联机时获得“同步种子/榜单/挑战/遥测”。

---

## 5. API 草案（只定形，不写代码）

- `POST /v1/auth/login`
  - 入参：`wx_code`
  - 出参：`{ token, user: { openid, nickname? } }`

- `GET /v1/seed/today?difficulty=normal`
  - 出参：`{ seed: "2025-09-11-N", expires_at }`

- `POST /v1/score/submit`
  - 入参：`{ seed, score, time_used, misclicks, checksum }`
  - 出参：`{ accepted: true, rank? }`

- `GET /v1/leaderboard?scope=daily&limit=50`
  - 出参：`[{ nickname, score, rank }]`

- `POST /v1/rescue/create`
  - 入参：`{ wrong_words:[...], difficulty }`
  - 出参：`{ rescue_code, expire_at }`

- `POST /v1/rescue/consume`
  - 入参：`{ rescue_code }`
  - 出参：`{ ok: true, level_params }`

- `POST /v1/telemetry/batch`
  - 入参：`[{ event, ts, payload }]`
  - 出参：`{ ok: true }`

**校验与反作弊最小化**  
- `checksum = HMAC(secret, openid|seed|score|time_used|misclicks)`  
- 服务器侧阈值：最短用时、最大分、误点/时间比例、同 seed 提交频率

---

## 6. 数据模型（概念级）

- **users**：`id, openid, created_at, last_login_at, nickname?`
- **scores**：`id, user_id, seed, score, time_used, misclicks, created_at`
- **leaderboards**（派生/缓存）：`scope(date/week), user_id, score, rank`
- **rescue_challenges**：`code, owner_user_id, words[], difficulty, created_at, used_at?`
- **telemetry_events**：`id, user_id?, seed, event, payload(jsonb), ts`

> 迁移：Alembic；所有表含 `created_at/updated_at` 与软删（可选）。

---

## 7. 构建与发布（极简流程）

- **前端**
  1. Cocos 项目 → 构建为 WeChat Mini Game  
  2. WeChat DevTools 预览/真机  
  3. 包体检查（主包 < 4MB），帧率/触控回归
- **后端**
  1. `Dockerfile` 构建镜像  
  2. 数据库迁移 `alembic upgrade head`  
  3. 上线 `docker compose` / K8s / or Serverless  
  4. 健康检查 `/healthz`、日志/指标接通

---

## 8. 配置与密钥（12-Factor）

- **前端**：`APP_ENV, API_BASE_URL, SEED_FALLBACK, LOG_LEVEL`
- **后端**：`DATABASE_URL, REDIS_URL, WX_APPID, WX_SECRET, JWT_SECRET, HMAC_SECRET`
- **密钥管理**：环境变量/Secret Manager；禁止写死到仓库

---

## 9. 性能与预算

- **前端**：目标 60 FPS（低端机≥50）；首屏 < 3s；同屏粒子 ≤ 3
- **后端**：P95 接口 < 120ms；单节点 1k RPS（缓存命中）；队列/批量处理遥测

---

## 10. 安全与隐私

- 仅处理 openid 与玩法数据；不收集个人敏感信息  
- 全链路 HTTPS；JWT 短期（如 2h），Refresh 可选  
- 服务器限流（IP/OpenID）；排行榜与分数接口做签名与阈值校验  
- 日志脱敏（不记录原始输入/音频）

---

## 11. 演进路线（技术侧）

- **V0.1**：纯前端离线 → 固定种子/本地日志  
- **V0.2**：仍离线，优化体验  
- **V0.3**：接入 `auth/login`、`seed/today`、`telemetry/batch`  
- **V0.4**：开启 `score/submit`、`leaderboard` 与 `rescue/*`  
- **V0.5+**：Serverless/对象存储、分享海报生成、更多分析维度

---

## 12. 目录与仓库（建议）

- **frontend/**（Cocos 项目）  
  - `assets/`、`scripts/`、`resources/`、`project.json`  
- **backend/**（Python FastAPI）  
  - `app/`（routers, models, schemas, services）  
  - `migrations/`（Alembic）  
  - `Dockerfile`, `compose.yml`  
  - `.env.example`（示例变量）

---

## 13. 开干前最后确认（只需勾选）

- [ ] 前端：Cocos 3.x 项目初始化（竖屏、TS、占位素材）  
- [ ] 网络层封装：`fetchJson` + 超时/重试（前端）  
- [ ] 后端：FastAPI 模板 + `/healthz` 跑起来  
- [ ] 环境变量：前后端 `.env.example` 填好  
- [ ] 固定 5 组 `seed` 列表（离线回归可用）  
- [ ] README 顶部写明“V0.1 无后端，V0.3 起接入”

---

**结论**：就按 **Cocos Creator（TS）+ Python FastAPI** 定型。  
先把 V0.1 离线做顺，再按路线逐条接后端能力；保持“能玩→更好玩”的节奏，不被工程复杂度拖慢。
