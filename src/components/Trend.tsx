import { useEffect, useRef, useState } from 'react';
import { controller } from '../core/controller';
import { fitCanvas } from './canvas';

type Range = '5' | 'session';

/**
 * Heart rate (pink) and music tempo (blue) over time. It sits between the two readings,
 * which share its colours — so the numbers on either side double as its legend.
 */
export function Trend({ sessionStart, running, caption }: { sessionStart: number | null; running: boolean; caption: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [range, setRange] = useState<Range>('5');

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext('2d')!;
    const draw = () => {
      const { w: W, h: H } = fitCanvas(canvas, g);
      g.clearRect(0, 0, W, H);
      const all = controller.history;
      const now = Date.now();
      let t0: number;
      let t1: number;
      if (range === 'session' && all.length) {
        t0 = running && sessionStart ? Math.max(all[0].t, sessionStart) : all[0].t;
        t1 = Math.max(now, t0 + 60000);
      } else {
        t1 = now;
        t0 = now - 5 * 60000;
      }
      const data = all.filter((d) => d.t >= t0);

      let lo = Infinity;
      let hi = -Infinity;
      for (const d of data)
        for (const v of [d.raw, d.hr, d.bpm])
          if (v != null) {
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          }
      if (!isFinite(lo)) {
        lo = 50;
        hi = 90;
      }
      lo = Math.floor((lo - 4) / 5) * 5;
      hi = Math.ceil((hi + 4) / 5) * 5;
      if (hi - lo < 20) {
        const mid = (hi + lo) / 2;
        lo = Math.floor((mid - 10) / 5) * 5;
        hi = lo + 20;
      }

      const L = 26;
      const R = 4;
      const T = 6;
      const B = 18;
      const pw = W - L - R;
      const ph = H - T - B;
      const x = (t: number) => L + ((t - t0) / (t1 - t0)) * pw;
      const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * ph;

      g.font = '11px "Figtree Variable", system-ui, sans-serif';
      g.fillStyle = '#6a7694';
      g.strokeStyle = 'rgba(198,207,224,0.08)';
      g.lineWidth = 1;
      const step = hi - lo > 50 ? 20 : 10;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
        const yy = Math.round(y(v)) + 0.5;
        g.beginPath();
        g.moveTo(L, yy);
        g.lineTo(W - R, yy);
        g.stroke();
        g.fillText(String(v), L - 6, y(v));
      }
      // time labels: as many as fit without crowding
      g.textAlign = 'center';
      g.textBaseline = 'top';
      const span = t1 - t0;
      const tickMin = span <= 6 * 60000 ? 1 : span <= 30 * 60000 ? 5 : span <= 120 * 60000 ? 15 : 30;
      const ticks = Math.floor(span / (tickMin * 60000));
      const every = Math.max(1, Math.ceil((ticks * 52) / pw));
      for (let k = 0; k <= ticks; k += every) {
        const t = t1 - k * tickMin * 60000;
        g.fillText(k === 0 ? 'now' : `−${k * tickMin} min`, Math.min(W - R - 16, Math.max(L + 16, x(t))), H - B + 4);
      }

      if (!data.length) {
        g.textBaseline = 'middle';
        const empty = all.length ? 'No readings in the last 5 minutes' : 'Waiting for the first heart rate reading';
        // only when it fits: on a narrow phone chart the line would run past the edges
        if (g.measureText(empty).width <= pw - 16) g.fillText(empty, L + pw / 2, T + ph / 2);
        return;
      }
      const stride = Math.max(1, Math.floor(data.length / pw));
      g.fillStyle = 'rgba(216,138,150,0.25)';
      for (let i = 0; i < data.length; i += stride) {
        const d = data[i];
        if (d.raw != null) g.fillRect(x(d.t) - 1, y(d.raw) - 1, 2, 2);
      }
      const line = (key: 'hr' | 'bpm', color: string) => {
        g.strokeStyle = color;
        g.lineWidth = 2;
        g.lineJoin = 'round';
        g.beginPath();
        let pen = false;
        for (let i = 0; i < data.length; i += stride) {
          const d = data[i];
          const v = d[key];
          if (v == null) {
            pen = false;
            continue;
          }
          if (pen) g.lineTo(x(d.t), y(v));
          else {
            g.moveTo(x(d.t), y(v));
            pen = true;
          }
        }
        g.stroke();
      };
      line('hr', '#d88a96');
      line('bpm', '#7ea3d4');
    };
    draw();
    const id = window.setInterval(draw, 1000);
    window.addEventListener('resize', draw);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', draw);
    };
  }, [range, running, sessionStart]);

  return (
    <div className="trend">
      <div className="trend-head">
        <span className="caption">{caption}</span>
        <span className="seg" role="group" aria-label="Chart range">
          <button aria-pressed={range === '5'} onClick={() => setRange('5')}>
            5 min
          </button>
          <button aria-pressed={range === 'session'} onClick={() => setRange('session')}>
            session
          </button>
        </span>
      </div>
      <canvas ref={ref} role="img" aria-label="Chart: heart rate in pink, music tempo in blue" />
    </div>
  );
}
