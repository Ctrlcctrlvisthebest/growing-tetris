const COLS = 10;
const ROWS = 20;
const CELL = 30;
const BOARD_X = 100;
const BOARD_Y = 50;
const PREVIEW_COUNT = 5;
const FALL_INTERVAL_MS = 500;
const LOCK_DELAY_MS = 650;
const MAX_LOCK_DELAY_RESETS = 15;
const HORIZONTAL_HOLD_DELAY_MS = 140;
const HORIZONTAL_REPEAT_MS = 70;
const SOFT_DROP_HOLD_DELAY_MS = 60;
const SOFT_DROP_REPEAT_MS = 45;
const MAX_FRAME_ELAPSED_MS = 100;
const FRAME_INTERVAL_MS = 1000 / 60;
const FREEZE_DURATION_MS = 8_000;
const GROWTH_WARNING_FRAMES = 45;
const PIECES_PER_SPEED_LEVEL = 5;
const GROWTH_SPEED_STEP_FRAMES = 12;
const MIN_GROWTH_INTERVAL = 60;
const SPEED_UP_NOTICE_FRAMES = 90;
const LINE_CLEAR_NOTICE_FRAMES = 90;
const PIECE_REPEAT_WEIGHT_BY_AGE = [0, 0.25, 0.5, 0.75];
const KEY_BINDINGS_STORAGE_KEY = 'growing-tetris-key-bindings-v1';
const MUSIC_ENABLED_STORAGE_KEY = 'growing-tetris-music-enabled-v1';
const MUSIC_VOLUME = 0.32;
const HIGH_GROWTH_MUSIC_INTERVAL_FRAMES = 150;
const OPENING_MUSIC_TRACK_ID = 'opening';
const HIGH_GROWTH_MUSIC_TRACK_ID = 'arcade-rush';
const MUSIC_TRACKS = Object.freeze({
  opening: 'assets/audio/growing-tetris-a-natural-minor-fast.m4a',
  'syncopated-a-minor': 'assets/audio/groove-01-syncopated-a-minor-v2.m4a',
  'heavy-break-d-minor': 'assets/audio/groove-02-heavy-break-d-minor-v2.m4a',
  'arcade-rush': 'assets/audio/groove-03-arcade-rush-e-minor.m4a',
});
const DEFAULT_KEY_BINDINGS = Object.freeze({
  left: 'ArrowLeft',
  right: 'ArrowRight',
  down: 'ArrowDown',
  rotate: 'ArrowUp',
  'rotate-ccw': 'KeyZ',
  'rotate-180': 'KeyX',
  drop: 'Space',
  hold: 'KeyC',
  freeze: 'KeyF',
  pause: 'KeyP',
  mode: 'KeyH',
  restart: 'KeyR',
});
const KEY_BINDING_ACTIONS = Object.freeze([
  ['left', 'Move left'],
  ['right', 'Move right'],
  ['down', 'Soft drop'],
  ['rotate', 'Rotate clockwise'],
  ['rotate-ccw', 'Rotate counterclockwise'],
  ['rotate-180', 'Rotate 180°'],
  ['drop', 'Hard drop / start'],
  ['hold', 'Hold / swap'],
  ['freeze', 'Use Freeze'],
  ['pause', 'Pause / resume'],
  ['mode', 'Toggle hard mode'],
  ['restart', 'Restart'],
]);

const SHAPES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
};

const COLORS = {
  I: '#38d8e8', O: '#ffc247', S: '#ff4c61', Z: '#5be078',
  L: '#ff9d45', J: '#ff659d', T: '#a879ff',
};
const ROTATION_PIVOTS = {
  I: [1.5, 1.5],
  O: [1.5, 0.5],
  S: [1, 1], Z: [1, 1], L: [1, 1], J: [1, 1], T: [1, 1],
};

// 标准超级旋转系统的踢墙数据已转换为画布坐标系，其中纵轴正方向向下。
const JLSTZ_KICKS = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const I_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};
const PIECE_TYPES = Object.keys(SHAPES);

let board;
let currentPiece;
let nextQueue = [];
let pieceGenerationHistory = [];
let heldPiece = null;
let canHold = true;
let score = 0;
let piecesLocked = 0;
let speedUpNoticeFrames = 0;
let lineClearNotice = null;
let gameOver = false;
let gameStarted = false;
let gamePaused = false;
let fallElapsedMs = 0;
let lockElapsedMs = 0;
let lockDelayResetCount = 0;
let hardOperationInProgress = false;
let heldHorizontalDirection = 0;
let horizontalHoldElapsedMs = 0;
let horizontalRepeatElapsedMs = 0;
let softDropWasHeld = false;
let softDropHoldElapsedMs = 0;
let softDropRepeatElapsedMs = 0;
let hardMode = false;
let hardOperationCount = 0;
let growthSpeed = 3;
let directedGrowth = false;
let freezeItems = 0;
let freezeRemainingMs = 0;
let modeButton;
let speedSlider;
let speedOutput;
let directedGrowthCheckbox;
let freezeButton;
let pauseButton;
let startScreen;
let keybindingsOpenButtons = [];
let keybindingsPanel;
let keybindingsCloseButton;
let keybindingsList;
let backgroundMusic;
let musicToggleButton;
let keyBindings = { ...DEFAULT_KEY_BINDINGS };
let bindingCaptureAction = null;
let controlsSuspended = false;
let lastKeybindingsTrigger = null;
let keybindingControlsBound = false;
let musicEnabled = true;
let musicControlsBound = false;
let currentMusicTrackId = OPENING_MUSIC_TRACK_ID;
const heldActions = new Set();
let gameCanvas = null;
let boardGestureSurface = null;
let animationRequest = null;
let lastFrameTime = null;
let nextFrameTime = null;

/** DOM 就绪后创建画布和控件；不等待音乐或外部绘图库。 */
function setup() {
  gameCanvas = createGameCanvas();
  boardGestureSurface = document.querySelector('.board-gesture-surface');
  cacheControls();
  initializeMusicControls();
  bindGrowthControls();
  restartGame();
  bindTouchControls();
  bindStartScreen();
  initializeKeybindingControls();
  initializeScoreHistory();
  initializeGlobalLeaderboard();
  initializeLanguage();
  window.addEventListener('keydown', (event) => {
    if (keyPressed(event) === false) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (keyReleased(event) === false) event.preventDefault();
  });
  window.addEventListener('blur', resetInputTimers);
  window.addEventListener('resize', syncGameLoop);
  document.addEventListener('visibilitychange', () => {
    resetInputTimers();
    syncGameLoop();
  });
  syncGameLoop();
}

/** 空闲时只绘制一次；恢复时丢弃后台时间，避免补算下落或卡住长按。 */
function syncGameLoop() {
  boardGestureSurface?.classList.toggle('is-active', canUseBoardGesture());
  if (!gameCanvas) return;
  if (animationRequest !== null) cancelAnimationFrame(animationRequest);
  animationRequest = null;
  lastFrameTime = null;
  nextFrameTime = null;
  if (!document.hidden) animationRequest = requestAnimationFrame(renderGameFrame);
}

function shouldAnimateGame() {
  return gameStarted && !gamePaused && !controlsSuspended && !document.hidden
    && (!gameOver || lineClearNotice?.framesRemaining > 0);
}

/** 高刷新率屏幕也维持原有 60 帧规则；使用时间戳避免帧率漂移。 */
function renderGameFrame(timestamp) {
  animationRequest = null;
  if (document.hidden) return;
  if (nextFrameTime === null || timestamp >= nextFrameTime - 0.5) {
    const elapsedMs = lastFrameTime === null ? 0 : timestamp - lastFrameTime;
    lastFrameTime = timestamp;
    nextFrameTime = nextFrameTime === null
      ? timestamp + FRAME_INTERVAL_MS
      : nextFrameTime + FRAME_INTERVAL_MS;
    if (nextFrameTime <= timestamp) nextFrameTime = timestamp + FRAME_INTERVAL_MS;
    frameCount += 1;
    draw(elapsedMs);
  }
  // State transitions inside draw() may already have scheduled the next frame.
  if (shouldAnimateGame() && animationRequest === null) {
    animationRequest = requestAnimationFrame(renderGameFrame);
  }
}

/** 将外部计时值限制为非负有限数，防止异常帧时间污染所有计时器。 */
function normalizeElapsedMs(elapsedMs) {
  return Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
}

/**
 * 渲染并推进一帧游戏。
 * 先更新状态再渲染，输入、生长和落地结果在同一帧显示。
 */
function draw(frameElapsedMs = 0) {
  if (gameStarted && !gameOver && !gamePaused && !controlsSuspended) {
    const elapsedMs = Math.min(normalizeElapsedMs(frameElapsedMs), MAX_FRAME_ELAPSED_MS);
    handleHeldKeys(elapsedMs);
    const unfrozenElapsedMs = Math.max(0, elapsedMs - freezeRemainingMs);
    if (isGrowthFrozen()) updateFreezeTimer(elapsedMs);
    if (!hardMode) currentPiece.updateGrowth(unfrozenElapsedMs);
    updateFalling(elapsedMs);
    if (speedUpNoticeFrames > 0) speedUpNoticeFrames -= 1;
  }

  if (gameStarted && !gamePaused && !controlsSuspended && lineClearNotice?.framesRemaining > 0) {
    lineClearNotice.framesRemaining -= 1;
    if (lineClearNotice.framesRemaining <= 0) lineClearNotice = null;
  }

  paintGame();
}

/** 仅重绘当前状态，供切换语言使用，不推进任何游戏计时。 */
function paintGame() {
  background(0);
  board.draw();
  if (!gameOver) {
    currentPiece.drawLandingPreview();
    currentPiece.draw();
  }
  drawInterface();
}

class Board {
  /** 创建一个 20×10 的空棋盘；空值表示空格，颜色字符串表示已锁定方块。 */
  constructor() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.revision = 0;
    this.renderedRevision = -1;
    this.layer = null;
  }

  /** 棋盘改变时重建缓存；普通帧只复制一次图像，保留边缘描边。 */
  draw() {
    const layerWidth = COLS * CELL + 2;
    const layerHeight = ROWS * CELL + 2;
    if (!this.layer) this.layer = createCanvasLayer(layerWidth, layerHeight);
    if (this.renderedRevision !== this.revision) {
      const context = this.layer.getContext('2d');
      context.clearRect(0, 0, layerWidth, layerHeight);
      context.lineWidth = 1;
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const value = this.grid[row][col];
          context.fillStyle = value || '#141414';
          context.strokeStyle = value ? '#000' : '#c8c8c8';
          context.fillRect(1 + col * CELL, 1 + row * CELL, CELL, CELL);
          context.strokeRect(1 + col * CELL, 1 + row * CELL, CELL, CELL);
        }
      }
      this.renderedRevision = this.revision;
    }
    drawLayer(this.layer, BOARD_X - 1, BOARD_Y - 1, layerWidth, layerHeight);
  }

  /**
   * 判断指定形状能否放在目标坐标。
   * 允许方块暂时位于棋盘顶部之外，但不允许越过左右、底部或重叠锁定格。
   */
  isValid(newX, newY, shape) {
    if (!Number.isInteger(newX) || !Number.isInteger(newY)
        || !Array.isArray(shape) || shape.length === 0) return false;
    return shape.every((cell) => {
      if (!Array.isArray(cell) || cell.length < 2) return false;
      const [dx, dy] = cell;
      if (!Number.isInteger(dx) || !Number.isInteger(dy)) return false;
      const col = newX + dx;
      const row = newY + dy;
      return col >= 0 && col < COLS && row < ROWS
        && (row < 0 || !this.grid[row][col]);
    });
  }

  /** 将活动方块写入棋盘网格，并返回是否有组成格锁定在棋盘顶部之外。 */
  lock(piece) {
    this.revision += 1;
    let toppedOut = false;
    piece.shape.forEach(([dx, dy]) => {
      const col = piece.x + dx;
      const row = piece.y + dy;
      if (row < 0) toppedOut = true;
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
        this.grid[row][col] = piece.color;
      }
    });
    return toppedOut;
  }

  /**
   * 删除所有填满的行，在顶部补空行，并返回本次消除的行数。
   * 删除后重新检查同一行位置，以支持一次消除多行。
   */
  clearLines() {
    let cleared = 0;
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      if (this.grid[row].every(Boolean)) {
        this.grid.splice(row, 1);
        this.grid.unshift(Array(COLS).fill(null));
        cleared += 1;
        row += 1;
      }
    }
    if (cleared > 0) this.revision += 1;
    return cleared;
  }
}

class Piece {
  /** 根据方块类型复制出生形状、设置颜色，并计算居中的出生位置。 */
  constructor(type) {
    this.type = type;
    this.color = COLORS[type];
    this.shape = SHAPES[type].map(([x, y]) => [x, y]);
    this.rotationState = 0;
    this.growthElapsedMs = 0;
    this.warning = null;
    positionPieceAtSpawn(this);
  }

  /** 绘制活动方块及其待生长位置提示。 */
  draw() {
    this.shape.forEach(([dx, dy]) => drawCell(this.x + dx, this.y + dy, this.color));
    this.drawGrowthWarning();
  }

  /** 模拟垂直下落直到下一格发生碰撞，返回幽灵落点的纵坐标。 */
  getLandingY() {
    const cached = this.landingCache;
    if (cached && cached.board === board && cached.revision === board.revision
        && cached.x === this.x && cached.y === this.y
        && cached.shape === this.shape && cached.length === this.shape.length) {
      return cached.landingY;
    }
    let landingY = this.y;
    while (board.isValid(this.x, landingY + 1, this.shape)) landingY += 1;
    this.landingCache = {
      board, revision: board.revision, x: this.x, y: this.y,
      shape: this.shape, length: this.shape.length, landingY,
    };
    return landingY;
  }

  /** 在预计落点绘制粗边框，不改变活动方块的真实位置。 */
  drawLandingPreview() {
    const landingY = this.getLandingY();
    noFill();
    stroke(165);
    strokeWeight(6);
    this.shape.forEach(([dx, dy]) => {
      const col = this.x + dx;
      const row = landingY + dy;
      if (row < 0 || row >= ROWS) return;
      rect(
        BOARD_X + col * CELL + 2,
        BOARD_Y + row * CELL + 2,
        CELL - 4,
        CELL - 4,
      );
    });
  }

  /**
   * 尝试移动方块；成功时更新位置和生长提示，失败时保持原状。
   * 落地后的横向调整会在允许次数内重新开始锁定计时。
   */
  move(dx, dy) {
    if (!board.isValid(this.x + dx, this.y + dy, this.shape)) return false;
    this.x += dx;
    this.y += dy;
    if (dx !== 0) resetLockDelayAfterAdjustment(this);
    this.revalidateWarning();
    return true;
  }

  /**
   * 尝试旋转方块。参数为 1、-1、2 时分别表示顺时针、逆时针和 180°。
   * 180° 由两次超级旋转系统的四分之一旋转组成，任一步失败都会完整回滚。
   */
  rotate(turns = 1) {
    if (![1, -1, 2].includes(turns)) return false;
    if (turns === 2) {
      const before = {
        shape: this.shape.map(([x, y]) => [x, y]),
        warning: this.warning ? [...this.warning] : null,
        x: this.x,
        y: this.y,
        rotationState: this.rotationState,
        lockElapsedMs,
        lockDelayResetCount,
      };
      if (this.rotateQuarter(1) && this.rotateQuarter(1)) return true;
      this.shape = before.shape;
      this.warning = before.warning;
      this.x = before.x;
      this.y = before.y;
      this.rotationState = before.rotationState;
      lockElapsedMs = before.lockElapsedMs;
      lockDelayResetCount = before.lockDelayResetCount;
      return false;
    }

    return this.rotateQuarter(turns === -1 ? -1 : 1);
  }

  /** 使用对应方块的超级旋转系统踢墙表完成一次 90° 旋转。 */
  rotateQuarter(direction) {
    const fromState = this.rotationState;
    const toState = (fromState + direction + 4) % 4;
    const rotated = this.shape.map((cell) => this.rotateCell(cell, direction));
    const kickTable = this.type === 'I' ? I_KICKS : JLSTZ_KICKS;
    const kickTests = this.type === 'O'
      ? [[0, 0]]
      : kickTable[`${fromState}>${toState}`];
    const kick = kickTests.find(([dx, dy]) => (
      board.isValid(this.x + dx, this.y + dy, rotated)
    ));
    if (!kick) return false;

    this.shape = rotated;
    this.x += kick[0];
    this.y += kick[1];
    this.rotationState = toState;
    resetLockDelayAfterAdjustment(this);
    if (this.warning) {
      if (directedGrowth) {
        this.warning = null;
        this.chooseWarning();
      } else {
        this.warning = this.rotateCell(this.warning, direction);
      }
    }
    this.revalidateWarning();
    return true;
  }

  /** 围绕当前方块类型的标准旋转中心计算单个格子的旋转后坐标。 */
  rotateCell([x, y], direction) {
    const [pivotX, pivotY] = ROTATION_PIVOTS[this.type];
    const relativeX = x - pivotX;
    const relativeY = y - pivotY;
    return direction === 1
      ? [Math.round(pivotX - relativeY), Math.round(pivotY + relativeX)]
      : [Math.round(pivotX + relativeY), Math.round(pivotY - relativeX)];
  }

  /** 用真实毫秒推进普通模式生长；帧率改变不改变周期或预警时长。 */
  updateGrowth(elapsedMs = 0) {
    const elapsed = Math.min(normalizeElapsedMs(elapsedMs), MAX_FRAME_ELAPSED_MS);
    if (elapsed === 0) return;
    const intervalMs = getGrowthInterval() * FRAME_INTERVAL_MS;
    // 调快滑杆时最多立即完成一次生长，不把原来的长周期兑换成多次生长。
    this.growthElapsedMs = Math.min(this.growthElapsedMs, intervalMs) + elapsed;
    const warningAtMs = intervalMs - GROWTH_WARNING_FRAMES * FRAME_INTERVAL_MS;
    if (!this.warning && this.growthElapsedMs + 1e-7 >= warningAtMs) this.chooseWarning();
    if (this.growthElapsedMs + 1e-7 >= intervalMs) {
      const remainderMs = Math.max(0, this.growthElapsedMs - intervalMs);
      this.commitWarningGrowth();
      // 保留跨过周期边界的时间，避免 24/30 Hz 或抖动帧逐次累积误差。
      this.growthElapsedMs = remainderMs;
    }
  }

  /** 将仍然有效的警告格加入形状，然后清空提示并重新开始生长周期。 */
  commitWarningGrowth() {
    if (!this.warning) this.chooseWarning();
    if (this.warning && this.isGrowthCellValid(...this.warning)) {
      this.shape.push([...this.warning]);
    }
    this.warning = null;
    this.growthElapsedMs = 0;
  }

  /** 判断局部坐标是否已经属于当前形状。 */
  containsCell(x, y) {
    return this.shape.some(([sx, sy]) => sx === x && sy === y);
  }

  /** 判断候选生长格是否未重复、在棋盘内且没有与锁定格重叠。 */
  isGrowthCellValid(x, y) {
    if (this.containsCell(x, y)) return false;
    const col = this.x + x;
    const row = this.y + y;
    return col >= 0 && col < COLS && row >= 0 && row < ROWS && !board.grid[row][col];
  }

  /**
   * 收集与当前形状相邻的合法格并随机选择警告位置。
   * 开启定向生长时，只收集每个格子右侧的候选位置。
   */
  chooseWarning() {
    const directions = directedGrowth
      ? [[1, 0]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const candidates = [];
    const seen = new Set();
    this.shape.forEach(([x, y]) => {
      directions.forEach(([dx, dy]) => {
        const candidate = [x + dx, y + dy];
        const key = candidate.join(',');
        if (!seen.has(key) && this.isGrowthCellValid(...candidate)) {
          seen.add(key);
          candidates.push(candidate);
        }
      });
    });
    if (candidates.length) this.warning = random(candidates);
  }

  /** 移动或旋转后重新验证警告格；失效时尝试选择新的候选位置。 */
  revalidateWarning() {
    if (this.warning && !this.isGrowthCellValid(...this.warning)) {
      this.warning = null;
      this.chooseWarning();
    }
  }

  /** 以脉冲透明度绘制待生长格，让玩家能提前看到生长方向。 */
  drawGrowthWarning() {
    if (!this.warning) return;
    this.revalidateWarning();
    if (!this.warning) return;
    const alpha = 70 + 120 * Math.abs(Math.sin(frameCount * 0.16));
    const rgb = parseInt(this.color.slice(1), 16);
    fill(rgb >> 16, (rgb >> 8) & 255, rgb & 255, alpha);
    stroke(255, 235);
    strokeWeight(2);
    rect(BOARD_X + (this.x + this.warning[0]) * CELL, BOARD_Y + (this.y + this.warning[1]) * CELL, CELL, CELL);
  }
}

/** 在棋盘坐标上绘制一个具有统一描边的方格。 */
function drawCell(col, row, cellColor) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
  fill(cellColor);
  stroke(50);
  strokeWeight(1);
  rect(BOARD_X + col * CELL, BOARD_Y + row * CELL, CELL, CELL);
}

/** 持续生成方块类型，直到预览队列达到固定长度。 */
function fillNextQueue() {
  while (nextQueue.length < PREVIEW_COUNT) nextQueue.push(generatePieceType());
}

/**
 * 按最近出现时间进行加权随机，减少连续重复方块。
 * 越近期出现的类型权重越低，超过历史窗口的类型恢复为完整权重。
 */
function generatePieceType() {
  const weights = PIECE_TYPES.map((type) => {
    const age = pieceGenerationHistory.indexOf(type);
    return age === -1 || age >= PIECE_REPEAT_WEIGHT_BY_AGE.length
      ? 1
      : PIECE_REPEAT_WEIGHT_BY_AGE[age];
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * totalWeight;
  let selectedType = PIECE_TYPES[PIECE_TYPES.length - 1];

  for (let index = 0; index < PIECE_TYPES.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) {
      selectedType = PIECE_TYPES[index];
      break;
    }
  }

  pieceGenerationHistory.unshift(selectedType);
  pieceGenerationHistory = pieceGenerationHistory.slice(0, PIECE_REPEAT_WEIGHT_BY_AGE.length);
  return selectedType;
}

/** 从预览队列头部创建活动方块，并立即补足队列。 */
function takeNextPiece() {
  fillNextQueue();
  const piece = new Piece(nextQueue.shift());
  fillNextQueue();
  return piece;
}

/**
 * 锁定当前方块、结算消行和奖励，然后生成下一方块。
   * 同时重置本方块专属的下落、锁定和暂存状态，并检查游戏结束。
 */
function lockAndSpawn() {
  const toppedOut = board.lock(currentPiece);
  const lines = board.clearLines();
  const lineClearScore = lines * lines * 100;
  score += lineClearScore;
  saveScoreProgress();
  if (lines > 0) showLineClearNotice(lines, lineClearScore);
  freezeItems += lines;
  if (lines > 0) updateFreezeButton();
  piecesLocked += 1;
  if (!hardMode && piecesLocked % PIECES_PER_SPEED_LEVEL === 0) {
    speedUpNoticeFrames = SPEED_UP_NOTICE_FRAMES;
  }
  fallElapsedMs = 0;
  lockElapsedMs = 0;
  lockDelayResetCount = 0;
  if (toppedOut) {
    endGame();
    return;
  }

  currentPiece = takeNextPiece();
  canHold = true;
  if (!board.isValid(currentPiece.x, currentPiece.y, currentPiece.shape)) endGame();
  if (hardMode && !hardOperationInProgress && hardOperationCount % 4 !== 0
      && !gameOver && !isGrowthFrozen()) currentPiece.chooseWarning();
}

/**
 * 保存或交换当前方块；每个活动方块只能成功使用一次。
   * 交换后的形状会重新居中，若无法安全出生则回滚队列并返回失败结果。
 */
function holdCurrentPiece() {
  if (gameOver || !canHold) return false;
  const outgoingPiece = snapshotPiece(currentPiece);
  let incomingPiece;
  let queueBeforeHold = null;
  let generationHistoryBeforeHold = null;

  if (heldPiece === null) {
    queueBeforeHold = [...nextQueue];
    generationHistoryBeforeHold = [...pieceGenerationHistory];
    incomingPiece = takeNextPiece();
  } else {
    incomingPiece = restorePiece(heldPiece);
  }

  // 生长或旋转后的暂存形状可能含有负偏移，也可能远宽于原始四格方块。
  // 只有找到安全且居中的出生位置后，才真正提交本次交换。
  if (!board.isValid(incomingPiece.x, incomingPiece.y, incomingPiece.shape)) {
    if (queueBeforeHold) nextQueue = queueBeforeHold;
    if (generationHistoryBeforeHold) pieceGenerationHistory = generationHistoryBeforeHold;
    return false;
  }

  heldPiece = outgoingPiece;
  currentPiece = incomingPiece;
  canHold = false;
  fallElapsedMs = 0;
  lockElapsedMs = 0;
  lockDelayResetCount = 0;
  return true;
}

/** 创建暂存功能所需的纯数据快照，避免保存活动方块的计时和警告状态。 */
function snapshotPiece(piece) {
  return {
    type: piece.type,
    shape: piece.shape.map(([x, y]) => [x, y]),
    rotationState: piece.rotationState,
  };
}

/** 从暂存快照重建独立方块实例，并重新计算出生位置。 */
function restorePiece(savedPiece) {
  const piece = new Piece(savedPiece.type);
  piece.shape = savedPiece.shape.map(([x, y]) => [x, y]);
  piece.rotationState = savedPiece.rotationState ?? 0;
  positionPieceAtSpawn(piece);
  return piece;
}

/** 根据形状实际边界将任意大小、旋转或生长后的方块水平居中到顶部。 */
function positionPieceAtSpawn(piece) {
  const xs = piece.shape.map(([x]) => x);
  const ys = piece.shape.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const pieceWidth = maxX - minX + 1;
  piece.x = Math.floor((COLS - pieceWidth) / 2) - minX;
  piece.y = -minY;
}

/** 将当前方块降至最低合法位置、按距离加分并立即锁定。 */
function hardDrop() {
  if (gameOver) return false;
  while (currentPiece.move(0, 1)) score += 1;
  lockAndSpawn();
  return true;
}

/** 根据累计锁定方块数计算从 1 开始的自动生长速度等级。 */
function getGrowthLevel() {
  return Math.floor(piecesLocked / PIECES_PER_SPEED_LEVEL) + 1;
}

/** 结合玩家滑杆和自动等级计算生长间隔，并限制最低帧数。 */
function getGrowthInterval() {
  const progressReduction = (getGrowthLevel() - 1) * GROWTH_SPEED_STEP_FRAMES;
  return Math.max(MIN_GROWTH_INTERVAL, 330 - growthSpeed * 24 - progressReduction);
}

/**
 * 创建一次消行得分提示。
 * 提示保存本次行数、得分和剩余帧数，由界面绘制函数负责上浮淡出。
 */
function showLineClearNotice(lines, points) {
  lineClearNotice = {
    lines,
    points,
    framesRemaining: LINE_CLEAR_NOTICE_FRAMES,
  };
}

/** 清空所有单局状态并创建全新棋盘，同时保留当前普通/困难模式选择。 */
function restartGame(reason = 'restarted') {
  saveScoreProgress(reason);
  board = new Board();
  nextQueue = [];
  pieceGenerationHistory = [];
  heldPiece = null;
  canHold = true;
  score = 0;
  piecesLocked = 0;
  speedUpNoticeFrames = 0;
  lineClearNotice = null;
  gameOver = false;
  gamePaused = false;
  fallElapsedMs = 0;
  lockElapsedMs = 0;
  lockDelayResetCount = 0;
  hardOperationInProgress = false;
  resetInputTimers();
  hardOperationCount = 0;
  freezeItems = 0;
  freezeRemainingMs = 0;
  fillNextQueue();
  currentPiece = takeNextPiece();
  if (gameStarted) beginScoreRun();
  updateControlStates();
  resetBackgroundMusicForGame();
}

/** 标记游戏结束并同步所有会受结束状态影响的按钮。 */
function endGame() {
  gameOver = true;
  saveScoreProgress('completed');
  updateControlStates();
  syncBackgroundMusic();
}

/** 集中刷新模式、冻结和暂停按钮，避免状态变化时遗漏其中某个控件。 */
function updateControlStates() {
  updateModeButton();
  updateFreezeButton();
  updatePauseButton();
  syncGameLoop();
}

/** 缓存页面控件节点，避免在每一帧反复查询页面结构。 */
function cacheControls() {
  modeButton = document.querySelector('[data-action="mode"]');
  speedSlider = document.querySelector('#growth-speed');
  speedOutput = document.querySelector('#growth-speed-value');
  directedGrowthCheckbox = document.querySelector('#directed-growth');
  freezeButton = document.querySelector('[data-action="freeze"]');
  pauseButton = document.querySelector('[data-action="pause"]');
  startScreen = document.querySelector('#start-screen');
  keybindingsOpenButtons = [...document.querySelectorAll('[data-open-keybindings]')];
  keybindingsPanel = document.querySelector('#keybindings-panel');
  keybindingsCloseButton = document.querySelector('#keybindings-close');
  keybindingsList = document.querySelector('#keybindings-list');
  backgroundMusic = document.querySelector('#background-music');
  musicToggleButton = document.querySelector('#music-toggle');
}

/** 安全读取浏览器本地存储；不可用时返回空值而不影响游戏。 */
function readLocalStorageItem(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

/** 安全写入浏览器本地存储，并返回是否保存成功。 */
function writeLocalStorageItem(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (_) {
    return false;
  }
}

/** 从浏览器本地存储读取音乐开关；存储不可用时默认开启。 */
function loadMusicPreference() {
  musicEnabled = readLocalStorageItem(MUSIC_ENABLED_STORAGE_KEY) !== 'false';
}

/** 保存音乐开关；隐私模式或存储失败不会影响当前会话。 */
function saveMusicPreference() {
  writeLocalStorageItem(MUSIC_ENABLED_STORAGE_KEY, String(musicEnabled));
}

/** 根据音乐开关更新按钮文字和无障碍按下状态。 */
function updateMusicButton() {
  if (!musicToggleButton) return;
  setLocalizedText(musicToggleButton, musicEnabled ? '♪ MUSIC ON' : '♪ MUSIC OFF');
  musicToggleButton.setAttribute('aria-pressed', String(musicEnabled));
}

/** 判断当前模式和实际生长间隔是否已经达到高速音乐的启用条件。 */
function allowsHighGrowthMusic() {
  return hardMode || getGrowthInterval() <= HIGH_GROWTH_MUSIC_INTERVAL_FRAMES;
}

/**
 * 返回下一首音乐可用的候选列表。
 * 开场曲和两首普通曲始终可用，高速街机曲只在生长速度较高时加入。
 */
function getEligibleMusicTrackIds() {
  const highGrowthMusicAllowed = allowsHighGrowthMusic();
  return Object.keys(MUSIC_TRACKS).filter((trackId) => (
    trackId !== HIGH_GROWTH_MUSIC_TRACK_ID || highGrowthMusicAllowed
  ));
}

/** 从当前候选池随机选择下一首，并尽量避免与刚播放的曲目连续重复。 */
function chooseNextMusicTrackId() {
  const eligibleTrackIds = getEligibleMusicTrackIds();
  const nonRepeatingTrackIds = eligibleTrackIds.filter((trackId) => trackId !== currentMusicTrackId);
  return random(nonRepeatingTrackIds.length ? nonRepeatingTrackIds : eligibleTrackIds);
}

/** 切换并播放指定音乐；未知曲目不会改变当前状态。 */
function playBackgroundMusicTrack(trackId) {
  const source = MUSIC_TRACKS[trackId];
  if (!backgroundMusic || !source) return false;
  backgroundMusic.pause();
  const currentSource = backgroundMusic.getAttribute?.('src') ?? backgroundMusic.src;
  if (currentSource !== source) {
    backgroundMusic.src = source;
    backgroundMusic.load?.();
  }
  backgroundMusic.currentTime = 0;
  currentMusicTrackId = trackId;
  syncBackgroundMusic();
  return true;
}

/** 每次新开局强制重置为指定的 A 自然小调开场曲。 */
function resetBackgroundMusicForGame() {
  playBackgroundMusicTrack(OPENING_MUSIC_TRACK_ID);
}

/** 根据实时生长速度选择并播放下一首曲目。 */
function playNextBackgroundMusicTrack() {
  const nextTrackId = chooseNextMusicTrackId();
  return Boolean(nextTrackId && playBackgroundMusicTrack(nextTrackId));
}

/** 若高速曲已经不符合当前速度条件，则立即切换到普通候选曲目。 */
function ensureCurrentMusicTrackAllowed() {
  if (currentMusicTrackId !== HIGH_GROWTH_MUSIC_TRACK_ID || allowsHighGrowthMusic()) return;
  playNextBackgroundMusicTrack();
}

/**
 * 让背景音乐与开始、暂停、游戏结束、设置面板和页面可见状态保持一致。
 * 播放失败通常表示浏览器仍在等待用户操作，此时静默等待下一次操作重试。
 */
function syncBackgroundMusic() {
  if (!backgroundMusic) return;
  const shouldPlay = musicEnabled
    && gameStarted
    && !gamePaused
    && !gameOver
    && !controlsSuspended
    && !document.hidden;
  if (!shouldPlay) {
    backgroundMusic.pause();
    return;
  }
  const playRequest = backgroundMusic.play();
  if (playRequest?.catch) playRequest.catch(() => {});
}

/** 切换音乐设置、保存偏好，并立即同步实际播放状态。 */
function toggleBackgroundMusic() {
  musicEnabled = !musicEnabled;
  saveMusicPreference();
  updateMusicButton();
  syncBackgroundMusic();
}

/** 初始化音乐音量、曲目轮换、持久化开关和页面事件；重复调用不会重复绑定。 */
function initializeMusicControls() {
  if (musicControlsBound || !backgroundMusic || !musicToggleButton) return;
  loadMusicPreference();
  backgroundMusic.volume = MUSIC_VOLUME;
  backgroundMusic.loop = false;
  backgroundMusic.addEventListener('ended', playNextBackgroundMusicTrack);
  musicToggleButton.addEventListener('click', toggleBackgroundMusic);
  document.addEventListener('visibilitychange', syncBackgroundMusic);
  musicControlsBound = true;
  updateMusicButton();
  resetBackgroundMusicForGame();
}

/**
 * 在页面节点完成解析后初始化改键功能。
 * 一次性标记可防止重复调用时为同一按钮添加多个监听器。
 */
function initializeKeybindingControls() {
  if (keybindingControlsBound) return;
  if (!keybindingsOpenButtons.length || !keybindingsPanel || !keybindingsList) return;
  loadKeyBindings();
  bindKeybindingControls();
  keybindingControlsBound = true;
}

/** 判断一组键位是否包含全部动作、有效按键代码且没有冲突。 */
function isValidKeyBindings(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  const codes = KEY_BINDING_ACTIONS.map(([action]) => candidate[action]);
  return codes.every((code) => isBindableCode(code)) && new Set(codes).size === codes.length;
}

/** 判断键盘代码是否适合绑定，保留退出键和系统修饰键用于界面控制。 */
function isBindableCode(code) {
  if (typeof code !== 'string' || code.length === 0) return false;
  return ![
    'Escape', 'Unidentified', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
    'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock', 'F5', 'F12',
  ].includes(code);
}

/** 从浏览器本地存储读取键位；数据缺失或损坏时安全回退到默认设置。 */
function loadKeyBindings() {
  keyBindings = { ...DEFAULT_KEY_BINDINGS };
  try {
    const saved = JSON.parse(readLocalStorageItem(KEY_BINDINGS_STORAGE_KEY));
    if (isValidKeyBindings(saved)) keyBindings = { ...saved };
  } catch (_) {
    // 无法解析的数据保持上方已经设置的默认键位。
  }
  updateDisplayedKeyLabels();
}

/** 将当前键位写入浏览器本地存储；存储不可用时保持当前会话设置。 */
function saveKeyBindings() {
  writeLocalStorageItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(keyBindings));
}

/** 保存键位修改并统一刷新静态标签与设置面板，避免各入口遗漏同步步骤。 */
function commitKeyBindingChanges() {
  bindingCaptureAction = null;
  saveKeyBindings();
  updateDisplayedKeyLabels();
  renderKeybindingsList();
}

/** 将键盘事件代码转换成适合界面显示的短标签。 */
function formatKeyCode(code) {
  const labels = {
    ArrowLeft: '←', ArrowRight: '→', ArrowDown: '↓', ArrowUp: '↑',
    Space: 'SPACE', Enter: 'ENTER', Backspace: 'BACKSPACE', Delete: 'DELETE',
  };
  if (labels[code]) return labels[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `NUM ${code.slice(6)}`;
  return code.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

/** 返回指定按键代码当前绑定的动作；未绑定时返回空值。 */
function getActionForCode(code) {
  const entry = Object.entries(keyBindings).find(([, bindingCode]) => bindingCode === code);
  return entry?.[0] ?? null;
}

/** 更新开始页、操作说明和其他静态位置中的键位标签。 */
function updateDisplayedKeyLabels() {
  document.querySelectorAll('[data-key-action]').forEach((element) => {
    const code = keyBindings[element.dataset.keyAction];
    if (code) setLocalizedText(element, formatKeyCode(code));
  });
}

/** 根据当前键位生成设置列表，并标记正在等待输入的动作。 */
function renderKeybindingsList() {
  if (!keybindingsList) return;
  keybindingsList.replaceChildren();
  KEY_BINDING_ACTIONS.forEach(([action, labelText]) => {
    const label = document.createElement('label');
    setLocalizedText(label, labelText);
    label.htmlFor = `keybinding-${action}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = `keybinding-${action}`;
    button.dataset.keybindingAction = action;
    setLocalizedText(button, bindingCaptureAction === action ? 'PRESS A KEY…' : formatKeyCode(keyBindings[action]));
    button.classList.toggle('is-listening', bindingCaptureAction === action);
    keybindingsList.append(label, button);
  });
}

/** 打开键位设置并暂停游戏状态更新，但不改变玩家原本的暂停状态。 */
function openKeybindingsPanel(trigger = null) {
  if (!keybindingsPanel) return;
  lastKeybindingsTrigger = trigger ?? keybindingsOpenButtons[0] ?? null;
  controlsSuspended = true;
  bindingCaptureAction = null;
  resetInputTimers();
  keybindingsPanel.hidden = false;
  renderKeybindingsList();
  keybindingsCloseButton?.focus();
  syncBackgroundMusic();
  syncGameLoop();
}

/** 关闭键位设置、取消等待输入并恢复游戏状态更新。 */
function closeKeybindingsPanel() {
  if (!keybindingsPanel) return;
  bindingCaptureAction = null;
  controlsSuspended = false;
  keybindingsPanel.hidden = true;
  resetInputTimers();
  lastKeybindingsTrigger?.focus();
  syncBackgroundMusic();
  syncGameLoop();
}

/** 进入指定动作的按键捕获状态。 */
function beginKeyCapture(action) {
  if (!Object.hasOwn(keyBindings, action)) return false;
  bindingCaptureAction = action;
  resetInputTimers();
  renderKeybindingsList();
  return true;
}

/**
 * 应用捕获到的新按键；若按键已被其他动作使用，则交换两个动作的键位。
 * 退出键只取消本次捕获，系统保留键会被忽略。
 */
function handleKeyCapture(event) {
  if (!bindingCaptureAction || !event) return false;
  if (event.code === 'Escape') {
    bindingCaptureAction = null;
    renderKeybindingsList();
    return true;
  }
  if (!isBindableCode(event.code)) return true;

  const targetAction = bindingCaptureAction;
  const previousCode = keyBindings[targetAction];
  const conflictingAction = getActionForCode(event.code);
  if (conflictingAction && conflictingAction !== targetAction) {
    keyBindings[conflictingAction] = previousCode;
  }
  keyBindings[targetAction] = event.code;
  commitKeyBindingChanges();
  return true;
}

/** 恢复所有默认键位并立即保存和刷新界面。 */
function resetKeyBindings() {
  keyBindings = { ...DEFAULT_KEY_BINDINGS };
  commitKeyBindingChanges();
}

/** 在文档级别分派改键面板的指针操作，避免动态节点重绘后丢失监听。 */
function handleKeybindingPointerDown(event) {
  const target = event.target;
  const openButton = target?.closest?.('[data-open-keybindings]');
  if (openButton) {
    event.preventDefault();
    openKeybindingsPanel(openButton);
    return;
  }
  if (target?.closest?.('#keybindings-close')) {
    event.preventDefault();
    closeKeybindingsPanel();
    return;
  }
  if (target?.closest?.('#keybindings-reset')) {
    event.preventDefault();
    resetKeyBindings();
    return;
  }
  const bindingButton = target?.closest?.('[data-keybinding-action]');
  if (bindingButton) {
    event.preventDefault();
    beginKeyCapture(bindingButton.dataset.keybindingAction);
    return;
  }
  if (target === keybindingsPanel) closeKeybindingsPanel();
}

/** 在事件捕获阶段接收改键输入，防止按键继续触发绘图库的游戏操作。 */
function handleKeybindingKeyDown(event) {
  if (scoreHistoryDialog?.open) return;
  if (bindingCaptureAction) {
    event.preventDefault();
    event.stopPropagation();
    handleKeyCapture(event);
    return;
  }
  if (controlsSuspended && event.code === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeKeybindingsPanel();
  }
}

/** 绑定文档级指针和键盘监听器，统一处理全部改键界面操作。 */
function bindKeybindingControls() {
  document.addEventListener('click', handleKeybindingPointerDown);
  document.addEventListener('keydown', handleKeybindingKeyDown, true);
}

/** 响应首次开始操作，隐藏开始页并从零开始累计游戏计时。 */
function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  beginScoreRun();
  fallElapsedMs = 0;
  resetInputTimers();
  currentPiece.growthElapsedMs = 0;
  if (startScreen) {
    startScreen.classList.add('is-hidden');
    startScreen.setAttribute('aria-hidden', 'true');
  }
  syncBackgroundMusic();
  syncGameLoop();
}

/** 明确点击开始按钮，滚动说明页面不会误开局。 */
function bindStartScreen() {
  const button = document.querySelector('[data-start-game]');
  if (button) bindTapControl(button, requestStartGame);
}

/** 根据模式和暂停状态刷新模式按钮、速度滑杆及定向生长控件。 */
function updateModeButton() {
  if (modeButton) {
    if (!hardMode) setLocalizedText(modeButton, 'START HARD MODE');
    else setLocalizedText(modeButton, 'EXIT HARD MODE');
    modeButton.disabled = gamePaused && !gameOver;
  }
  if (speedSlider) speedSlider.disabled = hardMode || gamePaused;
  if (directedGrowthCheckbox) directedGrowthCheckbox.disabled = gamePaused;
}

/** 将生长速度限制为滑杆允许的整数范围，异常值回退到默认速度 3。 */
function normalizeGrowthSpeed(value, minimum = 1, maximum = 10) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 3;
  const lowerBound = Math.min(minimum, maximum);
  const upperBound = Math.max(minimum, maximum);
  return Math.min(upperBound, Math.max(lowerBound, Math.round(numericValue)));
}

/** 从滑杆读取并同步生长速度，同时确保当前音乐仍符合速度条件。 */
function handleGrowthSpeedInput() {
  if (!speedSlider || !speedOutput) return;
  const minimum = Number(speedSlider.min) || 1;
  const maximum = Number(speedSlider.max) || 10;
  growthSpeed = normalizeGrowthSpeed(speedSlider.value, minimum, maximum);
  speedSlider.value = String(growthSpeed);
  speedOutput.value = String(growthSpeed);
  ensureCurrentMusicTrackAllowed();
}

/** 同步定向生长开关，并在需要时为当前方块重新选择警告格。 */
function handleDirectedGrowthChange() {
  directedGrowth = Boolean(directedGrowthCheckbox?.checked);
  if (!currentPiece) return;
  const hadWarning = Boolean(currentPiece.warning);
  currentPiece.warning = null;
  if (hadWarning || (hardMode && hardOperationCount % 4 !== 0)) {
    currentPiece.chooseWarning();
  }
}

/**
 * 读取生长相关控件的初始值并监听后续变化。
 * 切换定向生长时会重新选择警告格，保证提示符合新规则。
 */
function bindGrowthControls() {
  if (!speedSlider || !speedOutput) return;

  handleGrowthSpeedInput();
  speedSlider.addEventListener('input', handleGrowthSpeedInput);

  if (!directedGrowthCheckbox) return;
  handleDirectedGrowthChange();
  directedGrowthCheckbox.addEventListener('change', handleDirectedGrowthChange);
}

/** 在普通与困难模式之间切换，并按新模式重新开局。 */
function handleModeRequest() {
  hardMode = !hardMode;
  restartGame('mode-change');
}

/** 切换暂停状态并同步输入计时器和相关按钮；未开始或已结束时拒绝操作。 */
function togglePause() {
  if (!gameStarted || gameOver) return false;
  gamePaused = !gamePaused;
  resetInputTimers();
  updateControlStates();
  syncBackgroundMusic();
  return true;
}

/** 根据当前暂停和结束状态更新暂停按钮的文字及可用性。 */
function updatePauseButton() {
  if (!pauseButton) return;
  setLocalizedText(pauseButton, gamePaused ? 'RESUME' : 'PAUSE');
  pauseButton.disabled = gameOver;
}

/** 返回冻结道具是否仍有剩余时间。 */
function isGrowthFrozen() {
  return freezeRemainingMs > 0;
}

/** 按真实经过时间减少冻结剩余时长，并及时刷新按钮显示。 */
function updateFreezeTimer(elapsedMs) {
  freezeRemainingMs = Math.max(0, freezeRemainingMs - normalizeElapsedMs(elapsedMs));
  updateFreezeButton();
}

/**
 * 消耗一个冻结道具，清除当前警告并暂停所有模式的生长。
 * 困难模式操作阶段会回到四步周期起点，避免恢复时立即生长。
 */
function useFreezeItem() {
  if (gameOver || gamePaused || freezeItems <= 0 || isGrowthFrozen()) return false;
  freezeItems -= 1;
  freezeRemainingMs = FREEZE_DURATION_MS;
  currentPiece.warning = null;
  currentPiece.growthElapsedMs = 0;
  hardOperationCount -= hardOperationCount % 4;
  updateFreezeButton();
  return true;
}

/** 显示冻结道具数量或剩余时间，并根据游戏状态决定按钮是否可用。 */
function updateFreezeButton() {
  if (!freezeButton) return;
  const label = isGrowthFrozen()
    ? `FROZEN ${(freezeRemainingMs / 1000).toFixed(1)}s`
    : `FREEZE ×${freezeItems}`;
  const disabled = gameOver || gamePaused || freezeItems <= 0 || isGrowthFrozen();
  if (freezeButton.textContent !== t(label)) setLocalizedText(freezeButton, label);
  if (freezeButton.disabled !== disabled) freezeButton.disabled = disabled;
}

/**
 * 统一执行玩家操作并维护困难模式的四步生长周期。
 * 第四次有效操作先提交生长；失败操作会回滚生长且不增加计数。
 * 若操作生成了新方块，会根据操作阶段为新方块恢复正确的警告状态。
 */
function performOperation(action) {
  if (gameOver || gamePaused) return false;

  if (isGrowthFrozen()) {
    return action() !== false;
  }

  const pieceBefore = currentPiece;
  const growthBefore = hardMode ? {
    shape: currentPiece.shape.map(([x, y]) => [x, y]),
    warning: currentPiece.warning ? [...currentPiece.warning] : null,
    growthElapsedMs: currentPiece.growthElapsedMs,
  } : null;

  // 困难模式下，第一次有效操作显示警告格，第四次有效操作使其生长。
  // 生长发生在第四次操作之前，防止暂存或硬降丢弃已经提示的生长格。
  if (hardMode && (hardOperationCount + 1) % 4 === 0) {
    currentPiece.commitWarningGrowth();
  }

  hardOperationInProgress = hardMode;
  let succeeded;
  let actionError = null;
  try {
    succeeded = action() !== false;
  } catch (error) {
    succeeded = false;
    actionError = error;
  } finally {
    hardOperationInProgress = false;
  }

  if (!succeeded) {
    if (growthBefore && currentPiece === pieceBefore) {
      currentPiece.shape = growthBefore.shape;
      currentPiece.warning = growthBefore.warning;
      currentPiece.growthElapsedMs = growthBefore.growthElapsedMs;
    }
    if (actionError) throw actionError;
    return false;
  }
  if (!hardMode || gameOver) return true;

  hardOperationCount += 1;
  const spawnedNewPiece = currentPiece !== pieceBefore;
  if (hardOperationCount % 4 === 1 || (spawnedNewPiece && hardOperationCount % 4 !== 0)) {
    currentPiece.warning = null;
    currentPiece.chooseWarning();
  }
  return true;
}

/** 方块落地后移动或旋转时重置锁定计时，但每个方块最多允许 15 次。 */
function resetLockDelayAfterAdjustment(piece) {
  const isGrounded = !board.isValid(piece.x, piece.y + 1, piece.shape);
  if (!isGrounded || lockDelayResetCount >= MAX_LOCK_DELAY_RESETS) return;
  lockElapsedMs = 0;
  lockDelayResetCount += 1;
}

/**
 * 将键盘和触屏动作统一映射到同一套游戏函数。
 * 未知动作返回失败，防止错误的页面属性触发意外行为。
 */
function executeGameAction(actionName) {
  switch (actionName) {
    case 'mode':
      handleModeRequest();
      return true;
    case 'restart':
      restartGame();
      return true;
    case 'pause': return togglePause();
    case 'freeze': return useFreezeItem();
    case 'left': return performOperation(() => currentPiece.move(-1, 0));
    case 'right': return performOperation(() => currentPiece.move(1, 0));
    case 'down': return performOperation(() => currentPiece.move(0, 1));
    case 'rotate': return performOperation(() => currentPiece.rotate());
    case 'rotate-ccw': return performOperation(() => currentPiece.rotate(-1));
    case 'rotate-180': return performOperation(() => currentPiece.rotate(2));
    case 'drop': return performOperation(hardDrop);
    case 'hold': return performOperation(holdCurrentPiece);
    default: return false;
  }
}

/** 绘制暂存、预览、分数、模式、冻结、升级提示及暂停/结束遮罩。 */
function drawInterface() {
  drawPanelTitle('Hold:', 20, 55);
  if (heldPiece) drawMiniShape(heldPiece.shape, COLORS[heldPiece.type], 20, 75, 15);
  if (!canHold) {
    noStroke(); fill(150); textSize(10); text(t('USED'), 20, 165);
  }
  noStroke();
  if (isGrowthFrozen()) fill(80, 190, 255);
  else fill(180);
  textSize(11);
  text(t(isGrowthFrozen() ? `Frozen ${(freezeRemainingMs / 1000).toFixed(1)}s` : `Freeze ×${freezeItems}`), 20, 205);

  drawPanelTitle('Next:', 405, 55);
  nextQueue.forEach((type, index) => {
    drawMiniShape(SHAPES[type], COLORS[type], 405, 78 + index * 82, 15);
  });

  noStroke();
  fill(255);
  textAlign(LEFT, BASELINE);
  textStyle(NORMAL);
  textSize(20);
  text(t(`Score: ${score}`), 30, 30);
  textSize(14);
  text(t(`Growth Lv: ${getGrowthLevel()}`), 385, 30);
  text(t(hardMode ? `HARD ${hardOperationCount % 4 + 1}/4` : 'NORMAL'), 205, 30);

  drawLineClearNotice();

  if (speedUpNoticeFrames > 0) {
    const pulse = 140 + 115 * Math.abs(Math.sin(frameCount * 0.2));
    fill(255, 190, 60, pulse);
    textAlign(RIGHT, CENTER);
    textStyle(BOLD);
    textSize(13);
    text(t('SPEED\nUP!'), width - 7, BOARD_Y + 505);
    textStyle(NORMAL);
    textAlign(LEFT, BASELINE);
  }

  if (gameOver) {
    noStroke(); fill(0, 210); rect(BOARD_X, BOARD_Y + 220, COLS * CELL, 140);
    textAlign(CENTER, CENTER); fill(255); textSize(28); text(t('GAME OVER'), width / 2, BOARD_Y + 255);
    textSize(14);
    if (hardMode) {
      if (usesTouchControls()) {
        text(t('RESTART: Play hard mode again'), width / 2, BOARD_Y + 300);
        text(t('EXIT HARD MODE: Return to normal'), width / 2, BOARD_Y + 330);
      } else {
        text(t(`${formatKeyCode(keyBindings.restart)}: Play hard mode again`), width / 2, BOARD_Y + 300);
        text(t(`${formatKeyCode(keyBindings.mode)}: Exit hard mode`), width / 2, BOARD_Y + 330);
      }
    } else {
      text(t(usesTouchControls() ? 'Tap RESTART below' : `Press ${formatKeyCode(keyBindings.restart)} to restart`), width / 2, BOARD_Y + 310);
    }
    textAlign(LEFT, BASELINE);
  } else if (gamePaused) {
    noStroke(); fill(0, 215); rect(BOARD_X, BOARD_Y + 235, COLS * CELL, 110);
    textAlign(CENTER, CENTER); fill(255); textSize(28); text(t('PAUSED'), width / 2, BOARD_Y + 270);
    textSize(13);
    text(t(usesTouchControls() ? 'Tap RESUME below' : `Press ${formatKeyCode(keyBindings.pause)} to resume`), width / 2, BOARD_Y + 315);
    textAlign(LEFT, BASELINE);
  }
}

/**
 * 在棋盘左侧绘制消行结果，并根据剩余时间向上移动及淡出。
 * 四行消除显示四消名称，其余情况分别显示单消、双消或三消名称。
 */
function drawLineClearNotice() {
  if (!lineClearNotice || lineClearNotice.framesRemaining <= 0) return;

  const labels = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD'];
  const progress = 1 - lineClearNotice.framesRemaining / LINE_CLEAR_NOTICE_FRAMES;
  const alpha = 255 * Math.min(1, lineClearNotice.framesRemaining / 25);
  const noticeY = 285 - progress * 24;

  noStroke();
  fill(255, 205, 70, alpha);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(12);
  text(t(labels[lineClearNotice.lines] || `${lineClearNotice.lines} LINES`), BOARD_X / 2, noticeY);
  textSize(16);
  text(t(`+${lineClearNotice.points}`), BOARD_X / 2, noticeY + 19);
  textStyle(NORMAL);
  textAlign(LEFT, BASELINE);
}

/** 通过视口宽度和指针类型判断当前是否应展示触屏文案。 */
function usesTouchControls() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 560 || window.matchMedia('(pointer: coarse)').matches;
}

/** 使用统一样式绘制暂存和预览面板标题。 */
function drawPanelTitle(label, x, y) {
  noStroke(); fill(255); textStyle(NORMAL); textSize(20); textAlign(LEFT, BASELINE); text(t(label), x, y);
}

/** 将形状按自身最小坐标归一化后绘制为暂存或预览缩略图。 */
function drawMiniShape(shape, shapeColor, x, y, size) {
  const minX = Math.min(...shape.map(([dx]) => dx));
  const minY = Math.min(...shape.map(([, dy]) => dy));
  fill(shapeColor);
  strokeWeight(1);
  shape.forEach(([dx, dy]) => {
    stroke(50);
    rect(x + (dx - minX) * size, y + (dy - minY) * size, size, size);
  });
}

/** 清空左右方向键的长按方向和重复计时。 */
function resetHorizontalInputTimers() {
  heldHorizontalDirection = 0;
  horizontalHoldElapsedMs = 0;
  horizontalRepeatElapsedMs = 0;
}

/** 清空软降键的长按状态和重复计时。 */
function resetSoftDropInputTimers() {
  softDropWasHeld = false;
  softDropHoldElapsedMs = 0;
  softDropRepeatElapsedMs = 0;
}

/** 同时清空所有长按输入计时，供暂停和重新开局使用。 */
function resetInputTimers() {
  resetBoardGesture();
  resetHorizontalInputTimers();
  resetSoftDropInputTimers();
  heldActions.clear();
}

/**
 * 用真实毫秒累计自动下落和落地锁定延迟。
 * 可继续下落时按固定间隔下降；已落地时累计到上限后锁定。
 */
function updateFalling(elapsedMs) {
  elapsedMs = normalizeElapsedMs(elapsedMs);
  if (!board.isValid(currentPiece.x, currentPiece.y + 1, currentPiece.shape)) {
    fallElapsedMs = 0;
    lockElapsedMs += elapsedMs;
    if (lockElapsedMs >= LOCK_DELAY_MS) lockAndSpawn();
    return;
  }

  lockElapsedMs = 0;
  fallElapsedMs += elapsedMs;
  if (fallElapsedMs < FALL_INTERVAL_MS) return;
  fallElapsedMs -= FALL_INTERVAL_MS;
  currentPiece.move(0, 1);
}

/**
 * 实现左右移动和软降的延迟自动重复行为。
 * 首次按键由键盘按下入口处理并计作一次操作；长按产生的重复移动不重复计数。
 */
function handleHeldKeys(elapsedMs) {
  elapsedMs = normalizeElapsedMs(elapsedMs);
  const leftHeld = heldActions.has('left');
  const rightHeld = heldActions.has('right');
  const horizontalDirection = leftHeld === rightHeld
    ? 0
    : (leftHeld ? -1 : 1);

  if (horizontalDirection !== heldHorizontalDirection) {
    heldHorizontalDirection = horizontalDirection;
    horizontalHoldElapsedMs = 0;
    horizontalRepeatElapsedMs = 0;
  } else if (horizontalDirection !== 0) {
    const previousHoldMs = horizontalHoldElapsedMs;
    horizontalHoldElapsedMs += elapsedMs;
    if (horizontalHoldElapsedMs >= HORIZONTAL_HOLD_DELAY_MS) {
      if (previousHoldMs < HORIZONTAL_HOLD_DELAY_MS) {
        currentPiece.move(horizontalDirection, 0);
        horizontalRepeatElapsedMs = horizontalHoldElapsedMs - HORIZONTAL_HOLD_DELAY_MS;
      } else {
        horizontalRepeatElapsedMs += elapsedMs;
      }
      while (horizontalRepeatElapsedMs >= HORIZONTAL_REPEAT_MS) {
        currentPiece.move(horizontalDirection, 0);
        horizontalRepeatElapsedMs -= HORIZONTAL_REPEAT_MS;
      }
    }
  }

  const softDropHeld = heldActions.has('down');
  if (softDropHeld !== softDropWasHeld) {
    softDropWasHeld = softDropHeld;
    softDropHoldElapsedMs = 0;
    softDropRepeatElapsedMs = 0;
  } else if (softDropHeld) {
    const previousHoldMs = softDropHoldElapsedMs;
    softDropHoldElapsedMs += elapsedMs;
    if (softDropHoldElapsedMs >= SOFT_DROP_HOLD_DELAY_MS) {
      if (previousHoldMs < SOFT_DROP_HOLD_DELAY_MS) {
        currentPiece.move(0, 1);
        softDropRepeatElapsedMs = softDropHoldElapsedMs - SOFT_DROP_HOLD_DELAY_MS;
      } else {
        softDropRepeatElapsedMs += elapsedMs;
      }
      while (softDropRepeatElapsedMs >= SOFT_DROP_REPEAT_MS) {
        currentPiece.move(0, 1);
        softDropRepeatElapsedMs -= SOFT_DROP_REPEAT_MS;
      }
    }
  }
}

/** 绘图库的键盘按下入口：处理开始、模式、暂停、道具以及所有方块操作。 */
function keyPressed(event) {
  if (event?.target?.matches?.('input[type="text"], textarea, select') || event?.target?.isContentEditable) return undefined;
  if (scoreHistoryDialog?.open) return undefined;
  if (event?.target?.closest?.('[data-open-scores]') && ['Space', 'Enter'].includes(event.code)) return undefined;
  if (handleKeyCapture(event)) return false;
  if (controlsSuspended) {
    if (event?.code === 'Escape') closeKeybindingsPanel();
    return false;
  }

  const action = getActionForCode(event?.code);
  if (!action) return undefined;
  if (event?.repeat) return false;

  if (!gameStarted) {
    if (action === 'drop') requestStartGame();
    return false;
  }

  if (action === 'pause') {
    executeGameAction('pause');
    return false;
  }
  if (gamePaused) {
    if (action === 'restart') executeGameAction('restart');
    return false;
  }

  if (['left', 'right', 'down'].includes(action)) heldActions.add(action);
  executeGameAction(action);
  return false;
}

/** 绘图库的键盘松开入口：结束方向键长按并清空重复计时。 */
function keyReleased(event) {
  if (event?.target?.matches?.('input[type="text"], textarea, select') || event?.target?.isContentEditable) return undefined;
  if (scoreHistoryDialog?.open) return undefined;
  if (event?.target?.closest?.('[data-open-scores]') && ['Space', 'Enter'].includes(event.code)) return undefined;
  const action = getActionForCode(event?.code);
  if (!action) return undefined;
  heldActions.delete(action);
  if (action === 'left' || action === 'right') resetHorizontalInputTimers();
  if (action === 'down') resetSoftDropInputTimers();
  return false;
}

// A scroll/drag never activates a button; keyboard and assistive clicks still work.
function bindTapControl(element, activate) {
  let pointer = null;
  let cancelled = false;
  element.addEventListener('pointerdown', (event) => {
    if (event.isPrimary === false) { cancelled = true; return; }
    cancelled = event.button !== undefined && event.button !== 0;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  const track = (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) cancelled = true;
  };
  element.addEventListener('pointermove', track, { passive: true });
  element.addEventListener('pointerup', (event) => { track(event); pointer = null; });
  element.addEventListener('pointercancel', () => { pointer = null; cancelled = true; });
  element.addEventListener('click', (event) => {
    if (event.detail !== 0 && cancelled) { event.preventDefault(); return; }
    if (!element.disabled) activate(event);
  });
}

let boardGesture = null;
function resetBoardGesture() { boardGesture = null; }
function canUseBoardGesture() {
  return gameStarted && !gamePaused && !gameOver && !controlsSuspended && !document.hidden;
}

function beginBoardGesture(event) {
  if (event.isPrimary === false) { resetBoardGesture(); return; }
  if (!['touch', 'pen'].includes(event.pointerType) || !canUseBoardGesture()) return;
  const bounds = gameCanvas.getBoundingClientRect();
  const scale = bounds.width / 500;
  const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
  if (x < BOARD_X * scale || x > (BOARD_X + COLS * CELL) * scale
      || y < BOARD_Y * scale || y > (BOARD_Y + ROWS * CELL) * scale) return;
  boardGesture = {
    id: event.pointerId, startX: event.clientX, startY: event.clientY,
    anchorX: event.clientX, step: Math.max(18, CELL * scale),
    startedAt: event.timeStamp, piece: currentPiece, axis: null, counted: false,
  };
  try { (boardGestureSurface || gameCanvas).setPointerCapture(event.pointerId); } catch (_) { /* Implicit touch capture is sufficient. */ }
}

function moveBoardGesture(event) {
  const gesture = boardGesture;
  if (!gesture || event.pointerId !== gesture.id) return;
  if (!canUseBoardGesture() || gesture.piece !== currentPiece) { resetBoardGesture(); return; }
  const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
  if (!gesture.axis) {
    if (Math.abs(dx) >= 12 && Math.abs(dx) > Math.abs(dy) * 1.25) gesture.axis = 'horizontal';
    else if (Math.abs(dy) >= 12 && Math.abs(dy) > Math.abs(dx) * 1.25) gesture.axis = 'vertical';
    else return;
  }
  if (event.cancelable) event.preventDefault();
  // Vertical actions commit only on release; cancelled gestures never drop a piece.
  if (gesture.axis === 'vertical') return;
  let distance = event.clientX - gesture.anchorX;
  // Cap each move event to the board width, even for malformed/coalesced coordinates.
  for (let step = 0; step < COLS && Math.abs(distance) >= gesture.step; step += 1) {
    const direction = distance < 0 ? -1 : 1;
    const moved = gesture.counted ? currentPiece.move(direction, 0)
      : executeGameAction(direction < 0 ? 'left' : 'right');
    if (moved) gesture.counted = true;
    gesture.anchorX += direction * gesture.step;
    distance = event.clientX - gesture.anchorX;
  }
}

function endBoardGesture(event) {
  const gesture = boardGesture;
  if (!gesture || event.pointerId !== gesture.id) return;
  moveBoardGesture(event);
  const valid = boardGesture === gesture && canUseBoardGesture() && gesture.piece === currentPiece;
  const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
  resetBoardGesture();
  if (!valid) return;
  if (gesture.axis === 'vertical') {
    if (dy >= 48) executeGameAction('drop');
    else if (dy <= -28) executeGameAction('rotate');
  } else if (!gesture.axis && Math.hypot(dx, dy) <= 10 && event.timeStamp - gesture.startedAt < 500) {
    executeGameAction('rotate');
  }
}

/** The board reserves gameplay swipes; the surrounding canvas and page keep native scrolling. */
function bindTouchControls() {
  document.querySelectorAll('[data-action]').forEach((button) => {
    bindTapControl(button, () => {
      if (!controlsSuspended && gameStarted) executeGameAction(button.dataset.action);
    });
  });
  if (!boardGestureSurface) return;
  boardGestureSurface.addEventListener('pointerdown', beginBoardGesture);
  boardGestureSurface.addEventListener('pointermove', moveBoardGesture);
  boardGestureSurface.addEventListener('pointerup', endBoardGesture);
  boardGestureSurface.addEventListener('pointercancel', resetBoardGesture);
  boardGestureSurface.addEventListener('lostpointercapture', resetBoardGesture);
  document.addEventListener('pointerdown', (event) => { if (event.isPrimary === false) resetBoardGesture(); }, { passive: true });
}

if (typeof document.addEventListener === 'function') {
  document.addEventListener('DOMContentLoaded', setup, { once: true });
}
