//Temporary method for this lab only

void keyPressed() {
  if (key == ' ') {
    if (!gameOver) {
      while (currentPiece.moveDown()) { }
      lockAndSpawn();
    }
  }
  if (key == 'r' || key == 'R') {
    restartGame();
  }
  if (key == 'c' || key == 'C') {
    holdCurrentPiece();
  }
  if(keyCode==LEFT){
    leftHeld=true;
  }
  if(keyCode==RIGHT){
    rightHeld=true;
  }
  if(keyCode==DOWN){
    downHeld=true;
  }
  if(keyCode==UP){
    upHeld=true;
  }
}
void keyReleased() {
  if(keyCode==LEFT){
    leftHeld=false;
  }
  if(keyCode==RIGHT){
    rightHeld=false;
  }
  if(keyCode==DOWN){
    downHeld=false;
  }
  if(keyCode==UP){
    upHeld=false;
  }
}
