const COLS = 10;
const ROWS = 20;
const CELL = 30;
const BOARD_X = 100;
const BOARD_Y = 50;
const PREVIEW_COUNT = 5;
const FRAMES_PER_FALL = 30;
const FREEZE_DURATION_FRAMES = 8 * 60;
const GROWTH_WARNING_FRAMES = 45;

const SHAPES = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [1, 1], [0, 1]],
  S: [[0, 1], [1, 0], [1, 1], [0, 2]],
  Z: [[0, 0], [1, 1], [1, 2], [0, 1]],
  L: [[0, 0], [1, 0], [2, 0], [2, 1]],
  J: [[0, 1], [1, 1], [2, 1], [2, 0]],
  T: [[0, 0], [0, 1], [0, 2], [1, 1]],
};

const COLORS = {
  I: '#38d8e8', O: '#ffc247', S: '#ff4c61', Z: '#5be078',
  L: '#ff9d45', J: '#ff659d', T: '#a879ff',
};
const PIECE_TYPES = Object.keys(SHAPES);

let board;
let currentPiece;
let nextQueue = [];
let heldPiece = null;
let canHold = true;
let score = 0;
let piecesLocked = 0;
let gameOver = false;
let gameStarted = false;
let fallCounter = 0;
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
  currentPiece.draw();

  if (gameStarted && !gameOver) {
    handleHeldKeys();
    if (freezeFramesRemaining > 0) {
      freezeFramesRemaining -= 1;
      if (freezeFramesRemaining % 15 === 0) updateFreezeButton();
    } else if (!hardMode) {
      currentPiece.updateGrowth();
    }
    fallCounter += 1;
    if (fallCounter >= FRAMES_PER_FALL) {
      fallCounter = 0;
      if (!currentPiece.move(0, 1)) lockAndSpawn();
    }
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
        stroke(200);
        strokeWeight(1);
        rect(BOARD_X + col * CELL, BOARD_Y + row * CELL, CELL, CELL);
      }
    }
  }

  isValid(piece, newX, newY, shape = piece.shape) {
    return shape.every(([dx, dy]) => {
      const col = newX + dx;
      const row = newY + dy;
      return col >= 0 && col < COLS && row >= 0 && row < ROWS && !this.grid[row][col];
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
    this.x = Math.floor(COLS / 2) - 1;
    this.y = 0;
    this.growthCounter = 0;
    this.warning = null;
  }

  draw() {
    this.shape.forEach(([dx, dy]) => drawCell(this.x + dx, this.y + dy, this.color));
    this.drawGrowthWarning();
  }

  move(dx, dy) {
    if (!board.isValid(this, this.x + dx, this.y + dy)) return false;
    this.x += dx;
    this.y += dy;
    this.revalidateWarning();
    return true;
  }

  rotate(turns = 1) {
    const clockwiseTurns = turns === -1 ? 3 : turns;
    let rotated = this.shape.map(([x, y]) => [x, y]);
    for (let turn = 0; turn < clockwiseTurns; turn += 1) {
      rotated = rotated.map(([x, y]) => [-y, x]);
    }
    const kicks = [0, 1, -1, 2, -2];
    const kick = kicks.find((offset) => board.isValid(this, this.x + offset, this.y, rotated));
    if (kick === undefined) return false;
    this.shape = rotated;
    this.x += kick;
    if (this.warning) {
      if (directedGrowth) {
        this.warning = null;
        this.chooseWarning();
      } else {
        for (let turn = 0; turn < clockwiseTurns; turn += 1) {
          this.warning = [-this.warning[1], this.warning[0]];
        }
      }
    }
    this.revalidateWarning();
    return true;
  }

  updateGrowth() {
    const interval = Math.max(35, 330 - growthSpeed * 24 - piecesLocked * 7);
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
  currentPiece = takeNextPiece();
  canHold = true;
  fallCounter = 0;
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
  fallCounter = 0;
  return true;
}

function snapshotPiece(piece) {
  return {
    type: piece.type,
    shape: piece.shape.map(([x, y]) => [x, y]),
  };
}

function restorePiece(savedPiece) {
  const piece = new Piece(savedPiece.type);
  piece.shape = savedPiece.shape.map(([x, y]) => [x, y]);
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

function restartGame() {
  board = new Board();
  nextQueue = [];
  heldPiece = null;
  canHold = true;
  score = 0;
  piecesLocked = 0;
  gameOver = false;
  fallCounter = 0;
  hardOperationCount = 0;
  freezeItems = 0;
  freezeFramesRemaining = 0;
  fillNextQueue();
  currentPiece = takeNextPiece();
  updateModeButton();
  updateFreezeButton();
}

function endGame() {
  gameOver = true;
  updateModeButton();
  updateFreezeButton();
}

function cacheControls() {
  modeButton = document.querySelector('[data-action="mode"]');
  speedSlider = document.querySelector('#growth-speed');
  speedOutput = document.querySelector('#growth-speed-value');
  directedGrowthCheckbox = document.querySelector('#directed-growth');
  freezeButton = document.querySelector('[data-action="freeze"]');
  startScreen = document.querySelector('#start-screen');
}

function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  fallCounter = 0;
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
  }
  if (speedSlider) speedSlider.disabled = hardMode;
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

function isGrowthFrozen() {
  return freezeFramesRemaining > 0;
}

function useFreezeItem() {
  if (gameOver || freezeItems <= 0 || isGrowthFrozen()) return false;
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
  freezeButton.disabled = gameOver || freezeItems <= 0 || isGrowthFrozen();
}

function performOperation(action) {
  if (gameOver) return;

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
  text(`Growth speed: ${Math.floor(piecesLocked / 5) + 1}`, 365, 30);
  text(hardMode ? `HARD ${hardOperationCount % 4 + 1}/4` : 'NORMAL', 205, 30);

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

function handleHeldKeys() {
  if (keyIsDown(DOWN_ARROW) && frameCount % 3 === 0) currentPiece.move(0, 1);
  if (keyIsDown(LEFT_ARROW) && frameCount % 7 === 0) currentPiece.move(-1, 0);
  if (keyIsDown(RIGHT_ARROW) && frameCount % 7 === 0) currentPiece.move(1, 0);
}

function keyPressed(event) {
  if (event && event.repeat) return false;

  if (!gameStarted) {
    if (key === ' ') startGame();
    return false;
  }

  if (key === 'h' || key === 'H') handleModeRequest();
  else if (key === 'r' || key === 'R') restartGame();
  else if (key === 'f' || key === 'F') useFreezeItem();
  else if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW || keyCode === DOWN_ARROW) performOperation(() => {});
  else if (keyCode === UP_ARROW) performOperation(() => currentPiece.rotate());
  else if (key === 'z' || key === 'Z') performOperation(() => currentPiece.rotate(-1));
  else if (key === 'x' || key === 'X') performOperation(() => currentPiece.rotate(2));
  else if (key === ' ') performOperation(() => hardDrop());
  else if (key === 'c' || key === 'C') performOperation(() => holdCurrentPiece());

  if ([LEFT_ARROW, RIGHT_ARROW, DOWN_ARROW, UP_ARROW, 32].includes(keyCode)) return false;
}

function bindTouchControls() {
  const touchActions = {
    mode: handleModeRequest,
    restart: restartGame,
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
