const COLS = 10;
const ROWS = 20;
const CELL = 30;
const BOARD_X = 100;
const BOARD_Y = 50;
const PREVIEW_COUNT = 5;
const FALL_INTERVAL_MS = 500;
const HORIZONTAL_HOLD_DELAY_MS = 140;
const HORIZONTAL_REPEAT_MS = 70;
const SOFT_DROP_HOLD_DELAY_MS = 60;
const SOFT_DROP_REPEAT_MS = 45;
const FREEZE_DURATION_FRAMES = 8 * 60;
const GROWTH_WARNING_FRAMES = 45;
const PIECES_PER_SPEED_LEVEL = 5;
const GROWTH_SPEED_STEP_FRAMES = 12;
const MIN_GROWTH_INTERVAL = 60;
const SPEED_UP_NOTICE_FRAMES = 90;

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

// Official SRS wall-kick data converted to canvas coordinates, where +y is down.
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
let heldPiece = null;
let canHold = true;
let score = 0;
let piecesLocked = 0;
let speedUpNoticeFrames = 0;
let gameOver = false;
let gameStarted = false;
let gamePaused = false;
let fallElapsedMs = 0;
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
let freezeFramesRemaining = 0;
let modeButton;
let speedSlider;
let speedOutput;
let directedGrowthCheckbox;
let freezeButton;
let pauseButton;
let startScreen;

function setup() {
  const canvas = createCanvas(500, 700);
  canvas.parent('game-canvas');
  frameRate(60);
  textFont('monospace');
  cacheControls();
  bindGrowthControls();
  restartGame();
  bindTouchControls();
  bindStartScreen();
}

function draw() {
  background(0);
  board.draw();
  if (!gameOver) currentPiece.drawLandingPreview();
  currentPiece.draw();

  if (gameStarted && !gameOver && !gamePaused) {
    const elapsedMs = Math.min(deltaTime, 100);
    handleHeldKeys(elapsedMs);
    if (freezeFramesRemaining > 0) {
      freezeFramesRemaining -= 1;
      if (freezeFramesRemaining % 15 === 0) updateFreezeButton();
    } else if (!hardMode) {
      currentPiece.updateGrowth();
    }
    updateFalling(elapsedMs);
    if (speedUpNoticeFrames > 0) speedUpNoticeFrames -= 1;
  }

  drawInterface();
}

class Board {
  constructor() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  draw() {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const value = this.grid[row][col];
        fill(value || 20);
        stroke(value ? 0 : 200);
        strokeWeight(1);
        rect(BOARD_X + col * CELL, BOARD_Y + row * CELL, CELL, CELL);
      }
    }
  }

  isValid(piece, newX, newY, shape = piece.shape) {
    return shape.every(([dx, dy]) => {
      const col = newX + dx;
      const row = newY + dy;
      return col >= 0 && col < COLS && row < ROWS
        && (row < 0 || !this.grid[row][col]);
    });
  }

  lock(piece) {
    piece.shape.forEach(([dx, dy]) => {
      const col = piece.x + dx;
      const row = piece.y + dy;
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS) {
        this.grid[row][col] = piece.color;
      }
    });
  }

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
    return cleared;
  }
}

class Piece {
  constructor(type) {
    this.type = type;
    this.color = COLORS[type];
    this.shape = SHAPES[type].map(([x, y]) => [x, y]);
    this.rotationState = 0;
    this.growthCounter = 0;
    this.warning = null;
    positionPieceAtSpawn(this);
  }

  draw() {
    this.shape.forEach(([dx, dy]) => drawCell(this.x + dx, this.y + dy, this.color));
    this.drawGrowthWarning();
  }

  getLandingY() {
    let landingY = this.y;
    while (board.isValid(this, this.x, landingY + 1)) landingY += 1;
    return landingY;
  }

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

  move(dx, dy) {
    if (!board.isValid(this, this.x + dx, this.y + dy)) return false;
    this.x += dx;
    this.y += dy;
    this.revalidateWarning();
    return true;
  }

  rotate(turns = 1) {
    if (turns === 2) {
      const before = {
        shape: this.shape.map(([x, y]) => [x, y]),
        warning: this.warning ? [...this.warning] : null,
        x: this.x,
        y: this.y,
        rotationState: this.rotationState,
      };
      if (this.rotateQuarter(1) && this.rotateQuarter(1)) return true;
      this.shape = before.shape;
      this.warning = before.warning;
      this.x = before.x;
      this.y = before.y;
      this.rotationState = before.rotationState;
      return false;
    }

    return this.rotateQuarter(turns === -1 ? -1 : 1);
  }

  rotateQuarter(direction) {
    const fromState = this.rotationState;
    const toState = (fromState + direction + 4) % 4;
    const rotated = this.shape.map((cell) => this.rotateCell(cell, direction));
    const kickTable = this.type === 'I' ? I_KICKS : JLSTZ_KICKS;
    const kickTests = this.type === 'O'
      ? [[0, 0]]
      : kickTable[`${fromState}>${toState}`];
    const kick = kickTests.find(([dx, dy]) => (
      board.isValid(this, this.x + dx, this.y + dy, rotated)
    ));
    if (!kick) return false;

    this.shape = rotated;
    this.x += kick[0];
    this.y += kick[1];
    this.rotationState = toState;
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

  rotateCell([x, y], direction) {
    const [pivotX, pivotY] = ROTATION_PIVOTS[this.type];
    const relativeX = x - pivotX;
    const relativeY = y - pivotY;
    return direction === 1
      ? [Math.round(pivotX - relativeY), Math.round(pivotY + relativeX)]
      : [Math.round(pivotX + relativeY), Math.round(pivotY - relativeX)];
  }

  updateGrowth() {
    const interval = getGrowthInterval();
    this.growthCounter += 1;
    if (!this.warning && this.growthCounter >= interval - GROWTH_WARNING_FRAMES) this.chooseWarning();
    if (this.growthCounter >= interval) {
      this.commitWarningGrowth();
    }
  }

  commitWarningGrowth() {
    if (!this.warning) this.chooseWarning();
    if (this.warning && this.isGrowthCellValid(...this.warning)) {
      this.shape.push([...this.warning]);
    }
    this.warning = null;
    this.growthCounter = 0;
  }

  containsCell(x, y) {
    return this.shape.some(([sx, sy]) => sx === x && sy === y);
  }

  isGrowthCellValid(x, y) {
    if (this.containsCell(x, y)) return false;
    const col = this.x + x;
    const row = this.y + y;
    return col >= 0 && col < COLS && row >= 0 && row < ROWS && !board.grid[row][col];
  }

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

  revalidateWarning() {
    if (this.warning && !this.isGrowthCellValid(...this.warning)) {
      this.warning = null;
      this.chooseWarning();
    }
  }

  drawGrowthWarning() {
    if (!this.warning) return;
    this.revalidateWarning();
    if (!this.warning) return;
    const alpha = 70 + 120 * Math.abs(Math.sin(frameCount * 0.16));
    const c = color(this.color);
    c.setAlpha(alpha);
    fill(c);
    stroke(255, 235);
    strokeWeight(2);
    rect(BOARD_X + (this.x + this.warning[0]) * CELL, BOARD_Y + (this.y + this.warning[1]) * CELL, CELL, CELL);
  }
}

function drawCell(col, row, cellColor) {
  fill(cellColor);
  stroke(50);
  strokeWeight(1);
  rect(BOARD_X + col * CELL, BOARD_Y + row * CELL, CELL, CELL);
}

function fillNextQueue() {
  while (nextQueue.length < PREVIEW_COUNT) nextQueue.push(random(PIECE_TYPES));
}

function takeNextPiece() {
  fillNextQueue();
  const piece = new Piece(nextQueue.shift());
  fillNextQueue();
  return piece;
}

function lockAndSpawn() {
  board.lock(currentPiece);
  const lines = board.clearLines();
  score += lines * lines * 100;
  freezeItems += lines;
  if (lines > 0) updateFreezeButton();
  piecesLocked += 1;
  if (!hardMode && piecesLocked % PIECES_PER_SPEED_LEVEL === 0) {
    speedUpNoticeFrames = SPEED_UP_NOTICE_FRAMES;
  }
  currentPiece = takeNextPiece();
  canHold = true;
  fallElapsedMs = 0;
  if (!board.isValid(currentPiece, currentPiece.x, currentPiece.y)) endGame();
  if (hardMode && hardOperationCount % 4 !== 0 && !gameOver && !isGrowthFrozen()) currentPiece.chooseWarning();
}

function holdCurrentPiece() {
  if (gameOver || !canHold) return;
  const outgoingPiece = snapshotPiece(currentPiece);
  let incomingPiece;
  let queueBeforeHold = null;

  if (heldPiece === null) {
    queueBeforeHold = [...nextQueue];
    incomingPiece = takeNextPiece();
  } else {
    incomingPiece = restorePiece(heldPiece);
  }

  // A grown or rotated held structure can have negative offsets or be much
  // wider than its original tetromino. Only commit the swap after a safe,
  // centered spawn position has been found.
  if (!board.isValid(incomingPiece, incomingPiece.x, incomingPiece.y)) {
    if (queueBeforeHold) nextQueue = queueBeforeHold;
    return false;
  }

  heldPiece = outgoingPiece;
  currentPiece = incomingPiece;
  canHold = false;
  fallElapsedMs = 0;
  return true;
}

function snapshotPiece(piece) {
  return {
    type: piece.type,
    shape: piece.shape.map(([x, y]) => [x, y]),
    rotationState: piece.rotationState,
  };
}

function restorePiece(savedPiece) {
  const piece = new Piece(savedPiece.type);
  piece.shape = savedPiece.shape.map(([x, y]) => [x, y]);
  piece.rotationState = savedPiece.rotationState ?? 0;
  positionPieceAtSpawn(piece);
  return piece;
}

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

function hardDrop() {
  if (gameOver) return;
  while (currentPiece.move(0, 1)) score += 1;
  lockAndSpawn();
}

function getGrowthLevel() {
  return Math.floor(piecesLocked / PIECES_PER_SPEED_LEVEL) + 1;
}

function getGrowthInterval() {
  const progressReduction = (getGrowthLevel() - 1) * GROWTH_SPEED_STEP_FRAMES;
  return Math.max(MIN_GROWTH_INTERVAL, 330 - growthSpeed * 24 - progressReduction);
}

function restartGame() {
  board = new Board();
  nextQueue = [];
  heldPiece = null;
  canHold = true;
  score = 0;
  piecesLocked = 0;
  speedUpNoticeFrames = 0;
  gameOver = false;
  gamePaused = false;
  fallElapsedMs = 0;
  resetInputTimers();
  hardOperationCount = 0;
  freezeItems = 0;
  freezeFramesRemaining = 0;
  fillNextQueue();
  currentPiece = takeNextPiece();
  updateModeButton();
  updateFreezeButton();
  updatePauseButton();
}

function endGame() {
  gameOver = true;
  updateModeButton();
  updateFreezeButton();
  updatePauseButton();
}

function cacheControls() {
  modeButton = document.querySelector('[data-action="mode"]');
  speedSlider = document.querySelector('#growth-speed');
  speedOutput = document.querySelector('#growth-speed-value');
  directedGrowthCheckbox = document.querySelector('#directed-growth');
  freezeButton = document.querySelector('[data-action="freeze"]');
  pauseButton = document.querySelector('[data-action="pause"]');
  startScreen = document.querySelector('#start-screen');
}

function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  fallElapsedMs = 0;
  resetInputTimers();
  currentPiece.growthCounter = 0;
  if (startScreen) {
    startScreen.classList.add('is-hidden');
    startScreen.setAttribute('aria-hidden', 'true');
  }
}

function bindStartScreen() {
  if (!startScreen) return;
  startScreen.addEventListener('pointerdown', (event) => {
    if (!usesTouchControls()) return;
    event.preventDefault();
    startGame();
  });
}

function updateModeButton() {
  if (modeButton) {
    if (!hardMode) modeButton.textContent = 'START HARD MODE';
    else if (gameOver) modeButton.textContent = 'EXIT HARD MODE';
    else modeButton.textContent = 'HARD MODE';
    modeButton.disabled = gamePaused && !gameOver;
  }
  if (speedSlider) speedSlider.disabled = hardMode || gamePaused;
  if (directedGrowthCheckbox) directedGrowthCheckbox.disabled = gamePaused;
}

function bindGrowthControls() {
  if (!speedSlider || !speedOutput) return;

  growthSpeed = Number(speedSlider.value);
  speedSlider.addEventListener('input', () => {
    growthSpeed = Number(speedSlider.value);
    speedOutput.value = String(growthSpeed);
  });

  if (!directedGrowthCheckbox) return;
  directedGrowth = directedGrowthCheckbox.checked;
  directedGrowthCheckbox.addEventListener('change', () => {
    directedGrowth = directedGrowthCheckbox.checked;
    const hadWarning = Boolean(currentPiece?.warning);
    currentPiece.warning = null;
    if (hadWarning || (hardMode && hardOperationCount % 4 !== 0)) {
      currentPiece.chooseWarning();
    }
  });
}

function handleModeRequest() {
  if (!hardMode) {
    hardMode = true;
    restartGame();
  } else if (gameOver) {
    hardMode = false;
    restartGame();
  }
}

function togglePause() {
  if (!gameStarted || gameOver) return false;
  gamePaused = !gamePaused;
  resetInputTimers();
  updateModeButton();
  updateFreezeButton();
  updatePauseButton();
  return true;
}

function updatePauseButton() {
  if (!pauseButton) return;
  pauseButton.textContent = gamePaused ? 'RESUME' : 'PAUSE';
  pauseButton.disabled = gameOver;
}

function isGrowthFrozen() {
  return freezeFramesRemaining > 0;
}

function useFreezeItem() {
  if (gameOver || gamePaused || freezeItems <= 0 || isGrowthFrozen()) return false;
  freezeItems -= 1;
  freezeFramesRemaining = FREEZE_DURATION_FRAMES;
  currentPiece.warning = null;
  currentPiece.growthCounter = 0;
  hardOperationCount -= hardOperationCount % 4;
  updateFreezeButton();
  return true;
}

function updateFreezeButton() {
  if (!freezeButton) return;
  if (isGrowthFrozen()) {
    freezeButton.textContent = `FROZEN ${(freezeFramesRemaining / 60).toFixed(1)}s`;
  } else {
    freezeButton.textContent = `FREEZE ×${freezeItems}`;
  }
  freezeButton.disabled = gameOver || gamePaused || freezeItems <= 0 || isGrowthFrozen();
}

function performOperation(action) {
  if (gameOver || gamePaused) return;

  if (isGrowthFrozen()) {
    action();
    return;
  }

  // In hard mode, the first input previews a cell and the fourth grows it.
  // Growth happens before carrying out input four so Hold and hard drop
  // cannot discard the warned cell.
  if (hardMode && (hardOperationCount + 1) % 4 === 0) {
    currentPiece.commitWarningGrowth();
  }

  action();
  if (!hardMode || gameOver) return;

  hardOperationCount += 1;
  if (hardOperationCount % 4 === 1) {
    currentPiece.warning = null;
    currentPiece.chooseWarning();
  }
}

function drawInterface() {
  drawPanelTitle('Hold:', 20, 55);
  if (heldPiece) drawMiniShape(heldPiece.shape, COLORS[heldPiece.type], 20, 75, 15);
  if (!canHold) {
    noStroke(); fill(150); textSize(10); text('USED', 20, 165);
  }
  noStroke();
  fill(isGrowthFrozen() ? color(80, 190, 255) : 180);
  textSize(11);
  text(isGrowthFrozen() ? `Frozen ${(freezeFramesRemaining / 60).toFixed(1)}s` : `Freeze ×${freezeItems}`, 20, 205);

  drawPanelTitle('Next:', 405, 55);
  nextQueue.forEach((type, index) => {
    drawMiniShape(SHAPES[type], COLORS[type], 405, 78 + index * 82, 15);
  });

  noStroke();
  fill(255);
  textAlign(LEFT, BASELINE);
  textStyle(NORMAL);
  textSize(20);
  text(`Score: ${score}`, 30, 30);
  textSize(14);
  text(`Growth Lv: ${getGrowthLevel()}`, 385, 30);
  text(hardMode ? `HARD ${hardOperationCount % 4 + 1}/4` : 'NORMAL', 205, 30);

  if (speedUpNoticeFrames > 0) {
    const pulse = 140 + 115 * Math.abs(Math.sin(frameCount * 0.2));
    fill(255, 190, 60, pulse);
    textAlign(RIGHT, CENTER);
    textStyle(BOLD);
    textSize(13);
    text('SPEED\nUP!', width - 7, BOARD_Y + 505);
    textStyle(NORMAL);
    textAlign(LEFT, BASELINE);
  }

  if (gameOver) {
    noStroke(); fill(0, 210); rect(BOARD_X, BOARD_Y + 220, COLS * CELL, 140);
    textAlign(CENTER, CENTER); fill(255); textSize(28); text('GAME OVER', width / 2, BOARD_Y + 255);
    textSize(14);
    if (hardMode) {
      if (usesTouchControls()) {
        text('RESTART: Play hard mode again', width / 2, BOARD_Y + 300);
        text('EXIT HARD MODE: Return to normal', width / 2, BOARD_Y + 330);
      } else {
        text('R: Play hard mode again', width / 2, BOARD_Y + 300);
        text('H: Exit hard mode', width / 2, BOARD_Y + 330);
      }
    } else {
      text(usesTouchControls() ? 'Tap RESTART below' : 'Press R to restart', width / 2, BOARD_Y + 310);
    }
    textAlign(LEFT, BASELINE);
  } else if (gamePaused) {
    noStroke(); fill(0, 215); rect(BOARD_X, BOARD_Y + 235, COLS * CELL, 110);
    textAlign(CENTER, CENTER); fill(255); textSize(28); text('PAUSED', width / 2, BOARD_Y + 270);
    textSize(13);
    text(usesTouchControls() ? 'Tap RESUME below' : 'Press P to resume', width / 2, BOARD_Y + 315);
    textAlign(LEFT, BASELINE);
  }
}

function usesTouchControls() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 560 || window.matchMedia('(pointer: coarse)').matches;
}

function drawPanelTitle(label, x, y) {
  noStroke(); fill(255); textStyle(NORMAL); textSize(20); textAlign(LEFT, BASELINE); text(label, x, y);
}

function drawMiniShape(shape, shapeColor, x, y, size) {
  const minX = Math.min(...shape.map(([dx]) => dx));
  const minY = Math.min(...shape.map(([, dy]) => dy));
  fill(shapeColor);
  shape.forEach(([dx, dy]) => {
    stroke(50);
    rect(x + (dx - minX) * size, y + (dy - minY) * size, size, size);
  });
}

function resetInputTimers() {
  heldHorizontalDirection = 0;
  horizontalHoldElapsedMs = 0;
  horizontalRepeatElapsedMs = 0;
  softDropWasHeld = false;
  softDropHoldElapsedMs = 0;
  softDropRepeatElapsedMs = 0;
}

function updateFalling(elapsedMs) {
  fallElapsedMs += elapsedMs;
  if (fallElapsedMs < FALL_INTERVAL_MS) return;
  fallElapsedMs -= FALL_INTERVAL_MS;
  if (!currentPiece.move(0, 1)) lockAndSpawn();
}

function handleHeldKeys(elapsedMs) {
  const horizontalDirection = keyIsDown(LEFT_ARROW) === keyIsDown(RIGHT_ARROW)
    ? 0
    : (keyIsDown(LEFT_ARROW) ? -1 : 1);

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

  const softDropHeld = keyIsDown(DOWN_ARROW);
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

function keyPressed(event) {
  if (event && event.repeat) return false;

  if (!gameStarted) {
    if (key === ' ') startGame();
    return false;
  }

  if (key === 'p' || key === 'P') {
    togglePause();
    return false;
  }
  if (gamePaused) {
    if (key === 'r' || key === 'R') restartGame();
    return false;
  }

  if (key === 'h' || key === 'H') handleModeRequest();
  else if (key === 'r' || key === 'R') restartGame();
  else if (key === 'f' || key === 'F') useFreezeItem();
  else if (keyCode === LEFT_ARROW) performOperation(() => currentPiece.move(-1, 0));
  else if (keyCode === RIGHT_ARROW) performOperation(() => currentPiece.move(1, 0));
  else if (keyCode === DOWN_ARROW) performOperation(() => currentPiece.move(0, 1));
  else if (keyCode === UP_ARROW) performOperation(() => currentPiece.rotate());
  else if (key === 'z' || key === 'Z') performOperation(() => currentPiece.rotate(-1));
  else if (key === 'x' || key === 'X') performOperation(() => currentPiece.rotate(2));
  else if (key === ' ') performOperation(() => hardDrop());
  else if (key === 'c' || key === 'C') performOperation(() => holdCurrentPiece());

  if ([LEFT_ARROW, RIGHT_ARROW, DOWN_ARROW, UP_ARROW, 32].includes(keyCode)) return false;
}

function keyReleased() {
  if ([LEFT_ARROW, RIGHT_ARROW, DOWN_ARROW].includes(keyCode)) resetInputTimers();
}

function bindTouchControls() {
  const touchActions = {
    mode: handleModeRequest,
    restart: restartGame,
    pause: togglePause,
    freeze: useFreezeItem,
    left: () => performOperation(() => currentPiece.move(-1, 0)),
    right: () => performOperation(() => currentPiece.move(1, 0)),
    down: () => performOperation(() => currentPiece.move(0, 1)),
    rotate: () => performOperation(() => currentPiece.rotate()),
    'rotate-ccw': () => performOperation(() => currentPiece.rotate(-1)),
    'rotate-180': () => performOperation(() => currentPiece.rotate(2)),
    drop: () => performOperation(hardDrop),
    hold: () => performOperation(holdCurrentPiece),
  };

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      touchActions[button.dataset.action]?.();
    });
  });
}
