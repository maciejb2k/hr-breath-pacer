import { useEffect, useRef } from 'react';
import { vis } from '../core/visual';

// Full-screen night sky behind the app: an aurora that rises and warms on the inhale,
// settles and cools on the exhale, and glows faintly with each heartbeat. Raw WebGL,
// rendered at reduced resolution and ~30 fps to stay light on phones.

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLevel;
uniform float uBeat;
uniform float uFade;
uniform float uGlow;

const vec3 INK = vec3(0.039, 0.067, 0.133);
const vec3 DAWN = vec3(0.914, 0.706, 0.498);
const vec3 DUSK = vec3(0.494, 0.639, 0.831);
const vec3 VIOLET = vec3(0.420, 0.365, 0.720);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime * 0.025;

  // sky gradient: deep ink at the top, a touch of blue towards the horizon
  vec3 col = mix(INK * 1.25 + vec3(0.0, 0.012, 0.03), INK * 0.7, uv.y);

  // aurora curtains: vertical folds warped by noise
  float warp = fbm(vec2(p.x * 0.9 + t, p.y * 0.5 - t * 0.6));
  float folds = fbm(vec2(p.x * 2.6 - t * 1.4 + warp * 1.6, p.y * 0.8 + t * 0.3));
  float curtain = smoothstep(0.34, 0.72, folds);
  // fine vertical rays inside the curtains
  float rays = 0.65 + 0.35 * noise(vec2(p.x * 38.0 + warp * 6.0, t * 4.0));
  // the aurora's crest climbs with the inhale
  float crest = mix(0.45, 0.85, uLevel);
  float body = smoothstep(0.02, crest * 0.55, uv.y) * (1.0 - smoothstep(crest - 0.12, crest + 0.25, uv.y));
  vec3 tint = mix(DUSK, DAWN, clamp(uLevel * 1.15 - 0.08 + (warp - 0.5) * 0.6, 0.0, 1.0));
  tint = mix(tint, VIOLET, smoothstep(0.5, 0.95, uv.y) * 0.65);
  // kept low and with a small range between exhale and inhale: the sky is a backdrop,
  // it must never flash or out-shine the breath light (uBeat only a hint, no flicker)
  float glow = curtain * rays * body * (0.44 + 0.18 * uLevel + 0.03 * uBeat);
  col += tint * glow * uGlow;

  // soft light from below the horizon
  col += tint * 0.06 * pow(1.0 - uv.y, 2.2) * (0.6 + 0.4 * uLevel);

  // stars: small soft points at random spots in a coarse grid, twinkling,
  // fading where the aurora is bright
  vec2 gs = gl_FragCoord.xy / 7.0;
  vec2 id = floor(gs);
  float s = hash(id);
  vec2 off = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
  float d = length(fract(gs) - 0.5 - off * 0.6);
  float twinkle = 0.5 + 0.5 * sin(uTime * (0.5 + s * 2.0) + s * 60.0);
  float star = step(0.975, s) * smoothstep(0.16, 0.0, d) * twinkle * smoothstep(0.2, 0.8, uv.y) * (1.0 - glow * 2.0);
  col += vec3(0.82, 0.86, 1.0) * max(star, 0.0) * 0.7;

  // vignette
  col *= 1.0 - 0.38 * pow(length(uv - vec2(0.5, 0.55)), 1.6);
  gl_FragColor = vec4(col * uFade, 1.0);
}
`;

const SCALE = 0.5; // render at half resolution — the sky is soft anyway

export function NightSky({ running, glow }: { running: boolean; glow: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const runningRef = useRef(running);
  runningRef.current = running;
  const glowRef = useRef(glow);
  glowRef.current = glow;

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return; // no WebGL: the plain ink background stays

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u('uRes');
    const uTime = u('uTime');
    const uLevel = u('uLevel');
    const uBeat = u('uBeat');
    const uFade = u('uFade');
    const uGlow = u('uGlow');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const born = performance.now();
    let raf = 0;
    let last = 0;
    let level = 0.15;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return; // ~30 fps is plenty for a slow sky
      last = now;
      const w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      level += (vis.level - level) * 0.04; // slow follow: colour shifts glide, never jump
      const beat = runningRef.current ? Math.exp(-(now - vis.lastBeat) / 260) * vis.beatVel : 0;
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, reduced ? 0 : now / 1000);
      gl.uniform1f(uLevel, level);
      gl.uniform1f(uBeat, beat);
      // the one entrance moment: the sky rises out of the dark
      gl.uniform1f(uFade, Math.min(1, (now - born) / 2600));
      gl.uniform1f(uGlow, glowRef.current * 1.4);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    // no loseContext() here: StrictMode re-runs this effect on the same canvas
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <canvas ref={ref} className="sky" aria-hidden />
      {/* veil between the sky and the content: darker behind the light and the readings */}
      <div className="sky-veil" aria-hidden />
    </>
  );
}
