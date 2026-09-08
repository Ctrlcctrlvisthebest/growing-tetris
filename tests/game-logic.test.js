const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const sourcePath = path.join(__dirname, '..', 'sketch.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'leaderboard.js'), 'utf8') + '\n'
  + fs.readFileSync(path.join(__dirname, '..', 'score-history.js'), 'utf8')
  + '\n' + fs.readFileSync(sourcePath, 'utf8');

/** 创建带有最少绘图环境替身的隔离游戏运行环境。 */
function createGameContext() {
  const storage = new Map();
  const context = {
    assert,
    console,
    Math,
    AbortController,
    setTimeout,
    clearTimeout,
    random: (values) => (Array.isArray(values) ? values[0] : 0),
    color: () => ({ setAlpha() {} }),
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: {
      innerWidth: 1000,
      matchMedia: () => ({ matches: false }),
      localStorage: {
        get length() { return storage.size; },
        key: (index) => [...storage.keys()][index] ?? null,
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
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
  return vm.runInContext(`${source}\n${assertionSource}`, context);
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
    assert.equal(board.isValid(0.5, 0, [[0, 0]]), false);
    assert.equal(board.isValid(0, Number.NaN, [[0, 0]]), false);
    assert.equal(board.isValid(0, 0, [null]), false);
    assert.equal(board.isValid(0, 0, [[]]), false);
    assert.equal(board.isValid(0, 0, [[Number.NaN, 0]]), false);
    assert.equal(board.isValid(0, 0, [[0.5, 0]]), false);
  `);
});

// 验证未知旋转参数不会被误当作顺时针旋转，也不会改变方块状态。
test('拒绝异常旋转参数', () => {
  runGameAssertions(`
    board = new Board();
    currentPiece = new Piece('T');
    const before = JSON.stringify(currentPiece.shape);
    assert.equal(currentPiece.rotate(0), false);
    assert.equal(currentPiece.rotate(3), false);
    assert.equal(JSON.stringify(currentPiece.shape), before);
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

// 验证开场曲固定、普通候选池完整，并且高速曲只在允许的速度状态出现。
test('背景音乐按速度选择候选曲目', () => {
  runGameAssertions(`
    hardMode = false;
    growthSpeed = 3;
    piecesLocked = 0;
    assert.equal(
      JSON.stringify(getEligibleMusicTrackIds()),
      JSON.stringify([OPENING_MUSIC_TRACK_ID, 'syncopated-a-minor', 'heavy-break-d-minor']),
    );
    assert.equal(allowsHighGrowthMusic(), false);

    growthSpeed = 10;
    assert.equal(allowsHighGrowthMusic(), true);
    assert.equal(getEligibleMusicTrackIds().includes(HIGH_GROWTH_MUSIC_TRACK_ID), true);

    growthSpeed = 3;
    hardMode = true;
    assert.equal(allowsHighGrowthMusic(), true);
  `);
});

// 验证每次新开局都重置为开场曲，曲目结束后才进入非开场候选轮换。
test('背景音乐固定开场并在结束后轮换', () => {
  runGameAssertions(`
    let playCount = 0;
    backgroundMusic = {
      src: MUSIC_TRACKS['heavy-break-d-minor'],
      currentTime: 12,
      getAttribute: () => MUSIC_TRACKS['heavy-break-d-minor'],
      pause() {},
      load() {},
      play: () => { playCount += 1; return Promise.resolve(); },
    };
    musicEnabled = true;
    gameStarted = true;
    gamePaused = false;
    gameOver = false;
    controlsSuspended = false;
    hardMode = false;
    growthSpeed = 3;
    piecesLocked = 0;
    currentMusicTrackId = 'heavy-break-d-minor';

    resetBackgroundMusicForGame();
    assert.equal(currentMusicTrackId, OPENING_MUSIC_TRACK_ID);
    assert.equal(backgroundMusic.src, MUSIC_TRACKS[OPENING_MUSIC_TRACK_ID]);
    assert.equal(backgroundMusic.currentTime, 0);
    assert.equal(playCount, 1);

    playNextBackgroundMusicTrack();
    assert.equal(currentMusicTrackId, 'syncopated-a-minor');
    assert.equal(backgroundMusic.src, MUSIC_TRACKS['syncopated-a-minor']);
    assert.equal(playCount, 2);
  `);
});

// 验证降低生长速度会立即停止不再符合条件的高速曲，并切回普通候选池。
test('降低生长速度会退出高速曲', () => {
  runGameAssertions(`
    let playCount = 0;
    backgroundMusic = {
      src: MUSIC_TRACKS[HIGH_GROWTH_MUSIC_TRACK_ID],
      currentTime: 8,
      getAttribute: () => MUSIC_TRACKS[HIGH_GROWTH_MUSIC_TRACK_ID],
      pause() {},
      load() {},
      play: () => { playCount += 1; return Promise.resolve(); },
    };
    musicEnabled = true;
    gameStarted = true;
    gamePaused = false;
    gameOver = false;
    controlsSuspended = false;
    hardMode = false;
    growthSpeed = 3;
    piecesLocked = 0;
    currentMusicTrackId = HIGH_GROWTH_MUSIC_TRACK_ID;

    ensureCurrentMusicTrackAllowed();
    assert.equal(currentMusicTrackId, OPENING_MUSIC_TRACK_ID);
    assert.equal(backgroundMusic.src, MUSIC_TRACKS[OPENING_MUSIC_TRACK_ID]);
    assert.equal(playCount, 1);
  `);
});

// 验证异常计时和被脚本篡改的滑杆值不会让游戏状态变成负数或非数字。
test('异常计时与生长速度安全归一化', () => {
  runGameAssertions(`
    assert.equal(normalizeElapsedMs(-100), 0);
    assert.equal(normalizeElapsedMs(Number.NaN), 0);
    assert.equal(normalizeElapsedMs(Number.POSITIVE_INFINITY), 0);
    assert.equal(normalizeElapsedMs(125), 125);

    freezeRemainingMs = 1000;
    updateFreezeTimer(Number.NaN);
    assert.equal(freezeRemainingMs, 1000);
    updateFreezeTimer(-500);
    assert.equal(freezeRemainingMs, 1000);

    speedSlider = { value: 'bad', min: '1', max: '10' };
    speedOutput = { value: '' };
    currentMusicTrackId = OPENING_MUSIC_TRACK_ID;
    handleGrowthSpeedInput();
    assert.equal(growthSpeed, 3);
    assert.equal(speedSlider.value, '3');
    assert.equal(speedOutput.value, '3');

    speedSlider.value = '99';
    handleGrowthSpeedInput();
    assert.equal(growthSpeed, 10);
    speedSlider.value = '-5';
    handleGrowthSpeedInput();
    assert.equal(growthSpeed, 1);
  `);
});

// 验证压缩音乐存在、包含 MP4 容器头和媒体数据，且小于原始 WAV。
test('背景音乐资源配置完整', () => {
  const context = createGameContext();
  vm.runInContext(source, context);
  const sources = vm.runInContext('Object.values(MUSIC_TRACKS)', context);
  assert.equal(sources.length, 4);
  assert.equal(new Set(sources).size, sources.length);
  sources.forEach((relativePath) => {
    const audioPath = path.join(__dirname, '..', relativePath);
    const audio = fs.readFileSync(audioPath);
    assert.equal(audio.subarray(4, 8).toString('ascii'), 'ftyp');
    assert.equal(audio.includes(Buffer.from('moov')), true);
    assert.equal(audio.includes(Buffer.from('mdat')), true);
    assert.equal(audio.length > 4096, true);
    const original = fs.statSync(audioPath.replace(/\.m4a$/, '.wav'));
    assert.equal(audio.length < original.size / 3, true);
  });
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

test('落点缓存随移动、旋转、生长、锁定和消行刷新', () => {
  runGameAssertions(`
    board = new Board();
    currentPiece = new Piece('T');
    const isValid = board.isValid.bind(board);
    let checks = 0;
    board.isValid = (...args) => { checks += 1; return isValid(...args); };
    function verifyLanding() {
      let expected = currentPiece.y;
      while (isValid(currentPiece.x, expected + 1, currentPiece.shape)) expected += 1;
      assert.equal(currentPiece.getLandingY(), expected);
      const before = checks;
      assert.equal(currentPiece.getLandingY(), expected);
      assert.equal(checks, before, 'unchanged preview performs no collision scans');
    }
    verifyLanding();
    currentPiece.move(-1, 0);
    verifyLanding();
    currentPiece.move(0, 1);
    verifyLanding();
    currentPiece.rotate();
    verifyLanding();
    currentPiece.warning = [2, 2];
    currentPiece.commitWarningGrowth();
    verifyLanding();
    board.lock({ x: 0, y: ROWS - 1, shape: Array.from({ length: COLS }, (_, x) => [x, 0]), color: '#fff' });
    verifyLanding();
    assert.equal(board.clearLines(), 1);
    verifyLanding();
    currentPiece = restorePiece(snapshotPiece(currentPiece));
    verifyLanding();
  `);
});

test('静态棋盘只在锁定和消行后重绘', () => {
  runGameAssertions(`
    let painted = 0;
    let copies = 0;
    const context = { clearRect() {}, strokeRect() {}, fillRect() { painted += 1; } };
    createCanvasLayer = () => ({ getContext: () => context });
    drawLayer = () => { copies += 1; };
    board = new Board();
    board.draw();
    for (let i = 0; i < 60; i += 1) board.draw();
    assert.equal(painted, ROWS * COLS);
    assert.equal(copies, 61);
    board.lock({ x: 0, y: ROWS - 1, shape: Array.from({ length: COLS }, (_, x) => [x, 0]), color: '#fff' });
    board.draw();
    assert.equal(painted, ROWS * COLS * 2);
    board.clearLines();
    board.draw();
    assert.equal(painted, ROWS * COLS * 3);
  `);
});

test('冻结按钮仅在显示值改变时更新 DOM', () => {
  runGameAssertions(`
    let labelWrites = 0;
    let label = '';
    freezeButton = {
      disabled: true,
      get textContent() { return label; },
      set textContent(value) { label = value; labelWrites += 1; },
    };
    freezeRemainingMs = 8000;
    updateFreezeButton();
    updateFreezeTimer(10);
    updateFreezeTimer(10);
    assert.equal(labelWrites, 1);
    updateFreezeTimer(100);
    assert.equal(labelWrites, 2);
    assert.equal(label, 'FROZEN 7.9s');
  `);
});

test('帧调度在暂停、设置、后台和结束时停止，恢复不补算后台时间', () => {
  runGameAssertions(`
    const pending = new Map();
    const elapsed = [];
    let id = 0;
    requestAnimationFrame = (callback) => { pending.set(++id, callback); return id; };
    cancelAnimationFrame = (request) => pending.delete(request);
    frameCount = 0;
    draw = (ms) => elapsed.push(ms);
    gameCanvas = {};
    function tick(time) {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(time));
    }
    syncGameLoop();
    tick(0);
    assert.equal(pending.size, 0, 'start screen stays idle');
    gameStarted = true;
    syncGameLoop();
    tick(100);
    assert.equal(pending.size, 1);
    gamePaused = true;
    syncGameLoop();
    tick(200);
    assert.equal(pending.size, 0);
    gamePaused = false;
    controlsSuspended = true;
    syncGameLoop();
    tick(300);
    assert.equal(pending.size, 0);
    controlsSuspended = false;
    document.hidden = true;
    syncGameLoop();
    assert.equal(pending.size, 0);
    document.hidden = false;
    syncGameLoop();
    syncGameLoop();
    assert.equal(pending.size, 1, 'state updates never duplicate the loop');
    tick(30000);
    assert.equal(elapsed.at(-1), 0);
    tick(30000 + FRAME_INTERVAL_MS);
    assert.ok(Math.abs(elapsed.at(-1) - FRAME_INTERVAL_MS) < 0.01);
    gameOver = true;
    syncGameLoop();
    tick(31000);
    assert.equal(pending.size, 0);
  `);
});

test('60 Hz 和 120 Hz 屏幕每秒执行相同次数的游戏更新', () => {
  runGameAssertions(`
    const pending = new Map();
    let id = 0;
    requestAnimationFrame = (callback) => { pending.set(++id, callback); return id; };
    cancelAnimationFrame = (request) => pending.delete(request);
    frameCount = 0;
    let draws = 0;
    draw = () => { draws += 1; };
    gameCanvas = {};
    gameStarted = true;
    function simulate(refreshRate) {
      draws = 0;
      syncGameLoop();
      for (let frame = 0; frame <= refreshRate; frame += 1) {
        const callbacks = [...pending.values()];
        pending.clear();
        callbacks.forEach((callback) => callback(frame * 1000 / refreshRate));
      }
      return draws;
    }
    assert.equal(simulate(60), 61);
    assert.equal(simulate(120), 61);
    assert.equal(simulate(144), 61);
  `);
});

test('单局成绩持续更新，结束、打开历史和重启不重复记录', () => {
  runGameAssertions(`
    restartGame();
    assert.equal(readScoreRecords().length, 0, 'start screen creates no score');
    startGame();
    const runId = activeScoreRecord.id;
    assert.equal(readScoreRecords().length, 1);
    hardDrop();
    assert.equal(readScoreRecords()[0].score, score);
    score = 1234;
    endGame();
    endGame();
    saveScoreProgress();
    assert.equal(readScoreRecords().length, 1);
    assert.equal(readScoreRecords()[0].score, 1234);
    assert.equal(readScoreRecords()[0].status, 'completed');
    restartGame();
    const records = readScoreRecords();
    assert.equal(records.length, 2);
    assert.equal(records.find((record) => record.id === runId).score, 1234);
    assert.equal(activeScoreRecord.score, 0);
    assert.notEqual(activeScoreRecord.id, runId);
  `);
});

test('重新开始和切换模式保存上一局分数及原模式', () => {
  runGameAssertions(`
    restartGame();
    startGame();
    const firstId = activeScoreRecord.id;
    score = 200;
    handleModeRequest();
    let previous = readScoreRecords().find((record) => record.id === firstId);
    assert.equal(previous.mode, 'normal');
    assert.equal(previous.score, 200);
    assert.equal(previous.status, 'mode-change');
    assert.equal(activeScoreRecord.mode, 'hard');
    const secondId = activeScoreRecord.id;
    score = 300;
    restartGame();
    previous = readScoreRecords().find((record) => record.id === secondId);
    assert.equal(previous.mode, 'hard');
    assert.equal(previous.score, 300);
    assert.equal(previous.status, 'restarted');
  `);
});

test('重新加载后仍能读取已完成成绩和中途保存的分数', () => {
  const first = createGameContext();
  vm.runInContext(source + `
    restartGame(); startGame(); score = 456; endGame();
    restartGame(); score = 78; saveScoreProgress();
  `, first);
  const reloaded = createGameContext();
  reloaded.window.localStorage = first.window.localStorage;
  vm.runInContext(source + `
    const records = readScoreRecords();
    assert.equal(records.length, 2);
    assert.equal(records.find((record) => record.status === 'completed').score, 456);
    const unfinished = records.find((record) => record.status === 'playing');
    assert.equal(unfinished.score, 78);
    assert.equal(scoreRecordStatus(unfinished), 'Unfinished');
  `, reloaded);
});

test('不同会话分别保存成绩，不覆盖已有记录', () => {
  const first = createGameContext();
  const second = createGameContext();
  second.window.localStorage = first.window.localStorage;
  vm.runInContext(source + 'restartGame(); startGame(); score = 100; saveScoreProgress();', first);
  vm.runInContext(source + 'restartGame(); startGame(); score = 200; endGame();', second);
  vm.runInContext(`score = 300; endGame();
    assert.deepEqual(Array.from(readScoreRecords(), (record) => record.score).sort(), [200, 300]);
  `, first);
});

test('损坏成绩被忽略，存储不可用时保留本次会话记录', () => {
  runGameAssertions(`
    restartGame(); startGame(); score = 150; endGame();
    window.localStorage.setItem(SCORE_STORAGE_PREFIX + 'broken', '{');
    window.localStorage.setItem(SCORE_STORAGE_PREFIX + 'invalid', JSON.stringify({ ...activeScoreRecord, id: 'invalid', score: -2 }));
    window.localStorage.setItem('other-app', JSON.stringify(activeScoreRecord));
    assert.equal(readScoreRecords().length, 1);
    window.localStorage.setItem = () => { throw new Error('quota exceeded'); };
    restartGame(); score = 500; endGame();
    assert.equal(readScoreRecords().length, 2);
    assert.equal(unsavedScoreRecords.size, 1);
    assert.equal([...unsavedScoreRecords.values()][0].score, 500);
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    assert.equal(readScoreRecords().length, 1);
    assert.equal(scoreStorageReadFailed, true);
    restartGame(); score = 600; endGame();
    assert.equal(readScoreRecords().length, 2);
  `);
});

test('成绩面板拦截游戏键，关闭后保留原有暂停状态', () => {
  runGameAssertions(`
    restartGame(); startGame(); gamePaused = true;
    controlsSuspended = true;
    scoreHistoryDialog = { open: true };
    const piece = currentPiece;
    assert.equal(keyPressed({ code: 'Space' }), undefined);
    assert.equal(currentPiece, piece);
    handleKeybindingKeyDown({ code: 'Escape', preventDefault() { assert.fail('native dialog handles Escape'); } });
    scoreHistoryDialog.open = false;
    resumeAfterScoreHistory();
    assert.equal(gamePaused, true);
    assert.equal(controlsSuspended, false);
    assert.equal(keyPressed({ code: 'Space', target: { closest: () => ({}) } }), undefined);
  `);
});

test('CSV 导出包含所有分页中的成绩，且只创建本地下载', () => {
  runGameAssertions(`
    const downloads = [];
    let exported = '';
    let revoked = null;
    Blob = class { constructor(parts, options) { exported = parts.join(''); assert.match(options.type, /text\\/csv/); } };
    URL = { createObjectURL: () => 'blob:local-test', revokeObjectURL: (url) => { revoked = url; } };
    document.body = { append() {} };
    document.createElement = () => ({ click() { downloads.push({ href: this.href, name: this.download }); }, remove() {} });
    setTimeout = (callback) => callback();
    scoreHistoryRecords = Array.from({ length: 25 }, (_, index) => ({
      id: String(index), score: index * 100, mode: index % 2 ? 'hard' : 'normal',
      startedAt: 1800000000000 + index, updatedAt: 1800000000000 + index, status: 'completed',
    }));
    scoreHistoryPage = 1;
    exportScoreHistory();
    assert.equal(exported.split('\\r\\n').length, 26);
    assert.match(exported, /2400,normal,Game over/);
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].href, 'blob:local-test');
    assert.match(downloads[0].name, /^growing-tetris-scores-.*\\.csv$/);
    assert.equal(revoked, 'blob:local-test');
  `);
});

test('全球榜只提交新完成的对局，并使用开局时的昵称', () => {
  runGameAssertions(`
    const input = { value: '  Alice  ' };
    document.querySelector = (selector) => selector === '[data-player-name]' ? input : null;
    restartGame(); startGame();
    score = 200; saveScoreProgress();
    assert.equal(pendingGlobalScores.size, 0);
    restartGame();
    assert.equal(pendingGlobalScores.size, 0);
    input.value = 'Bob';
    score = 400; endGame(); endGame();
    assert.equal(pendingGlobalScores.size, 1);
    const payload = [...pendingGlobalScores.values()][0];
    assert.equal(payload.playerName, 'Alice');
    assert.equal(payload.score, 400);
    assert.equal(payload.mode, 'normal');
    assert.equal(payload.runId, activeScoreRecord.id);
    assert.equal(readScoreRecords().length, 2);
  `);
});

test('断网队列跨刷新保留，补传成功后只移除队列，不上传旧历史', async () => {
  const first = createGameContext();
  await vm.runInContext(source + `
    (async () => {
      restartGame(); startGame(); score = 700; endGame();
      const old = { ...activeScoreRecord, id: 'historical-run-1', score: 900 };
      window.localStorage.setItem(SCORE_STORAGE_PREFIX + old.id, JSON.stringify(old));
      fetch = async () => { throw new Error('offline'); };
      await assert.rejects(flushGlobalScores(), /offline/);
      assert.equal(pendingGlobalScores.size, 1);
    })();
  `, first);
  const reloaded = createGameContext();
  reloaded.window.localStorage = first.window.localStorage;
  await vm.runInContext(source + `
    (async () => {
      const uploaded = [];
      fetch = async (url, options) => {
        assert.equal(url, '/api/scores');
        uploaded.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ saved: true }) };
      };
      await flushGlobalScores();
      assert.equal(uploaded.length, 1);
      assert.equal(uploaded[0].score, 700);
      assert.equal(pendingGlobalScores.size, 0);
      assert.equal(window.localStorage.getItem(GLOBAL_SCORE_QUEUE_PREFIX + uploaded[0].runId), null);
      assert.equal(readScoreRecords().length, 2);
      await flushGlobalScores();
      assert.equal(uploaded.length, 1);
    })();
  `, reloaded);
});

test('被拒绝的成绩不阻塞后续上传，限流时仍可读取排行榜', async () => {
  await runGameAssertions(`
    (async () => {
      restartGame(); startGame(); endGame();
      restartGame(); endGame();
      let uploads = 0;
      fetch = async () => ++uploads === 1
        ? { ok: false, status: 400 }
        : { ok: true, json: async () => ({ saved: true }) };
      await flushGlobalScores();
      assert.equal(uploads, 2);
      assert.equal(pendingGlobalScores.size, 0);
      assert.equal(readScoreRecords().length, 2);
      assert.equal(rejectedGlobalScore, true);
      restartGame(); endGame();
      const status = { textContent: '' };
      document.querySelector = (selector) => selector === '#global-leaderboard-status'
        ? status : selector === '#global-leaderboard-mode' ? { value: 'hard' } : null;
      const requests = [];
      fetch = async (url, options) => {
        requests.push(url);
        return options.method === 'POST' ? { ok: false, status: 429 }
          : { ok: true, json: async () => ({ entries: [] }) };
      };
      await refreshGlobalLeaderboard();
      assert.equal(requests.join(','), '/api/scores,/api/leaderboard?mode=hard');
      assert.equal(pendingGlobalScores.size, 1);
      assert.match(status.textContent, /Global scores loaded.*waiting to upload/);
    })();
  `);
});
