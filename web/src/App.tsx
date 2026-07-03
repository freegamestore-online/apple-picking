import { useCallback, useEffect, useRef, useState } from "react";
import { GameShell, GameTopbar } from "@freegamestore/games";
import { useGameLoop } from "./hooks/useGameLoop";
import { useHighScore } from "./hooks/useHighScore";
import { drawText } from "./lib/canvas";
import type { Apple, AppleKind, GamePhase, Particle } from "./types";

// ─── constants ────────────────────────────────────────────────────────────────
const BASKET_W = 90;
const BASKET_H = 50;
const APPLE_RADIUS = 20;
const LIVES_START = 3;
const SPAWN_BASE = 1.4; // seconds between spawns at start
const SPAWN_MIN = 0.45;
const SPEED_BASE = 120; // px/s at start
const SPEED_MAX = 340;

function appleColor(kind: AppleKind): string {
  if (kind === "golden") return "#f5c518";
  if (kind === "rotten") return "#6b7c3b";
  return "#e8302a";
}
function applePoints(kind: AppleKind): number {
  if (kind === "golden") return 3;
  if (kind === "rotten") return 0;
  return 1;
}

let nextId = 1;
function uid() {
  return nextId++;
}

function pickKind(score: number): AppleKind {
  const r = Math.random();
  const goldenChance = Math.min(0.12 + score * 0.0005, 0.22);
  const rottenChance = Math.min(0.08 + score * 0.0004, 0.28);
  if (r < goldenChance) return "golden";
  if (r < goldenChance + rottenChance) return "rotten";
  return "red";
}

function spawnApple(canvasW: number, score: number): Apple {
  const kind = pickKind(score);
  const progress = Math.min(score / 80, 1);
  const vy = SPEED_BASE + progress * (SPEED_MAX - SPEED_BASE) + Math.random() * 30;
  return {
    id: uid(),
    x: APPLE_RADIUS + Math.random() * (canvasW - APPLE_RADIUS * 2),
    y: -APPLE_RADIUS,
    vy,
    kind,
    radius: APPLE_RADIUS,
    wobble: Math.random() * Math.PI * 2,
    wobbleAmp: 18 + Math.random() * 22,
  };
}

// ─── draw helpers ─────────────────────────────────────────────────────────────
function drawApple(
  ctx: CanvasRenderingContext2D,
  apple: Apple,
  t: number,
): void {
  const x = apple.x + Math.sin(t * 1.8 + apple.wobble) * apple.wobbleAmp * 0.25;
  const y = apple.y;
  const r = apple.radius;
  const color = appleColor(apple.kind);

  // shadow
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.ellipse(x, y + r - 4, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.restore();

  // body
  ctx.save();
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grad.addColorStop(0, lighten(color, 40));
  grad.addColorStop(1, darken(color, 20));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // shine
  ctx.beginPath();
  ctx.ellipse(x - r * 0.28, y - r * 0.28, r * 0.22, r * 0.14, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fill();

  // stem
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + 8, y - r - 14, x + 4, y - r - 20);
  ctx.strokeStyle = "#5a3a1a";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.stroke();

  // leaf
  ctx.beginPath();
  ctx.ellipse(x + 9, y - r - 13, 8, 4, 0.7, 0, Math.PI * 2);
  ctx.fillStyle = apple.kind === "rotten" ? "#4a6028" : "#4caf50";
  ctx.fill();

  // rotten spots
  if (apple.kind === "rotten") {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#3a4a1a";
    ctx.beginPath();
    ctx.arc(x + 5, y + 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 7, y - 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // golden shimmer
  if (apple.kind === "golden") {
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 4 + apple.wobble);
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffe066";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawBasket(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  w: number,
  h: number,
  shake: number,
): void {
  const sx = shake * (Math.random() - 0.5) * 6;
  const x = bx + sx;

  ctx.save();

  // basket body (trapezoid)
  ctx.beginPath();
  ctx.moveTo(x - w / 2, by);
  ctx.lineTo(x + w / 2, by);
  ctx.lineTo(x + w / 2 - 10, by + h);
  ctx.lineTo(x - w / 2 + 10, by + h);
  ctx.closePath();

  const grad = ctx.createLinearGradient(x - w / 2, by, x + w / 2, by + h);
  grad.addColorStop(0, "#c8843a");
  grad.addColorStop(0.5, "#a0622a");
  grad.addColorStop(1, "#7a4a1e");
  ctx.fillStyle = grad;
  ctx.fill();

  // weave lines horizontal
  ctx.strokeStyle = "#7a4a1e";
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    const fy = by + (h / 4) * i;
    const inset = (10 / h) * (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + inset, fy);
    ctx.lineTo(x + w / 2 - inset, fy);
    ctx.stroke();
  }

  // weave lines vertical
  for (let i = -3; i <= 3; i++) {
    const lx = x + (i * w) / 7;
    ctx.beginPath();
    ctx.moveTo(lx, by);
    ctx.lineTo(lx + 5, by + h);
    ctx.stroke();
  }

  // rim
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 5, by);
  ctx.lineTo(x + w / 2 + 5, by);
  ctx.strokeStyle = "#e8a050";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.restore();
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  canvasH: number,
  t: number,
  side: "left" | "right",
): void {
  const trunkH = canvasH * 0.28;
  const trunkW = 22;
  const foliageR = 70;
  const foliageY = canvasH - trunkH - foliageR + 20;
  const sway = Math.sin(t * 0.6) * 3;
  const dir = side === "left" ? 1 : -1;

  ctx.save();
  ctx.translate(x, 0);

  // trunk
  const tg = ctx.createLinearGradient(-trunkW / 2, canvasH - trunkH, trunkW / 2, canvasH);
  tg.addColorStop(0, "#7a5230");
  tg.addColorStop(1, "#4a3018");
  ctx.beginPath();
  ctx.moveTo(-trunkW / 2, canvasH);
  ctx.lineTo(-trunkW / 2 + sway * 0.5, canvasH - trunkH);
  ctx.lineTo(trunkW / 2 + sway * 0.5, canvasH - trunkH);
  ctx.lineTo(trunkW / 2, canvasH);
  ctx.fillStyle = tg;
  ctx.fill();

  // foliage layers
  const layers = [
    { dy: 0, r: foliageR, color: "#3d8c3a" },
    { dy: -foliageR * 0.45, r: foliageR * 0.78, color: "#4caf50" },
    { dy: -foliageR * 0.8, r: foliageR * 0.55, color: "#66bb6a" },
  ];

  for (const layer of layers) {
    const lx = sway * dir * 0.4;
    const ly = foliageY + layer.dy;
    const grad = ctx.createRadialGradient(lx - 10, ly - 10, 5, lx, ly, layer.r);
    grad.addColorStop(0, lighten(layer.color, 20));
    grad.addColorStop(1, darken(layer.color, 15));
    ctx.beginPath();
    ctx.arc(lx, ly, layer.r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save();
  ctx.globalAlpha = p.life;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.restore();
}

function lighten(hex: string, amt: number): string {
  return shiftColor(hex, amt);
}
function darken(hex: string, amt: number): string {
  return shiftColor(hex, -amt);
}
function shiftColor(hex: string, amt: number): string {
  const c = hex.replace("#", "");
  const r = Math.min(255, Math.max(0, parseInt(c.substring(0, 2), 16) + amt));
  const g = Math.min(255, Math.max(0, parseInt(c.substring(2, 4), 16) + amt));
  const b = Math.min(255, Math.max(0, parseInt(c.substring(4, 6), 16) + amt));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [highScore, updateHighScore] = useHighScore("applepicking_highscore");
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<GamePhase>("idle");

  // mutable game state (not React state — avoids re-render churn in the loop)
  const stateRef = useRef({
    phase: "idle" as GamePhase,
    score: 0,
    lives: LIVES_START,
    apples: [] as Apple[],
    particles: [] as Particle[],
    basketX: 0,
    spawnTimer: 0,
    shakeTimer: 0,
    t: 0,
    // input
    targetX: -1, // -1 = use keyboard
    keys: new Set<string>(),
  });

  const scoreRef = useRef(0);
  const phaseRef = useRef<GamePhase>("idle");

  // ── input listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    const st = stateRef.current;

    function onKeyDown(e: KeyboardEvent) {
      st.keys.add(e.key);
      if (["ArrowLeft", "ArrowRight", "a", "d", " "].includes(e.key))
        e.preventDefault();
      if (e.key === " " || e.key === "Enter") {
        if (st.phase === "idle" || st.phase === "gameover") startGame();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      st.keys.delete(e.key);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── canvas pointer/touch ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st = stateRef.current;

    function getX(e: MouseEvent | Touch) {
      const rect = canvas!.getBoundingClientRect();
      return e.clientX - rect.left;
    }

    function onPointerMove(e: MouseEvent) {
      st.targetX = getX(e);
    }
    function onClick(e: MouseEvent) {
      st.targetX = getX(e);
      if (st.phase === "idle" || st.phase === "gameover") startGame();
    }
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (t) {
        st.targetX = getX(t);
        e.preventDefault();
      }
    }
    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (t) {
        st.targetX = getX(t);
        if (st.phase === "idle" || st.phase === "gameover") startGame();
        e.preventDefault();
      }
    }

    canvas.addEventListener("mousemove", onPointerMove);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => {
      canvas.removeEventListener("mousemove", onPointerMove);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchstart", onTouchStart);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = useCallback(() => {
    const canvas = canvasRef.current;
    const w = canvas?.width ?? 400;
    const st = stateRef.current;
    st.phase = "playing";
    st.score = 0;
    st.lives = LIVES_START;
    st.apples = [];
    st.particles = [];
    st.basketX = w / 2;
    st.spawnTimer = 0;
    st.shakeTimer = 0;
    st.t = 0;
    scoreRef.current = 0;
    phaseRef.current = "playing";
    setScore(0);
    setPhase("playing");
  }, []);

  // ── game loop ──────────────────────────────────────────────────────────────
  useGameLoop((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // resize canvas to match display size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayW = Math.floor(rect.width);
    const displayH = Math.floor(rect.height);
    if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr) {
      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      ctx.scale(dpr, dpr);
    }
    const W = displayW;
    const H = displayH;

    const st = stateRef.current;
    st.t += dt;

    // ── clear ──────────────────────────────────────────────────────────────
    // sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#b8e4f9");
    sky.addColorStop(0.6, "#d8f0c0");
    sky.addColorStop(1, "#8bc34a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // ground
    ctx.fillStyle = "#6a9e30";
    ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = "#5a8a20";
    ctx.fillRect(0, H - 42, W, 6);

    // trees
    const treeXL = Math.min(W * 0.12, 80);
    const treeXR = W - Math.min(W * 0.12, 80);
    drawTree(ctx, treeXL, H, st.t, "left");
    drawTree(ctx, treeXR, H, st.t, "right");

    if (st.phase === "idle") {
      // title screen
      drawText(ctx, "🍎 Apple Picking", W / 2, H * 0.32, {
        font: `bold ${Math.min(W * 0.09, 48)}px Fraunces, serif`,
        color: "#2d5a1b",
        shadow: "#ffffff",
        shadowBlur: 12,
      });
      drawText(ctx, "Catch the falling apples!", W / 2, H * 0.46, {
        font: `${Math.min(W * 0.05, 22)}px Manrope, sans-serif`,
        color: "#3a6b22",
      });
      drawText(ctx, "Avoid 🟢 rotten apples", W / 2, H * 0.56, {
        font: `${Math.min(W * 0.04, 18)}px Manrope, sans-serif`,
        color: "#7a4a1e",
      });
      drawText(ctx, "Golden apples = 3 pts!", W / 2, H * 0.63, {
        font: `${Math.min(W * 0.04, 18)}px Manrope, sans-serif`,
        color: "#b8860b",
      });

      const btnW = Math.min(W * 0.55, 240);
      const btnH = 56;
      const btnX = W / 2 - btnW / 2;
      const btnY = H * 0.73;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(btnX, btnY, btnW, btnH, 28);
      ctx.fillStyle = "#e8302a";
      ctx.fill();
      drawText(ctx, "Tap / Press Space to Play", W / 2, btnY + btnH / 2, {
        font: `bold ${Math.min(W * 0.042, 18)}px Manrope, sans-serif`,
        color: "#fff",
      });
      ctx.restore();
      return;
    }

    if (st.phase === "gameover") {
      drawText(ctx, "Game Over!", W / 2, H * 0.3, {
        font: `bold ${Math.min(W * 0.1, 52)}px Fraunces, serif`,
        color: "#c0392b",
        shadow: "#fff",
        shadowBlur: 14,
      });
      drawText(ctx, `Score: ${st.score}`, W / 2, H * 0.44, {
        font: `bold ${Math.min(W * 0.065, 34)}px Manrope, sans-serif`,
        color: "#2d5a1b",
      });
      drawText(ctx, `Best: ${Math.max(st.score, highScore)}`, W / 2, H * 0.54, {
        font: `${Math.min(W * 0.05, 24)}px Manrope, sans-serif`,
        color: "#7a4a1e",
      });
      const btnW = Math.min(W * 0.55, 220);
      const btnH = 54;
      const btnX = W / 2 - btnW / 2;
      const btnY = H * 0.65;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(btnX, btnY, btnW, btnH, 27);
      ctx.fillStyle = "#e8302a";
      ctx.fill();
      drawText(ctx, "Play Again", W / 2, btnY + btnH / 2, {
        font: `bold ${Math.min(W * 0.05, 22)}px Manrope, sans-serif`,
        color: "#fff",
      });
      ctx.restore();
      return;
    }

    // ── playing ────────────────────────────────────────────────────────────

    // basket movement
    const BASKET_SPEED = 480;
    const BASKET_Y = H - 40 - BASKET_H + 8;

    if (st.keys.has("ArrowLeft") || st.keys.has("a")) {
      st.basketX -= BASKET_SPEED * dt;
      st.targetX = -1;
    }
    if (st.keys.has("ArrowRight") || st.keys.has("d")) {
      st.basketX += BASKET_SPEED * dt;
      st.targetX = -1;
    }
    if (st.targetX >= 0) {
      // smooth follow toward pointer/touch
      const diff = st.targetX - st.basketX;
      st.basketX += diff * Math.min(dt * 14, 1);
    }
    st.basketX = Math.max(BASKET_W / 2, Math.min(W - BASKET_W / 2, st.basketX));

    // spawn apples
    const spawnInterval = Math.max(
      SPAWN_MIN,
      SPAWN_BASE - st.score * 0.008,
    );
    st.spawnTimer -= dt;
    if (st.spawnTimer <= 0) {
      st.apples.push(spawnApple(W, st.score));
      st.spawnTimer = spawnInterval + Math.random() * 0.3;
    }

    // update apples
    const toRemove: number[] = [];
    for (const apple of st.apples) {
      apple.y += apple.vy * dt;
      // side wobble
      apple.x += Math.sin(st.t * 1.8 + apple.wobble) * apple.wobbleAmp * dt;
      apple.x = Math.max(apple.radius, Math.min(W - apple.radius, apple.x));

      // catch check
      const ax = apple.x + Math.sin(st.t * 1.8 + apple.wobble) * apple.wobbleAmp * 0.25;
      const inBasketX = Math.abs(ax - st.basketX) < BASKET_W / 2 + apple.radius * 0.4;
      const inBasketY = apple.y + apple.radius >= BASKET_Y && apple.y - apple.radius < BASKET_Y + BASKET_H;

      if (inBasketX && inBasketY) {
        toRemove.push(apple.id);
        if (apple.kind === "rotten") {
          // lose a life
          st.lives = Math.max(0, st.lives - 1);
          st.shakeTimer = 0.4;
          spawnParticles(st.particles, ax, apple.y, "#6b7c3b", 8);
          if (st.lives === 0) endGame();
        } else {
          const pts = applePoints(apple.kind);
          st.score += pts;
          scoreRef.current = st.score;
          setScore(st.score);
          updateHighScore(st.score);
          spawnParticles(st.particles, ax, apple.y, appleColor(apple.kind), 10);
        }
        continue;
      }

      // missed — fell off bottom
      if (apple.y - apple.radius > H) {
        toRemove.push(apple.id);
        if (apple.kind !== "rotten") {
          st.lives = Math.max(0, st.lives - 1);
          st.shakeTimer = 0.25;
          if (st.lives === 0) endGame();
        }
      }
    }
    st.apples = st.apples.filter((a) => !toRemove.includes(a.id));

    // update particles
    for (const p of st.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt;
      p.life -= dt * 2.2;
    }
    st.particles = st.particles.filter((p) => p.life > 0);

    // shake
    if (st.shakeTimer > 0) st.shakeTimer -= dt;

    // ── draw ──────────────────────────────────────────────────────────────

    // particles
    for (const p of st.particles) drawParticle(ctx, p);

    // apples
    for (const apple of st.apples) drawApple(ctx, apple, st.t);

    // basket
    drawBasket(
      ctx,
      st.basketX,
      BASKET_Y,
      BASKET_W,
      BASKET_H,
      st.shakeTimer > 0 ? 1 : 0,
    );

    // HUD — lives
    const heartSize = 26;
    const heartPad = 8;
    for (let i = 0; i < LIVES_START; i++) {
      ctx.save();
      ctx.font = `${heartSize}px sans-serif`;
      ctx.globalAlpha = i < st.lives ? 1 : 0.22;
      ctx.fillText("❤️", 14 + i * (heartSize + heartPad), 36);
      ctx.restore();
    }
  });

  function endGame() {
    const st = stateRef.current;
    st.phase = "gameover";
    phaseRef.current = "gameover";
    updateHighScore(st.score);
    setPhase("gameover");
  }

  function spawnParticles(
    arr: Particle[],
    x: number,
    y: number,
    color: string,
    count: number,
  ) {
    for (let i = 0; i < count; i++) {
      arr.push({
        id: uid(),
        x,
        y,
        vx: (Math.random() - 0.5) * 180,
        vy: -Math.random() * 200 - 60,
        life: 1,
        color,
        radius: 5 + Math.random() * 5,
      });
    }
  }

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Apple Picking"
          score={score}
          highScore={highScore}
        />
      }
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block touch-none"
        style={{ cursor: "none" }}
      />
      {/* overlay buttons for mobile idle/gameover */}
      {phase === "idle" && (
        <button
          className="absolute inset-0 w-full h-full opacity-0"
          onClick={startGame}
          aria-label="Start game"
        />
      )}
      {phase === "gameover" && (
        <button
          className="absolute inset-0 w-full h-full opacity-0"
          onClick={startGame}
          aria-label="Play again"
        />
      )}
    </GameShell>
  );
}
