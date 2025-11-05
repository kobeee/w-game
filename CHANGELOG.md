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