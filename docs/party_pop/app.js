/* =========================================
   Bubble Pop Party - Game Logic
   Readable, split from HTML/CSS
   No line >100 chars.
   ========================================= */

const CONFIG = {
  bubbleSize: 68,
  gameDuration: 20, // seconds
  riseDuration: 5, // seconds slow
  blueInterval: 160, // ms - flood
  redInterval: 2000, // ms - 2 reds every 2s
  goldInterval: 5000, // ms
  redsPerSpawn: 2,
};

const POINTS = {
  blue: 50,
  gold: 200,
  red: -100,
};

// DOM refs
const scoreEl = document.getElementById('scoreDisplay');
const timerEl = document.getElementById('timerDisplay');
const bubbleArea = document.getElementById('bubbleArea');
const floatLayer = document.getElementById('floatLayer');
const startOverlay = document.getElementById('startOverlay');
const endOverlay = document.getElementById('endOverlay');
const finalScoreEl = document.getElementById('finalScore');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

// State - use refs to avoid stale closures
let score = 0;
let timeLeft = CONFIG.gameDuration;
let gameActive = false;
let timers = [];
let bubbleIdCounter = 0;

function setScore(newVal) {
  score = newVal;
  scoreEl.textContent = String(score);
}

function addScore(delta) {
  setScore(score + delta);
}

function setTime(val) {
  timeLeft = val;
  timerEl.textContent = String(val);
}

/* -- Bubble creation -- */
function randomX() {
  const areaW = bubbleArea.clientWidth;
  // keep inside, accounting for bubble size
  const margin = CONFIG.bubbleSize;
  return Math.floor(
    Math.random() * (areaW - margin * 2)
  ) + margin;
}

function createBubble(type = 'blue') {
  const id = ++bubbleIdCounter;
  const el = document.createElement('div');
  el.className = `bubble ${type}`;
  el.dataset.id = String(id);
  el.dataset.type = type;

  const x = randomX();
  const startY = bubbleArea.clientHeight + 20;

  el.style.left = `${x - CONFIG.bubbleSize / 2}px`;
  el.style.top = `${startY}px`;
  el.style.animation = `rise ${CONFIG.riseDuration}s linear forwards`;

  // Remove after rise
  const removeTimer = setTimeout(() => {
    if (el.parentNode) el.remove();
  }, CONFIG.riseDuration * 1000 + 100);

  // Unified pop handler - supports multi-touch
  function handlePop(clientX, clientY) {
    if (!gameActive) return;
    if (el.dataset.popped === '1') return;
    el.dataset.popped = '1';

    const pts = POINTS[type] || 0;
    addScore(pts);

    // Floating +score at pop position
    showFloatText(clientX, clientY, pts, type);

    // Pop animation
    el.style.transform = 'scale(1.3)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 120);
    clearTimeout(removeTimer);
  }

  // Use pointerdown for instant response
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Convert to client coords
    const cx = e.clientX;
    const cy = e.clientY;
    handlePop(cx, cy);
  });

  // Fallback for touch
  el.addEventListener('touchstart', (e) => {
    if (e.touches[0]) {
      const t = e.touches[0];
      handlePop(t.clientX, t.clientY);
    }
  }, { passive: false });

  el.addEventListener('mousedown', (e) => {
    handlePop(e.clientX, e.clientY);
  });

  bubbleArea.appendChild(el);
}

/* -- Floating score text at tap location -- */
function showFloatText(clientX, clientY, points, type) {
  const rect = bubbleArea.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const div = document.createElement('div');
  div.className = `float-text ${type}`;
  div.style.left = `${x}px`;
  div.style.top = `${y}px`;
  div.textContent = points > 0 ? `+${points}` : `${points}`;

  floatLayer.appendChild(div);
  setTimeout(() => div.remove(), 900);
}

/* -- Spawners -- */
function startSpawners() {
  // Blue flood
  const blueTimer = setInterval(() => {
    if (!gameActive) return;
    createBubble('blue');
  }, CONFIG.blueInterval);
  timers.push(blueTimer);

  // Red - 2 every 2s
  const redTimer = setInterval(() => {
    if (!gameActive) return;
    for (let i = 0; i < CONFIG.redsPerSpawn; i++) {
      // slight delay between the 2 reds
      setTimeout(() => createBubble('red'), i * 120);
    }
  }, CONFIG.redInterval);
  timers.push(redTimer);

  // Gold every 5s
  const goldTimer = setInterval(() => {
    if (!gameActive) return;
    createBubble('gold');
  }, CONFIG.goldInterval);
  timers.push(goldTimer);

  // Immediate burst at start
  for (let i = 0; i < 4; i++) {
    setTimeout(() => createBubble('blue'), i * 80);
  }
}

function clearSpawners() {
  timers.forEach((t) => clearInterval(t));
  timers = [];
}

/* -- Game loop -- */
function startGame() {
  score = 0;
  setScore(0);
  setTime(CONFIG.gameDuration);
  gameActive = true;

  startOverlay.classList.add('hidden');
  endOverlay.classList.add('hidden');
  bubbleArea.innerHTML = '';
  floatLayer.innerHTML = '';

  startSpawners();

  const tick = setInterval(() => {
    if (!gameActive) {
      clearInterval(tick);
      return;
    }
    setTime(timeLeft - 1);
    if (timeLeft <= 0) {
      endGame();
      clearInterval(tick);
    }
  }, 1000);
  timers.push(tick);
}

function endGame() {
  gameActive = false;
  clearSpawners();
  finalScoreEl.textContent = String(score);
  endOverlay.classList.remove('hidden');
}

/* -- Events -- */
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// Prevent scroll / zoom gestures
document.addEventListener('touchmove', (e) => {
  if (gameActive) e.preventDefault();
}, { passive: false });

document.addEventListener('gesturestart', (e) => {
  e.preventDefault();
});
