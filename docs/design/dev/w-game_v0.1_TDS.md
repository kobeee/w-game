# w-game（《拯救萌宠·猜单词》）v0.1 需求分析与系统设计（更新版 TDS）
**项目名**：w-game（w = word）  
**范围**：v0.1（最小可玩）  
**平台/引擎**：微信小游戏 / Cocos Creator 3.x（TS）  
**项目结构**：外层仓库；内层 Cocos 项目位于 **`src/cocos/`**。

---

## 0. 概览（What）
- **核心闭环**：60s → 选字组成词 → 提交校验 → 正/误反馈 → 下一题/结果页。
- **新增：词义解释（In-Game Gloss）**：答对后短暂展示词义卡；HUD “i” 可手动打开；结果页显示“本局生词本”。

---

## 1. 目录结构（How）
```
w-game/
├─ docs/
│  ├─ prd_v0.1_updated.md
│  ├─ wordlist_guide.md
│  ├─ wordlist_logic.md
├─ src/
│  └─ cocos/                 # Cocos 项目根
│     ├─ assets/
│     │  ├─ scenes/          # Main / Game / Result
│     │  ├─ ui/              # 背景/字母卡/按钮/面板/图标 …
│     │  └─ words/
│     │     ├─ words_core.json
│     │     ├─ zh_gloss.json           # ← 可选（若未内嵌）
│     │     └─ MANIFEST.json
│     ├─ scripts/
│     │  ├─ app/             # 入口与场景生命周期
│     │  ├─ core/            # 规则/算法/实体
│     │  ├─ platform/cocos/  # 组件/场景/资源适配
│     │  ├─ ui/              # UI 逻辑与状态联动
│     │  ├─ data/            # 资源加载与配置
│     │  └─ util/            # 工具库
│     ├─ tsconfig.json
│     └─ project.json
└─ tools/wordlist/           # 词库工具（离线执行）
```

---

## 2. 模块职责（How）
- **RuleService**：取词、合法性校验、可解字母池生成。
- **BoardManager**：格子、卡片状态、点击/撤销。
- **Timer**：倒计时控制与广播。
- **FeedbackService**：正确/错误动画与宠物表情联动。
- **GlossService（新增）**：词义加载/查询/展示与收藏（见 §4）。

---

## 3. 数据（How）
- **词库**：`words_core.json`（按长度分桶）。
- **中文释义**：
  - 分文件：`zh_gloss.json`（键：大写英文，值：中文简释）；**推荐 v0.1**。
  - 内嵌：`words_core.json.gloss`（由工具 `--embed-gloss true` 写入）。
- **本地存储**：
  - `notebook_session`：本局收藏词数组（去重）。

---

## 4. 词义解释（In-Game Gloss）详细设计
### 4.1 What / When
- **自动展示**：提交**正确**后，Bottom Sheet 1.2s；玩家触摸延长至 2.5s。
- **手动展示**：HUD “i” 按钮；不暂停计时。
- **缺失兜底**：无释义 → “暂无释义”，仍可⭐收藏。

### 4.2 GlossService（接口）
```ts
// @data/GlossService.ts
export interface GlossQuery {
  word: string;           // 原词（大写）
  base?: string;          // 归一化后词形（若发生词形还原）
  zh?: string | null;     // 中文简释，null 表示缺失
}

export class GlossService {
  async load(): Promise<void>;  // 在 Game.Ready 阶段调用，一次加载到内存
  explain(word: string): GlossQuery;   // 查询：原词→zh 或 归一化→zh
  star(word: string): void;            // 收藏到 notebook_session（去重）
  getSessionNotebook(): string[];      // 结果页读取
}
```
**实现要点**：  
- 加载时尝试读取 `zh_gloss.json`；若不存在且 `words_core.json.gloss` 有值则使用内嵌。  
- 归一化规则（轻量）：`ing|ed|es|s` 后缀剥离；`ier|iest → y`；优先命中原词。  
- 数据常驻内存 Map，查询 O(1)。

### 4.3 UI 组件
- `InfoButton`（24×24）：位于 HUD；点击触发 `GlossService.explain(Current/Last)`。
- `GlossSheet`（Bottom Sheet）：词头、中文、⭐、✕；上滑展开、点击空白或✕关闭。

### 4.4 埋点
- `gloss_auto_show`（word, has_gloss, duration_ms）  
- `gloss_manual_open`（word, source）  
- `notebook_star`（word, dedup）

### 4.5 失败与降级
- 无 `zh_gloss`：功能降级，仅显示词头与占位，不阻塞主循环。

---

## 5. 时序（When）
1. **Ready**：加载词库与 `zh_gloss` → 引导（首局）  
2. **Playing**：点击→候选→提交→（Correct? GlossSheet 弹出）→ 下一题  
3. **Result**：展示成绩与“本局生词本”

---

## 6. 性能与质量（How）
- `zh_gloss.json` 预计几百 KB；一次加载进内存 Map。  
- GlossSheet 动效：入 200ms、出 120ms；与棋盘输入互不阻塞。

---

## 7. 测试用例（新增）
- 正确后 1.2s 自动词义卡出现且可交互；倒计时继续。  
- 手动点击 HUD “i” 时词义卡可开合。  
- 无释义词显示占位、可收藏；结果页展示“本局生词本”。

---

## 8. 工程约定（补充）
- 资源路径：`src/cocos/assets/words/`；构建脚本会自动创建目录。  
- 运行失败时日志：GlossService 仅 `warn`，不 `throw`。

