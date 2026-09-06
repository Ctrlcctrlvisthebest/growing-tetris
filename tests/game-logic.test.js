const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const sourcePath = path.join(__dirname, '..', 'sketch.js');
const source = fs.readFileSync(sourcePath, 'utf8');

/** 创建带有最少绘图环境替身的隔离游戏运行环境。 */
function createGameContext() {
  const storage = new Map();
  const context = {
    assert,
    console,
    Math,
    random: (values) => (Array.isArray(values) ? values[0] : 0),
    color: () => ({ setAlpha() {} }),
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: {
      innerWidth: 1000,
      matchMedia: () => ({ matches: false }),
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
    },
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
    heldActions.add('left');
    const xBeforeRepeat = currentPiece.x;
    handleHeldKeys(100);
    assert.equal(currentPiece.x < xBeforeRepeat, true);
    assert.equal(hardOperationCount, 1);
  `);
});

// 验证自定义键位能够驱动游戏，松键后也会清除相应长按状态。
test('自定义键位驱动操作', () => {
  runGameAssertions(`
    board = new Board();
    currentPiece = new Piece('T');
    gameStarted = true;
    gameOver = false;
    gamePaused = false;
    hardMode = true;
    freezeRemainingMs = 0;
    keyBindings.left = 'KeyA';
    const xBeforeMove = currentPiece.x;
    assert.equal(keyPressed({ code: 'KeyA', repeat: false }), false);
    assert.equal(currentPiece.x, xBeforeMove - 1);
    assert.equal(hardOperationCount, 1);
    assert.equal(heldActions.has('left'), true);
    assert.equal(keyReleased({ code: 'KeyA' }), false);
    assert.equal(heldActions.has('left'), false);
  `);
});

// 验证键位冲突采用交换策略，并拒绝系统保留键。
test('键位冲突交换和保留键保护', () => {
  runGameAssertions(`
    keyBindings = { ...DEFAULT_KEY_BINDINGS };
    assert.equal(beginKeyCapture('left'), true);
    assert.equal(handleKeyCapture({ code: 'ArrowRight' }), true);
    assert.equal(keyBindings.left, 'ArrowRight');
    assert.equal(keyBindings.right, 'ArrowLeft');
    assert.equal(isValidKeyBindings(keyBindings), true);

    assert.equal(beginKeyCapture('left'), true);
    assert.equal(handleKeyCapture({ code: 'Escape' }), true);
    assert.equal(keyBindings.left, 'ArrowRight');
    assert.equal(isBindableCode('F5'), false);
    assert.equal(isBindableCode('ControlLeft'), false);
  `);
});

// 验证文档级事件入口可以打开面板并截获改键输入。
test('改键面板事件委托', () => {
  runGameAssertions(`
    keybindingsPanel = { hidden: true };
    keybindingsList = null;
    keybindingsOpenButtons = [];
    let pointerPrevented = false;
    const trigger = { focus() {} };
    handleKeybindingPointerDown({
      target: { closest: (selector) => selector === '[data-open-keybindings]' ? trigger : null },
      preventDefault: () => { pointerPrevented = true; },
    });
    assert.equal(pointerPrevented, true);
    assert.equal(keybindingsPanel.hidden, false);
    assert.equal(controlsSuspended, true);

    bindingCaptureAction = 'left';
    let keyPrevented = false;
    let propagationStopped = false;
    handleKeybindingKeyDown({
      code: 'KeyA',
      preventDefault: () => { keyPrevented = true; },
      stopPropagation: () => { propagationStopped = true; },
    });
    assert.equal(keyPrevented, true);
    assert.equal(propagationStopped, true);
    assert.equal(keyBindings.left, 'KeyA');
  `);
});

// 验证损坏的本地键位数据会安全恢复默认设置。
test('损坏键位存储安全回退', () => {
  runGameAssertions(`
    window.localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, '{bad json');
    loadKeyBindings();
    assert.deepEqual(keyBindings, { ...DEFAULT_KEY_BINDINGS });

    const duplicated = { ...DEFAULT_KEY_BINDINGS, left: 'KeyA', right: 'KeyA' };
    window.localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(duplicated));
    loadKeyBindings();
    assert.deepEqual(keyBindings, { ...DEFAULT_KEY_BINDINGS });
  `);
});

// 验证音乐只在允许播放的游戏状态中播放，并能通过按钮立即静音。
test('背景音乐跟随游戏和开关状态', () => {
  runGameAssertions(`
    let playCount = 0;
    let pauseCount = 0;
    backgroundMusic = {
      play: () => { playCount += 1; return Promise.resolve(); },
      pause: () => { pauseCount += 1; },
    };
    musicToggleButton = {
      textContent: '',
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
    };
    musicEnabled = true;
    gameStarted = true;
    gamePaused = false;
    gameOver = false;
    controlsSuspended = false;

    syncBackgroundMusic();
    assert.equal(playCount, 1);
    assert.equal(pauseCount, 0);

    gamePaused = true;
    syncBackgroundMusic();
    assert.equal(pauseCount, 1);

    gamePaused = false;
    toggleBackgroundMusic();
    assert.equal(musicEnabled, false);
    assert.equal(musicToggleButton.textContent, '♪ MUSIC OFF');
    assert.equal(musicToggleButton.attributes['aria-pressed'], 'false');
    assert.equal(pauseCount, 2);
    assert.equal(window.localStorage.getItem(MUSIC_ENABLED_STORAGE_KEY), 'false');
  `);
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
