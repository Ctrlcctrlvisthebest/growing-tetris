class Board {
  int cols, rows, cellSize;
  int xOffset, yOffset;
  color[][] grid;

  // 初始化棋盘尺寸、绘制偏移和网格。
  Board(int cols, int rows, int cellSize) {
    this.cols=cols;
    this.rows=rows;
    this.cellSize=cellSize;
    // 将棋盘水平居中，并在顶部保留边距。
    // 此处使用绘图环境提供的全局画布宽度和高度。
    xOffset = (500-cols*cellSize)/2;
    yOffset = 50;

    // 初始化网格；其中的值会自动设为 0。
    grid = new color[rows][cols];
  }

  // 绘制棋盘中的每一个格子。
  void drawBoard() {
    stroke(200); // 设置空格的网格线颜色。
     for(int r=0;r<rows;r++){
      for(int c=0;c<cols;c++){
        if(grid[r][c]==0){
          fill(color(20));
        }
         else{
           fill(grid[r][c]);
        }
        rect(c*cellSize+xOffset,r*cellSize+yOffset,cellSize,cellSize);
      }
    }
  }
  boolean isValidPosition(Piece piece, int newX, int newY){
    for(int i=0;i<piece.shape.length;i++){
      int c=piece.shape[i][0]+newX;
      int r=piece.shape[i][1]+newY;
      if(c<0||c>=cols||r<0||r>=rows){
        return false;
      }
      if(grid[r][c]!=0){
        return false;
      }
    }
      return true;
  }
   void lockPiece(Piece piece){
     for(int i=0;i<piece.shape.length;i++){
      int c=piece.shape[i][0]+piece.x;
      int r=piece.shape[i][1]+piece.y;
      if(r>=0&&r<rows&&c>=0&&c<cols){
       grid[r][c]=piece.pieceColor;
      }
     }
   }
   int clearLines() {
      int linesCleared = 0;
     for (int i=rows-1;i>=0;i--) { // 从最底行向上检查。
        boolean full = true; // 先假设当前行已填满。
          for (int j=0;j<cols;j++) { // 从左到右检查所有列。
            if (grid[i][j]==0) { // 发现空格后即可确认该行未填满。
              full = false;
              break;
            }
          }
        if (full) {
        // 将上方所有行向下移动一行。
        linesCleared++;
          for (int rr = i; rr>0; rr--) { // 继续从下向上复制，避免覆盖源数据。
            for (int c=0;c<cols;c++) { // 遍历当前行的所有列。
                grid[rr][c] = grid[rr-1][c]; // 用上一行对应格覆盖当前格。
            }
          }
        // 清空顶行，因为第 0 行已复制到第 1 行，但自身不会被其他行覆盖。
          for (int c = 0; c < cols; c++) {
           grid[0][c]=0;
          }
          i++; // 移动完成后再次检查当前位置，以支持连续消行。
        }
  }
  return linesCleared;
}
}
