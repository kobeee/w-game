# BAS闪烁被ASK抢占问题修复方案

## 问题描述

**问题编号**：008
**严重等级**：🔴 高
**影响范围**：叠叠乐玩法核心逻辑

### 症状

用户在快速点击字母卡片时（B → A → S → K），出现以下异常行为：

1. BAS 开始闪烁（约 200ms）
2. K 进来后，BAS 闪烁立即停止
3. **ASK 开始闪烁（错误！）**
4. BASK 被完全忽略

### 预期行为

应该显示 **BASK** 闪烁，而不是 ASK。

---

## 根因分析

### 核心问题

当用户在 BAS 闪烁动画进行中快速点击 K 时，存在以下可能的故障点：

#### 问题点 1：本地验证被错误触发

**位置**：`src/cocos/assets/scripts/app/StackGameApp.ts` L586

```typescript
// 当前代码
if (this.validationsInFlight === 0) {
    const match = this.wordMatcher.findWord(letters);
    // ...
}
```

**风险**：
- 如果 BAS 的网络验证刚好完成，`validationsInFlight` 可能变为 0
- 本地验证会被执行，可能返回错误的结果

#### 问题点 2：WordMatcher 可能返回非最长匹配

**位置**：`src/cocos/assets/scripts/core/WordMatcher.ts`

**风险**：
- 如果算法实现有误，`findWord(['B','A','S','K'])` 可能返回 ASK 而不是 BASK
- 查找逻辑可能没有严格按长度降序查找

#### 问题点 3：网络验证排序逻辑可能有问题

**位置**：`src/cocos/assets/scripts/app/StackGameApp.ts` L503-536

**风险**：
- 排序时字段名可能不匹配（`suffix` vs `word`）
- 排序逻辑可能没有正确处理长度相同的情况

---

## 修复方案

### 修复点 1：加强 validationsInFlight 守卫

**文件**：`src/cocos/assets/scripts/app/StackGameApp.ts`

**修改位置**：L559-604（onLetterAdded 方法）

**修改前**：
```typescript
if (this.validationsInFlight === 0) {
    const match = this.wordMatcher.findWord(letters);
    if (match) {
        // 创建 MatchState
    }
}
```

**修改后**：
```typescript
// ✅ 修复点 1：更严格的守卫条件
const shouldLocalValidate = (
    this.validationsInFlight === 0 &&
    this.gameState === GameState.PLAYING &&
    letters.length >= 3
);

console.log(`[DEBUG] shouldLocalValidate=${shouldLocalValidate} (validationsInFlight=${this.validationsInFlight}, gameState=${this.gameState})`);

if (shouldLocalValidate) {
    const match = this.wordMatcher.findWord(letters);
    if (match) {
        console.log(`[DEBUG] 本地验证: 找到 ${match.word}`);
        // 创建 MatchState
        this.currentMatch = match;
        this.currentMatchState = {
            word: match.word,
            versionAtCreation: this.inputVersion,
            source: 'local'
        };
        this.gameState = GameState.BLINKING;
        this.slotQueue.startBlink(match);
    }
} else {
    console.log(`[DEBUG] 跳过本地验证（validationsInFlight=${this.validationsInFlight}）`);
}
```

**改进点**：
1. 增加 `gameState === PLAYING` 检查
2. 增加 `letters.length >= 3` 检查
3. 添加详细日志便于调试

---

### 修复点 2：确保 WordMatcher 返回最长匹配

**文件**：`src/cocos/assets/scripts/core/WordMatcher.ts`

**修改方法**：`findWord(letters: string[]): WordMatch | null`

**修改后**：
```typescript
/**
 * 查找最长的有效后缀单词
 * @param letters 当前字母序列
 * @returns 最长的有效匹配，如果没有则返回 null
 */
public findWord(letters: string[]): WordMatch | null {
    // 确保从最长开始查找
    for (let length = letters.length; length >= 3; length--) {
        const suffix = letters.slice(letters.length - length);
        const word = suffix.join('');

        if (this.dictionary.has(word)) {
            console.log(`[DEBUG] WordMatcher.findWord: 找到匹配 ${word} (长度=${length})`);
            return {
                word: word,
                length: length,
                valid: true
            };
        }
    }

    console.log(`[DEBUG] WordMatcher.findWord: 无匹配`);
    return null;
}
```

**改进点**：
1. 明确从 `letters.length` 降序到 3
2. 第一个匹配的就是最长的
3. 添加日志记录匹配结果

---

### 修复点 3：修复网络验证排序逻辑

**文件**：`src/cocos/assets/scripts/app/StackGameApp.ts`

**修改位置**：L503-536（Promise.all 回调）

**修改后**：
```typescript
Promise.all(promises).then(results => {
    console.log(`[DEBUG] Promise.all 回调: versionAtDispatch=${versionAtDispatch}, inputVersion=${this.inputVersion}`);

    // ✅ 版本号检查
    if (versionAtDispatch !== this.inputVersion) {
        console.log(`[DEBUG] ⚠️ 版本号不匹配，丢弃 (expected=${versionAtDispatch}, actual=${this.inputVersion})`);
        this.validationsInFlight = Math.max(0, this.validationsInFlight - 1);
        return;
    }

    // ✅ 确保排序字段正确
    console.log(`[DEBUG] 排序前: ${results.map(r => `${r.word || r.suffix}(len=${r.length}, valid=${r.valid})`).join(', ')}`);

    const sorted = [...results].sort((a, b) => {
        // 优先按长度降序
        if (b.length !== a.length) {
            return b.length - a.length;
        }
        // 长度相同时，有效的优先
        if (a.valid !== b.valid) {
            return a.valid ? -1 : 1;
        }
        return 0;
    });

    console.log(`[DEBUG] 排序后: ${sorted.map(r => `${r.word || r.suffix}(len=${r.length}, valid=${r.valid})`).join(', ')}`);

    const validMatch = sorted.find(r => r.valid);

    console.log(`[DEBUG] 选择结果: ${validMatch ? (validMatch.word || validMatch.suffix) : 'null'}`);

    // ✅ 更严格的状态检查
    if (validMatch && this.gameState === GameState.PLAYING) {
        const word = validMatch.word || validMatch.suffix;

        console.log(`[DEBUG] ✅ 创建 MatchState: word=${word}, version=${versionAtDispatch}`);

        this.currentMatch = {
            word: word,
            length: validMatch.length,
            valid: true
        };

        this.currentMatchState = {
            word: word,
            versionAtCreation: versionAtDispatch,
            source: 'network'
        };

        this.gameState = GameState.BLINKING;
        this.slotQueue.startBlink(this.currentMatch);
    }

    this.validationsInFlight = Math.max(0, this.validationsInFlight - 1);
    console.log(`[DEBUG] validationsInFlight-- (${this.validationsInFlight + 1}→${this.validationsInFlight})`);
});
```

**改进点**：
1. 兼容 `word` 和 `suffix` 字段名
2. 排序时优先按长度，其次按有效性
3. 版本号不匹配时也要减少 `validationsInFlight`
4. 添加详细日志

---

## 推演测试验证

### 测试场景 1：快速点击（间隔 50ms）

**操作序列**：B → A → S → K

**时间线**：

```
T=0ms:    点击 B
          ├─ inputVersion = 1
          ├─ validationsInFlight = 1
          └─ gameState = PLAYING

T=50ms:   点击 A
          ├─ inputVersion = 2
          ├─ validationsInFlight = 2
          └─ 跳过本地验证（validationsInFlight > 0）✓

T=100ms:  点击 S
          ├─ inputVersion = 3
          ├─ validationsInFlight = 3
          └─ 跳过本地验证（validationsInFlight > 0）✓

T=150ms:  BAS 验证完成
          ├─ versionAtDispatch = 3, inputVersion = 3 ✓
          ├─ 选择: BAS
          ├─ gameState = BLINKING
          └─ validationsInFlight = 2

T=160ms:  点击 K（BAS 还在闪烁中）
          ├─ inputVersion = 4
          ├─ gameState = BLINKING → 清除 MatchState → PLAYING
          ├─ validationsInFlight = 2
          ├─ shouldLocalValidate = false（validationsInFlight > 0）✓✓✓
          └─ 跳过本地验证

T=180ms:  发起 BASK 验证
          └─ validationsInFlight = 3

T=250ms:  BASK 验证完成
          ├─ versionAtDispatch = 4, inputVersion = 4 ✓
          ├─ results = [BASK(4,true), ASK(3,true)]
          ├─ 排序后: BASK(4,true), ASK(3,true) ✓
          ├─ 选择: BASK ✓✓✓
          └─ startBlink(BASK) ✓✓✓
```

**预期结果**：✅ BASK 闪烁，ASK 被忽略

---

### 测试场景 2：极端情况（validationsInFlight 突然变 0）

**假设**：K 进来时，所有前面的验证都刚好完成

**时间线**：

```
T=35ms:   点击 K
          ├─ inputVersion = 4
          ├─ gameState = BLINKING → PLAYING
          ├─ validationsInFlight = 0 ⚠️
          ├─ shouldLocalValidate = true ⚠️
          └─ 执行本地验证
             ├─ wordMatcher.findWord(['B','A','S','K'])
             ├─ 返回: BASK（因为修复了 WordMatcher）✓✓✓
             └─ startBlink(BASK) ✓✓✓

T=40ms:   BASK 网络验证完成
          ├─ versionAtDispatch = 4, inputVersion = 4 ✓
          └─ gameState = BLINKING（已被本地验证设置）
             └─ 不重复创建 ✓
```

**预期结果**：✅ BASK 闪烁（本地验证触发，但结果正确）

---

## 单元测试

### 测试 1：WordMatcher.findWord()

**文件**：`src/cocos/assets/scripts/tests/test_word_matcher.ts`

```typescript
import { WordMatcher } from '../core/WordMatcher';

describe('WordMatcher.findWord()', () => {
    let matcher: WordMatcher;

    beforeEach(() => {
        matcher = new WordMatcher();
        matcher.loadDictionary(['ASK', 'BASK', 'TASK', 'BASKET', 'BAS']);
    });

    it('应该返回最长的有效匹配 BASK', () => {
        const result = matcher.findWord(['B', 'A', 'S', 'K']);
        expect(result?.word).toBe('BASK');
        expect(result?.length).toBe(4);
    });

    it('应该返回 BAS 而不是 AS', () => {
        const result = matcher.findWord(['B', 'A', 'S']);
        expect(result?.word).toBe('BAS');
    });

    it('应该返回 BASKET 而不是 BASK', () => {
        const result = matcher.findWord(['B', 'A', 'S', 'K', 'E', 'T']);
        expect(result?.word).toBe('BASKET');
    });

    it('没有匹配时应该返回 null', () => {
        const result = matcher.findWord(['X', 'Y', 'Z']);
        expect(result).toBeNull();
    });
});
```

---

### 测试 2：validationsInFlight 守卫

**文件**：`src/cocos/assets/scripts/tests/test_validation_guard.ts`

```typescript
import { StackGameApp } from '../app/StackGameApp';
import { GameState } from '../data/StackTypes';

describe('validationsInFlight 守卫', () => {
    let app: StackGameApp;

    beforeEach(() => {
        app = new StackGameApp();
        app.init();
    });

    it('validationsInFlight > 0 时应该跳过本地验证', () => {
        app['validationsInFlight'] = 2;
        app['gameState'] = GameState.PLAYING;

        const spy = jest.spyOn(app['wordMatcher'], 'findWord');

        app['onLetterAdded']({ letter: 'K' });

        expect(spy).not.toHaveBeenCalled();
    });

    it('validationsInFlight = 0 时应该执行本地验证', () => {
        app['validationsInFlight'] = 0;
        app['gameState'] = GameState.PLAYING;

        const spy = jest.spyOn(app['wordMatcher'], 'findWord');

        app['onLetterAdded']({ letter: 'K' });

        expect(spy).toHaveBeenCalled();
    });

    it('gameState = BLINKING 时应该先清除再检查', () => {
        app['validationsInFlight'] = 0;
        app['gameState'] = GameState.BLINKING;
        app['currentMatchState'] = { word: 'BAS', versionAtCreation: 3, source: 'network' };

        app['onLetterAdded']({ letter: 'K' });

        expect(app['currentMatchState']).toBeNull();
        expect(app['gameState']).toBe(GameState.PLAYING);
    });
});
```

---

## 手动验证步骤

### 步骤 1：在 Cocos Creator 中测试

1. 打开 Cocos Creator，加载项目
2. 打开叠叠乐场景
3. 点击 Play 按钮
4. 快速点击字母卡片：B → A → S → K（间隔 < 100ms）
5. 观察控制台日志和游戏表现

**预期日志关键片段**：
```
[DEBUG] onLetterAdded: 跳过本地验证（validationsInFlight=2）
[DEBUG] Promise.all 回调: versionAtDispatch=4, inputVersion=4
[DEBUG] 排序后: BASK(4,true), ASK(3,true)
[DEBUG] 选择结果: BASK
[DEBUG] ✅ 创建 MatchState: word=BASK
```

**预期游戏表现**：
- BAS 闪烁约 1 秒
- K 进来后，BAS 闪烁停止
- **BASK 开始闪烁**（不是 ASK）

---

### 步骤 2：使用测试脚本

**文件**：`scripts/test_issue_008.js`

```javascript
// 模拟快速点击测试

const TEST_CASES = [
    { name: "快速点击 50ms", letters: ['B','A','S','K'], interval: 50, expected: 'BASK' },
    { name: "极速点击 10ms", letters: ['B','A','S','K'], interval: 10, expected: 'BASK' },
    { name: "正常速度 500ms", letters: ['B','A','S','K'], interval: 500, expected: 'BASK' }
];

async function runTest(testCase) {
    console.log(`\n===== ${testCase.name} =====`);

    const app = new StackGameApp();
    await app.init();

    for (const letter of testCase.letters) {
        console.log(`点击: ${letter}`);
        app.onCardClicked(letter);
        await sleep(testCase.interval);
    }

    await sleep(2000); // 等待验证完成

    const match = app.getCurrentMatch();
    const pass = match?.word === testCase.expected;

    console.log(`结果: ${match?.word} ${pass ? '✅' : '❌'}`);
    return pass;
}

async function main() {
    let passed = 0;
    for (const tc of TEST_CASES) {
        if (await runTest(tc)) passed++;
    }
    console.log(`\n通过: ${passed}/${TEST_CASES.length}`);
}

main();
```

---

## 回归测试清单

修复完成后，必须通过以下测试：

- [ ] **RT1**: 快速点击（50ms）B→A→S→K，显示 BASK 闪烁
- [ ] **RT2**: 极速点击（10ms）B→A→S→K，显示 BASK 闪烁
- [ ] **RT3**: 正常点击（500ms）B→A→S→K，显示 BASK 闪烁
- [ ] **RT4**: WordMatcher 单元测试全部通过
- [ ] **RT5**: validationsInFlight 守卫单元测试全部通过
- [ ] **RT6**: 控制台日志显示正确的排序结果
- [ ] **RT7**: 玩 5 局游戏，不出现 ASK 抢占 BASK 的情况

---

## 监控和预防

### 关键监控指标

1. **validationsInFlight 异常值**：如果 > 10，触发告警
2. **本地验证调用频率**：应该 < 20% 的字母添加事件
3. **最长匹配一致性**：网络验证和本地验证结果应该一致

### 预防措施

1. **代码层面**：
   - 在 `WordMatcher.findWord()` 中添加 assert 确保降序查找
   - 在排序逻辑中添加单元测试覆盖所有组合

2. **流程层面**：
   - 每次发布前运行完整回归测试
   - 监控线上错误日志

3. **文档层面**：
   - 在代码中添加详细注释
   - 更新开发文档记录本次修复

---

## 修复时间估算

| 任务 | 估计时间 |
|------|---------|
| 修复 validationsInFlight 守卫 | 1 小时 |
| 修复 WordMatcher.findWord() | 1 小时 |
| 修复排序逻辑 | 30 分钟 |
| 编写单元测试 | 1 小时 |
| 手动验证 | 1 小时 |
| **总计** | **4.5 小时** |

---

**文档版本**：v1.0
**创建时间**：2025-11-17
**状态**：待实施
