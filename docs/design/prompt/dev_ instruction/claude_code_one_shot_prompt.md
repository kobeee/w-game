你是我的协作程序员。环境是 **Cocos Creator 3.8.7 / TypeScript / 2D / 微信小游戏**。  
项目结构（已存在）：
```
w-game/
└─ src/cocos/                   # Cocos 工程根
   ├─ assets/
   │  ├─ resources/
   │  │  └─ words/             # 词库已放好
   │  │     ├─ words_core.json
   │  │     ├─ zh_gloss.json
   │  │     ├─ words_core_full.json     # 可能存在
   │  │     └─ zh_gloss_full.json       # 可能存在
   │  ├─ ui/
   │  │  └─ tiles/              # 五态底图：
   │  │     ├─ tile_selectable.png
   │  │     ├─ tile_highlight.png
   │  │     ├─ tile_correct.png
   │  │     ├─ tile_wrong.png
   │  │     └─ tile_disabled.png
   │  └─ scenes/
   │     ├─ Main.scene          # 已创建空场景
   │     ├─ Game.scene          # 已创建空场景
   │     └─ Result.scene        # 已创建空场景
   └─ assets/scripts/           # 代码放这里
```

## 目标
产出 v0.1 可玩版本的全部 **TypeScript 脚本**（完整代码，从 `import` 到结尾），并给出**在编辑器中绑定节点的步骤**与**自测步骤**。  
不要引第三方库。需要动态加载资源时**用 `resources.load`**，且路径相对 `assets/resources/`，不带扩展名。  
UI 组件在 Canvas 下，事件用枚举常量。没有资源时要**降级不报错**（比如 Audio 没有就 no-op）。

## 需要生成的文件（逐个给出完整代码与说明）

1) `assets/scripts/data/GlossService.ts`  
   - `load(useFull:boolean)`：`false`→加载 `words/words_core + zh_gloss`；`true`→加载 `words/words_core_full + zh_gloss_full`。  
   - `pickWord(len:number): string | null`（来自 `by_len`）。  
   - `explain(word:string): string | null`（大写 key）。  
   - `star(word:string)` / `getSessionNotebook(): string[]`（`sys.localStorage`，键名 `notebook_session`，去重）。  

2) `assets/scripts/data/WordBank.ts`  
   - `init(coreJson:any)` 接收 `words_core.json` 的结构；  
   - `pick(len:number): string | null`；`has(len:number, w:string): boolean`。  

3) `assets/scripts/ui/LetterTile.ts`（字母卡组件）  
   - 序列化属性：`charLabel: Label`、`bgSprite: Sprite`；  
   - `setChar(c:string)`；  
   - `setState(state:'selectable'|'selected'|'highlight'|'correct'|'wrong'|'disabled')`；  
   - 从 `ui/tiles/*.png` 动态加载 5 张底图的 `SpriteFrame`（`resources.load('ui/tiles/tile_xxx/spriteFrame')`）。找不到资源时，用纯色材质降级。  

4) `assets/scripts/ui/GameBoard.ts`（4×4 棋盘）  
   - 序列化属性：`rows=4`、`cols=4`、`tilePrefab: Prefab`、`container: Node`；  
   - `spawnGrid(targetWord:string)`：生成网格，并至少嵌入一条**可达路径**（8方向可连）；其他格随机 A–Z（避免全相同）；  
   - 选取规则：只能从当前最后一格的 8 邻接继续；点击已选最后一格可撤销一步；`getCurrentString()` 返回当前选串；  
   - 字符变更时 `this.node.emit('board:change', current)`。  

5) `assets/scripts/ui/GlossSheet.ts`（词义 Bottom Sheet）  
   - 属性：`titleLabel: Label`、`descLabel: Label`、`starButton: Node`、`closeButton: Node`、`panel: Node`；  
   - `show(word:string, zh:string|null, autoMs=1200)`：滑入 200ms，自动停留 autoMs，再滑出（可手动关闭）；中文截断 ≤18 字。  

6) `assets/scripts/ui/HUD.ts`（分数/计时/信息按钮）  
   - 属性：`timerLabel: Label`、`scoreLabel: Label`、`infoButton: Node`；  
   - `bindGlossSheet(sheet:GlossSheet)`；`openGlossFor(word:string, zh:string|null)`。  

7) `assets/scripts/app/GameApp.ts`（主流程）  
   - 属性：`board: GameBoard`、`hud: HUD`；内部 new `GlossService`+`WordBank`；  
   - `onLoad()`：`gloss.load(false)`；初始化 `WordBank`；注册 `board:change`；  
   - 游戏循环：`startGame()`→计时 **60s**（每秒刷新 HUD），`nextRound()`：长度 4–6 随机 → `WordBank.pick(len)` → `board.spawnGrid(targetWord)`；  
   - 点击提交（给 `submit()` 方法，供按钮调用）：若 `board.getCurrentString()===targetWord`：加分（+10），`hud` 更新；`glossSheet.show(...)`；进入下一题；否则播放 `wrong` 状态闪烁并清空选择。  
   - 倒计时到 0：保存本局 `notebook_session`，`director.loadScene('Result')`。  

8) `assets/scripts/app/MainMenu.ts`  
   - Start 按钮：`director.loadScene('Game')`；  
   - 可选开关：`useFull:boolean` 写 `sys.localStorage('use_full_dictionary')`，Game 里读取决定 `gloss.load(true/false)`。  

9) `assets/scripts/app/ResultPage.ts`  
   - 从 `GlossService.getSessionNotebook()` 或 `sys.localStorage('notebook_session')` 读取本局收藏词，按 `WORD - 中文` 显示滚动列表；按钮：`清空`（清掉 session 键）与 `返回主菜单`。  

10) `assets/scripts/util/AudioMgr.ts`（可选，若无资源需 no-op）  
   - 简单 `playCorrect()` / `playWrong()` 方法；尝试从 `resources/sfx/correct`、`resources/sfx/wrong` 加载 `AudioClip`，找不到时安静返回。  

## 组件绑定与自测（必须给出）
- **Main.scene**：Canvas 下放 Start 按钮，挂 `MainMenu.ts`；若实现 `useFull` 开关，也在此绑定。  
- **Game.scene**：
  - 空节点 `GameRoot`，挂 `GameApp.ts`；
  - 子节点 `HUD`，挂 `HUD.ts`，拖入 `timerLabel`/`scoreLabel`/`infoButton`；
  - 子节点 `GlossSheet` 面板，挂 `GlossSheet.ts`，拖入 `titleLabel`/`descLabel`/`starButton`/`closeButton`/`panel`；
  - 子节点 `Board`，挂 `GameBoard.ts`，拖入 `tilePrefab`（预制里包含 `LetterTile.ts`）、设置 `rows=4`、`cols=4`，并将 `container` 指向网格容器节点。  
- **Result.scene**：挂 `ResultPage.ts`；有返回按钮与清空按钮，各自绑定脚本方法。

**自测步骤**：运行 Game.scene → 控制台日志显示词库加载 OK → 随机网格出现 → 按路径点选组成目标词 → 点击提交：正确则加分并自动弹出词义卡，1.2s 后收起；倒计时 60s 到后跳 Result.scene → 结果页能看到本局收藏词列表。

## 其它通用约束
- 不要引入第三方库；所有路径以 `assets/resources/` 为基准使用 `resources.load`；事件统一用枚举常量。  
- 缺资源时降级不报错（例如音效不存在时不抛异常）。  
- 输出请按“**文件为单位分块**”：注明文件路径 → 贴完整源码 → 再给场景绑定步骤与自测清单；不要向我提问，**直接完成**。
