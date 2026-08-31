
// NEURO VOLT - MEMORY MATCH - Readable Vanilla Version
// No bundler, no 10k-char lines. Each function does one thing.

const EMOJIS = ['🚀','🌙','🍕','🎧','🌵','⚡️','🎨','🎮'];
const GAME_TIME = 30.0;

// State - simple, not hidden in refs
let state = {
  cards: [],
  flipped: [], // ids
  matched: [], // ids
  score: 0,
  timeLeft: GAME_TIME,
  gameState: 'start', // start | playing | won | lost
  isChecking: false,
  highScores: loadScores(),
  lastAddedId: null,
  pendingScore: 0,
  pendingTime: 0,
};

// Audio - Web Audio API, tiny and readable
let audioCtx = null;
function getAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
    catch { return null; }
  }
  return audioCtx;
}
function play(type) {
  const ctx = getAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  
  const now = ctx.currentTime;
  if (type === 'flip') {
    osc.frequency.value = 800; gain.gain.setValueAtTime(0.2, now);
    osc.start(now); osc.stop(now+0.08);
  }
  if (type === 'match') {
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(900, now+0.15);
    gain.gain.setValueAtTime(0.25, now); gain.gain.linearRampToValueAtTime(0, now+0.2);
    osc.start(now); osc.stop(now+0.2);
  }
  if (type === 'mismatch') {
    osc.type = 'sawtooth'; osc.frequency.value = 180;
    gain.gain.setValueAtTime(0.15, now); gain.gain.linearRampToValueAtTime(0, now+0.25);
    osc.start(now); osc.stop(now+0.25);
  }
  if (type === 'win') {
    [523,659,784,1046].forEach((f,i)=>{
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f; g.gain.setValueAtTime(0.2, now+i*0.12);
      g.gain.linearRampToValueAtTime(0, now+i*0.12+0.2);
      o.start(now+i*0.12); o.stop(now+i*0.12+0.25);
    });
    return;
  }
  if (type === 'lose') {
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(120, now+0.6);
    gain.gain.setValueAtTime(0.25, now); gain.gain.linearRampToValueAtTime(0, now+0.6);
    osc.start(now); osc.stop(now+0.6);
  }
  if (type === 'click') {
    osc.frequency.value = 700; gain.gain.setValueAtTime(0.15, now);
    osc.start(now); osc.stop(now+0.05);
  }
}

// Persistence
function loadScores() {
  try { return JSON.parse(localStorage.getItem('memory-corporate-highscores')||'[]'); }
  catch { return []; }
}
function saveScores(scores) {
  localStorage.setItem('memory-corporate-highscores', JSON.stringify(scores));
}

// Card creation - Fisher-Yates, readable
function createCards() {
  let id = 0;
  const pairs = [];
  EMOJIS.forEach((emoji, pairId)=>{
    pairs.push({id: id++, emoji, pairId});
    pairs.push({id: id++, emoji, pairId});
  });
  // Shuffle
  for (let i = pairs.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs;
}

// High score check - SCORE ONLY, win/lose doesn't matter
function qualifiesAsHighScore(score) {
  if (score <= 0) return false;
  if (state.highScores.length < 5) return true;
  const min = Math.min(...state.highScores.map(s=>s.score));
  return score > min;
}

// Timer
let timerInterval = null;
function startTimer() {
  if (timerInterval) return;
  state.gameState = 'playing';
  timerInterval = setInterval(()=>{
    state.timeLeft = Math.max(0, +(state.timeLeft-0.1).toFixed(1));
    renderHeader();
    if (state.timeLeft <= 0) {
      clearInterval(timerInterval); timerInterval = null;
      // On timeout, check high score even if lost
      state.pendingScore = state.score;
      state.pendingTime = 0;
      if (qualifiesAsHighScore(state.pendingScore)) {
        showNameInput();
      } else {
        state.gameState = 'lost';
        render();
        play('lose');
      }
    }
  }, 100);
}
function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

// Game flow
function startGame() {
  play('click');
  getAudio(); // warm up audio context
  state.cards = createCards();
  state.flipped = [];
  state.matched = [];
  state.score = 0;
  state.timeLeft = GAME_TIME;
  state.gameState = 'playing';
  state.isChecking = false;
  startTimer();
  render();
}

function goToStart() {
  play('click');
  stopTimer();
  state.cards = createCards();
  state.flipped = [];
  state.matched = [];
  state.score = 0;
  state.timeLeft = GAME_TIME;
  state.gameState = 'start';
  state.isChecking = false;
  render();
}

function onCardClick(id) {
  if (state.isChecking) return;
  if (state.matched.includes(id)) return;
  if (state.flipped.includes(id)) return;
  if (state.flipped.length >= 2) return;
  if (state.timeLeft <= 0) return;

  if (state.gameState === 'start') {
    startGame();
    // After starting, the click we just made should still flip
    // So fall through
  }

  state.flipped.push(id);
  play('flip');
  render();

  if (state.flipped.length === 2) {
    state.isChecking = true;
    const [a,b] = state.flipped;
    const ca = state.cards.find(c=>c.id===a);
    const cb = state.cards.find(c=>c.id===b);

    if (ca.emoji === cb.emoji) {
      // MATCH - score = timeLeft * 100 (1 decimal)
      const pts = Math.round(state.timeLeft * 100);
      state.score += pts;
      showFloating(a, pts);
      setTimeout(()=>{
        state.matched.push(a,b);
        state.flipped = [];
        state.isChecking = false;
        play('match');
        // Check win
        if (state.matched.length === 16) {
          const bonus = Math.round(state.timeLeft * 100);
          state.pendingScore = state.score + bonus;
          state.pendingTime = state.timeLeft;
          state.score = state.pendingScore;
          stopTimer();
          if (qualifiesAsHighScore(state.pendingScore)) {
            showNameInput();
          } else {
            state.gameState = 'won';
            play('win');
          }
        }
        render();
      }, 300);
    } else {
      // MISMATCH
      setTimeout(()=>{
        state.flipped = [];
        state.isChecking = false;
        play('mismatch');
        render();
      }, 800);
    }
  }
}

function showFloating(cardId, pts) {
  const el = document.querySelector(`[data-card="${cardId}"] .float-holder`);
  if (!el) return;
  const span = document.createElement('span');
  span.className = 'float';
  span.textContent = `+${pts}`;
  el.appendChild(span);
  setTimeout(()=>span.remove(), 1000);
}

// Modals
function showNameInput() {
  state.gameState = state.matched.length===16 ? 'won_pending' : 'lost_pending';
  render();
}
function saveHighScore() {
  const input = document.getElementById('name-input');
  const name = (input.value.trim() || 'ANON').toUpperCase().slice(0,12);
  const entry = {
    name,
    score: state.pendingScore,
    timeLeft: state.pendingTime,
    date: new Date().toISOString(),
    id: Date.now()+'_'+Math.random().toString(36).slice(2,6)
  };
  const merged = [...state.highScores, entry]
    .sort((a,b)=>b.score-a.score)
    .slice(0,5);
  state.highScores = merged;
  state.lastAddedId = entry.id;
  saveScores(merged);
  play('win');
  // Go to start and show leaderboard
  goToStart();
  setTimeout(()=>{ document.getElementById('leaderboard-overlay').style.display='grid'; }, 100);
}
function skipHighScore() {
  if (state.matched.length===16) {
    state.gameState = 'won';
    play('win');
  } else {
    state.gameState = 'lost';
    play('lose');
  }
  render();
}

// Render - small pure functions, no 10k-char line
function renderHeader() {
  const t = document.getElementById('time');
  if (t) t.textContent = state.timeLeft.toFixed(1)+'s';
  const s = document.getElementById('score');
  if (s) s.textContent = state.score.toLocaleString();
}
function renderBoard() {
  const board = document.getElementById('board');
  if (!board) return;
  board.innerHTML = '';
  state.cards.forEach(card=>{
    const isFlipped = state.flipped.includes(card.id);
    const isMatched = state.matched.includes(card.id);
    const btn = document.createElement('button');
    btn.className = 'card' + (isFlipped?' flipped':'') + (isMatched?' matched':'');
    btn.dataset.card = card.id;
    btn.disabled = isMatched;
    btn.onclick = ()=>onCardClick(card.id);
    btn.innerHTML = `
      <span class="float-holder" style="position:absolute; inset:0;"></span>
      <span>${isFlipped||isMatched? card.emoji : ''}</span>
    `;
    board.appendChild(btn);
  });
}
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  const isStart = state.gameState==='start';
  const isPlaying = state.gameState==='playing';
  const isWon = state.gameState==='won';
  const isLost = state.gameState==='lost';
  const isPending = state.gameState.includes('pending');

  app.innerHTML = `
    ${isStart ? `
      <div class="logo-bar">
        <img src="assets/neurovolt-logo.png" alt="NEURO VOLT"/>
      </div>
      <div class="hero-logo" style="margin-top:12px;">
        <img src="assets/memory-match-logo.png" alt="MEMORY MATCH"/>
      </div>
      <div class="mechanics">
        <div><div class="icon">👀</div><div class="label">FLIP</div></div>
        <div><div class="icon">🧠</div><div class="label">MEMORIZE</div></div>
        <div><div class="icon">⚡️</div><div class="label">MATCH</div></div>
      </div>
      <button class="btn-primary" style="margin-top:16px;" onclick="startGame()">Start Game</button>
      <button class="btn-ghost" onclick="document.getElementById('leaderboard-overlay').style.display='grid'; play('click')">🏆 Show Leaderboard</button>
    ` : ''}

    ${isPlaying || isWon || isLost || isPending ? `
      <!-- Company logo on its own row, full width of game (360px), not full screen -->
      <div class="logo-bar">
        <img src="assets/neurovolt-logo.png" alt="NEURO VOLT"/>
      </div>

      <!-- Score left, Time + Reset right -->
      <div class="game-header" style="margin-top:12px;">
        <div class="stat">⭐ <span id="score">${state.score.toLocaleString()}</span></div>
        <div style="display:flex; gap:8px; align-items:center; margin-left:auto;">
          <div class="stat">⏱ <span id="time">${state.timeLeft.toFixed(1)}s</span></div>
          <button class="restart-btn" onclick="goToStart()" title="Restart">↻</button>
        </div>
      </div>

      <div id="board" class="board"></div>
    ` : ''}
  `;

  if (isPlaying || isWon || isLost) renderBoard();

  // Overlays handled separately to keep render small
  renderOverlays(isWon, isLost, isPending);
}

function renderOverlays(isWon, isLost, isPending) {
  // Name input
  const nameOverlay = document.getElementById('name-overlay');
  if (isPending) {
    nameOverlay.style.display = 'grid';
    nameOverlay.innerHTML = `
      <div class="modal">
        <h2 style="font-size:20px; font-weight:800;">${state.matched.length===16?'🎉 NEW HIGH SCORE!':'⏰ NEW HIGH SCORE!'}</h2>
        <div style="margin-top:12px; background:#f8fbff; border:1px solid #dbeafe; border-radius:14px; padding:12px;">
          <div style="font-size:10px; letter-spacing:0.2em; color:#94a3b8; font-weight:700;">FINAL SCORE</div>
          <div style="font-size:28px; font-weight:800; margin-top:4px;">${state.pendingScore.toLocaleString()}</div>
        </div>
        <label style="display:block; margin-top:16px; font-size:10px; letter-spacing:0.2em; color:#94a3b8; font-weight:700;">ENTER YOUR NAME</label>
        <input id="name-input" maxlength="12" placeholder="YOUR NAME" autofocus
          style="width:100%; height:44px; border-radius:999px; border:2px solid #3b82f6; padding:0 20px; font-weight:700; margin-top:8px; text-transform:uppercase;">
        <button class="btn-primary" style="margin-top:12px;" onclick="saveHighScore()">Save Score</button>
        <button class="btn-ghost" onclick="skipHighScore()">Skip</button>
      </div>
    `;
    setTimeout(()=>document.getElementById('name-input')?.focus(), 50);
  } else {
    nameOverlay.style.display = 'none';
  }

  // Won
  const wonOverlay = document.getElementById('won-overlay');
  wonOverlay.style.display = isWon ? 'grid' : 'none';
  if (isWon) {
    wonOverlay.innerHTML = `
      <div class="modal">
        <div class="hero-logo"><img src="assets/neurovolt-logo.png" alt="END LOGO"/></div>
        <h2 style="font-size:20px; font-weight:800;">🎉 PERFECT CLEAR</h2>
        <div style="margin-top:12px; background:#f8fbff; border:1px solid #dbeafe; border-radius:14px; padding:12px;">
          <div style="font-size:10px; color:#94a3b8; font-weight:700;">FINAL SCORE</div>
          <div style="font-size:28px; font-weight:800;">${state.score.toLocaleString()}</div>
        </div>
        <button class="btn-primary" style="margin-top:16px;" onclick="goToStart()">Play Again</button>
      </div>
    `;
  }

  // Lost
  const lostOverlay = document.getElementById('lost-overlay');
  lostOverlay.style.display = isLost ? 'grid' : 'none';
  if (isLost) {
    lostOverlay.innerHTML = `
      <div class="modal">
        <div class="hero-logo"><img src="assets/neurovolt-logo.png" alt="END LOGO"/></div>
        <h2 style="font-size:20px; font-weight:800;">⏰ TIME'S UP</h2>
        <div style="margin-top:8px; font-size:13px; color:#64748b;">You matched ${Math.floor(state.matched.length/2)} of 8 pairs.</div>
        <div style="margin-top:12px; background:#f8fbff; border:1px solid #dbeafe; border-radius:14px; padding:12px;">
          <div style="font-size:10px; color:#94a3b8; font-weight:700;">SCORE</div>
          <div style="font-size:20px; font-weight:800;">${state.score.toLocaleString()}</div>
        </div>
        <button class="btn-primary" style="margin-top:16px;" onclick="goToStart()">Play Again</button>
      </div>
    `;
  }

  // Leaderboard - rank, name, date, score only
  const lb = document.getElementById('leaderboard-list');
  if (lb) {
    if (state.highScores.length===0) {
      lb.innerHTML = '<div style="text-align:center; padding:24px; color:#64748b; font-size:13px;">No scores yet. Be the first!</div>';
    } else {
      lb.innerHTML = state.highScores.map((h,i)=>`
        <div class="row ${h.id===state.lastAddedId?'highlight':''}">
          <div style="display:flex; gap:8px; align-items:center;">
            <span style="font-size:11px; font-weight:800; color:#94a3b8; width:22px;">#${i+1}</span>
            <span style="font-size:12px; font-weight:700;">${h.name}</span>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <span style="font-size:10px; color:#64748b;">${new Date(h.date).toLocaleDateString()}</span>
            <span style="font-size:12px; font-weight:800; color:#3b82f6;">${h.score.toLocaleString()}</span>
          </div>
        </div>
      `).join('');
    }
  }
}

// Init
document.addEventListener('DOMContentLoaded', ()=>{
  state.cards = createCards();
  render();
});
