import { useEffect, useRef } from 'react';
import { vis } from '../core/visual';
import { t } from '../i18n';
import { fitCanvas, mix } from './canvas';

// A light that rises and warms on the inhale (dawn) and sinks and cools on the exhale (dusk),
// circled by the breath track: one lap = one breath, the dot shows where you are.
// Each phase start sends one ring from the light out to the track — the twin of the audio ping.
const DAWN = [233, 180, 127];
const DUSK = [126, 163, 212];
const MOON = [198, 207, 224];

// where an element's letters actually sit, in viewport px: the top of its tallest glyph and its baseline
const probe = document.createElement('canvas').getContext('2d')!;
function glyphs(el: Element) {
  const cs = getComputedStyle(el);
  // built by hand: cs.font is empty whenever font-variation-settings are in play
  probe.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const m = probe.measureText(el.textContent || 'H');
  const size = parseFloat(cs.fontSize);
  const lh = cs.lineHeight === 'normal' ? m.fontBoundingBoxAscent + m.fontBoundingBoxDescent : parseFloat(cs.lineHeight);
  const box = el.getBoundingClientRect();
  const baseline = box.top + (lh - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
  return { top: baseline - Math.min(m.actualBoundingBoxAscent, size), baseline };
}
// the highest line of text inside a container
function firstText(root: Element | null) {
  if (!root) return null;
  let best: Element | null = null;
  for (const el of root.querySelectorAll('*')) {
    if (el.children.length || !el.textContent?.trim() || !el.getClientRects().length) continue;
    if (!best || el.getBoundingClientRect().top < best.getBoundingClientRect().top) best = el;
  }
  return best;
}

const ease = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * p);
const rgba = (c: number[], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const TEXT_SPACE = 128; // px reserved under the track for the phase word
const CHROME_PAD = 8; // fallback when the charts aren't found: their padding below the stage

/**
 * units: [inhale, exhale] of the breath pattern — sets the proportions of the track,
 * and drives the preview rhythm (in seconds) shown before a session starts.
 */
export function BreathLight({ running, units }: { running: boolean; units: [number, number] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(running);
  runningRef.current = running;
  const unitsRef = useRef(units);
  unitsRef.current = units;

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext('2d')!;
    const label = labelRef.current!;
    const [word, sub] = label.children as unknown as [HTMLElement, HTMLElement];
    let shown = '';
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

      // ---- phase word and seconds left, in the space reserved under the track.
      // Real text rather than canvas text: the canvas is capped at 2x pixel density,
      // so on sharper phone screens canvas text came out soft next to the HTML readings.
      const left = Math.max(1, Math.ceil(phaseLeftMs / 1000));
      const size = Math.round(Math.min(40, Math.max(24, trackR * 0.17)));
      const wordText = `${t(phase === 'in' ? 'light.inhale' : 'light.exhale')} ${left}`;
      const subText = live ? '' : t('light.preview', { in: inU, out: outU });
      const key = `${wordText}|${subText}|${live}|${Math.round(cy)}|${Math.round(trackR)}|${Math.round(H)}|${size}`;
      if (key !== shown) {
        shown = key;
        label.dataset.phase = phase;
        label.dataset.live = String(live);
        word.style.fontSize = `${size}px`;
        word.textContent = wordText;
        sub.textContent = subText;
        // optically centred between the track and the charts under the stage: the gap from the
        // track to the tops of the letters equals the gap from the last baseline to the charts' letters
        // (text boxes carry empty leading, so centring the boxes left the top looking cramped)
        const trackBottom = cy + trackR + 1.5;
        const stageTop = canvas.getBoundingClientRect().top;
        const chart = firstText(document.querySelector('.gap'));
        const chartTop = chart ? glyphs(chart).top - stageTop : H + CHROME_PAD;
        const last = sub.textContent ? sub : word;
        const inTop = word.offsetTop + glyphs(word).top - word.getBoundingClientRect().top;
        const inBase = last.offsetTop + glyphs(last).baseline - last.getBoundingClientRect().top;
        label.style.top = `${(trackBottom + chartTop - inTop - inBase) / 2}px`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <canvas ref={ref} role="img" aria-label={t('light.aria')} />
      <div ref={labelRef} className="phase-label" aria-hidden>
        <span className="phase-word" />
        <span className="phase-sub" />
      </div>
    </>
  );
}
