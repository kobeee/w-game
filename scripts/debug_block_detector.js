// 调试脚本：在 Node 中复现当前 BlockDetector 的遮挡算法
// 1）可以跑内置的三层叠放示例
// 2）也可以从布局 JSON（例如 sheep_style_complex）推导所有卡片的遮挡关系

const fs = require('fs');
const path = require('path');

const GRID_UNIT = 90;
const CELL = 45; // 子网格大小（卡片1/2）
const GRID_SIZE = { rows: 7, cols: 7 };
const CENTER_ROW = (GRID_SIZE.rows - 1) / 2; // 3
const CENTER_COL = (GRID_SIZE.cols - 1) / 2; // 3

function gridToWorld(gridRow, gridCol, offsetX, offsetY) {
  const rowOffsetFromCenter = gridRow - CENTER_ROW;
  const colOffsetFromCenter = gridCol - CENTER_COL;
  const worldX = colOffsetFromCenter * GRID_UNIT + offsetX;
  const worldY = rowOffsetFromCenter * GRID_UNIT + offsetY;
  return { x: worldX, y: worldY };
}

function createCard(id, layer, gridRow, gridCol, offsetX = 0, offsetY = 0) {
  const pos = gridToWorld(gridRow, gridCol, offsetX, offsetY);
  const rect = {
    x: pos.x - GRID_UNIT / 2,
    y: pos.y - GRID_UNIT / 2,
    width: GRID_UNIT,
    height: GRID_UNIT
  };
  return { id, layer, rect, removed: false };
}

function getOccupiedCells(card) {
  const leftCell = Math.floor(card.rect.x / CELL);
  const bottomCell = Math.floor(card.rect.y / CELL);
  return [
    { x: leftCell, y: bottomCell },
    { x: leftCell + 1, y: bottomCell },
    { x: leftCell, y: bottomCell + 1 },
    { x: leftCell + 1, y: bottomCell + 1 }
  ];
}

function isOverlap(rect1, rect2) {
  return !(
    rect1.x + rect1.width <= rect2.x ||
    rect2.x + rect2.width <= rect1.x ||
    rect1.y + rect1.height <= rect2.y ||
    rect2.y + rect2.height <= rect1.y
  );
}

/**
 * 使用与 BlockDetector 相同的“子网格栈”算法，计算每张卡片是否被遮挡
 * 返回 cardId -> blocked(boolean)
 */
function computeBlockedStates(cards) {
  const blockedMap = new Map();   // cardId -> boolean

  // 初始化为未遮挡
  for (const card of cards) {
    if (!card.removed) {
      blockedMap.set(card.id, false);
    }
  }

  // 构建 cell -> cards 映射
  const cellMap = new Map(); // "x,y" -> Card[]
  for (const card of cards) {
    if (card.removed) continue;
    const cells = getOccupiedCells(card);
    for (const cell of cells) {
      const key = `${cell.x},${cell.y}`;
      let list = cellMap.get(key);
      if (!list) {
        list = [];
        cellMap.set(key, list);
      }
      list.push(card);
    }
  }

  // 每个子网格内按 layer 排序，只有栈顶卡片可见，其余都被遮挡
  cellMap.forEach((cardsInCell) => {
    if (cardsInCell.length <= 1) return;
    cardsInCell.sort((a, b) => a.layer - b.layer);
    for (let i = 0; i < cardsInCell.length - 1; i++) {
      const lower = cardsInCell[i];
      if (!lower.removed) {
        blockedMap.set(lower.id, true);
      }
    }
  });

  return blockedMap;
}

function dumpState(label, cards) {
  console.log(`\n=== ${label} ===`);
  const blockedMap = computeBlockedStates(cards);

  for (const card of cards) {
    const blocked = blockedMap.get(card.id);
    console.log(
      `Card ${card.id} (layer=${card.layer}, removed=${card.removed}) ` +
      `rect=(${card.rect.x},${card.rect.y},${card.rect.width},${card.rect.height}) ` +
      `cells=${JSON.stringify(getOccupiedCells(card))} ` +
      `blocked=${blocked}`
    );
  }

  // 如需查看子网格，可使用 getOccupiedCells(card) 手动打印
}

function runManualScenario() {
  // 模拟一个典型场景：
  // G 在最底层，B 在 G 上面一层，X 在最上层；
  // 三张牌中心都在网格(3,3)，偏移不同，用于测试1/4、1/2和全挡情况。

  // 底层 G：居中，无偏移
  const G = createCard('G', 0, 3, 3, 0, 0);
  // 中层 B：向上半格偏移（遮挡G的上半部分）
  const B = createCard('B', 1, 3, 3, 0, 45);
  // 顶层 X：向左半格偏移（同时遮挡G的左半部分，以及部分B）
  const X = createCard('X', 2, 3, 3, -45, 0);

  const cards = [G, B, X];

  dumpState('初始', cards);

  // 点击掉中层 B
  B.removed = true;
  dumpState('移除B之后', cards);

  // 再点击掉顶层 X
  X.removed = true;
  dumpState('移除B和X之后', cards);
}

/**
 * 从布局 JSON 中恢复所有卡片，并打印指定网格位置的遮挡关系
 * @param {string} layoutRelPath 相对项目根目录的布局路径
 * @param {number} gridRow 目标行
 * @param {number} gridCol 目标列
 */
function runFromLayout(layoutRelPath, gridRow, gridCol) {
  const layoutPath = path.join(__dirname, '..', layoutRelPath);
  const jsonText = fs.readFileSync(layoutPath, 'utf8');
  const config = JSON.parse(jsonText);

  const cards = config.cards.map((cfg, idx) => {
    const card = createCard(
      `card_${idx}`,
      cfg.layer,
      cfg.gridRow,
      cfg.gridCol,
      cfg.offset.x,
      cfg.offset.y
    );
    return card;
  });

  console.log(`\n=== 来自布局 ${layoutRelPath} 的完整遮挡关系（初始，无移除）===`);
  dumpState('布局初始', cards);

  console.log(
    `\n=== 仅关注 gridRow=${gridRow}, gridCol=${gridCol} 的卡片遮挡关系 ===`
  );
  const blockedMap = computeBlockedStates(cards);
  cards.forEach((card, idx) => {
    const cfg = config.cards[idx];
    if (cfg.gridRow === gridRow && cfg.gridCol === gridCol) {
      const blocked = blockedMap.get(card.id);
      console.log(`Card ${card.id} (layer=${card.layer}) blocked=${blocked}`);
    }
  });
}

// 默认：先跑手写三层叠放示例，再跑布局推导示例（sheep_style_complex 中心格 (3,3)）
runManualScenario();
runFromLayout('src/cocos/assets/resources/layouts/sheep_style_complex.json', 3, 3);


