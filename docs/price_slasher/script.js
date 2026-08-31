/* 
  ShopSmart Price Slasher - Clean Vanilla JS
  ===========================================
  No TSX, no bundler, readable line by line
*/

// --------------------
// CONFIG
// --------------------
const CONFIG = {
  orange: '#EE4D2D',
  totalTime: 30,

  // spawn intervals (ms) - already in ms
  normalInterval: 250,
  goldInterval: 2500,
  bombInterval: 2500,
  bombFirstAt: 1250,
  initialBurst: 5,

  // scoring
  scoreNormal: 100,
  scoreFast: 120,
  scoreGold: 500,
  scoreBomb: -250,
  fastWindowMs: 500,

  // physics - lowered gravity + higher launch for high arc
  gravity: 0.18,
  trailMax: 20,

  labels: ['-50%', '-70%', '-30%', '% OFF', 'SALE', '-25%', '-80%']
};

// --------------------
// STATE
// --------------------
let state = {
  game: 'start', // start | playing | over
  score: 0,
  best: Number(localStorage.getItem('ps-best') || 0),
  timeLeft: CONFIG.totalTime,
  items: [],
  popups: [],
  trail: [],
  lastId: 0
};

let timers = {
  gameLoop: null,
  countdown: null,
  normalSpawn: null,
  goldSpawn: null,
  bombSpawn: null
};

let audioCtx = null;

// --------------------
// DOM REFS
// --------------------
const els = {};

function cacheEls() {
  els.gameArea = document.getElementById('gameArea');
  els.time = document.getElementById('timeEl');
  els.score = document.getElementById('scoreEl');
  els.best = document.getElementById('bestEl');
  els.popupRoot = document.getElementById('popupRoot');
  els.startScreen = document.getElementById('startScreen');
  els.endScreen = document.getElementById('endScreen');
  els.playBtn = document.getElementById('playBtn');
  els.againBtn = document.getElementById('againBtn');
  els.finalScore = document.getElementById('finalScore');
  els.rankText = document.getElementById('rankText');
  els.trailGlow = document.getElementById('trailGlow');
  els.trailCore = document.getElementById('trailCore');
  els.trailSvg = document.getElementById('trailSvg');
}

// --------------------
// AUDIO - victory sound
// --------------------
function getAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(freq, dur, type = 'sine', vol = 0.2) {
  try {
    const ctx = getAudio();
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + dur
    );

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch (e) {}
}

function playVictory() {
  try {
    const ctx = getAudio();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    const melody = [523.25, 659.25, 783.99, 1046.5];

    melody.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = i === 3 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(
        freq,
        now + i * 0.12
      );

      gain.gain.setValueAtTime(
        0.0001,
        now + i * 0.12
      );
      gain.gain.linearRampToValueAtTime(
        0.34,
        now + i * 0.12 + 0.02
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + i * 0.12 + 0.38
      );

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.42);
    });
  } catch (e) {}
}

function playSlash(isGold) {
  playTone(isGold ? 880 : 440, 0.12, 'square', 0.12);
}

// --------------------
// HELPERS
// --------------------
function uid() {
  return 'id_' + (state.lastId++);
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function pickLabel() {
  const arr = CONFIG.labels;
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRank(score) {
  if (score >= 5000) return 'Legendary Slasher!';
  if (score >= 3000) return 'Master Slasher';
  if (score >= 1500) return 'Pro Slasher';
  if (score >= 800) return 'Smart Shopper';
  return 'Keep Slashing!';
}

// --------------------
// SPAWNING
// --------------------
function spawnItem(type) {
  const rect = els.gameArea.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  const isGold = type === 'gold';
  const isBomb = type === 'bomb';

  const size = isBomb ? 56 : isGold ? 76 : 72;

  const item = {
    id: uid(),
    type: type,
    x: rand(size, w - size),
    y: h + size + 10,
    vx: rand(-3.2, 3.2),
    vy: rand(-19, -14),
    rot: rand(-20, 20),
    rotSpeed: rand(-4, 4),
    size: size,
    hit: false,
    label: isBomb ? 'BOMB' : isGold ? '500' : pickLabel(),
    spawnTime: Date.now(),
    el: null
  };

  const el = document.createElement('div');
  el.className = 'game-item';
  el.dataset.id = item.id;

  if (isBomb) {
    el.innerHTML = `<div class="bomb">💣</div>`;
  } else {
    const cls = isGold ? 'gold' : 'red';
    el.innerHTML = `<div class="tag ${cls}">${item.label}</div>`;
  }

  // FIX: set initial position immediately to avoid 0,0 flash
  el.style.left = item.x + 'px';
  el.style.top = item.y + 'px';
  el.style.transform = `translate(-50%, -50%) rotate(${item.rot}deg)`;

  els.gameArea.appendChild(el);
  item.el = el;

  state.items.push(item);
}

function spawnNormal() {
  spawnItem('discount');
}

function spawnGold() {
  spawnItem('gold');
}

function spawnBomb() {
  spawnItem('bomb');
}

// --------------------
// SCORING + POPUPS
// --------------------
function addScore(amount, kind) {
  state.score += amount;
  if (state.score < 0) state.score = 0;

  els.score.textContent = state.score;

  // scale animation
  els.score.parentElement.style.transform = 'scale(1.12)';
  setTimeout(() => {
    els.score.parentElement.style.transform = 'scale(1)';
  }, 120);

  // popup
  const text = amount > 0 ? `+${amount}` : `${amount}`;
  showPopup(text, kind);
}

function showPopup(text, kind) {
  const div = document.createElement('div');
  div.className = `popup ${kind}`;
  div.textContent = text;

  els.popupRoot.appendChild(div);

  setTimeout(() => {
    div.classList.add('out');
    setTimeout(() => div.remove(), 250);
  }, 800);
}

function handleHit(item) {
  if (item.hit) return;
  item.hit = true;

  const now = Date.now();
  const isFast = (now - item.spawnTime) < CONFIG.fastWindowMs;
  const isGold = item.type === 'gold';
  const isBomb = item.type === 'bomb';

  if (isBomb) {
    addScore(CONFIG.scoreBomb, 'bomb');
    playTone(120, 0.4, 'sawtooth', 0.3);
  } else if (isGold) {
    addScore(CONFIG.scoreGold, 'gold');
    playSlash(true);
  } else {
    const pts = isFast ? CONFIG.scoreFast : CONFIG.scoreNormal;
    const kind = isFast ? 'fast' : 'normal';
    addScore(pts, kind);
    playSlash(false);
  }

  // remove visually with scale
  if (item.el) {
    item.el.style.transform += ' scale(0.1)';
    item.el.style.opacity = '0';
    item.el.style.transition = 'all 0.18s ease-out';
    setTimeout(() => {
      if (item.el) item.el.remove();
    }, 180);
  }

  state.items = state.items.filter(i => i.id !== item.id);
}

// --------------------
// GAME LOOP - physics
// --------------------
function gameLoop() {
  const rect = els.gameArea.getBoundingClientRect();

  for (let i = state.items.length - 1; i >= 0; i--) {
    const it = state.items[i];

    it.vy += CONFIG.gravity;
    it.x += it.vx;
    it.y += it.vy;
    it.rot += it.rotSpeed;

    if (it.el) {
      it.el.style.left = it.x + 'px';
      it.el.style.top = it.y + 'px';
      it.el.style.transform = 
        `translate(-50%, -50%) rotate(${it.rot}deg)`;
    }

    // offscreen cleanup
    if (it.y > rect.height + 120) {
      if (it.el) it.el.remove();
      state.items.splice(i, 1);
    }
  }

  // trail update
  updateTrail();
}

function updateTrail() {
  if (state.trail.length < 2) {
    els.trailGlow.setAttribute('points', '');
    els.trailCore.setAttribute('points', '');
    return;
  }

  const pts = state.trail
    .map(p => `${p.x},${p.y}`)
    .join(' ');

  els.trailGlow.setAttribute('points', pts);
  els.trailCore.setAttribute('points', pts);

  // fade trail
  state.trail = state.trail.filter(p => {
    p.life -= 0.06;
    return p.life > 0;
  });
}

// --------------------
// INPUT - slash detection
// --------------------
let isPointerDown = false;

function getPos(e) {
  const rect = els.gameArea.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return {
    x: t.clientX - rect.left,
    y: t.clientY - rect.top
  };
}

function onPointerMove(e) {
  if (!isPointerDown) return;
  if (state.game !== 'playing') return;

  const pos = getPos(e);

  state.trail.push({
    x: pos.x,
    y: pos.y,
    life: 1
  });

  if (state.trail.length > CONFIG.trailMax) {
    state.trail.shift();
  }

  // hit test - simple distance
  for (const item of [...state.items]) {
    const dx = item.x - pos.x;
    const dy = item.y - pos.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < item.size * 0.6) {
      handleHit(item);
    }
  }
}

function onPointerDown(e) {
  isPointerDown = true;
  state.trail = [];
  onPointerMove(e);
}

function onPointerUp() {
  isPointerDown = false;
  // fade trail quickly
  setTimeout(() => { state.trail = []; }, 120);
}

// --------------------
// GAME FLOW
// --------------------
function clearAllTimers() {
  Object.values(timers).forEach(t => {
    if (t) {
      clearInterval(t);
      clearTimeout(t);
    }
  });
  timers = {
    gameLoop: null,
    countdown: null,
    normalSpawn: null,
    goldSpawn: null,
    bombSpawn: null
  };
}

function startGame() {
  // FIX: clear any previous timers first
  clearAllTimers();

  state.game = 'playing';
  state.score = 0;
  state.timeLeft = CONFIG.totalTime;
  state.items = [];
  state.trail = [];

  // clear old dom items
  document
    .querySelectorAll('.game-item')
    .forEach(el => el.remove());

  els.score.textContent = '0';
  els.time.textContent = CONFIG.totalTime + 's';
  els.time.style.color = '';

  els.startScreen.classList.add('hidden');
  els.endScreen.classList.add('hidden');

  // initial burst - 5 tickets
  for (let i = 0; i < CONFIG.initialBurst; i++) {
    setTimeout(() => {
      if (state.game === 'playing') spawnNormal();
    }, i * 120);
  }

  // physics loop 60fps
  timers.gameLoop = setInterval(gameLoop, 1000 / 60);

  // countdown - pure countdown, no extra reductions
  timers.countdown = setInterval(() => {
    state.timeLeft--;
    els.time.textContent = state.timeLeft + 's';

    if (state.timeLeft <= 5) {
      els.time.style.color = '#FF3B30';
    } else {
      els.time.style.color = '';
    }

    if (state.timeLeft <= 0) {
      endGame();
    }
  }, 1000);

  // FIX: spawns now correctly keep spawning
  timers.normalSpawn = setInterval(() => {
    if (state.game === 'playing') spawnNormal();
  }, CONFIG.normalInterval);

  timers.goldSpawn = setInterval(() => {
    if (state.game === 'playing') spawnGold();
  }, CONFIG.goldInterval);

  timers.bombSpawn = setTimeout(() => {
    // first bomb after offset, then interval
    if (state.game === 'playing') spawnBomb();
    timers.bombSpawn = setInterval(() => {
      if (state.game === 'playing') spawnBomb();
    }, CONFIG.bombInterval);
  }, CONFIG.bombFirstAt);
}

function endGame() {
  state.game = 'over';

  // stop timers
  clearAllTimers();

  // best
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('ps-best', state.best);
  }

  if (state.best > 0) {
    els.best.textContent = 'BEST ' + state.best;
    els.best.classList.remove('hidden');
  }

  els.finalScore.textContent = state.score;
  els.rankText.textContent = getRank(state.score);
  els.endScreen.classList.remove('hidden');

  playVictory();
}

function bind() {
  els.playBtn.addEventListener('click', startGame);
  els.againBtn.addEventListener('click', startGame);

  const area = els.gameArea;
  area.addEventListener('mousedown', onPointerDown);
  area.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  area.addEventListener('touchstart', onPointerDown, { passive: false });
  area.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);
}

// --------------------
// INIT
// --------------------
document.addEventListener('DOMContentLoaded', () => {
  cacheEls();
  bind();

  if (state.best > 0) {
    els.best.textContent = 'BEST ' + state.best;
    els.best.classList.remove('hidden');
  }
});
