Board board;

int cols = 10;
int rows = 20;
int boardWidth=300;
int boardHeight=600;
int cellSize;
int framesPerFall = 30; // 方块每 30 帧自动下落一次。
int fallCounter = 0;
boolean leftHeld, rightHeld, downHeld, upHeld;
int leftCounter = 0, rightCounter = 0;
int horizontalDelay = 6;
int score = 0;
int piecesLocked = 0;
Piece currentPiece;
ArrayList<Character> nextQueue = new ArrayList<Character>();
Piece heldPiece;
boolean canHold = true;
int previewCount = 5;
boolean gameOver = false;  // 游戏结束后设为真，以停止状态更新。

void setup() {
  size(500, 700);
  // 根据棋盘高度和行数计算单格尺寸。
  cellSize = boardHeight/rows;
  // 创建棋盘。
  board = new Board(cols,rows,cellSize);
  fillNextQueue();
  currentPiece = takeNextPiece();

}

void draw() {
  background(0);
  drawGame();
  if (!gameOver) {
        handleInput();
        handleFalling();
    }
    drawUI();

}
void drawGame() {
  board.drawBoard();
  currentPiece.drawPiece();
}
void handleFalling(){
  currentPiece.updateGrowth();
  fallCounter++;
  if(fallCounter>=framesPerFall){
    fallCounter=0;
    if(!currentPiece.moveDown()){
      lockAndSpawn();
    }
  }
}
char getRandomTetromino(){
  char[] types = {'I','O','T','S','Z','J','L'};
  return types[(int)(Math.random()*7)];
}

void fillNextQueue() {
  while (nextQueue.size() < previewCount) {
    nextQueue.add(getRandomTetromino());
  }
}

Piece takeNextPiece() {
  fillNextQueue();
  char nextType = nextQueue.remove(0);
  fillNextQueue();
  return new Piece(board, nextType);
}

void holdCurrentPiece() {
  if (gameOver || !canHold) return;

  Piece outgoingPiece = currentPiece.copyForHold();
  Piece incomingPiece;
  ArrayList<Character> queueBeforeHold = null;

  if (heldPiece == null) {
    queueBeforeHold = new ArrayList<Character>(nextQueue);
    incomingPiece = takeNextPiece();
  } else {
    incomingPiece = heldPiece.copyForHold();
    incomingPiece.resetForSpawn();
  }

  if (!board.isValidPosition(incomingPiece, incomingPiece.x, incomingPiece.y)) {
    if (queueBeforeHold != null) nextQueue = queueBeforeHold;
    return;
  }

  heldPiece = outgoingPiece;
  currentPiece = incomingPiece;
  canHold = false;
  fallCounter = 0;
}

void handleInput(){
  if(leftHeld){
    if(leftCounter<=0){
      currentPiece.moveLeft();
      leftCounter=horizontalDelay;
    }else leftCounter--;
  }else leftCounter=0;
  
  if(rightHeld){
    if(rightCounter<=0){
      currentPiece.moveRight();
      rightCounter=horizontalDelay;
    }else rightCounter--;
  }else rightCounter=0;
  if(upHeld){
    currentPiece.turn();
    upHeld=false;
  }
  if(downHeld){
    currentPiece.moveDown();
  }
    
}
void lockAndSpawn(){
  board.lockPiece(currentPiece);
  score+=board.clearLines()*100;
  piecesLocked++;
  currentPiece = takeNextPiece();
  canHold = true;
  fallCounter=0;
  if (!board.isValidPosition(currentPiece, currentPiece.x, currentPiece.y)) {
    gameOver=true;
  }
}

void drawUI() {
  fill(255);
  textSize(20);
  text("Score: " + score, 30,30); // 在画布左上角显示当前分数。
  text("Hold:", 20, 55);
  if (heldPiece != null) heldPiece.drawPreview(20, 75);

  text("Next:", 405, 55);
  for (int i = 0; i < nextQueue.size(); i++) {
    Piece previewPiece = new Piece(board, nextQueue.get(i));
    previewPiece.drawPreview(405, 78 + i * 82);
  }
  textSize(14);
  text("Growth speed: " + (piecesLocked / 5 + 1), 365, 30);
  if (gameOver) {
    fill(0, 190);
    rect(board.xOffset, board.yOffset + 235, boardWidth, 100);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(28);
    text("GAME OVER", width/2, board.yOffset + 275);
    textSize(14);
    text("Press R to restart", width/2, board.yOffset + 310);
    textAlign(LEFT, BASELINE);
  }
}

void restartGame() {
  board = new Board(cols, rows, cellSize);
  nextQueue.clear();
  heldPiece = null;
  canHold = true;
  fillNextQueue();
  currentPiece = takeNextPiece();
  score = 0;
  piecesLocked = 0;
  fallCounter = 0;
  gameOver = false;
}
