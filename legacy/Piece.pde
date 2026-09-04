class Piece {
  int x, y;          // 棋盘坐标
  int[][] shape;     // 各组成格相对方块原点的偏移
  color pieceColor;
  char type;
  Board board;
  int growthCounter = 0;
  int warningX, warningY;
  boolean hasGrowthWarning = false;
  final int warningFrames = 45;
  Piece(Board board, char type) {
    this.board = board;
    this.type = type;
    // 将方块放在棋盘顶部中央的出生位置。
    x = board.cols/2-1;
    y =0;


    // 根据类型设置形状和颜色。
  setShapeAndColor(type);
  }
 
   // 根据方块类型建立局部坐标数组和显示颜色。
  void setShapeAndColor(char t) {
    if (t == 'I') {
     shape = new int[][]{{0,0}, {1,0}, {2,0}, {3,0}}; // 每个二元数组表示一个组成格的局部坐标。
     pieceColor = color(0, 255, 255);
    } else if (t == 'O') {
      shape = new int[][]{{0,0}, {1,0}, {1,1}, {0,1}};
      pieceColor = color(255, 186, 38);
   } else if (t == 'S') {
      shape = new int[][]{{0,1}, {1,0}, {1,1}, {0,2}};
      pieceColor = color(255, 0, 0);
      } else if (t == 'Z') {
      shape = new int[][]{{0,0}, {1,1}, {1,2}, {0,1}};
      pieceColor = color(0, 255, 0);
      } else if (t == 'L') {
      shape = new int[][]{{0,0}, {1,0}, {2,0}, {2,1}};
      pieceColor = color(255, 160, 51);
      } else if (t == 'J') {
      shape = new int[][]{{0,1}, {1,1}, {2,1}, {2,0}};
      pieceColor = color(255, 86, 155);
      } else if (t == 'T') {
      shape = new int[][]{{0,0}, {0,1}, {0,2}, {1,1}};
      pieceColor = color(185, 33, 255);
      }
  }
  void drawPiece() {
    stroke(50); // 设置每个组成格的描边颜色。
    // 遍历形状数组中的所有组成格。
      for (int i = 0; i < shape.length; i++) {
        // 读取当前组成格在形状内部的列、行偏移。
        int c =shape[i][0]; // 形状内部的横向偏移
        int r =shape[i][1] ; // 形状内部的纵向偏移
        
        // 将棋盘坐标转换为画布上的像素坐标。

        int px = board.xOffset+(x+c)*cellSize;
        int py =board.yOffset+(y+r)*cellSize;
        fill(pieceColor); // 设置当前组成格的填充颜色。
        rect(px,py,cellSize,cellSize); // 绘制当前组成格。
      }
      drawGrowthWarning();
  }

  // 方块分两个阶段生长：先显示警告，再加入目标格。
  // 已锁定方块越多，生长间隔越短。
  void updateGrowth() {
    int growthInterval = max(70, 210 - piecesLocked * 7);
    growthCounter++;

    if (!hasGrowthWarning && growthCounter >= growthInterval - warningFrames) {
      chooseGrowthWarning();
    }

    if (growthCounter >= growthInterval) {
      if (hasGrowthWarning && isGrowthCellValid(warningX, warningY)) {
        addBlock(warningX, warningY);
      }
      growthCounter = 0;
      hasGrowthWarning = false;
    }
  }

  void chooseGrowthWarning() {
    ArrayList<int[]> candidates = new ArrayList<int[]>();
    int[][] directions = {{1,0}, {-1,0}, {0,1}, {0,-1}};

    for (int i = 0; i < shape.length; i++) {
      for (int d = 0; d < directions.length; d++) {
        int cx = shape[i][0] + directions[d][0];
        int cy = shape[i][1] + directions[d][1];
        if (isGrowthCellValid(cx, cy) && !candidateExists(candidates, cx, cy)) {
          candidates.add(new int[]{cx, cy});
        }
      }
    }

    if (candidates.size() > 0) {
      int[] chosen = candidates.get((int)random(candidates.size()));
      warningX = chosen[0];
      warningY = chosen[1];
      hasGrowthWarning = true;
    }
  }

  boolean candidateExists(ArrayList<int[]> candidates, int cx, int cy) {
    for (int[] p : candidates) {
      if (p[0] == cx && p[1] == cy) return true;
    }
    return false;
  }

  boolean containsBlock(int cx, int cy) {
    for (int i = 0; i < shape.length; i++) {
      if (shape[i][0] == cx && shape[i][1] == cy) return true;
    }
    return false;
  }

  boolean isGrowthCellValid(int cx, int cy) {
    if (containsBlock(cx, cy)) return false;
    int boardX = x + cx;
    int boardY = y + cy;
    return boardX >= 0 && boardX < board.cols && boardY >= 0 &&
           boardY < board.rows && board.grid[boardY][boardX] == 0;
  }

  void addBlock(int cx, int cy) {
    int[][] grownShape = new int[shape.length + 1][2];
    for (int i = 0; i < shape.length; i++) {
      grownShape[i][0] = shape[i][0];
      grownShape[i][1] = shape[i][1];
    }
    grownShape[shape.length][0] = cx;
    grownShape[shape.length][1] = cy;
    shape = grownShape;
  }

  Piece copyForHold() {
    Piece savedPiece = new Piece(board, type);
    savedPiece.shape = copyShape(shape);
    savedPiece.pieceColor = pieceColor;
    return savedPiece;
  }

  int[][] copyShape(int[][] sourceShape) {
    int[][] copiedShape = new int[sourceShape.length][2];
    for (int i = 0; i < sourceShape.length; i++) {
      copiedShape[i][0] = sourceShape[i][0];
      copiedShape[i][1] = sourceShape[i][1];
    }
    return copiedShape;
  }

  void resetForSpawn() {
    int minX = shape[0][0];
    int maxX = shape[0][0];
    int minY = shape[0][1];
    for (int i = 1; i < shape.length; i++) {
      minX = min(minX, shape[i][0]);
      maxX = max(maxX, shape[i][0]);
      minY = min(minY, shape[i][1]);
    }
    int pieceWidth = maxX - minX + 1;
    x = (board.cols - pieceWidth)/2 - minX;
    y = -minY;
    growthCounter = 0;
    hasGrowthWarning = false;
  }

  void drawGrowthWarning() {
    if (!hasGrowthWarning) return;
    if (!isGrowthCellValid(warningX, warningY)) {
      hasGrowthWarning = false;
      chooseGrowthWarning();
      if (!hasGrowthWarning) return;
    }
    float pulse = 90 + 90 * abs(sin(frameCount * 0.16));
    fill(red(pieceColor), green(pieceColor), blue(pieceColor), pulse);
    stroke(255, 220);
    strokeWeight(2);
    rect(board.xOffset + (x + warningX) * cellSize,
         board.yOffset + (y + warningY) * cellSize,
         cellSize, cellSize);
    strokeWeight(1);
  }
  boolean moveDown(){
    boolean a= board.isValidPosition(this,x,y+1);
    if(a){
      y++;
    }
    return a;
  }
  boolean moveLeft(){
    boolean a= board.isValidPosition(this,x-1,y);
    if(a){
      x--;
    }
    return a;
  }
  boolean moveRight(){
    boolean a= board.isValidPosition(this,x+1,y);
    if(a){
      x++;
    }
    return a;
  }
  void turn(){
    int[][] newShape = new int[shape.length][2];
    for (int i = 0; i < shape.length; i++) {
      newShape[i][0] =-shape[i][1];// 顺时针旋转时，新横坐标取原纵坐标的相反数。
      newShape[i][1] =shape[i][0]; // 顺时针旋转时，新纵坐标取原横坐标。
    }
    int[][] oldShape = shape;
    shape = newShape;
    if (!board.isValidPosition(this, x, y)){ 
      shape = oldShape;
    } else if (hasGrowthWarning) {
      int oldWarningX = warningX;
      warningX = -warningY;
      warningY = oldWarningX;
      if (!isGrowthCellValid(warningX, warningY)) {
        hasGrowthWarning = false;
        chooseGrowthWarning();
      }
    }
  }
  void drawPreview(int px, int py) {
    int previewSize = (int)(cellSize/2);  // 预览格尺寸为正式格的一半。
    for (int i = 0; i < shape.length; i++) {
      int bx =px+(shape[i][0]*previewSize);
      int by =py+shape[i][1]*previewSize; // 计算预览格的纵向位置。
      fill(pieceColor);
      stroke(50);
      rect(bx, by, previewSize, previewSize); // 绘制预览格。
    }
  }
}
