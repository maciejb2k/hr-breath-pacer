// The session as a media notification (lock screen, notification shade), like a music player.
// Android shows one only while an <audio> element plays, and Web Audio alone doesn't count,
// so a silent loop plays alongside the music. The music itself keeps its own path to the
// speakers: routing it through the element would add latency and risk the old crackling.

export interface MediaInfo {
  title: string;
  status: string;
}

let el: HTMLAudioElement | null = null;
let ours = false; // pauses we cause ourselves are not "the system paused us"

/** 10 s of 8 kHz silence as a WAV; Chrome skips the notification for media under 5 s */
function silentWav(): string {
  const rate = 8000;
  const n = rate * 10;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true); // 8-bit: silence is 128
  str(36, 'data');
  v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * Shows the notification and keeps it until hide(). onEnd: its button was pressed,
 * or the system paused the media (a call, headphones unplugged).
 */
export async function show(info: MediaInfo, onEnd: () => void) {
  if (!('mediaSession' in navigator)) return;
  if (!el) {
    el = new Audio(silentWav());
    el.loop = true;
    el.addEventListener('pause', () => {
      if (!ours) onEndRef();
    });
  }
  onEndRef = onEnd;
  update(info);
  navigator.mediaSession.setActionHandler('pause', () => onEndRef());
  navigator.mediaSession.setActionHandler('stop', () => onEndRef());
  try {
    ours = false;
    await el.play();
    navigator.mediaSession.playbackState = 'playing';
  } catch (err) {
    console.warn('Media notification unavailable:', (err as Error)?.message);
  }
}
let onEndRef: () => void = () => {};

export function update(info: MediaInfo) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: info.title,
    artist: info.status,
    artwork: [
      { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
}

export function hide() {
  if (!('mediaSession' in navigator)) return;
  if (el && !el.paused) {
    ours = true;
    el.pause();
  }
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = 'none';
  navigator.mediaSession.setActionHandler('pause', null);
  navigator.mediaSession.setActionHandler('stop', null);
}
