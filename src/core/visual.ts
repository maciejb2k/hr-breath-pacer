// Shared, mutable visual state. The audio engine writes it at the exact moment sounds play
// (via Tone.Draw); the canvas components read it every animation frame. Kept outside React
// on purpose: it changes many times per second and must not trigger re-renders.
export type BreathPhase = 'idle' | 'in' | 'out';

export const vis = {
  phase: 'idle' as BreathPhase,
  phaseStart: 0, // performance.now() ms
  phaseDur: 1, // ms
  lastBeat: -1e9,
  beatVel: 0.8,
  lastBowl: -1e9,
  /** current breath level 0..1 as drawn by the breath light (also used by the sky) */
  level: 0.15,
};
