const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const sourcePath = path.join(__dirname, '..', 'sketch.js');
const source = fs.readFileSync(sourcePath, 'utf8');

/** 创建带有最少绘图环境替身的隔离游戏运行环境。 */
function createGameContext() {
  const context = {
    assert,
    console,
    Math,
    random: (values) => (Array.isArray(values) ? values[0] : 0),
    color: () => ({ setAlpha() {} }),
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: { innerWidth: 1000, matchMedia: () => ({ matches: false }) },
    LEFT_ARROW: 37,
    RIGHT_ARROW: 39,
    DOWN_ARROW: 40,
    UP_ARROW: 38,
    keyIsDown: () => false,
  };
  vm.createContext(context);
  return context;
}

/** 在隔离环境中加载游戏源码并执行一段状态断言。 */
function runGameAssertions(assertionSource, overrides = {}) {
  const context = Object.assign(createGameContext(), overrides);
  vm.runInContext(`${source}\n${assertionSource}`, context);
}

// 验证多行消除会删除目标行并正确补充空行。
test('同时消除多行', () => {
  runGameAssertions(`
    board = new Board();
    board.grid[ROWS - 1].fill('#fff');
    board.grid[ROWS - 2].fill('#fff');
    assert.equal(board.clearLines(), 2);
    assert.equal(board.grid.every((row) => row.every((cell) => cell === null)), true);
  `);
});

// 验证损坏或空形状不会绕过碰撞检查。
test('拒绝异常形状', () => {
  runGameAssertions(`
    board = new Board();
    assert.equal(board.isValid(0, 0, []), false);
    assert.equal(board.isValid(0, 0, [[Number.NaN, 0]]), false);
    assert.equal(board.isValid(0, 0, [[0.5, 0]]), false);
  `);
});

// 验证棋盘顶部之外的锁定不会静默丢失，而是结束游戏。
test('顶部越界锁定结束游戏', () => {
  runGameAssertions(`
    board = new Board();
    currentPiece = new Piece('O');
    currentPiece.x = 0;
    currentPiece.y = 0;
    currentPiece.shape = [[0, -1], [0, 0]];
    gameOver = false;
    hardMode = false;
    lockAndSpawn();
    assert.equal(gameOver, true);
    assert.equal(board.grid[0][0], currentPiece.color);
  `);
});

// 验证无效操作、重复暂存和第四次硬降的困难模式阶段。
test('困难模式只计算有效操作', () => {
  runGameAssertions(`
    board = new Board();
    currentPiece = new Piece('T');
    gameOver = false;
    gamePaused = false;
    hardMode = true;
    freezeRemainingMs = 0;
    hardOperationCount = 0;

    assert.equal(executeGameAction('unknown'), false);
    assert.equal(performOperation(() => currentPiece.move(-100, 0)), false);
    assert.equal(hardOperationCount, 0);

    canHold = false;
    assert.equal(executeGameAction('hold'), false);
    assert.equal(hardOperationCount, 0);
    canHold = true;

    hardOperationCount = 3;
    currentPiece.warning = [3, 1];
    assert.equal(executeGameAction('drop'), true);
    assert.equal(hardOperationCount, 4);
    assert.equal(currentPiece.warning, null);
  `);
});

// 验证玩家操作抛出异常后会清理临时标记并回滚预提交生长。
test('操作异常安全回滚', () => {
  runGameAssertions(`
    board = new Board();
    currentPiece = new Piece('T');
    gameOver = false;
    gamePaused = false;
    hardMode = true;
    freezeRemainingMs = 0;
    hardOperationCount = 3;
    currentPiece.warning = [3, 1];
    const shapeBeforeError = JSON.stringify(currentPiece.shape);
    assert.throws(() => performOperation(() => { throw new Error('测试异常'); }));
    assert.equal(hardOperationInProgress, false);
    assert.equal(JSON.stringify(currentPiece.shape), shapeBeforeError);
  `);
});

// 验证长按会移动方块，但不会重复增加困难模式操作次数。
test('长按移动不重复计数', () => {
  runGameAssertions(`
    board = new Board();
    currentPiece = new Piece('T');
    gameOver = false;
    gamePaused = false;
    hardMode = true;
    freezeRemainingMs = 0;
    assert.equal(executeGameAction('left'), true);
    assert.equal(hardOperationCount, 1);

    heldHorizontalDirection = -1;
    horizontalHoldElapsedMs = HORIZONTAL_HOLD_DELAY_MS - 10;
    const xBeforeRepeat = currentPiece.x;
    handleHeldKeys(100);
    assert.equal(currentPiece.x < xBeforeRepeat, true);
    assert.equal(hardOperationCount, 1);
  `, { keyIsDown: (code) => code === 37 });
});

// 验证松开一种方向键不会清空另一种仍按住的输入计时。
test('输入计时器互不干扰', () => {
  runGameAssertions(`
    horizontalHoldElapsedMs = 100;
    softDropHoldElapsedMs = 50;
    resetHorizontalInputTimers();
    assert.equal(horizontalHoldElapsedMs, 0);
    assert.equal(softDropHoldElapsedMs, 50);

    horizontalHoldElapsedMs = 100;
    resetSoftDropInputTimers();
    assert.equal(horizontalHoldElapsedMs, 100);
    assert.equal(softDropHoldElapsedMs, 0);
  `);
});

// 验证冻结使用真实毫秒、拒绝负时间并能安全归零。
test('冻结时间边界', () => {
  runGameAssertions(`
    freezeRemainingMs = FREEZE_DURATION_MS;
    updateFreezeTimer(1250);
    assert.equal(freezeRemainingMs, 6750);
    updateFreezeTimer(-100);
    assert.equal(freezeRemainingMs, 6750);
    updateFreezeTimer(9999);
    assert.equal(freezeRemainingMs, 0);
  `);
});

// 验证落地方块无法无限重置锁定延迟。
test('锁定延迟重置上限', () => {
  runGameAssertions(`
    board = new Board();
    currentPiece = new Piece('O');
    currentPiece.y = currentPiece.getLandingY();
    lockDelayResetCount = 0;
    for (let index = 0; index < 30; index += 1) {
      currentPiece.move(index % 2 === 0 ? -1 : 1, 0);
    }
    assert.equal(lockDelayResetCount, MAX_LOCK_DELAY_RESETS);
  `);
});
