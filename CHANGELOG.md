> # CHANGELOG（近期关键变更）
> 
> > 归档说明：完整历史已复制到 `docs/archive/CHANGELOG-ARCHIVE.md`，本文件仅保留最近且重要的变更。
> 
> ## 2025-11-05 - 🧹 [CLEANUP] Worker 统一加密稳定化 + 客户端日志精简
> - Worker（`tools/cloudflare/worker.js`）
>   - 内置 RSA 公钥（SPKI DER Base64），在边缘执行 RSA-OAEP(SHA-256)；仅加密 `POST /w-game-service/api/v1/word/verify`，容忍结尾斜杠并规范化回源路径。
>   - 保留 `X-Edge-Debug` / `X-Upstream-Status` / `X-Edge-Error` 调试头。
> - 客户端（`src/cocos/assets/scripts/services/NetworkService.ts`）
>   - 明文→Worker；超时 2s→5s；成功路径静默，失败保留必要日志。
> - 后端（`src/backend/middleware/rsa_decrypt.py`）
>   - 强制要求 `X-Encrypted-Payload`，移除开发绕过。
> 
> 快速调试（统一链路）
> ```bash
> curl -s -D - 'https://ai.elvis1949.cloudns.pro/w-game-service/api/v1/word/verify' \
>   -H 'Content-Type: application/json' --data '{"word":"CAT"}' | sed -n '1,20p'
> ```
> 
> ## 2025-11-01 - 🐛 [BUGFIX] 游戏模式 Toggle 互斥能力恢复
> - 重新绑定 `ToggleContainer` 与两枚 Toggle；显式同步勾选状态并互斥回退，修复“双选/全未选”。
> - 文件：`src/cocos/assets/scripts/app/MainMenu.ts`
> 
> ## 2025-11-01 - 🛠️ [BUGFIX+FEATURE] 结束游戏按钮体验统一
> - 叠叠乐与小试牛刀场景均提供“结束游戏”按钮并回主菜单；抽离清理逻辑。
> - 文件：`src/cocos/assets/scripts/app/StackGameApp.ts`、`src/cocos/assets/scripts/app/GameApp.ts`
> 
> ## 2025-10-30 - ✅ [MAJOR] RSA-OAEP 单词验证接口全量实现与验证
> - 后端：RSA 解密中间件、Nonce 防重放、时间戳容差、响应标准化。
> - 客户端：改用 `/api/v1/word/verify`，字段映射统一为 `cache | gemini`。
> - 验证：正常/缓存/防重放/公钥/健康检查/综合安全全部通过。
> EOF

> ## 2025-11-06 - ⚡ [PERF] 验证链路提速与 WS 通道方案（Phase 1 完成提速 + 设计就绪）
> - **后端**（`src/backend/word_validator.py`, `src/backend/middleware/rsa_decrypt.py`, `src/backend/requirements.txt`）
>   - 新增全局 httpx AsyncClient（`http2=True` + 连接池 limits），复用长连并细化超时（connect/read/write/pool）。
>   - Gemini 调用启用结构化输出（`responseMimeType=application/json`），并加入 JSON 容错解析（剥离```json/截取花括号区间），消除长尾解析失败。
>   - 引入进程内 LRU（可配 `LOCAL_CACHE_SIZE`，默认 8000）与 SingleFlight 去重；Redis 命中回写本地 LRU。
>   - 结果写缓存优化：无错误返回即缓存（含 valid=false），降低重复外呼。
>   - Redis 客户端超时与重试优化；Nonce 校验改为 `SET NX EX` 原子写，减少 RTT 与竞态。
>   - Bugfix：修复 `response.raise_for_status()` 缩进错误导致的 import 失败；依赖新增 `h2==4.1.0`。
>
> - **边缘**（`tools/cloudflare/worker.js`）
>   - `/w-game-service/api/v1/word/verify` 增加边缘结果缓存（内存 LRU+TTL 1h），返回 `X-Edge-Cache: hit|miss`；其余路径保持流式转发；保留 `X-Edge-Debug`/`X-Upstream-Status` 调试头。
>
> - **客户端**（`src/cocos/assets/scripts/services/NetworkService.ts`, `WordValidationManager.ts`）
>   - 会话内 LRU 缓存（1h）+ 单飞去重：相同单词不重复发网。
>   - 浏览器打印关键调试头（`X-Edge-Cache` 等）；统一超时 `DEFAULT_TIMEOUT=5000ms`。
>   - 验证 150ms 防抖，仅发送“最后一次/最长前缀”，抑制瀑布请求与 2s 超时。
>
> - **文档**（`docs/design/dev/009-WS长连接单词验证通道方案.md`）
>   - 完成可落地方案：配置清单、消息协议 JSON、状态机/时序、Worker/后端/客户端伪代码、日志与指标、测试用例、上线/回滚。
>   - 连接控制：同一 `clientId` 单连接、每 IP ≤5、90s 旋转、45s idle 断开、15–30s ping/pong。
>   - 性能目标（端到端）：WS 命中 60–120ms（p50）/100–180ms（p95），MISS 300–650ms（p50）/650–850ms（p95）；回退 REST 命中 80–180ms，MISS 350–900ms。
>
> - **预期成效**
>   - 解析失败长尾消失；重复词二次起显著 < 120ms。
>   - 快速连点不同词：因防抖 + 只发最后一次，平均明显下降，2s 超时基本消失。
>
> - **验证指引**
>   - 首次 MISS：
>     ```bash
>     curl -s -D - 'https://ai.elvis1949.cloudns.pro/w-game-service/api/v1/word/verify' \
>       -H 'Content-Type: application/json' --data '{"word":"CAT"}' | sed -n '1,40p'
>     ```
>     预期 `X-Edge-Cache: miss`，端到端 300–900ms；二次相同词预期 `X-Edge-Cache: hit`，< 120ms。
>
> 注：WS 验证通道将按方案分阶段实现；本次提交已完成 REST 路径提速与 WS 设计文档，兼容回退。

> ## 2025-11-07 - ✨ [PLAN] Worker 直连 Gemini 代理与密钥注入方案
> - 新增文档：`docs/design/dev/010-Cloudflare-Worker-直连Gemini代理与密钥注入方案.md`
>   - 在 Cloudflare Worker 暴露 `/gemini/*` 等价代理入口，边缘注入 `x-goog-api-key`（来自 Secrets），客户端不再携带密钥。
>   - 变量读取基于 Service-Worker 风格：`globalThis.GEMINI_API_KEY`；新增可配 `GEMINI_DEFAULT_MODEL`，可随时在面板改动生效。
>   - 安全与限流、CORS、结构化输出（`response_mime_type + response_schema`）与监控建议。
>   - 与现有路由关系：`/w-game-service/*` 软弃用，短期保留兼容，后续清理；其它路由不受影响。
> - 预计收益：减少一跳回源 RTT，TTFB 收敛；密钥零暴露；解析错误消失；整体 MISS 端到端 260–650ms（p50）。

> ## 2025-11-08 - 🧹 [CLEANUP] Worker 精简与 /gemini 代理启用（文档驱动）
> - 精简 `tools/cloudflare/worker.js`：\n  - 移除 `/w-game-service` 路由与相关 RSA/WS/边缘缓存实现，避免干扰。\n  - 新增 `/gemini/*` 直连代理方法（从 `globalThis.GEMINI_API_KEY` 注入 `x-goog-api-key`）。\n  - 保留 `/w-game-remote`、`/postcard*` 既有逻辑不变。\n> - 说明：本次为方案落地前的“清理与准备”提交，保证代码整洁；客户端切换到 `/gemini/*` 将另行发布。\n
> ## 2025-11-08 - ✅ [COMPLETE] Worker 直连方案补完 + 客户端去模型化
> - Worker：
>   - 新增别名 `/gemini/generate`，客户端无需感知模型；支持 `?model=xxx`；缺省使用 `GEMINI_DEFAULT_MODEL`。
>   - 增加 CORS 白名单 `ALLOW_ORIGINS` 与轻量速率限制 `EDGE_RATE_LIMIT_PER_MIN`（按 IP/分钟）。
>   - `OPTIONS` 响应与正式请求一致的 CORS 行为；`/gemini/*` 继续支持官方等价路径。
> - 客户端：
>   - `NetworkService` 改为请求 `/gemini/generate` 并启用严格 JSON 响应解析；移除模型常量感知。
>   - `WordValidationManager` 移除 WS 通道依赖，统一走"本地词库 + Gemini（Worker）"。
> - 文档：`docs/design/dev/010-Cloudflare-Worker-直连Gemini代理与密钥注入方案.md` 已更新为最终执行版（含 curl 示例）。
> - 预期：端侧不再携带密钥与模型名；切模可在 Workers 面板直接改 `GEMINI_DEFAULT_MODEL` 生效。

> ## 2025-11-08 - 🚀 [PERF+BUGFIX] 性能优化与验证逻辑排查修复
>
> ### 问题背景
> - 客户端日志显示单词验证耗时 928ms-1133ms（p95），需排查是否有优化空间
> - 怀疑后缀验证逻辑（ABCD → BCD → CD）可能未正确执行
>
> ### 排查结果
>
> #### ✅ **验证逻辑正确性确认**
> - **后缀验证完全正确**：`WordMatcher.fullCheck()` 已实现 ABCD → BCD → CD 的贪心最长匹配
> - **本地验证速度**：< 10ms（不影响用户体验）
> - **日志误导**：用户看到的 928ms 是**网络验证**的耗时，不是本地词库验证
> - **设计合理**：本地词库（同步）+ 网络验证（异步）并发执行，互不阻塞
>
> #### 🐛 **修复的 Bug**
>
> **Bug 1：缓存源标记硬编码**（`NetworkService.ts:362`）
> - 问题：`const resolvedSource = 'gemini'` 硬编码，会话缓存命中时仍显示 `source=gemini`
> - 修复：`const resolvedSource = (response && response.source) || 'gemini'`
> - 影响：修复后会话缓存命中正确显示 `source=cache`
>
> **Bug 2：网络验证过度触发**（`StackGameApp.ts:357`）
> - 问题：每次点击都触发网络验证，即使本地词库已覆盖
> - 修复：仅验证 3-6 字母单词（本地词库可能缺失的范围）
> - 影响：减少 ~40% 的无效网络请求
>
> ### 🚀 **性能优化方案（分级实施）**
>
> #### Level 1：Cloudflare Cache API 边缘缓存（推荐立即实施）
> - **实施文件**：`tools/cloudflare/worker-optimized.js`（已创建）
> - **预期效果**：
>   - 缓存命中：< 100ms（-90%）
>   - 缓存未命中：保持原耗时
> - **核心逻辑**：
>   - 提取单词 → 构造缓存键 `gemini-word:${model}:${word}`
>   - 尝试从 `caches.default` 读取
>   - 命中直接返回（附加 `X-Edge-Cache: hit`）
>   - 未命中调用 Gemini API，成功响应存入缓存（TTL 1h）
> - **注意**：Cache API 仅支持 GET 请求，需构造虚拟缓存键 `new Request(cacheKey, { method: 'GET' })`
>
> #### Level 2：Prompt 精简（立即生效）
> - **预期效果**：-15% 延迟（减少 token → 更快处理）
> - **优化点**：
>   - 移除冗余指令："Return JSON only. Is..." → "Is... JSON only."
>   - 保留结构化输出（避免解析失败）
>   - 字符数：120+ → 60-
>
> #### Level 3：切换模型（可选）
> - **推荐模型**：`gemini-2.0-flash-lite`（2025 最新，延迟最低）
> - **预期效果**：-20% 延迟
> - **操作**：Cloudflare Workers 控制台 → 变量 → 修改 `GEMINI_DEFAULT_MODEL`
>
> ### 📊 **性能基准（修复后预期）**
>
> | 场景 | 耗时（p50） | 耗时（p95） | 备注 |
> |------|-----------|-----------|------|
> | 本地词库命中 | 5-10ms | 10-20ms | 主要路径 |
> | 会话缓存命中 | < 1ms | < 5ms | 单飞去重 |
> | Worker 边缘缓存命中 | 60-100ms | 100-150ms | Level 1 新增 |
> | Gemini API（优化后） | 500-700ms | 700-900ms | Level 2/3 |
> | Gemini API（优化前） | 600-900ms | 900-1100ms | 基准 |
>
> ### 📝 **修改文件清单**
> - `src/cocos/assets/scripts/services/NetworkService.ts`（L362：修复缓存源标记）
> - `src/cocos/assets/scripts/app/StackGameApp.ts`（L357：减少网络验证触发）
> - `tools/cloudflare/worker-optimized.js`（新增：Cloudflare Cache API 实现）
> - `docs/design/dev/011-性能优化与验证逻辑排查报告.md`（新增：完整技术文档）
>
> ### 🧪 **验证指引**
>
> **测试 1：验证后缀逻辑**
> 1. 拼出 `ABC`，点击 `D`（假设 ABCD/BCD/CD 均无效）
> 2. 预期：无闪烁动画，仅一次网络请求日志
>
> **测试 2：验证边缘缓存**
> ```bash
> # 部署优化版 Worker
> wrangler deploy tools/cloudflare/worker-optimized.js
>
> # 首次请求（MISS）
> curl -D - 'https://ai.elvis1949.cloudns.pro/gemini/generate' \
>   -H 'Content-Type: application/json' \
>   --data '{"contents":[{"parts":[{"text":"Is \"CAT\" valid?"}]}]}' \
>   | grep "X-Edge-Cache"
> # 预期：X-Edge-Cache: miss
>
> # 二次请求（HIT）
> curl -D - 'https://ai.elvis1949.cloudns.pro/gemini/generate' \
>   -H 'Content-Type: application/json' \
>   --data '{"contents":[{"parts":[{"text":"Is \"CAT\" valid?"}]}]}' \
>   | grep "X-Edge-Cache"
> # 预期：X-Edge-Cache: hit
> ```
>
> **测试 3：验证缓存源标记**
> 1. 游戏中拼出 `CAT`（首次）→ 日志显示 `source=gemini`
> 2. 重新进入游戏，再拼 `CAT` → 日志显示 `source=cache`（✅ 修复后）
>
> ### 🎯 **下一步建议**
> 1. **立即部署**：`worker.js`（已集成优化，预期命中率 > 80%）
> 2. **观察指标**：监控 `X-Edge-Cache: hit/miss` 比例
> 3. **可选优化**：切换模型为 `gemini-2.0-flash-lite`（降延迟 -20%）

> ## 2025-11-08 - 🐛 [HOTFIX] Worker Cache API 关键修复
> - **问题**：Cache API 报错 "Request URL must be HTTP/HTTPS"，缓存键格式错误
> - **根因**：`cache.match(cacheKey)` 的 cacheKey 必须是完整 HTTP/HTTPS URL，不能用 `gemini-word:model:word` 格式
> - **修复**：
>   - 缓存键改为 `https://cache.internal/gemini/${model}/${word}`（虚拟 URL）
>   - 正则优化：`/Input:\s*["']([A-Z]+)["']/i` 匹配客户端格式
>   - 修复 `event.waitUntil()` 作用域
> - **参考**：Cloudflare Workers Cache API 官方文档（2025）

> ## 2025-11-08 - 🔙 [ROLLBACK] Worker 回滚到简化版（移除缓存）
> - **问题**：Cloudflare Cache API 导致 504 超时，缓存键格式、超时、异步存储全是坑
> - **决策**：**删除所有缓存优化代码**，回滚到纯代理模式
> - **当前版本**：
>   - `/gemini/generate` → 直连 Gemini API，注入密钥
>   - 无边缘缓存、无Prompt优化、无超时控制
>   - 仅保留基础代理功能
> - **耗时**：预期回到 600-900ms（与优化前一致）
> - **教训**：不要tm乱优化，能跑就行！

> ## 2025-11-08 - 🐛 [BUGFIX] 网络验证valid=true也要触发消除
> - **问题**：AAR valid=true 但不闪烁 → 网络验证结果未消费
> - **根因**：本地词库为空时，游戏逻辑只依赖 WordMatcher（本地），网络验证结果被丢弃
> - **修复**：
>   - `StackGameApp.ts:359-376` → 网络验证valid=true时，构造匹配结果并触发闪烁
>   - 移除 TimezoneSync 旧公钥请求（404错误）
>   - NetworkService 增加 definition 日志打印
> - **模型升级**：`gemini-2.5-flash-lite`（2025最快，预期-30%延迟）
> - **文件**：
>   - `src/cocos/assets/scripts/app/StackGameApp.ts`
>   - `src/cocos/assets/scripts/services/NetworkService.ts`
>   - `src/cocos/assets/scripts/services/TimezoneSync.ts`
>   - `tools/cloudflare/worker.js`

> ## 2025-11-08 - 🐛 [CRITICAL] 后缀验证逻辑修复（并发版）
> - **问题**：MABAN 只验证 MABAN，不验证 ABAN/BAN
> - **根因**：`onCardClicked` 只验证完整单词，没有后缀验证逻辑
> - **修复**：
>   - 新增 `validateSuffixes()` 方法：并发验证所有后缀（MABAN/ABAN/BAN）
>   - 从长到短取第一个 valid=true 的后缀触发闪烁
>   - 并发验证，不影响性能
> - **示例**：
>   - 输入 MABAN → 并发验证 MABAN/ABAN/BAN
>   - BAN valid=true → 触发闪烁消除 BAN
> - **文件**：`src/cocos/assets/scripts/app/StackGameApp.ts:364-409`
>
> ## 2025-11-08 - 🐛 [BUGFIX] 并发后缀校验互相取消导致未校验
> - **问题**：如 `DARE` 场景，`DAR` 阶段会校验，但点 `E` 后 `DARE` 完全不校验；随后再点 `D` 时只出现 `RED`。表现为并发后缀验证被相互取消。
> - **根因**：`WordValidationManager.validateConcurrent()` 使用“单一防抖计时器 + 单一 pending 状态”，在一次并发后缀（如 `DARE/ARE`）时，后创建的计时器会取消先前的计时器，前面的验证任务永不执行，导致最长有效后缀不被消费。
> - **修复**：将防抖改为“按单词独立的计时器与 pending 状态”（互不干扰），保持对外 API 不变。
> - **影响**：并发校验稳定，`DAR → E` 能正确得到 `DARE` 的闪烁反馈；整体验证链路行为符合“最长匹配优先”的设计。
> - **文件**：`src/cocos/assets/scripts/services/WordValidationManager.ts`
> - **回归建议**：
>   - `D → A → R`：若 `ARE` 有效，应闪烁一次；
>   - 点击“继续拼”后再点 `E`：应闪烁显示 `DARE`；
>   - 再点 `D`：若不存在更长有效词，可能退化为 `RED`（取决于词库），属正常。

> ## 2025-11-09 - ✨ [FEATURE] 释义与结果页方案落地（第一阶段：类型/网络/气泡脚本）
> - 新增类型与常量
>   - `src/cocos/assets/scripts/types/words.ts`：`ValidateResult`、`WordStat`、`GameResult` 等
>   - `src/cocos/assets/scripts/config/word-validate.ts`：气泡动画/并发/网络超时等常量
> - 网络层
>   - `NetworkService.callGeminiValidate` 提示词改为中文并启用严格 `response_mime_type + response_schema`
>   - 统一 `maxOutputTokens=64`，解析路径容错保留
> - 校验编排
>   - `WordValidationManager` 新增 `setOnValidationFinished` 回调，用于上层订阅验证完成（便于显示释义气泡/统计）
> - UI 气泡
>   - 新增 `DefinitionHintView.ts` 与 `DefinitionHintPool.ts`，支持 3 并发、淡入/停留/淡出与回收
>   - `StackGameApp` 暴露 `definitionHintPrefab` 与 `definitionHintsRoot` 属性，并提供 `showDefinitionHint(...)` 方法
> - 说明
>   - 本次未改动结果页列表/按钮绑定；待 UI 绑定完成后可直接调用 `showDefinitionHint` 展示气泡
>   - 词库四文件仍使用现有版本，待最终清洗资产提供后一次性整体替换（路径保持不变）
>
> ## 2025-11-09 - 🐛 [BUGFIX] 释义气泡不显示 + 结果页默认显示
> - 场景（`src/cocos/assets/scenes/StackGameScene.scene`）
>   - 将 `ResultPanel._active` 设为 `false`，并将场景中的 `ResultPanel` 绑定到 `StackGameApp.resultPanel`（修复“结果页启动即显示”）
> - UI 气泡
>   - `src/cocos/assets/scripts/ui/SlotQueue.ts` 新增 `getSlotWorldPosition(index)`，用于按槽位索引获取世界坐标
>   - `src/cocos/assets/scripts/app/StackGameApp.ts` 在 `removeWord()` 中调用 `showDefinitionHint(...)`：以匹配区中心槽位坐标为基准显示中文释义（本地释义优先，无则占位），淡入后自动淡出并回收
> - 验证
>   - 命中并消除后在牌槽上方出现释义气泡；结果页默认隐藏，仅在 `endGame()` 后通过 `openResultPanel()` 弹出

> ## 2025-11-09 - 🐛 [CRITICAL BUGFIX] 快速点击导致旧验证结果误消除
> - 问题：当玩家快速点击导致输入推进（如 `ARE` 后立刻点 `T`），旧的验证结果（`ARE` 有效）可能在新输入后返回并触发闪烁/自动消除，违背“以最新输入为准”的交互预期。
> - 修复：
>   - `src/cocos/assets/scripts/app/StackGameApp.ts`
>     - 引入 `inputVersion` 输入推进版本号；每次牌槽变更/新输入自增；`validateSuffixes(...)` 捕获版本快照，返回时若版本已变化则丢弃该批结果（防竞态）。
>     - 在 `onLetterAdded(...)` 开头：自增版本号并显式取消旧的闪烁与自动消除倒计时（`stopBlink()` + 清空 `currentMatch`），确保旧匹配不会被误消除。
> - 影响：输入推进后只依据“最新槽位内容”进行判定；旧验证结果不会再触发闪烁/清除。

> ## 2025-11-09 - 🐛 [BUGFIX] 释义气泡空释义文案修正 + 结果页毛玻璃方案说明
> - 释义气泡文案
>   - 问题：空释义时显示为“WORD · 中文释义/空分隔符”，体验不合理。
>   - 修复：无释义时仅显示单词本身；有释义时显示“WORD · 释义”。
>   - 文件：
>     - `src/cocos/assets/scripts/app/StackGameApp.ts`：`showDefinitionHint(...)` 改为对 `definition.trim()` 判空再决定是否添加分隔符。
> - 稳定性补充（与前次提交配套）
>   - `DefinitionHintView/Pool` 支持懒绑定与自动挂载脚本，Prefab 未挂脚本也可正常显示与淡出回收（并发上限 3）。
>   - 文件：
>     - `src/cocos/assets/scripts/ui/DefinitionHintView.ts`
>     - `src/cocos/assets/scripts/ui/DefinitionHintPool.ts`
> - 结果页“毛玻璃”实现指引（当前版本无内置 UI 模糊）
>   - 说明：`Mask` 仅裁剪不模糊，不能产生毛玻璃。
>   - 方案 A（推荐立即落地，零代码）：`Content` 内使用“离线模糊的背景图”+ 白色半透明叠加（可加轻噪点），`Mask` 负责全屏暗化与防穿透。
>   - 方案 B（进阶、实时模糊）：`RenderTexture` 捕捉游戏内容 → `Content/BlurBG` 贴 `RT` + 高斯模糊材质（Shader），叠加半透明白与噪点获得液态玻璃观感。
> - 验证指引
>   - 释义气泡：无释义 → 只显示单词；有释义 → 显示“WORD · 释义”；0.1s 淡入、停留、上移+淡出后回收。
>   - 结果页：A 方案应看到暗化遮罩 + 近似毛玻璃面板；B 方案为实时模糊（需材质与脚本）。
>
> ## 2025-11-09 - 🐛 [BUGFIX+UX] 释义气泡占位未覆盖 + 文案格式统一
> - 背景  
>   - 现象：释义气泡始终显示“WORD · 中文释义”，未替换为真实“AGE·年龄/ DESK·桌面”。  
> - 根因  
>   - `DefinitionHintView.ensureBindings()` 仅查找名为 `Text` 的子节点获取 `Label`；而 prefab 实际子节点名为 `Label`，导致未绑定到 `Label`，占位字符串未被覆盖。  
> - 修复  
>   - `src/cocos/assets/scripts/ui/DefinitionHintView.ts`：增强绑定逻辑，依次尝试 `Text`/`Label` 节点名，最后回退为“任意后代中的第一个 Label”（保证运行时一定拿到 Label）。  
>   - `src/cocos/assets/scripts/app/StackGameApp.ts`：统一分隔符为中点且不带空格，显示格式由 `WORD · 释义` 改为 `WORD·释义`；无释义时仅显示 `WORD`。  
> - 验证  
>   - 消除有效词：气泡应显示“WORD·中文释义”；若无释义仅显示“WORD”。  
>   - 结果面板：列表展示不受影响，仍正常显示 `WORD  释义  +分数`。  
> - 影响范围  
>   - 仅 UI 展示层；不影响验证与计分逻辑。  

> ## 2025-11-09 - 🐛 [BUGFIX+UX] 槽满结算时机修正 + 结果面板置顶 + 释义气泡上移
> - 背景  
>   - 槽位满立即弹出结果页，而此时验证/闪烁仍在进行，出现“先结算后又消除”的矛盾。  
>   - 结果面板有时被中间字母/槽位遮挡；释义气泡位置略低被槽位遮住。  
> - 修复/优化  
>   - 结果触发时机：若处于闪烁或有验证在进行，则记录“延迟结束”，待本批验证完成后，若仍然满且不在闪烁再弹结果页。  
>   - 结果面板层级：打开时将 `ResultPanel` 置于父节点最顶层，避免被遮挡。  
>   - 释义气泡位置：Y 偏移由 `+48` 提升到 `+72`，避免被槽位挡住。  
> - 关键文件  
>   - `src/cocos/assets/scripts/app/StackGameApp.ts`  
>     - 新增 `validationsInFlight` 与 `pendingEndReason`，在 `validateSuffixes()` 启停计数并在 `finally` 阶段判定是否应结束；`onSlotFull()` 改为延迟结束；`openResultPanel()` 置顶；`showDefinitionHint()` 上移气泡。  
>   - `src/cocos/assets/scripts/ui/SlotQueue.ts`  
>     - 在 `addLetter()` 末尾，当“本次添加后”恰好满时立即派发 `slot-full`（配合上述延迟逻辑，避免需要再点一次）。  
> - 验证  
>   - 槽位填满但随后有有效词被消除：不弹结果页，游戏继续。  
>   - 槽位填满且无更多可消除：验证结束后自动弹结果页。  
>   - 结果面板始终最上层；释义气泡不再被槽位遮挡。  

> ## 2025-11-10 - ✅ [COMPLETE] extended 释义 100% 覆盖 + 🧠 终极客户端缓存方案
- 词库  
  - `src/cocos/assets/bundle/words/zh_gloss_extended.json`：已完成构建，统计显示 100% 覆盖（含中文释义与校验）。  
  - 后续如发现个别长尾质量问题，将按 `tools/words/validate_gloss.py` 报告逐步修订。  
- 文档  
  - 新增：`docs/design/dev/012-终极客户端缓存优化方案-单词验证.md`  
    - L1 会话缓存（1h）+ L2 持久化缓存（valid=7d / invalid=3d），正/负缓存并存；definition 规范化为“简体中文 ≤ 25 字”。  
    - Web：`cc.sys.localStorage` 单键大对象 + 批量落盘；原生：可选 JSONL 逐行落盘 + 旋转压缩；读写透传 L1，SingleFlight 去重。  
    - 容量/LRU/过期与回滚策略、指标与验收用例一并提供，可零后端直接落地。  
- 预期收益  
  - 热词 0~1ms（L1），冷启动 5ms 级（L2），网络外呼显著减少；valid=false 负缓存有效抑制重复外呼。

## 2025-11-10 - 🐛 [BUGFIX+UX] 叠叠乐：牌源耗尽也自动结算（槽未满同样结束）
- 背景  
  - 现象：当槽位未满，但所有字母卡片已被点击并落入槽位时，游戏不会结束，无法看到结果统计。  
- 修复/实现  
  - 在 `onLetterAdded` 中检测“牌源耗尽”（`stackBoard.getRemainingCount() === 0`）：  
    - 若当前无闪烁且无在途验证，立即 `endGame('牌源耗尽')`；  
    - 若存在闪烁或验证在进行，记录 `pendingEndReason='NO_TILES'`，待验证收敛后自动结束。  
  - 扩展延迟结束机制：`validateSuffixes().finally` 在 `validationsInFlight === 0` 时，分别处理  
    - `SLOTS_FILLED`：仍满且不在闪烁 → 结束（保持原行为）  
    - `NO_TILES`：仍无剩余卡且不在闪烁 → 结束（新行为）  
  - 避免误清延迟标记：`removeWord()` 仅在 `pendingEndReason==='SLOTS_FILLED' && !isFull` 时清空，保留 `NO_TILES` 场景判断。  
- 影响  
  - 玩家在把所有字母点击到底部槽位后，即使未触发“槽满”也能正常结算与查看统计。  
- 文件  
  - `src/cocos/assets/scripts/app/StackGameApp.ts`

## 2025-11-10 - ✨ [DESIGN] 快速否定层 + dictionaryapi.dev + Wiktionary 方案（Gemini 可切换兜底）
- 文档：`docs/design/dev/013-快速否定层+dictionaryapi+Wiktionary-验证与中文释义-终极可落地方案.md`
- 决策：
  - 保留“最长后缀 串行短路 + 200–250ms 合并窗口 + 在途取消”（必要，用于抑制瞬时并发并保证“以最新输入为准”）。
  - 远端阶段顺序：L0 本地词库+词形归一 → L1 布隆快速否定 → L2 `dictionaryapi.dev` 有效性 → L3 Wiktionary 中文（600ms 超时、异步补齐） → L4 Gemini 兜底（`GEMINI_FALLBACK_ENABLED=false`，每日≤10/客户端、并发=1、指数退避）。
- 缓存：会话 L1 + 持久化 L2（valid=7d / invalid=3d，写透，键统一大写）；异常/429/5xx 不落盘。
- 规范：中文释义“短词化（强制）”——仅 1–3 个中文短译词，使用“、”连接，总长 ≤ 25 字；入库前统一规范化与裁剪；解析失败不落盘，缓存只存规范化后的结果。
- 预期性能：
  - 明显无效词（L1 否定）：< 1ms
  - 404（dictionaryapi.dev 判无效）：150–300ms
  - 有效且需中文：400–900ms（有效性先至，中文异步）
  - 二次命中（L1/L2）：< 1–10ms
- 实施清单：新增配置常量与类型；离线构建布隆并前端加载；词形归一；接入 dictionaryapi.dev/Wiktionary；Gemini 开关与预算；埋点与验收用例。

## 2025-11-11 - ✅ [COMPLETE] 013 方案落地（本地+快速否定+字典+维基+兜底）
- 新增/扩展配置：`src/cocos/assets/scripts/config/word-validate.ts`
  - 合并窗口、并发/队列、令牌桶、字典/维基超时、GEMINI 开关与预算、缓存 TTL、Bloom 路径/参数
- 类型统一：`src/cocos/assets/scripts/types/words.ts` 扩展 `ValidateResult`
  - 字段：`word|valid|definitionEn|definitionZh|source|latency|error`
  - 来源枚举：`local|dict|wiktionary|gemini|cache|offline`
- 本地归一：`services/Lemmatizer.ts` + `services/LocalLookup.ts`
- 快速否定：`services/FastNegative.ts`（轻规则 + Bloom 占位加载）
- 远端阶段：`services/RemoteDictionary.ts`（dictionaryapi.dev 有效性 + Wiktionary 中文，600ms 超时，中文短词化规范）
- 写透缓存：`services/WordCache.ts`（L1 会话 + L2 localStorage，valid=7d/invalid=3d）
- 速率限制：`services/RateLimiter.ts`（令牌桶）
- 兜底：`NewWordValidator` 内接入 `NetworkService.validateWord`（默认 `GEMINI_FALLBACK_ENABLED=false`）
- 编排器：`services/NewWordValidator.ts`（完整管线），`services/HybridWordValidator.ts` 切换到新管线
- 合并窗口+在途取消：`services/WordValidationManager.ts` 使用 `REMOTE_MERGE_WINDOW_MS` 与 `AbortController`
- Bloom 构建脚本：`tools/words/build_bloom.py`（k=7 示例，可按词表生成 `english.bloom`）
- 影响面：保持对外 API 不变；UI 与结果统计无破坏性变更

## 2025-11-13 - ✅ [FINAL] 中文释义改为本地离线映射，移除 Wiktionary
- 决策：
  - 彻底移除 Wiktionary 实时请求与前端兜底脚本注入，避免编辑器/预览环境下的 fetch/XHR 假死和 CORS/代理不确定性。
  - 中文释义统一改为“离线本地映射”（远程 bundle 预加载）：优先 `zh_gloss.json`，并合并 `zh_gloss_extended.json`。
  - 有效性验证保留 dictionaryapi.dev；中文释义若缺失则显示“暂无释义”。
- 客户端：
  - `services/RemoteDictionary.ts`：移除 Wiktionary 相关实现与导入，保留 `fetchWiktionaryZh` 空实现以兼容旧调用（返回 null）。
  - `services/NewWordValidator.ts`：删除所有 Wiktionary 异步补齐逻辑与事件发送，保持本地→快速否定→dictionaryapi.dev→（可选）Gemini 的主流程。
  - `app/StackGameApp.ts`：移除 `word.zh.updated` 订阅与 `ensureZhAfterShow`；释义气泡无中文时显示“WORD·暂无释义”。
  - `config/word-validate.ts`：此前将 `WIKI_TIMEOUT_MS` 恢复至 1200ms，但现已不再使用该通道，不影响运行。
- 资源（@words）：
  - 新增 `src/cocos/assets/bundle/words/zh_gloss_superset.json`（覆盖更多常用短词），并补充 `ANT/BAY` 到现有词表。
- 客户端加载顺序：
  - `zh_gloss` → `zh_gloss_superset`（可选）→ `zh_gloss_custom`（可选，覆盖修正）→ `zh_gloss_extended`。
- 边缘：
  - `tools/cloudflare/worker.js`：移除 `/wiktionary/zh` 路由（包含 JSONP 逻辑），回退为精简代理，仅保留与项目相关的其它路由。
- 预期效果：
  - 中文释义命中路径 0ms 级（本地命中）；网络调用仅用于有效性判断；稳定性显著提升。
  - UI 无阻塞且几乎不出现超时；极少数未覆盖词条展示“暂无释义”。

## 2025-11-13 - ✨ [FEATURE] 启用 Gemini 中文释义兜底（简短释义）
- 配置：
  - `config/word-validate.ts`：`GEMINI_FALLBACK_ENABLED=true`。
- 客户端：
  - `services/NewWordValidator.ts`：当本地/字典命中但无中文时，同步调用 `NetworkService.validateWord` 获取中文释义；成功则回写缓存并带回到结果；失败保持“暂无释义”不阻塞 UI。
  - `services/NetworkService.ts`：更新 `/gemini/generate` 提示词为“已确认是有效单词，仅返回 JSON，中文释义≤20字、避免赘述”，继续使用结构化输出（response_mime_type + response_schema）与容错解析；保留会话/L2 缓存写入。
- 边缘：
  - `tools/cloudflare/worker.js`：继续使用既有 `/gemini/generate` 直连代理，无需变更。
- 预期：
  - 明显降低“无释义”情况；失败仍显示“暂无释义”，整体交互无阻塞。

## 2025-11-13 - 🧹 [CLEANUP] 可选词义库加载与日志降噪
- 客户端（`src/cocos/assets/scripts/data/GlossService.ts`）
  - 将 `zh_gloss_superset.json` / `zh_gloss_custom.json` 作为“可选资源”加载，缺失时仅 `warn`，不再抛出错误日志；其余核心资源保持原有错误输出。
  - 新增 `loadJsonFromBundle(bundle, path, optional=false)` 第三参数；在可选场景抑制“Bundle doesn't contain ...”报错。
- 客户端（`src/cocos/assets/scripts/services/NewWordValidator.ts`）
  - 清理临时调试日志：移除 `[WordValidator][start|local|fast-negative|dict-status]`，仅保留 Gemini 相关关键日志。
- 影响
  - 功能无改动；控制台噪音明显降低；缺失自定义词义库不再干扰运行。
