export type AppleKind = "red" | "golden" | "rotten";

export interface Apple {
  id: number;
  x: number;
  y: number;
  vy: number;
  kind: AppleKind;
  radius: number;
  wobble: number; // phase offset for side-to-side sway
  wobbleAmp: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0-1, 1 = full, 0 = dead
  color: string;
  radius: number;
}

export type GamePhase = "idle" | "playing" | "gameover";
