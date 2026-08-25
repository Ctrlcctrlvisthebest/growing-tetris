const COLS = 10;
const ROWS = 20;
const CELL = 30;
const BOARD_X = 160;
const BOARD_Y = 60;
const PREVIEW_COUNT = 5;

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

let board;
let currentPiece;
let nextQueue = [];
let heldType = null;
let canHold = true;
let score = 0;
let piecesLocked = 0;
let gameOver = false;
let fallCounter = 0;
let framesPerFall = 30;

function setup() {
  const canvas = createCanvas(620, 700);
  canvas.parent('game-canvas');
  frameRate(60);
  textFont('monospace');
  restartGame();
  bindTouchControls();
}

function draw() {
  background('#0c0f19');
  drawBackdrop();
  board.draw();
  currentPiece.draw();

  if (!gameOver) {
    handleHeldKeys();
    currentPiece.updateGrowth();
    fallCounter += 1;
    if (fallCounter >= framesPerFall) {
      fallCounter = 0;
      if (!currentPiece.move(0, 1)) lockAndSpawn();
    }
  }

  drawInterface();
}

function drawBackdrop() {
  noStroke();
  fill(143, 117, 255, 18);
  circle(70, 125, 190);
  fill(182, 243, 72, 12);
  circle(555, 570, 230);
}

class Board {
  constructor() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  draw() {
    noStroke();
    fill('#151927');
    rect(BOARD_X - 6, BOARD_Y - 6, COLS * CELL + 12, ROWS * CELL + 12, 9);
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const value = this.grid[row][col];
        fill(value || '#10131d');
        stroke(value ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.045)');
        strokeWeight(1);
        rect(BOARD_X + col * CELL, BOARD_Y + row * CELL, CELL, CELL, 3);
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
    this.warningFrames = 45;
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

  rotate() {
    const rotated = this.shape.map(([x, y]) => [-y, x]);
    const kicks = [0, 1, -1, 2, -2];
    const kick = kicks.find((offset) => board.isValid(this, this.x + offset, this.y, rotated));
    if (kick === undefined) return;
    this.shape = rotated;
    this.x += kick;
    if (this.warning) this.warning = [-this.warning[1], this.warning[0]];
    this.revalidateWarning();
  }

  updateGrowth() {
    const interval = Math.max(70, 210 - piecesLocked * 7);
    this.growthCounter += 1;
    if (!this.warning && this.growthCounter >= interval - this.warningFrames) this.chooseWarning();
    if (this.growthCounter >= interval) {
      if (this.warning && this.isGrowthCellValid(...this.warning)) this.shape.push([...this.warning]);
      this.warning = null;
      this.growthCounter = 0;
    }
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
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
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
    rect(BOARD_X + (this.x + this.warning[0]) * CELL, BOARD_Y + (this.y + this.warning[1]) * CELL, CELL, CELL, 3);
  }
}

function drawCell(col, row, cellColor) {
  fill(cellColor);
  stroke('rgba(255,255,255,.25)');
  strokeWeight(1);
  rect(BOARD_X + col * CELL, BOARD_Y + row * CELL, CELL, CELL, 3);
  noStroke();
  fill(255, 28);
  rect(BOARD_X + col * CELL + 4, BOARD_Y + row * CELL + 4, CELL - 8, 5, 2);
}

function fillNextQueue() {
  while (nextQueue.length < PREVIEW_COUNT) nextQueue.push(random(Object.keys(SHAPES)));
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
  piecesLocked += 1;
  currentPiece = takeNextPiece();
  canHold = true;
  fallCounter = 0;
  if (!board.isValid(currentPiece, currentPiece.x, currentPiece.y)) gameOver = true;
}

function holdCurrentPiece() {
  if (gameOver || !canHold) return;
  const outgoingType = currentPiece.type;
  if (heldType === null) {
    heldType = outgoingType;
    currentPiece = takeNextPiece();
  } else {
    const incomingType = heldType;
    heldType = outgoingType;
    currentPiece = new Piece(incomingType);
  }
  canHold = false;
  fallCounter = 0;
  if (!board.isValid(currentPiece, currentPiece.x, currentPiece.y)) gameOver = true;
}

function hardDrop() {
  if (gameOver) return;
  while (currentPiece.move(0, 1)) score += 1;
  lockAndSpawn();
}

function restartGame() {
  board = new Board();
  nextQueue = [];
  heldType = null;
  canHold = true;
  score = 0;
  piecesLocked = 0;
  gameOver = false;
  fallCounter = 0;
  fillNextQueue();
  currentPiece = takeNextPiece();
}

function drawInterface() {
  drawPanelTitle('HOLD', 24, 78);
  if (heldType) drawMiniPiece(heldType, 26, 102, 16);
  if (!canHold) {
    noStroke(); fill(157, 165, 189, 130); textSize(9); text('USED', 26, 180);
  }

  drawPanelTitle('NEXT', 500, 78);
  nextQueue.forEach((type, index) => drawMiniPiece(type, 500, 100 + index * 90, 15));

  noStroke();
  fill('#f7f8ff');
  textAlign(LEFT, BASELINE);
  textStyle(BOLD);
  textSize(14);
  text(`SCORE  ${String(score).padStart(5, '0')}`, BOARD_X, 34);
  textAlign(RIGHT, BASELINE);
  fill('#b6f348');
  text(`GROW ×${Math.floor(piecesLocked / 5) + 1}`, BOARD_X + COLS * CELL, 34);

  if (gameOver) {
    noStroke(); fill(6, 8, 14, 225); rect(BOARD_X, BOARD_Y + 215, COLS * CELL, 170, 10);
    textAlign(CENTER, CENTER); fill('#b6f348'); textSize(11); text('RUN ENDED', BOARD_X + 150, BOARD_Y + 252);
    fill('#f7f8ff'); textSize(27); text('GAME OVER', BOARD_X + 150, BOARD_Y + 294);
    fill('#9da5bd'); textSize(11); text('按 R 或点击此处重新开始', BOARD_X + 150, BOARD_Y + 335);
    textAlign(LEFT, BASELINE);
  }
}

function drawPanelTitle(label, x, y) {
  noStroke(); fill('#9da5bd'); textStyle(BOLD); textSize(10); textAlign(LEFT, BASELINE); text(label, x, y);
}

function drawMiniPiece(type, x, y, size) {
  noStroke(); fill(COLORS[type]);
  SHAPES[type].forEach(([dx, dy]) => rect(x + dx * size, y + dy * size, size - 2, size - 2, 2));
}

function handleHeldKeys() {
  if (keyIsDown(DOWN_ARROW) && frameCount % 3 === 0) currentPiece.move(0, 1);
  if (keyIsDown(LEFT_ARROW) && frameCount % 7 === 0) currentPiece.move(-1, 0);
  if (keyIsDown(RIGHT_ARROW) && frameCount % 7 === 0) currentPiece.move(1, 0);
}

function keyPressed() {
  if (keyCode === UP_ARROW && !gameOver) currentPiece.rotate();
  if (key === ' ' && !gameOver) hardDrop();
  if ((key === 'c' || key === 'C') && !gameOver) holdCurrentPiece();
  if (key === 'r' || key === 'R') restartGame();
  if ([LEFT_ARROW, RIGHT_ARROW, DOWN_ARROW, UP_ARROW, 32].includes(keyCode)) return false;
}

function mousePressed() {
  if (gameOver && mouseX >= BOARD_X && mouseX <= BOARD_X + COLS * CELL && mouseY >= BOARD_Y + 215 && mouseY <= BOARD_Y + 385) restartGame();
}

function bindTouchControls() {
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const action = button.dataset.action;
      if (action === 'left' && !gameOver) currentPiece.move(-1, 0);
      if (action === 'right' && !gameOver) currentPiece.move(1, 0);
      if (action === 'down' && !gameOver) currentPiece.move(0, 1);
      if (action === 'rotate' && !gameOver) currentPiece.rotate();
      if (action === 'drop') hardDrop();
      if (action === 'hold') holdCurrentPiece();
    });
  });
}
