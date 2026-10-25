import * as Tone from 'tone';
import { breathUnits, type CueKind, type Settings, type VolumeKey } from './settings';
import { vis } from './visual';

// F lydian / C-major pentatonic colour: Fmaj9 -> Cmaj7 -> Dm9 -> Am7
// bell = inhale cue note, hum = exhale texture (root + fifth)
const CHORDS = [
  { name: 'Fmaj9', notes: ['F2', 'C3', 'E3', 'G3', 'A3'], scale: ['A3', 'C4', 'E4', 'F4', 'G4', 'A4', 'C5', 'E5'], bell: 'C5', hum: ['F2', 'C3'] },
  { name: 'Cmaj7', notes: ['C2', 'G2', 'B2', 'E3', 'G3'], scale: ['G3', 'C4', 'D4', 'E4', 'G4', 'B4', 'D5', 'E5'], bell: 'G4', hum: ['C3', 'G3'] },
  { name: 'Dm9', notes: ['D2', 'A2', 'C3', 'E3', 'F3'], scale: ['A3', 'C4', 'D4', 'E4', 'F4', 'A4', 'C5', 'D5'], bell: 'A4', hum: ['D3', 'A3'] },
  { name: 'Am7', notes: ['A1', 'E2', 'G2', 'C3', 'E3'], scale: ['G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5'], bell: 'E5', hum: ['A2', 'E3'] },
];
type Chord = (typeof CHORDS)[number];

export type PreviewKind = 'in' | 'out' | 'tex' | 'pair';

/** What the engine needs from the rest of the app, read live on every breath. */
export interface EngineHost {
  settings(): Settings;
  /** HR-derived tempo target, or a default before the first reading */
  targetBPM(): number;
  /** ms since the session started (for the progressive breath pattern) */
  sessionMs(): number | null;
}

type Note = string | number;
interface MonoVoice {
  volume: Tone.Param<'decibels'>;
  triggerAttackRelease(note: Note, dur: number, time?: number, vel?: number): unknown;
  triggerRelease(time?: number): unknown;
  connect(dest: Tone.InputNode): unknown;
}

// Fixed round-robin voice pool. Used instead of Tone.PolySynth, whose voice garbage
// collector disposes voices from inside scheduled callbacks and occasionally throws.
function makePool<O>(Voice: new (opts: O) => MonoVoice, opts: O, size: number, volumeDb: number, out: Tone.InputNode) {
  const voices = Array.from({ length: size }, () => {
    const v = new Voice(opts);
    v.volume.value = volumeDb;
    v.connect(out);
    return v;
  });
  let next = 0;
  return {
    trigger(notes: Note | Note[], dur: number, time: number, vel: number) {
      for (const n of ([] as Note[]).concat(notes)) {
        voices[next].triggerAttackRelease(n, dur, time, vel);
        next = (next + 1) % size;
      }
    },
    releaseAll() {
      voices.forEach((v) => v.triggerRelease());
    },
  };
}
type Pool = ReturnType<typeof makePool>;

type Graph = Awaited<ReturnType<typeof buildGraph>>;

async function buildGraph() {
  const T = Tone;
  const bus = new T.Gain(1);
  const masterLP = new T.Filter({ type: 'lowpass', frequency: 3200, rolloff: -12, Q: 0.5 });
  const master = new T.Volume(0);
  const fade = new T.Gain(0);
  const limiter = new T.Limiter(-3);
  bus.chain(masterLP, master, fade, limiter, T.getDestination());

  const reverb = new T.Reverb({ decay: 8, preDelay: 0.06, wet: 1 });
  const reverbLP = new T.Filter({ type: 'lowpass', frequency: 2400, rolloff: -12 });
  reverb.chain(reverbLP, bus);
  await reverb.generate();

  function makeLayer(dry: number, send: number) {
    const vol = new T.Volume(0);
    const dryGain = new T.Gain(dry);
    const sendGain = new T.Gain(send);
    vol.connect(dryGain);
    dryGain.connect(bus);
    vol.connect(sendGain);
    sendGain.connect(reverb);
    return vol;
  }

  // 1) Ambient drone — independent of BPM; its filter opens on inhale and darkens on exhale
  const droneVol = makeLayer(0.55, 0.8);
  const droneFilter = new T.Filter({ type: 'lowpass', frequency: 380, rolloff: -24, Q: 0.6 });
  droneFilter.connect(droneVol);
  const drone = makePool(T.Synth, {
    oscillator: { type: 'fatsine', count: 3, spread: 22 },
    envelope: { attack: 4, attackCurve: 'sine', decay: 2, sustain: 0.8, release: 6, releaseCurve: 'exponential' },
  } as Partial<Tone.SynthOptions>, 20, -18, droneFilter);

  // 2) Heartbeat pulse — every beat of the music tempo
  const heartVol = makeLayer(1, 0.12);
  const heartLP = new T.Filter({ type: 'lowpass', frequency: 150, rolloff: -24, Q: 0.4 });
  const heart = new T.MembraneSynth({
    pitchDecay: 0.08,
    octaves: 2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.004, decay: 0.55, sustain: 0, release: 0.7 },
  } as Partial<Tone.MembraneSynthOptions>);
  heart.volume.value = 2;
  heart.chain(heartLP, heartVol);

  // 3) Bowls — sparse, random, in the drone's scale
  const bowlVol = makeLayer(0.45, 0.9);
  const bowlLP = new T.Filter({ type: 'lowpass', frequency: 1700, rolloff: -12, Q: 0.3 });
  bowlLP.connect(bowlVol);
  const bowl = makePool(T.FMSynth, {
    harmonicity: 3,
    modulationIndex: 2,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: { attack: 0.03, decay: 3.5, sustain: 0.12, release: 8 },
    modulationEnvelope: { attack: 0.02, decay: 2, sustain: 0.05, release: 4 },
  } as Partial<Tone.FMSynthOptions>, 6, -16, bowlLP);

  // 4) Breath waves — pink noise through a slowly opening/closing lowpass
  const breathVol = makeLayer(0.8, 0.45);
  const noise = new T.Noise({ type: 'pink', volume: -12 });
  const breathLP = new T.Filter({ type: 'lowpass', frequency: 120, rolloff: -24, Q: 0.3 });
  const breathAmp = new T.Gain(0.35);
  noise.chain(breathLP, breathAmp, breathVol);

  // 5) Breath cues: inhale and exhale each have their own layer — a short onset sound that
  //    nails the start of the phase, and for the exhale an optional texture carrying the out-breath.
  const cuesVol = makeLayer(0.7, 0.45);
  const inhaleVol = makeLayer(0.7, 0.5);

  // trim: per-sound level correction in dB, measured so all onsets of one phase are about equally loud
  function makeCueBank(out: Tone.InputNode, trim: Partial<Record<CueKind, number>>) {
    const vol = (kind: CueKind, base: number) => base + (trim[kind] || 0);
    const lp = new T.Filter({ type: 'lowpass', frequency: 2400, rolloff: -12 });
    lp.connect(out);
    const sine = { type: 'sine' as const };
    const fm = (o: object) => o as Partial<Tone.FMSynthOptions>;
    const membrane = (o: object) => o as Partial<Tone.MembraneSynthOptions>;
    // built on first use: every Tone voice keeps a few nodes running even when silent,
    // so building all of them up front costs a phone dearly for sounds nobody picked
    const factories: Record<string, () => Pool> = {
      ping: () => makePool(T.Synth, { oscillator: sine, envelope: { attack: 0.005, decay: 1.6, sustain: 0, release: 1.5 } } as Partial<Tone.SynthOptions>, 4, vol('ping', -14), lp),
      kalimba: () => makePool(T.FMSynth, fm({
        harmonicity: 4, modulationIndex: 3, oscillator: sine, modulation: sine,
        envelope: { attack: 0.003, decay: 0.9, sustain: 0, release: 0.8 },
        modulationEnvelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 },
      }), 3, vol('kalimba', -14), lp),
      glass: () => makePool(T.FMSynth, fm({
        harmonicity: 5.4, modulationIndex: 1.2, oscillator: sine, modulation: sine,
        envelope: { attack: 0.004, decay: 2.4, sustain: 0, release: 2 },
        modulationEnvelope: { attack: 0.004, decay: 1.5, sustain: 0, release: 1 },
      }), 3, vol('glass', -20), lp),
      bowl: () => makePool(T.FMSynth, fm({
        harmonicity: 3, modulationIndex: 1.5, oscillator: sine, modulation: sine,
        envelope: { attack: 0.01, decay: 2.5, sustain: 0.05, release: 5 },
        modulationEnvelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 2 },
      }), 3, vol('bowl', -12), lp),
      wood: () => makePool(T.MembraneSynth, membrane({
        pitchDecay: 0.012, octaves: 1.5, oscillator: sine,
        envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.08 },
      }), 2, vol('wood', -8), lp),
      gong: () => makePool(T.FMSynth, fm({
        harmonicity: 1.41, modulationIndex: 3.5, oscillator: sine, modulation: sine,
        envelope: { attack: 0.03, decay: 4, sustain: 0, release: 4 },
        modulationEnvelope: { attack: 0.03, decay: 2.5, sustain: 0, release: 3 },
      }), 3, vol('gong', -10), lp),
      deep: () => makePool(T.MembraneSynth, membrane({
        pitchDecay: 0.25, octaves: 0.7, oscillator: sine,
        envelope: { attack: 0.02, decay: 2.2, sustain: 0, release: 1.5 },
      }), 2, vol('deep', -4), lp),
    };
    const pools: Record<string, Pool> = {};
    const pool = (kind: string) => (pools[kind] ??= factories[kind]());
    // soft tone gliding a fourth up (inhale) or down (exhale) onto the chord note
    let glideVoices: Tone.Synth[] = [];
    const makeGlideVoices = () => Array.from({ length: 3 }, () => {
      const v = new T.Synth({
        oscillator: { type: 'fatsine', count: 2, spread: 8 },
        envelope: { attack: 0.5, attackCurve: 'sine', decay: 1.2, sustain: 0.4, release: 1.8 },
      } as Partial<Tone.SynthOptions>);
      v.volume.value = vol('glide', -17);
      v.connect(lp);
      return v;
    });
    let glideIdx = 0;
    function glide(f1: number, time: number, dur: number, up: boolean) {
      if (!glideVoices.length) glideVoices = makeGlideVoices();
      const v = glideVoices[glideIdx++ % glideVoices.length];
      const f0 = f1 * Math.pow(2, (up ? -5 : 5) / 12);
      v.triggerAttackRelease(f0, Math.min(2.5, dur * 0.6), time, 0.7);
      v.frequency.setValueAtTime(f0, time);
      v.frequency.exponentialRampToValueAtTime(f1, time + Math.min(1.6, dur * 0.45));
    }
    return {
      play(kind: CueKind, time: number, f: number, dur: number, up: boolean) {
        const step = Math.pow(2, (up ? 7 : -5) / 12); // up a fifth / down a fourth
        switch (kind) {
          case 'ping': pool('ping').trigger(f, 1.2, time, 0.8); break;
          case 'double':
            pool('ping').trigger(f, 0.8, time, 0.7);
            pool('ping').trigger(f * step, 1.2, time + 0.22, 0.65);
            break;
          case 'kalimba': pool('kalimba').trigger(f, 0.6, time, 0.8); break;
          case 'glass': pool('glass').trigger(f * 2, 1.5, time, 0.6); break;
          case 'bowl': pool('bowl').trigger(f, 1.5, time, 0.7); break;
          case 'wood': pool('wood').trigger(f, 0.1, time, 0.8); break;
          case 'gong': pool('gong').trigger(f / 2, 2, time, 0.8); break;
          case 'deep': pool('deep').trigger(f / 2, 1.5, time, 0.9); break;
          case 'glide': glide(f, time, dur, up); break;
        }
      },
      releaseAll() {
        Object.values(pools).forEach((p) => p.releaseAll());
        glideVoices.forEach((v) => v.triggerRelease());
      },
    };
  }
  const inBank = makeCueBank(inhaleVol, { ping: 0, kalimba: 7, glass: 12, bowl: 3, wood: 5, glide: -1.5 });
  const outBank = makeCueBank(cuesVol, { ping: 5, gong: 5.5, deep: -12, bowl: 9.5, kalimba: 10, wood: -6, glide: 4.5 });

  const humFilter = new T.Filter({ type: 'lowpass', frequency: 300, rolloff: -24, Q: 1.5 });
  humFilter.connect(cuesVol);
  const hum = makePool(T.Synth, {
    oscillator: { type: 'fattriangle', count: 2, spread: 14 },
    envelope: { attack: 0.35, attackCurve: 'sine', decay: 1.5, sustain: 0.6, release: 2.5 },
  } as Partial<Tone.SynthOptions>, 6, -17, humFilter);

  // Air release ("hhhfff"): dark noise through a wide band-pass drifting down
  const airNoise = new T.Noise({ type: 'pink', volume: -4 });
  const airBP = new T.Filter({ type: 'bandpass', frequency: 1200, Q: 0.5 });
  const airLP = new T.Filter({ type: 'lowpass', frequency: 1800, rolloff: -24 });
  const airGain = new T.Gain(0);
  airNoise.chain(airBP, airLP, airGain, cuesVol);

  // Sigh ("haaa"): pink noise through two vowel formants gliding down
  const sighNoise = new T.Noise({ type: 'pink', volume: 4 });
  const sighF1 = new T.Filter({ type: 'bandpass', frequency: 750, Q: 4 });
  const sighF2 = new T.Filter({ type: 'bandpass', frequency: 1200, Q: 5 });
  const sighF2Gain = new T.Gain(0.55);
  const sighGain = new T.Gain(0);
  sighNoise.fan(sighF1, sighF2);
  sighF1.connect(sighGain);
  sighF2.chain(sighF2Gain, sighGain);
  sighGain.connect(cuesVol);

  const layers: Record<Exclude<VolumeKey, 'master'>, Tone.Volume> = {
    drone: droneVol, heart: heartVol, bowl: bowlVol, breath: breathVol, cues: cuesVol, inhale: inhaleVol,
  };

  return {
    master, fade, layers, drone, heart, heartLP, bowl, noise, breathLP, breathAmp, droneFilter,
    inBank, outBank, hum, humFilter, airNoise, airBP, airGain, sighNoise, sighF1, sighF2, sighGain,
  };
}

// Envelope: gentle linear swell to the peak, then a long, slow release across the whole exhale
function exhaleEnvelope(gainParam: Tone.Param<'gain'>, time: number, dur: number, peak: number, attack: number) {
  gainParam.cancelScheduledValues(time);
  gainParam.setValueAtTime(0, time);
  gainParam.linearRampToValueAtTime(peak, time + attack);
  gainParam.setTargetAtTime(0, time + attack, Math.max(0.5, (dur - attack) / 2.5));
}
function sweep(param: Tone.Param<'frequency'> | Tone.Signal<'frequency'>, time: number, dur: number, from: number, to: number) {
  param.cancelScheduledValues(time);
  param.setValueAtTime(from, time);
  param.exponentialRampToValueAtTime(to, time + dur);
}

export class AudioEngine {
  private g: Graph | null = null;
  private building: Promise<void> | null = null;
  private running = false;
  private stopToken = 0;
  private previewToken = 0;
  private chord: Chord = CHORDS[0];
  private chordIdx = 0;
  private chordTimeout: number | null = null;
  private br = { phase: 'out' as 'in' | 'out', left: 0, start: 0, dur: 1 };

  // Tone.Transport tempo automation is not used: overlapping linear bpm ramps make Tone's
  // tick math return NaN, which permanently breaks the Transport (and its automation
  // timeline is capped at 1000 events, too few for an hour of per-breath ramps).
  // Instead the tempo is a plain linear ramp and beats are scheduled ahead on the audio clock.
  private tempo = { from: 60, to: 60, t0: 0, t1: 0 };
  private nextBeat: number | null = null;
  private beatIdx = 0;
  private nextSecond: number | null = null;

  /** called with the chord name when the drone changes chord */
  onChord: (name: string) => void = () => {};

  constructor(private host: EngineHost) {}

  get isRunning() {
    return this.running;
  }

  private async ensureGraph(): Promise<Graph> {
    if (!this.building) {
      // 'playback' asks the browser for large audio buffers. With Tone's default
      // 'interactive' hint, Android Chrome renders in tiny buffers and this graph
      // (long reverb, many voices) underruns: every sound turns into crackle.
      // Latency doesn't matter here, the music is scheduled ahead anyway.
      // Phones also render at half the usual sample rate: the master lowpass sits at 3.2 kHz,
      // so nothing audible lives above 12 kHz and the halved DSP load is free.
      const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
      const ctx = new AudioContext({ latencyHint: 'playback', ...(mobile && { sampleRate: 24000 }) });
      Tone.setContext(new Tone.Context({ context: ctx, lookAhead: 0.15 }));
    }
    await Tone.start();
    if (!this.building) {
      this.building = buildGraph().then((g) => {
        this.g = g;
        this.applyAllVolumes();
        Tone.getContext().setInterval(() => this.schedule(), 0.05);
      });
    }
    await this.building;
    return this.g!;
  }

  // ---------------------------------------------------------------- volumes
  setVolume(key: VolumeKey, db: number) {
    if (!this.g) return;
    const node = key === 'master' ? this.g.master : this.g.layers[key];
    node.mute = db <= -40;
    if (db > -40) node.volume.rampTo(db, 0.15);
  }
  private applyAllVolumes() {
    const vols = this.host.settings().vols;
    (Object.keys(vols) as VolumeKey[]).forEach((k) => this.setVolume(k, vols[k]));
  }

  // ---------------------------------------------------------------- tempo
  bpmAt(t: number) {
    const { from, to, t0, t1 } = this.tempo;
    if (t >= t1) return to;
    if (t <= t0) return from;
    return from + ((to - from) * (t - t0)) / (t1 - t0);
  }
  /** current music tempo, or null when silent */
  currentBPM(): number | null {
    return this.running ? this.bpmAt(Tone.now()) : null;
  }
  private rampTempo(goal: number, dur: number, time: number) {
    this.tempo = { from: this.bpmAt(time), to: goal, t0: time, t1: time + Math.max(0.01, dur) };
  }

  // ---------------------------------------------------------------- session
  async start() {
    const g = await this.ensureGraph();
    this.stopToken++;
    const now = Tone.now();
    const bpm = this.host.targetBPM();
    this.tempo = { from: bpm, to: bpm, t0: 0, t1: 0 };
    this.nextBeat = null;
    this.beatIdx = 0;
    this.nextSecond = null;
    this.br = { phase: 'out', left: 0, start: 0, dur: 1 };
    const resets: [Tone.Param<any> | Tone.Signal<any>, number][] = [
      [g.breathLP.frequency, 120], [g.breathAmp.gain, 0.2], [g.droneFilter.frequency, 380],
      [g.heartLP.frequency, 140], [g.airGain.gain, 0], [g.sighGain.gain, 0],
    ];
    for (const [param, v] of resets) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(v, now);
    }
    g.fade.gain.cancelScheduledValues(now);
    g.fade.gain.setValueAtTime(g.fade.gain.getValueAtTime(now), now);
    g.fade.gain.linearRampTo(1, 6, now);
    for (const n of [g.noise, g.airNoise, g.sighNoise]) if (n.state !== 'started') n.start(now);
    this.stopChords();
    this.nextChord();
    this.running = true;
  }

  stop(fadeSec = 2.5) {
    const g = this.g;
    if (!this.running || !g) return;
    this.running = false;
    const token = ++this.stopToken;
    const now = Tone.now();
    g.fade.gain.cancelScheduledValues(now);
    g.fade.gain.setValueAtTime(g.fade.gain.getValueAtTime(now), now);
    g.fade.gain.linearRampTo(0, fadeSec, now);
    this.stopChords();
    vis.phase = 'idle';
    window.setTimeout(() => {
      if (token !== this.stopToken) return; // restarted meanwhile
      g.noise.stop();
      g.airNoise.stop();
      g.sighNoise.stop();
      g.drone.releaseAll();
      g.bowl.releaseAll();
      g.hum.releaseAll();
      g.inBank.releaseAll();
      g.outBank.releaseAll();
    }, fadeSec * 1000 + 150);
  }

  /** linear fade of the whole output (sleep timer); 1 restores */
  fadeTo(level: number, seconds: number) {
    if (!this.g) return;
    const now = Tone.now();
    const p = this.g.fade.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.getValueAtTime(now), now);
    p.linearRampTo(level, seconds, now);
  }

  resume() {
    if (!this.g) return;
    if (Tone.getContext().state !== 'running') Tone.getContext().resume();
  }

  // ---------------------------------------------------------------- preview (▶ buttons)
  async preview(which: PreviewKind) {
    const g = await this.ensureGraph();
    const now = Tone.now();
    const t = now + 0.08;
    if (!this.running) {
      // outside a session the output is faded out and the exhale noises are stopped:
      // open them just for the preview, then close again
      const token = ++this.previewToken;
      g.fade.gain.cancelScheduledValues(now);
      g.fade.gain.setValueAtTime(1, now);
      for (const n of [g.airNoise, g.sighNoise]) if (n.state !== 'started') n.start(now);
      const total = which === 'pair' ? 11 : which === 'tex' ? 7 : 4;
      window.setTimeout(() => {
        if (token !== this.previewToken || this.running) return;
        g.fade.gain.linearRampTo(0, 0.5);
        window.setTimeout(() => {
          if (token !== this.previewToken || this.running) return;
          g.airNoise.stop();
          g.sighNoise.stop();
        }, 700);
      }, total * 1000);
    }
    if (which === 'in' || which === 'pair') this.inhaleCueAt(t, 4);
    if (which === 'out') this.exhaleOnsetAt(t, 6);
    if (which === 'tex') this.exhaleTextureAt(t, 6);
    if (which === 'pair') this.exhaleCueAt(t + 4, 6);
  }

  // ---------------------------------------------------------------- chords
  private nextChord() {
    const g = this.g!;
    const c = CHORDS[this.chordIdx % CHORDS.length];
    this.chordIdx++;
    this.chord = c;
    const hold = 8 + Math.random() * 4; // 8–12 s per chord, wall-clock time
    const t = Tone.now() + 0.05;
    g.drone.trigger(c.notes, hold + 1.5, t, 0.6);
    Tone.getDraw().schedule(() => this.onChord(c.name), t);
    this.chordTimeout = Tone.getContext().setTimeout(() => this.nextChord(), hold);
  }
  private stopChords() {
    if (this.chordTimeout !== null) Tone.getContext().clearTimeout(this.chordTimeout);
    this.chordTimeout = null;
  }

  // ---------------------------------------------------------------- breath cues
  // Onset pitches follow the current chord; the exhale cue is set relative to the inhale one
  private inhaleFreq() {
    return Tone.Frequency(this.chord.bell).toFrequency() * Math.pow(2, this.host.settings().inhalePitch / 12);
  }
  private inhaleCueAt(time: number, dur: number) {
    this.g!.inBank.play(this.host.settings().inhaleCue, time, this.inhaleFreq(), dur, true);
  }
  private exhaleOnsetAt(time: number, dur: number) {
    const s = this.host.settings();
    this.g!.outBank.play(s.exhaleCue, time, this.inhaleFreq() * Math.pow(2, s.exhalePitch / 12), dur, false);
  }
  private exhaleCueAt(time: number, dur: number) {
    this.exhaleOnsetAt(time, dur);
    // the texture starts a moment later so the onset ping always sounds on its own
    const gap = this.host.settings().exhaleCue === 'none' ? 0 : 0.3;
    this.exhaleTextureAt(time + gap, dur - gap);
  }
  private exhaleTextureAt(time: number, dur: number) {
    const g = this.g!;
    const sound = this.host.settings().exhaleSound;
    const attack = Math.min(1.2, dur * 0.22);
    if (sound === 'air' || sound === 'airhum') {
      exhaleEnvelope(g.airGain.gain, time, dur, 0.7, attack);
      sweep(g.airBP.frequency, time, dur, 1300, 280);
    }
    if (sound === 'sigh') {
      exhaleEnvelope(g.sighGain.gain, time, dur, 0.9, attack);
      sweep(g.sighF1.frequency, time, dur, 800, 450);
      sweep(g.sighF2.frequency, time, dur, 1250, 850);
    }
    if (sound === 'hum' || sound === 'airhum') {
      sweep(g.humFilter.frequency, time, dur, 950, 170);
      g.hum.trigger(this.chord.hum, dur * 0.8, time, sound === 'hum' ? 0.9 : 0.6);
    }
  }

  // ---------------------------------------------------------------- breath pacer
  // Everything audible is anchored to the exact start of each phase,
  // so the onset of inhale and exhale can be heard immediately while lying down.
  private startBreathPhase(time: number, inhale: boolean, dur: number, goalBPM: number) {
    const g = this.g!;
    this.br.phase = inhale ? 'in' : 'out';
    this.br.start = time;
    this.br.dur = dur;
    const end = time + dur;
    const f = g.breathLP.frequency;
    const gn = g.breathAmp.gain;
    if (inhale) {
      // inhale: barely-there, slowly gathering wave
      f.exponentialRampTo(280, dur, time);
      gn.linearRampTo(0.4, dur, time);
      g.droneFilter.frequency.exponentialRampTo(430, dur, time);
      g.heartLP.frequency.linearRampTo(140, dur, time);
      this.inhaleCueAt(time, dur);
    } else {
      // exhale: the wave rolls over softly at the onset (~1 s), then recedes for the whole exhale
      const swell = Math.min(1, dur * 0.2);
      f.exponentialRampTo(550, swell, time);
      f.exponentialRampToValueAtTime(110, end);
      gn.linearRampTo(0.8, swell, time);
      gn.linearRampToValueAtTime(0.2, end);
      g.droneFilter.frequency.exponentialRampTo(260, dur, time);
      g.heartLP.frequency.linearRampTo(105, dur, time);
      this.exhaleCueAt(time, dur);
    }
    // Tempo settles onto the HR target during inhale and decelerates through every exhale
    this.rampTempo(goalBPM, dur * 0.95, time);
    Tone.getDraw().schedule(() => {
      vis.phase = inhale ? 'in' : 'out';
      vis.phaseStart = performance.now();
      vis.phaseDur = dur * 1000;
    }, time);
  }

  // Called once per unit: a beat ('sync') or a second ('fixed')
  private breathTick(time: number, mode: 'sync' | 'fixed') {
    if (this.br.left > 0) {
      this.br.left--;
      return;
    }
    const s = this.host.settings();
    const [inU, outU] = breathUnits(s.breathPattern, this.host.sessionMs());
    const inhale = this.br.phase !== 'in';
    const units = inhale ? inU : outU;
    this.br.left = units - 1;
    const base = this.host.targetBPM();
    const goal = inhale ? base : base * (1 - s.rsaDepth);
    // in sync mode the beats stretch while the tempo ramps, so use the average tempo
    const cur = this.bpmAt(time);
    const dur = mode === 'sync' ? (units * 60) / ((cur + goal) / 2) : units;
    this.startBreathPhase(time, inhale, dur, goal);
  }

  private onBeat(time: number, i: number) {
    const g = this.g!;
    const s = this.host.settings();
    if (s.breathMode === 'sync') this.breathTick(time, 'sync');
    // pulse: soft and flat on inhale, strongest on the first exhale beat, then fading
    const p = Math.min(1, Math.max(0, (time - this.br.start) / this.br.dur));
    const vel = this.br.phase === 'in' ? 0.52 + 0.08 * p : 0.85 - 0.45 * p;
    g.heart.triggerAttackRelease('G1', 0.15, time, vel);
    Tone.getDraw().schedule(() => {
      vis.lastBeat = performance.now();
      vis.beatVel = vel;
    }, time);

    // sparse bowl every 1 or 2 bars (4/4), first one after one bar;
    // never right after a phase start, so a random bowl can't be mistaken for a breath cue
    const every = s.bowlInterval === '2m' ? 8 : 4;
    const nearCue = time - this.br.start < 1.5;
    if (i >= 4 && i % every === 0 && !nearCue && Math.random() < s.bowlProb) {
      const sc = this.chord.scale;
      const note = sc[Math.floor(Math.random() * sc.length)];
      const t = time + Math.random() * 0.06; // light humanize
      g.bowl.trigger(note, 2.5, t, 0.3 + Math.random() * 0.25);
      Tone.getDraw().schedule(() => {
        vis.lastBowl = performance.now();
      }, t);
    }
  }

  // Look-ahead scheduler on Tone's worker-driven ticker (runs every 50 ms)
  private schedule() {
    if (!this.running) return;
    const now = Tone.now();
    const horizon = now + 0.25;
    // after a stall (e.g. a throttled tab) resync instead of bursting missed beats
    if (this.nextBeat === null || this.nextBeat < now - 0.2) this.nextBeat = now + 0.1;
    while (this.nextBeat < horizon) {
      this.onBeat(this.nextBeat, this.beatIdx++);
      this.nextBeat += 60 / this.bpmAt(this.nextBeat);
    }
    // fixed pacer: one unit per second, independent of the tempo
    if (this.host.settings().breathMode !== 'fixed') {
      this.nextSecond = null;
      return;
    }
    if (this.nextSecond === null || this.nextSecond < now - 0.2) this.nextSecond = now + 0.1;
    while (this.nextSecond < horizon) {
      this.breathTick(this.nextSecond, 'fixed');
      this.nextSecond += 1;
    }
  }
}
