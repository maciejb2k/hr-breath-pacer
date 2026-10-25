import { browserLang, type Lang } from '../i18n';

export type BreathMode = 'sync' | 'fixed';
export type BreathPattern = '4:6' | '4:7' | '4:8' | 'prog';
export type CueKind = 'ping' | 'double' | 'kalimba' | 'glass' | 'bowl' | 'wood' | 'gong' | 'deep' | 'glide' | 'none';
export type ExhaleTexture = 'air' | 'sigh' | 'hum' | 'airhum' | 'none';
export type InhaleTexture = 'air' | 'hum' | 'airhum' | 'none';
export type AudioQuality = 'low' | 'medium' | 'high';

// Sample rate per quality; undefined = the device's own rate (usually 48 kHz).
// Fewer samples per second means less work for the audio thread, and the master
// lowpass at 3.2 kHz leaves little up high to lose.
export const SAMPLE_RATE: Record<AudioQuality, number | undefined> = { low: 24000, medium: 32000, high: undefined };
export const isPhone = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);
// 'inhale' / 'cues' are the inhale / exhale onset cues (key names kept so saved settings carry over),
// 'inhaleTex' / 'exhaleTex' the sounds under each phase
export type VolumeKey = 'drone' | 'heart' | 'bowl' | 'breath' | 'cues' | 'inhale' | 'inhaleTex' | 'exhaleTex' | 'master';

export interface Settings {
  alpha: number;
  offset: number;
  minBPM: number;
  rsaDepth: number;
  breathMode: BreathMode;
  breathPattern: BreathPattern;
  exhaleSound: ExhaleTexture;
  /** sound under the inhale; 'none' by default, the inhale has only its onset cue */
  inhaleSound: InhaleTexture;
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
  /** lower = lighter on the audio thread, against crackling on phones */
  audioQuality: AudioQuality;
  /** during a session, show it as a media notification with a button that ends it */
  mediaNotification: boolean;
  /** interface language; Reset all leaves it alone */
  lang: Lang;
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
  inhaleSound: 'none',
  inhaleCue: 'double',
  inhalePitch: -7,
  exhaleCue: 'double',
  exhalePitch: 0,
  bowlInterval: '1m',
  bowlProb: 1,
  timerMinutes: 0,
  skyGlow: 0.6,
  autoDim: false,
  audioQuality: isPhone ? 'low' : 'high',
  mediaNotification: true,
  lang: browserLang(),
  vols: { drone: -2, heart: -6, bowl: -25, breath: 0, cues: -6, inhale: -6, inhaleTex: -6, exhaleTex: -6, master: 0 },
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
    // 'cues' used to set the exhale cue and the sound under it together: the new texture slider starts there
    const migrated = saved.vols && saved.vols.exhaleTex == null && saved.vols.cues != null ? { exhaleTex: saved.vols.cues } : {};
    return { ...DEFAULT_SETTINGS, ...saved, vols: { ...DEFAULT_SETTINGS.vols, ...migrated, ...saved.vols } };
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
