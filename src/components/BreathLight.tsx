import { useEffect, useRef } from 'react';
import { vis } from '../core/visual';
import { fitCanvas, mix } from './canvas';

// A light that rises and warms on the inhale (dawn) and sinks and cools on the exhale (dusk),
// circled by the breath track: one lap = one breath, the dot shows where you are.
// Each phase start sends one ring from the light out to the track — the twin of the audio ping.
const DAWN = [233, 180, 127];
const DUSK = [126, 163, 212];
const MOON = [198, 207, 224];

const ease = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * p);
const rgba = (c: number[], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const TEXT_SPACE = 104; // px reserved under the track for the phase word

/**
 * units: [inhale, exhale] of the breath pattern — sets the proportions of the track,
 * and drives the preview rhythm (in seconds) shown before a session starts.
 */
export function BreathLight({ running, units }: { running: boolean; units: [number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const runningRef = useRef(running);
  runningRef.current = running;
  const unitsRef = useRef(units);
  unitsRef.current = units;

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext('2d')!;
    let raf = 0;
    let level = 0.15;
    let from = 0.15;
    let seenStart = -1;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const { w: W, h: H } = fitCanvas(canvas, g);
      const now = performance.now();
      g.clearRect(0, 0, W, H);

      // ---- breath level 0..1, the current phase and how far into it we are
      const [inU, outU] = unitsRef.current;
      const live = runningRef.current && vis.phase !== 'idle';
      let phase: 'in' | 'out';
      let phaseP: number;
      let phaseLeftMs: number;
      if (live) {
        if (vis.phaseStart !== seenStart) {
          seenStart = vis.phaseStart;
          from = level;
        }
        phase = vis.phase as 'in' | 'out';
        phaseP = Math.min(1, (now - vis.phaseStart) / vis.phaseDur);
        phaseLeftMs = vis.phaseDur - (now - vis.phaseStart);
        level = from + ((phase === 'in' ? 1 : 0) - from) * ease(phaseP);
      } else {
        // before a session: preview the chosen rhythm in seconds
        const t = (now / 1000) % (inU + outU);
        phase = t < inU ? 'in' : 'out';
        phaseP = phase === 'in' ? t / inU : (t - inU) / outU;
        phaseLeftMs = (phase === 'in' ? inU - t : inU + outU - t) * 1000;
        const target = 0.1 + 0.75 * (phase === 'in' ? ease(phaseP) : 1 - ease(phaseP));
        level += (target - level) * 0.2;
      }
      vis.level = level;

      // ---- geometry: everything sized from the space actually available
      const cx = W / 2;
      const trackR = Math.max(40, Math.min(W * 0.44, (H - TEXT_SPACE) / 2 - 6));
      const cy = 6 + trackR + Math.max(0, (H - TEXT_SPACE - 12 - trackR * 2) / 2);
      const r = trackR * (0.26 + 0.5 * level);
      const color = mix(DUSK, DAWN, level);

      // halo — stays inside the track
      const halo = g.createRadialGradient(cx, cy, r * 0.5, cx, cy, trackR * 1.08);
      halo.addColorStop(0, rgba(color, 0.14 + 0.2 * level));
      halo.addColorStop(1, rgba(color, 0));
      g.fillStyle = halo;
      g.beginPath();
      g.arc(cx, cy, trackR * 1.08, 0, Math.PI * 2);
      g.fill();

      // body: a luminous core that dissolves at the edge
      const body = g.createRadialGradient(cx - r * 0.18, cy - r * 0.22, 0, cx, cy, r);
      body.addColorStop(0, rgba(mix(color, MOON, 0.55), 0.8 + 0.18 * level));
      body.addColorStop(0.55, rgba(color, 0.55 + 0.3 * level));
      body.addColorStop(0.85, rgba(color, 0.24 + 0.15 * level));
      body.addColorStop(1, rgba(color, 0));
      g.fillStyle = body;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();

      // heartbeat: a brief brightening of the light
      const kb = Math.exp(-(now - vis.lastBeat) / 220) * vis.beatVel;
      if (runningRef.current && kb > 0.01) {
        g.globalCompositeOperation = 'lighter';
        const pulse = g.createRadialGradient(cx, cy, 0, cx, cy, r * 1.05);
        pulse.addColorStop(0, rgba(color, 0.14 * kb));
        pulse.addColorStop(1, rgba(color, 0));
        g.fillStyle = pulse;
        g.beginPath();
        g.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = 'source-over';
      }

      // ---- breath track
      const inFrac = inU / (inU + outU);
      const top = -Math.PI / 2;
      const gapA = 0.035;
      const arc = (a0: number, a1: number, c: number[], alpha: number, width: number) => {
        if (a1 <= a0) return;
        g.strokeStyle = rgba(c, alpha);
        g.lineWidth = width;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(cx, cy, trackR, a0, a1);
        g.stroke();
      };
      const inEnd = top + inFrac * Math.PI * 2;
      arc(top + gapA, inEnd - gapA, DAWN, live ? 0.32 : 0.22, 2);
      arc(inEnd + gapA, top + Math.PI * 2 - gapA, DUSK, live ? 0.32 : 0.22, 2);
      const pos = phase === 'in' ? inFrac * phaseP : inFrac + (1 - inFrac) * phaseP;
      const dotA = top + pos * Math.PI * 2;
      const dotC = phase === 'in' ? DAWN : DUSK;
      // the part of the current phase already breathed through is drawn brighter
      if (phase === 'in') arc(top + gapA, dotA, DAWN, live ? 0.85 : 0.5, 2.5);
      else arc(inEnd + gapA, dotA, DUSK, live ? 0.85 : 0.5, 2.5);
      const dx = cx + Math.cos(dotA) * trackR;
      const dy = cy + Math.sin(dotA) * trackR;
      const dotGlow = g.createRadialGradient(dx, dy, 0, dx, dy, 14);
      dotGlow.addColorStop(0, rgba(dotC, live ? 0.9 : 0.6));
      dotGlow.addColorStop(1, rgba(dotC, 0));
      g.fillStyle = dotGlow;
      g.beginPath();
      g.arc(dx, dy, 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rgba(mix(dotC, MOON, 0.4), live ? 1 : 0.75);
      g.beginPath();
      g.arc(dx, dy, 3.5, 0, Math.PI * 2);
      g.fill();

      if (live) {
        // one ring per phase start, travelling from the light to the track
        const t = (now - vis.phaseStart) / 1800;
        if (t < 1) {
          g.strokeStyle = rgba(phase === 'in' ? DAWN : DUSK, 0.55 * (1 - t));
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(cx, cy, r + (trackR - r) * ease(t), 0, Math.PI * 2);
          g.stroke();
        }
        // bowl: faint moonlight shimmer
        const bt = (now - vis.lastBowl) / 3500;
        if (bt >= 0 && bt < 1) {
          g.strokeStyle = rgba(MOON, 0.16 * (1 - bt));
          g.lineWidth = 1;
          g.beginPath();
          g.arc(cx, cy, r + (trackR - r) * 0.6 * bt, 0, Math.PI * 2);
          g.stroke();
        }
      }

      // ---- phase word and seconds left, in the space reserved under the track
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const ty = cy + trackR + 46;
      const left = Math.max(1, Math.ceil(phaseLeftMs / 1000));
      g.fillStyle = rgba(phase === 'in' ? DAWN : DUSK, live ? 0.95 : 0.6);
      g.font = `300 ${Math.round(Math.min(40, Math.max(24, trackR * 0.17)))}px "Fraunces Variable", Georgia, serif`;
      g.fillText(`${phase === 'in' ? 'Inhale' : 'Exhale'} ${left}`, cx, ty);
      if (!live) {
        g.fillStyle = rgba(MOON, 0.5);
        g.font = `400 14px "Figtree Variable", system-ui, sans-serif`;
        g.fillText(`Rhythm preview ${inU} : ${outU}`, cx, ty + 30);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} role="img" aria-label="Breath light: grows as you breathe in, shrinks as you breathe out" />;
}
