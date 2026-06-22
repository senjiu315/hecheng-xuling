const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const cover = document.querySelector("#cover");
const gamePanel = document.querySelector("#gamePanel");
const startButton = document.querySelector("#startButton");
const soundButton = document.querySelector("#soundButton");
const pauseButton = document.querySelector("#pauseButton");
const restartButton = document.querySelector("#restartButton");
const againButton = document.querySelector("#againButton");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const finalScoreEl = document.querySelector("#finalScore");
const nextPreview = document.querySelector("#nextPreview");
const nextName = document.querySelector("#nextName");
const modal = document.querySelector("#gameOverModal");

const W = 390;
const H = 640;
const STORAGE_KEY = "hecheng-xuling-best";
const BOUNDS = {
  left: 22,
  right: W - 22,
  bottom: H - 14
};
const MAX_SPEED = 980;
const FIXED_STEP = 1 / 120;
const COLLISION_ITERATIONS = 5;
const MERGE_TOLERANCE = 3.5;
const LEVELS = [
  { src: "./assets/photos/level-1.jpg", radius: 25, score: 1, ring: "#ffb6df", name: "甜心许澪" },
  { src: "./assets/photos/level-2.jpg", radius: 34, score: 3, ring: "#ff8fc4", name: "粉发许澪" },
  { src: "./assets/photos/level-3.jpg", radius: 44, score: 8, ring: "#ff6cab", name: "魔法许澪" },
  { src: "./assets/photos/level-4.jpg", radius: 56, score: 18, ring: "#ffd166", name: "花束许澪" },
  { src: "./assets/photos/level-5.jpg", radius: 70, score: 38, ring: "#9d7bff", name: "祈愿许澪" },
  { src: "./assets/photos/level-6.jpg", radius: 86, score: 88, ring: "#6edcff", name: "冰蝶许澪" }
];

let images = [];
let balls = [];
let particles = [];
let score = 0;
let best = Number.parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0;
let nextLevel = 0;
let dropX = W / 2;
let canDrop = true;
let paused = false;
let gameOver = false;
let running = false;
let lastTime = 0;
let dangerTime = 0;
let nextId = 1;
let imageLoadingStarted = false;
let isAiming = false;
let audioCtx = null;
let masterGain = null;
let musicGain = null;
let musicTimer = null;
let soundEnabled = true;
let musicStep = 0;
const MUSIC_NOTES = [523.25, 659.25, 783.99, 987.77, 880.0, 783.99, 659.25, 587.33];

function loadImages() {
  if (imageLoadingStarted) return;
  imageLoadingStarted = true;
  images = LEVELS.map((level) => {
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.onload = () => render();
    image.onerror = () => render();
    image.src = level.src;
    return image;
  });
}

function preloadImagesWithTimeout(timeoutMs = 2500) {
  loadImages();
  const loaders = images.map((image) => new Promise((resolve) => {
    if (image.complete) {
      resolve();
      return;
    }
    image.onload = () => {
      render();
      resolve();
    };
    image.onerror = () => resolve();
  }));
  return Promise.race([
    Promise.allSettled(loaders),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

function warmImages() {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => loadImages(), { timeout: 1200 });
  } else {
    setTimeout(() => loadImages(), 600);
  }
}

function ensureAudio() {
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    audioCtx = new AudioCtor();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = soundEnabled ? 0.42 : 0;
    masterGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.08;
    musicGain.connect(masterGain);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return true;
}

function setSoundEnabled(enabled) {
  soundEnabled = enabled;
  if (masterGain) {
    masterGain.gain.setTargetAtTime(enabled ? 0.42 : 0, audioCtx.currentTime, 0.03);
  }
  if (soundButton) soundButton.textContent = enabled ? "静音" : "音乐";
}

function playTone(freq, duration = 0.14, type = "sine", volume = 0.22, startOffset = 0) {
  if (!soundEnabled || !ensureAudio()) return;
  const t = audioCtx.currentTime + startOffset;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function playDropSound() {
  playTone(392, 0.08, "triangle", 0.12);
  playTone(523.25, 0.11, "sine", 0.08, 0.035);
}

function playMergeSound(level) {
  const base = 523.25 + level * 55;
  playTone(base, 0.1, "sine", 0.16);
  playTone(base * 1.25, 0.13, "triangle", 0.13, 0.055);
  playTone(base * 1.5, 0.16, "sine", 0.1, 0.12);
}

function playButtonSound() {
  playTone(880, 0.07, "sine", 0.08);
}

function playGameOverSound() {
  playTone(392, 0.16, "triangle", 0.14);
  playTone(329.63, 0.22, "sine", 0.1, 0.13);
}

function startMusic() {
  if (!ensureAudio() || musicTimer) return;
  musicTimer = setInterval(() => {
    if (!soundEnabled || paused || gameOver || !running) return;
    const freq = MUSIC_NOTES[musicStep % MUSIC_NOTES.length];
    musicStep += 1;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(gain);
    gain.connect(musicGain);
    osc.start(t);
    osc.stop(t + 0.45);
  }, 420);
}


function pickNextLevel() {
  const roll = Math.random();
  if (roll > 0.88) return 2;
  if (roll > 0.55) return 1;
  return 0;
}

function updateHud() {
  if (score > best) {
    best = score;
    localStorage.setItem(STORAGE_KEY, String(best));
  }
  const next = LEVELS[nextLevel];
  scoreEl.textContent = score;
  bestEl.textContent = best;
  finalScoreEl.textContent = score;
  nextPreview.src = next.src;
  nextName.textContent = next.name;
  pauseButton.textContent = paused ? "继续" : "暂停";
  modal.classList.toggle("hidden", !gameOver);
}

function resetGame() {
  balls = [];
  particles = [];
  score = 0;
  nextLevel = pickNextLevel();
  dropX = W / 2;
  canDrop = true;
  paused = false;
  gameOver = false;
  dangerTime = 0;
  updateHud();
}

function spawnBall(x, y, level) {
  const def = LEVELS[level];
  balls.push({
    id: nextId++,
    x,
    y,
    vx: (Math.random() - 0.5) * 0.25,
    vy: 0,
    level,
    r: def.radius,
    merging: false,
    age: 0,
    grounded: false
  });
}

function dropBall() {
  if (!canDrop || paused || gameOver) return;
  spawnBall(dropX, 86, nextLevel);
  playDropSound();
  nextLevel = pickNextLevel();
  canDrop = false;
  setTimeout(() => {
    canDrop = true;
  }, 460);
  updateHud();
}

function addBurst(x, y, color) {
  for (let i = 0; i < 18; i += 1) {
    const a = (Math.PI * 2 * i) / 18;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * (80 + Math.random() * 90),
      vy: Math.sin(a) * (80 + Math.random() * 90),
      life: 0.55,
      color,
      text: i % 3 === 0 ? "♡" : "✦"
    });
  }
}

function mergePair(a, b) {
  if (a.merging || b.merging || a.level !== b.level || a.level >= LEVELS.length - 1) return false;
  a.merging = true;
  b.merging = true;
  const level = a.level + 1;
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  const vx = (a.vx + b.vx) * 0.25;
  const vy = Math.min((a.vy + b.vy) * 0.2, 180);
  balls = balls.filter((ball) => ball !== a && ball !== b);
  spawnBall(x, y, level);
  const created = balls[balls.length - 1];
  created.vx = vx;
  created.vy = vy;
  score += LEVELS[level].score;
  playMergeSound(level);
  addBurst(x, y, LEVELS[level].ring);
  updateHud();
  return true;
}

function stepPhysics(dt) {
  let remaining = Math.min(dt, 0.05);
  while (remaining > 0) {
    const step = Math.min(FIXED_STEP, remaining);
    stepPhysicsSubstep(step);
    remaining -= step;
  }
}

function stepPhysicsSubstep(dt) {
  const gravity = 980;
  const damp = 0.996;

  for (const ball of balls) {
    ball.age += dt;
    ball.grounded = false;
    ball.vy += gravity * dt;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > MAX_SPEED) {
      const scale = MAX_SPEED / speed;
      ball.vx *= scale;
      ball.vy *= scale;
    }
    ball.vx *= damp;
    ball.vy *= 0.998;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    clampToBounds(ball);
  }

  for (let iteration = 0; iteration < COLLISION_ITERATIONS; iteration += 1) {
    if (resolveBallCollisions()) return;
    for (const ball of balls) clampToBounds(ball);
  }

  finishPhysicsFrame(dt);
}

function clampToBounds(ball) {
  if (ball.x - ball.r < BOUNDS.left) {
    ball.x = BOUNDS.left + ball.r;
    ball.vx = Math.abs(ball.vx) * 0.45;
  }
  if (ball.x + ball.r > BOUNDS.right) {
    ball.x = BOUNDS.right - ball.r;
    ball.vx = -Math.abs(ball.vx) * 0.45;
  }
  if (ball.y + ball.r > BOUNDS.bottom) {
    ball.y = BOUNDS.bottom - ball.r;
    ball.vy = Math.min(-Math.abs(ball.vy) * 0.22, 0);
    if (Math.abs(ball.vy) < 24) ball.vy = 0;
    ball.vx *= 0.9;
    ball.grounded = true;
  }
  if (ball.y - ball.r < 54 && ball.age > 0.35) {
    ball.y = 54 + ball.r;
    ball.vy = Math.abs(ball.vy) * 0.25;
  }
}

function resolveBallCollisions() {
  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i];
      const b = balls[j];
      if (!a || !b || a.merging || b.merging) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const minDist = a.r + b.r;

      if (a.level === b.level && dist <= minDist + MERGE_TOLERANCE) {
        mergePair(a, b);
        return true;
      }

      if (dist >= minDist) continue;
      separateBalls(a, b, dx, dy, dist, minDist);
    }
  }
  return false;
}

function separateBalls(a, b, dx, dy, dist, minDist) {
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  const total = a.r + b.r;
  const aShare = b.r / total;
  const bShare = a.r / total;
  const correction = overlap + 0.45;
  a.x -= nx * correction * aShare;
  a.y -= ny * correction * aShare;
  b.x += nx * correction * bShare;
  b.y += ny * correction * bShare;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velAlongNormal = rvx * nx + rvy * ny;
  if (velAlongNormal <= 0) {
    const impulse = -(1.05 * velAlongNormal) / 2;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
  }

  const tx = -ny;
  const ty = nx;
  const tangentSpeed = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
  const friction = tangentSpeed * 0.025;
  a.vx += friction * tx;
  a.vy += friction * ty;
  b.vx -= friction * tx;
  b.vy -= friction * ty;
}

function finishPhysicsFrame(dt) {
  const danger = balls.some((ball) => ball.y - ball.r < 112 && ball.age > 1.2);
  dangerTime = danger && balls.length > 6 ? dangerTime + dt : 0;
  if (dangerTime > 1.8) {
    gameOver = true;
    canDrop = false;
    playGameOverSound();
    updateHud();
  }

  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 150 * dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#fff8fd");
  grad.addColorStop(0.52, "#ffe0ef");
  grad.addColorStop(1, "#e0f7ff");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  roundRect(20, 54, W - 40, H - 64, 24, "rgba(255,255,255,.82)", "#ff9ccc", 4);
  ctx.save();
  ctx.strokeStyle = "rgba(255,108,171,.7)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(28, 112);
  ctx.lineTo(W - 28, 112);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = "#ff78b7";
  ctx.font = "18px Georgia";
  for (let i = 0; i < 18; i += 1) {
    ctx.fillText(i % 3 === 0 ? "♡" : "✦", 28 + ((i * 71) % 330), 140 + ((i * 97) % 450));
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r, fill, stroke, lineWidth) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(ball, alpha = 1) {
  const def = LEVELS[ball.level];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(ball.x, ball.y);
  ctx.rotate(Math.sin(ball.x * 0.01 + ball.y * 0.01) * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, ball.r + 7, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = def.ring;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
  ctx.clip();
  const img = images[ball.level];
  const size = ball.r * 2;
  if (img && img.complete) {
    ctx.drawImage(img, -ball.r, -ball.r, size, size);
  } else {
    const grad = ctx.createLinearGradient(-ball.r, -ball.r, ball.r, ball.r);
    grad.addColorStop(0, "#fff0fa");
    grad.addColorStop(1, def.ring);
    ctx.fillStyle = grad;
    ctx.fillRect(-ball.r, -ball.r, size, size);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(-ball.r * 0.28, -ball.r * 0.36, ball.r * 0.42, ball.r * 0.2, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,.23)";
  ctx.fill();

  ctx.font = `${Math.max(18, ball.r * 0.42)}px Georgia`;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = ball.level === 5 ? "#47bdf2" : "#ff65ad";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const icon = ball.level % 2 === 0 ? "♡" : "✦";
  ctx.strokeText(icon, ball.r * 0.48, -ball.r * 0.76);
  ctx.fillText(icon, ball.r * 0.48, -ball.r * 0.76);
  ctx.restore();
}

function render() {
  window.__hechengDebug = {
    ballCount: balls.length,
    score,
    canDrop,
    isAiming,
    soundEnabled
  };
  drawBackground();

  const preview = { x: dropX, y: 52, r: LEVELS[nextLevel].radius, level: nextLevel };
  ctx.save();
  ctx.strokeStyle = "rgba(255,117,184,.64)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dropX, 70);
  ctx.lineTo(dropX, 118);
  ctx.stroke();
  ctx.restore();
  if (!gameOver) drawBall(preview, canDrop && !paused ? 0.72 : 0.36);

  for (const ball of balls) drawBall(ball);

  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.55);
    ctx.fillStyle = p.color;
    ctx.font = "18px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();

  if (paused && !gameOver) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillRect(20, 54, W - 40, H - 64);
    ctx.fillStyle = "#e94798";
    ctx.font = "900 34px Microsoft YaHei UI";
    ctx.textAlign = "center";
    ctx.fillText("暂停中", W / 2, H / 2);
    ctx.restore();
  }
}

function loop(time) {
  const dt = Math.min(0.033, (time - lastTime) / 1000 || 0.016);
  lastTime = time;
  if (running && !paused && !gameOver) {
    stepPhysics(dt);
  }
  render();
  requestAnimationFrame(loop);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  return ((clientX - rect.left) / rect.width) * W;
}

function movePointer(event) {
  const level = LEVELS[nextLevel];
  dropX = Math.max(34 + level.radius, Math.min(W - 34 - level.radius, canvasPoint(event)));
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  isAiming = true;
  movePointer(event);
  canvas.setPointerCapture?.(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!isAiming && event.pointerType === "touch") return;
  event.preventDefault();
  movePointer(event);
});
canvas.addEventListener("pointerup", (event) => {
  if (!isAiming) return;
  event.preventDefault();
  movePointer(event);
  isAiming = false;
  canvas.releasePointerCapture?.(event.pointerId);
  dropBall();
});
canvas.addEventListener("pointercancel", () => {
  isAiming = false;
});
canvas.addEventListener("touchmove", (event) => {
  event.preventDefault();
}, { passive: false });

startButton.addEventListener("click", async () => {
  playButtonSound();
  ensureAudio();
  startMusic();
  startButton.disabled = true;
  startButton.textContent = "进入中...";
  loadImages();
  cover.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  resetGame();
  running = true;
  startButton.disabled = false;
  startButton.textContent = "开始游戏";
  preloadImagesWithTimeout().finally(() => render());
});

restartButton.addEventListener("click", () => {
  playButtonSound();
  resetGame();
});
againButton.addEventListener("click", () => {
  playButtonSound();
  resetGame();
});
soundButton?.addEventListener("click", () => {
  ensureAudio();
  setSoundEnabled(!soundEnabled);
  playButtonSound();
});
pauseButton.addEventListener("click", () => {
  if (gameOver) return;
  playButtonSound();
  paused = !paused;
  updateHud();
});

updateHud();
warmImages();
requestAnimationFrame(loop);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
