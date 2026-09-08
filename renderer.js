// Small Canvas 2D drawing helpers used by sketch.js; no network dependencies.
const LEFT = 'left';
const RIGHT = 'right';
const CENTER = 'center';
const BASELINE = 'alphabetic';
const NORMAL = 'normal';
const BOLD = 'bold';
const width = 500;
const height = 700;
let drawingContext;
let canvasDensity = 1;
let fillEnabled = true;
let strokeEnabled = true;
let fontSize = 12;
let fontStyle = NORMAL;
let frameCount = 0;

function createGameCanvas() {
  canvasDensity = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = createCanvasLayer(width, height);
  drawingContext = canvas.getContext('2d');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Growing Tetris game board');
  document.querySelector('#game-canvas').append(canvas);
  textSize(fontSize);
  return canvas;
}

function createCanvasLayer(layerWidth, layerHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(layerWidth * canvasDensity);
  canvas.height = Math.round(layerHeight * canvasDensity);
  canvas.getContext('2d').setTransform(canvasDensity, 0, 0, canvasDensity, 0, 0);
  return canvas;
}

function drawLayer(layer, x, y, layerWidth, layerHeight) {
  drawingContext.drawImage(layer, x, y, layerWidth, layerHeight);
}

function random(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function canvasColor(values) {
  if (typeof values[0] === 'string') return values[0];
  const [r, g, b, a = 255] = values.length < 3
    ? [values[0], values[0], values[0], values[1] ?? 255]
    : values;
  return `rgba(${r},${g},${b},${a / 255})`;
}

function background(gray) {
  const previousFill = drawingContext.fillStyle;
  drawingContext.fillStyle = canvasColor([gray]);
  drawingContext.fillRect(0, 0, width, height);
  drawingContext.fillStyle = previousFill;
}

function fill(...values) {
  fillEnabled = true;
  drawingContext.fillStyle = canvasColor(values);
}

function stroke(...values) {
  strokeEnabled = true;
  drawingContext.strokeStyle = canvasColor(values);
}

function noFill() { fillEnabled = false; }
function noStroke() { strokeEnabled = false; }
function strokeWeight(value) { drawingContext.lineWidth = value; }

function rect(x, y, rectWidth, rectHeight) {
  if (fillEnabled) drawingContext.fillRect(x, y, rectWidth, rectHeight);
  if (strokeEnabled) drawingContext.strokeRect(x, y, rectWidth, rectHeight);
}

function textSize(value) {
  fontSize = value;
  drawingContext.font = `${fontStyle} ${fontSize}px monospace`;
}

function textStyle(value) {
  fontStyle = value;
  drawingContext.font = `${fontStyle} ${fontSize}px monospace`;
}

function textAlign(horizontal, vertical = BASELINE) {
  drawingContext.textAlign = horizontal;
  drawingContext.textBaseline = vertical === CENTER ? 'middle' : vertical;
}

function text(value, x, y) {
  const lines = String(value).split('\n');
  const leading = fontSize * 1.25;
  const top = drawingContext.textBaseline === 'middle' ? y - (lines.length - 1) * leading / 2 : y;
  for (let index = 0; index < lines.length; index += 1) {
    if (fillEnabled) drawingContext.fillText(lines[index], x, top + index * leading);
    if (strokeEnabled) drawingContext.strokeText(lines[index], x, top + index * leading);
  }
}
