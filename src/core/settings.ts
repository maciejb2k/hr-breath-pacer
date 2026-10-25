export type BreathMode = 'sync' | 'fixed';
export type BreathPattern = '4:6' | '4:7' | '4:8' | 'prog';
export type CueKind = 'ping' | 'double' | 'kalimba' | 'glass' | 'bowl' | 'wood' | 'gong' | 'deep' | 'glide' | 'none';
export type ExhaleTexture = 'air' | 'sigh' | 'hum' | 'airhum' | 'none';
export type VolumeKey = 'drone' | 'heart' | 'bowl' | 'breath' | 'cues' | 'inhale' | 'master';

export interface Settings {
  alpha: number;
  offset: number;
  minBPM: number;
  rsaDepth: number;
  breathMode: BreathMode;
  breathPattern: BreathPattern;
  exhaleSound: ExhaleTexture;
  inhaleCue: CueKind;
  inhalePitch: number;
  exhaleCue: CueKind;
  exhalePitch: number;
  bowlInterval: '1m' | '2m';
  bowlProb: number;
  timerMinutes: number;
  /** aurora brightness behind the app, 0 = plain night, 1 = brightest */
  skyGlow: number;
  /** during a session, fade everything but the breath light after a few idle seconds */
  autoDim: boolean;
  vols: Record<VolumeKey, number>;
}

// The user's own tuned settings are the defaults.
export const DEFAULT_SETTINGS: Settings = {
  alpha: 0.3,
  offset: 5,
  minBPM: 50,
  rsaDepth: 0.08,
  breathMode: 'fixed',
  breathPattern: '4:6',
  exhaleSound: 'airhum',
  inhaleCue: 'double',
  inhalePitch: -7,
  exhaleCue: 'double',
  exhalePitch: 0,
  bowlInterval: '1m',
  bowlProb: 1,
  timerMinutes: 0,
  skyGlow: 0.6,
  autoDim: false,
  vols: { drone: -2, heart: -6, bowl: -25, breath: 0, cues: -6, inhale: -6, master: 0 },
};

/** true when every listed setting still has its default value */
export function isDefault(s: Settings, keys: (keyof Settings)[]) {
  return keys.every((k) => JSON.stringify(s[k]) === JSON.stringify(DEFAULT_SETTINGS[k]));
}

const KEY = 'hrBreathPacer.settings';

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved) return structuredClone(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...saved, vols: { ...DEFAULT_SETTINGS.vols, ...saved.vols } };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}

// [inhale units, exhale units]; 'prog' stretches the exhale 6 → 8 over the first 15 minutes
export function breathUnits(pattern: BreathPattern, sessionMs: number | null): [number, number] {
  if (pattern === 'prog') {
    const p = sessionMs == null ? 0 : Math.min(1, sessionMs / (15 * 60000));
    return [4, Math.round(6 + 2 * p)];
  }
  const [a, b] = pattern.split(':').map(Number);
  return [a, b];
}
