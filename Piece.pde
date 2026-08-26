class Piece {
  int x, y;          // grid coordinates
  int[][] shape;     // offsets for blocks
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
    // Coordinates for the top-center for where pieces will enter the board
    x = board.cols/2-1;
    y =0;


    // Call the setShapeAndColor method
  setShapeAndColor(type);
  }
 
   // The first shape has been completed for you
  void setShapeAndColor(char t) {
    if (t == 'I') {
     shape = new int[][]{{0,0}, {1,0}, {2,0}, {3,0}}; // think of this as an array of coordinates
     pieceColor = color(0, 255, 255);
    } else if (t == 'O') {
      shape = new int[][]{{0,0}, {1,0}, {1,1}, {0,1}};
      pieceColor = color(255, 186, 38);
     // complete this method
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
    stroke(50); // Set the outline color for each block of the piece
    // Loop through each block in the shape array
      for (int i = 0; i < shape.length; i++) {
        // Calculate the column and row on the grid for this block
        int c =shape[i][0]; // x position in grid + block offset in shape
        int r =shape[i][1] ; // y position in grid + block offset in shape
        
        // Convert grid coordinates to actual pixel positions on the canvas
             //  Hint: think about the offsets and cellSize

        int px = board.xOffset+(x+c)*cellSize;// 
        int py =board.yOffset+(y+r)*cellSize; // 
        fill(pieceColor); // Set the fill color for this block
        rect(px,py,cellSize,cellSize); // Draw the rectangle for the block
      }
      drawGrowthWarning();
  }

  // A piece grows in two stages: show a warning, then add that cell.
  // The interval becomes shorter as more pieces are locked.
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
      newShape[i][0] =-shape[i][1];// Remember (x, y) → (-y, x)
      newShape[i][1] =shape[i][0];       // Remember (x, y) → (-y, x)
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
    int previewSize = (int)(cellSize/2);  // shrink cellSize by 2
    for (int i = 0; i < shape.length; i++) {
      int bx =px+(shape[i][0]*previewSize);
      int by =py+shape[i][1]*previewSize; //complete these lines
      fill(pieceColor);
      stroke(50);
      rect(bx, by, previewSize, previewSize); // complete this
    }
  }
}
