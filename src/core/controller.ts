import { useSyncExternalStore } from 'react';
import { AudioEngine, type PreviewKind } from './audioEngine';
import { HeartRateBle, bleSupport, type BleState, type BleSupport } from './heartRateBle';
import { setLang, t, type Key, type Vars } from '../i18n';
import * as notification from './mediaNotification';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AudioQuality, type Settings, type VolumeKey } from './settings';

const DEFAULT_BPM = 60;
const SIM_ASLEEP_MS = 180000; // 80 → 55 BPM in 3 minutes
const MAX_HISTORY = 6 * 3600; // 6 h at 1 Hz
// readings a new source must deliver before a session may start, so the music
// begins from a settled heart rate instead of the first (often off) value
const SYNC_READINGS = 5;

export interface HistoryPoint {
  t: number;
  raw: number | null;
  hr: number | null;
  bpm: number | null;
}

export interface Message {
  key: Key;
  vars?: Vars;
  error?: boolean;
}

export interface Snapshot {
  settings: Settings;
  running: boolean;
  starting: boolean;
  /** quality the sound is being rendered at right now (a change waits for the next session) */
  audioQuality: AudioQuality | null;
  rawHR: number | null;
  smoothedHR: number | null;
  targetBPM: number | null;
  musicBPM: number | null;
  sessionStart: number | null;
  sessionStartHR: number | null;
  chord: string | null;
  sim: { enabled: boolean; value: number; asleepProgress: number | null };
  ble: { supported: boolean; reason?: BleSupport['reason']; state: BleState; deviceName: string; retryIn: number; stale: boolean };
  wakeLock: 'active' | 'inactive' | 'unsupported';
  timer: { endAt: number | null; fading: boolean };
  /** heart-rate source warm-up: readings received so far / needed; ready = a session may start */
  sync: { count: number; needed: number; ready: boolean };
  /** a one-off message for the status line, translated when shown */
  message: Message | null;
  now: number;
}

class Controller {
  private s: Settings = loadSettings();
  private running = false;
  private starting = false;
  private rawHR: number | null = null;
  private smoothedHR: number | null = null;
  private lastHRAt = 0;
  private syncCount = 0;
  private sessionStart: number | null = null;
  private sessionStartHR: number | null = null;
  private chord: string | null = null;
  private sim = { enabled: false, value: 72, asleepStart: null as number | null, interval: undefined as number | undefined };
  private wakeLock: WakeLockSentinel | null = null;
  private timer = { endAt: null as number | null, fading: false };
  private message: Snapshot['message'] = null;
  readonly history: HistoryPoint[] = [];

  readonly engine = new AudioEngine({
    settings: () => this.s,
    targetBPM: () => this.targetBPM() ?? DEFAULT_BPM,
    sessionMs: () => (this.running && this.sessionStart ? Date.now() - this.sessionStart : null),
  });
  private lastBleState: BleState = 'off';
  readonly ble = new HeartRateBle(
    (hr) => {
      if (!this.sim.enabled) this.onHeartRate(hr);
    },
    () => {
      // a fresh connection (not a reconnect) means a new source: warm up again
      if (this.lastBleState === 'off' && this.ble.state === 'connecting' && !this.sim.enabled) this.resetBaseline();
      this.lastBleState = this.ble.state;
      this.emit();
    },
  );

  private listeners = new Set<() => void>();
  private snap: Snapshot;

  constructor() {
    setLang(this.s.lang);
    this.engine.onChord = (name) => {
      this.chord = name;
      this.emit();
    };
    this.snap = this.build();
    window.setInterval(() => this.tick(), 1000);
    window.setInterval(() => {
      if (this.running) this.emit(); // keeps the live music tempo readout moving
    }, 400);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.running) {
        this.requestWakeLock();
        this.engine.resume();
      }
    });
  }

  // ---------------------------------------------------------------- store plumbing
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private emit() {
    this.snap = this.build();
    this.listeners.forEach((fn) => fn());
  }

  private build(): Snapshot {
    const support = bleSupport();
    return {
      settings: this.s,
      running: this.running,
      starting: this.starting,
      audioQuality: this.engine.quality,
      rawHR: this.rawHR,
      smoothedHR: this.smoothedHR,
      targetBPM: this.targetBPM(),
      musicBPM: this.engine.currentBPM(),
      sessionStart: this.sessionStart,
      sessionStartHR: this.sessionStartHR,
      chord: this.running ? this.chord : null,
      sim: {
        enabled: this.sim.enabled,
        value: this.sim.value,
        asleepProgress: this.sim.asleepStart == null ? null : Math.min(1, (Date.now() - this.sim.asleepStart) / SIM_ASLEEP_MS),
      },
      ble: {
        supported: support.ok,
        reason: support.reason,
        state: this.ble.state,
        deviceName: this.ble.deviceName,
        retryIn: this.ble.retryIn,
        stale: this.ble.state === 'connected' && this.lastHRAt > 0 && Date.now() - this.lastHRAt > 10000,
      },
      wakeLock: !('wakeLock' in navigator) ? 'unsupported' : this.wakeLock ? 'active' : 'inactive',
      timer: { ...this.timer },
      sync: {
        count: Math.min(this.syncCount, SYNC_READINGS),
        needed: SYNC_READINGS,
        ready: (this.sim.enabled || this.ble.state === 'connected') && this.syncCount >= SYNC_READINGS,
      },
      message: this.message,
      now: Date.now(),
    };
  }

  private say(key: Key, vars?: Vars, error = false) {
    this.message = { key, vars, error };
    this.emit();
  }

  // ---------------------------------------------------------------- settings
  update(patch: Partial<Settings>) {
    this.s = { ...this.s, ...patch };
    saveSettings(this.s);
    if ('timerMinutes' in patch) this.armTimer();
    if (patch.lang) setLang(patch.lang);
    if ('mediaNotification' in patch || patch.lang) this.syncNotification(true);
    this.emit();
  }
  setVolume(key: VolumeKey, db: number) {
    this.s = { ...this.s, vols: { ...this.s.vols, [key]: db } };
    saveSettings(this.s);
    this.engine.setVolume(key, db);
    this.emit();
  }

  /** restores the listed settings to their defaults, or every setting when none are given */
  reset(keys?: (keyof Settings)[]) {
    const defaults = structuredClone(DEFAULT_SETTINGS);
    // the language is the viewer's, not a tuning setting: a full reset keeps it
    const patch = keys ? Object.fromEntries(keys.map((k) => [k, defaults[k]])) : { ...defaults, lang: this.s.lang };
    this.s = { ...this.s, ...patch };
    saveSettings(this.s);
    if ('vols' in patch) (Object.keys(this.s.vols) as VolumeKey[]).forEach((k) => this.engine.setVolume(k, this.s.vols[k]));
    if ('timerMinutes' in patch) this.armTimer();
    this.emit();
  }

  /** restores the listed mixer volumes to their defaults */
  resetVolumes(keys: VolumeKey[]) {
    const vols = { ...this.s.vols };
    for (const k of keys) {
      vols[k] = DEFAULT_SETTINGS.vols[k];
      this.engine.setVolume(k, vols[k]);
    }
    this.s = { ...this.s, vols };
    saveSettings(this.s);
    this.emit();
  }

  // ---------------------------------------------------------------- biofeedback
  private targetBPM(): number | null {
    if (this.smoothedHR == null) return null;
    return Math.max(this.s.minBPM, this.smoothedHR - this.s.offset);
  }

  private onHeartRate(raw: number) {
    if (!Number.isFinite(raw) || raw < 25 || raw > 230) return; // 0 = no skin contact on many watches
    this.rawHR = raw;
    this.lastHRAt = Date.now();
    this.syncCount++;
    this.smoothedHR = this.smoothedHR == null ? raw : this.s.alpha * raw + (1 - this.s.alpha) * this.smoothedHR;
    if (this.running && this.sessionStartHR == null) this.sessionStartHR = this.smoothedHR;
    this.emit();
  }

  // ---------------------------------------------------------------- session
  async toggle() {
    if (this.running) this.stop();
    else await this.start();
  }

  async start() {
    if (this.running || this.starting) return;
    this.starting = true;
    this.say('msg.preparing');
    try {
      await this.engine.start();
      this.running = true;
      this.sessionStart = Date.now();
      this.sessionStartHR = this.smoothedHR;
      this.syncNotification(true);
      this.armTimer();
      await this.requestWakeLock();
      this.message =
        this.smoothedHR == null
          ? { key: 'msg.noHR', vars: { bpm: DEFAULT_BPM } }
          : null;
    } catch (err) {
      console.warn(err);
      this.message = { key: 'msg.startFailed', vars: { error: String((err as Error)?.message ?? err) }, error: true };
    } finally {
      this.starting = false;
      this.emit();
    }
  }

  stop(reason: 'user' | 'timer' = 'user') {
    if (!this.running) return;
    this.engine.stop(reason === 'timer' ? 0.5 : 2.5);
    this.running = false;
    this.timer = { endAt: null, fading: false };
    this.releaseWakeLock();
    this.syncNotification(true);
    this.message = reason === 'timer' ? { key: 'msg.timerEnded' } : null;
    this.emit();
  }

  // ---------------------------------------------------------------- media notification
  private notificationShown = false;
  private notificationText = '';
  /** shows, refreshes or hides the media notification to match the session and the setting */
  private syncNotification(force = false) {
    const want = this.running && this.s.mediaNotification;
    if (!want) {
      if (this.notificationShown) notification.hide();
      this.notificationShown = false;
      return;
    }
    const min = Math.floor((Date.now() - (this.sessionStart ?? Date.now())) / 60000);
    const hr = this.smoothedHR == null ? null : Math.round(this.smoothedHR);
    const info = {
      title: t('app.title'),
      status: hr == null ? t('notif.statusNoHR', { min }) : t('notif.status', { min, hr }),
    };
    const key = info.title + info.status;
    if (!this.notificationShown) {
      this.notificationShown = true;
      notification.show(info, () => this.stop());
    } else if (force || key !== this.notificationText) {
      notification.update(info);
    }
    this.notificationText = key;
  }

  async preview(kind: PreviewKind) {
    try {
      await this.engine.preview(kind);
    } catch (err) {
      console.warn(err);
      this.say('msg.playFailed', { error: String((err as Error)?.message ?? err) }, true);
    }
  }

  /** A new heart-rate source starts from scratch: its own baseline, its own warm-up. */
  private resetBaseline() {
    this.syncCount = 0;
    if (this.running) return; // mid-session, keep the tempo steady
    this.smoothedHR = null;
    this.rawHR = null;
  }

  // ---------------------------------------------------------------- watch
  async connectBle() {
    try {
      await this.ble.connect();
      this.message = null;
      this.emit();
    } catch (err) {
      const e = err as DOMException;
      if (e?.name === 'NotFoundError') return; // user closed the picker
      console.warn(err);
      this.say('msg.connectFailed', { error: String(e?.message ?? err) }, true);
    }
  }
  disconnectBle() {
    this.ble.disconnect();
  }

  // ---------------------------------------------------------------- simulation
  setSim(on: boolean) {
    if (on !== this.sim.enabled) this.resetBaseline();
    this.sim.enabled = on;
    window.clearInterval(this.sim.interval);
    this.sim.interval = undefined;
    if (on) {
      this.sim.interval = window.setInterval(() => this.simTick(), 1000);
      this.simTick();
    } else {
      this.sim.asleepStart = null;
    }
    this.emit();
  }
  setSimValue(v: number) {
    this.sim.value = v;
    this.sim.asleepStart = null;
    this.emit();
  }
  toggleAsleep() {
    if (this.sim.asleepStart != null) {
      this.sim.asleepStart = null;
    } else {
      this.sim.value = 80;
      this.sim.asleepStart = Date.now();
      if (!this.sim.enabled) this.setSim(true);
    }
    this.emit();
  }
  private simTick() {
    if (this.sim.asleepStart != null) {
      const p = Math.min(1, (Date.now() - this.sim.asleepStart) / SIM_ASLEEP_MS);
      const eased = 1 - Math.pow(1 - p, 1.6); // falls a bit faster at first, like real sleep onset
      this.sim.value = Math.round(80 + (55 - 80) * eased);
      if (p >= 1) this.sim.asleepStart = null;
    }
    const jitter = (Math.random() - 0.5) * 4 + (Math.random() < 0.05 ? (Math.random() - 0.5) * 12 : 0);
    this.onHeartRate(Math.round(this.sim.value + jitter));
  }

  // ---------------------------------------------------------------- wake lock
  private async requestWakeLock() {
    if (!('wakeLock' in navigator) || this.wakeLock) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
        this.emit();
      });
    } catch (err) {
      console.warn('Wake Lock:', (err as Error)?.message);
    }
    this.emit();
  }
  private releaseWakeLock() {
    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  // ---------------------------------------------------------------- sleep timer
  private armTimer() {
    if (!this.running) return;
    if (this.timer.fading) this.engine.fadeTo(1, 3);
    this.timer = {
      endAt: this.s.timerMinutes > 0 ? Date.now() + this.s.timerMinutes * 60000 : null,
      fading: false,
    };
  }

  private tick() {
    // history for the chart
    if (this.smoothedHR != null || this.running) {
      this.history.push({ t: Date.now(), raw: this.rawHR, hr: this.smoothedHR, bpm: this.engine.currentBPM() });
      if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
    }
    this.syncNotification();
    // sleep timer: fade over the last minute, then stop
    if (this.running && this.timer.endAt != null) {
      const rem = this.timer.endAt - Date.now();
      if (rem <= 0) {
        this.stop('timer');
        return;
      }
      if (rem <= 60000 && !this.timer.fading) {
        this.timer.fading = true;
        this.engine.fadeTo(0, rem / 1000);
      }
    }
    this.emit();
  }
}

export const controller = new Controller();

export function useController(): Snapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}
