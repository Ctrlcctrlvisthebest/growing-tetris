class Board {
  int cols, rows, cellSize;
  int xOffset, yOffset;
  color[][] grid;
//  Piece p;

  // TODO: Complete the constructor
  Board(int cols, int rows, int cellSize) {
    this.cols=cols;
    this.rows=rows;
    this.cellSize=cellSize;
    // Center the board horizontally and leave margin at top
    // Note that width and height are global variables
    xOffset = (500-cols*cellSize)/2;
    yOffset = 50;

    // Initialize grid. (values are automatically set to 0)
    grid = new color[rows][cols];
  }

  // TODO: complete this method
  void drawBoard() {
    fill(40);
    stroke(200) ;// experiment with values
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
      if(r>=0&&grid[r][c]!=0){
        return false;
      }
    }
      return true;
  }
   void lockPiece(Piece piece){
     for(int i=0;i<piece.shape.length;i++){
      int c=piece.shape[i][0]+piece.x;//
      int r=piece.shape[i][1]+piece.y;
      if(r>=0&&r<rows&&c>=0&&c<cols){
       grid[r][c]=piece.pieceColor;
      }
     }
   }
   int clearLines() {
      int linesCleared = 0;
     for (int i=rows-1;i>=0;i--) { //go from bottom row to top row
        boolean full = true; //assume a row is a full
          for (int j=0;j<cols;j++) { // go through all columns left to right
            if (grid[i][j]==0) { // if the color at a cell is 0, we break out of the loop
              full = false;
              break;
            }
          }
        if (full) {
        // shift all rows above down
        linesCleared++;
          for (int rr = i; rr>0; rr--) { // again go backwards through rows
            for (int c=0;c<cols;c++) { //scroll through all cols
                grid[rr][c] = grid[rr-1][c]; //set the current cell the the cell one row up 
            }
          }
        // clear the top row – we need to do this since everything in row 0 was copied to row 1, but never cleared!
          for (int c = 0; c < cols; c++) {
           grid[0][c]=0;
          }
          i++; // increase r by 1 to recheck this row after shifting
        }
  }
  return linesCleared;
}
}
