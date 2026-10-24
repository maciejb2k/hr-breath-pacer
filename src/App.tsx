import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { controller, useController, type Snapshot } from './core/controller';
import { BreathLight } from './components/BreathLight';
import { NightSky } from './components/NightSky';
import { SettingsDock, SettingsSheet } from './components/SettingsSheet';
import { Trend } from './components/Trend';
import { breathUnits } from './core/settings';

const DIM_AFTER_MS = 10000;

function clock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function SourceStatus({ snap }: { snap: Snapshot }) {
  const { sim, ble } = snap;
  if (sim.enabled) return <span><i className="dot warn" />Simulated heart rate</span>;
  if (ble.state === 'connected') {
    return ble.stale
      ? <span><i className="dot warn" />{ble.deviceName}: no new readings</span>
      : <span><i className="dot ok" />{ble.deviceName}</span>;
  }
  if (ble.state === 'nocontact') return <span><i className="dot warn" />{ble.deviceName}: sensor not touching your skin</span>;
  if (ble.state === 'reconnecting') return <span><i className="dot bad" />Reconnecting to the smartwatch</span>;
  if (ble.state === 'connecting') return <span><i className="dot warn" />Connecting to the smartwatch</span>;
  return <span><i className="dot" />No heart rate source</span>;
}

function sessionLine(snap: Snapshot) {
  if (snap.message) return snap.message.text;
  if (!snap.running && !snap.sim.enabled && snap.ble.state === 'off') {
    return snap.ble.supported
      ? 'Your smartwatch or chest strap must share heart rate over Bluetooth (the standard Heart Rate profile).'
      : snap.ble.reason;
  }
  if (!snap.running && !snap.sync.ready) {
    if (snap.ble.state === 'nocontact') return 'The smartwatch can’t feel your pulse. Wear it a little tighter, sensor against your skin.';
    return 'One moment while your heart rate settles, so the music starts at the right tempo.';
  }
  if (!snap.running || !snap.sessionStart) return '';
  let line = `Session running for ${clock(snap.now - snap.sessionStart)}`;
  if (snap.sessionStartHR != null && snap.smoothedHR != null) {
    const d = Math.round(snap.smoothedHR - snap.sessionStartHR);
    if (d < 0) line += `, heart rate down ${-d}`;
    else if (d > 0) line += `, heart rate up ${d}`;
  }
  return line + '.';
}

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

const DOCK_KEY = 'hrBreathPacer.dockOpen';
function readDockPref() {
  try {
    return localStorage.getItem(DOCK_KEY) !== '0';
  } catch {
    return true;
  }
}

export default function App() {
  const snap = useController();
  const wide = useMediaQuery('(min-width: 1100px)');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dockOpen, setDockOpenState] = useState(readDockPref);
  const setDockOpen = (v: boolean) => {
    setDockOpenState(v);
    try {
      localStorage.setItem(DOCK_KEY, v ? '1' : '0');
    } catch {
      /* per-viewer convenience only */
    }
  };
  const docked = wide && dockOpen;
  const settingsOpen = sheetOpen;
  const setSettingsOpen = (v: boolean) => (wide ? setDockOpen(v) : setSheetOpen(v));
  const [dim, setDim] = useState(false);
  const autoDim = snap.settings.autoDim;
  const lastTouch = useRef(Date.now());

  // During a session the interface fades out after a while; any touch brings it back.
  useEffect(() => {
    const wake = () => {
      lastTouch.current = Date.now();
      setDim(false);
    };
    const events = ['pointerdown', 'keydown', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    const id = window.setInterval(() => {
      setDim(autoDim && snap.running && !settingsOpen && Date.now() - lastTouch.current > DIM_AFTER_MS);
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, wake));
      window.clearInterval(id);
    };
  }, [snap.running, settingsOpen, autoDim]);

  const connecting = snap.ble.state === 'connecting';
  const hasSource = snap.sim.enabled || snap.ble.state !== 'off';
  const needsSource = !snap.running && !hasSource;
  const warming = !snap.running && hasSource && !snap.sync.ready;
  const heart = snap.smoothedHR;
  const music = snap.musicBPM ?? snap.targetBPM;
  let bridge = 'Heart rate and music tempo';
  if (heart != null && music != null) {
    const diff = Math.round(heart - music);
    bridge = diff >= 1 ? `music is ${diff} BPM slower than your heart` : 'music in step with your heart';
  }

  return (
    <>
    <NightSky running={snap.running} glow={snap.settings.skyGlow} />
    <div className="app" data-dim={dim} data-docked={docked}>
      <div className="main">
      <header className="topbar chrome">
        <h1 className="wordmark">HR Breath Pacer</h1>
        <div className="status" aria-live="polite">
          <SourceStatus snap={snap} />
          {snap.running && snap.timer.endAt != null && <span>Ends in {clock(snap.timer.endAt - snap.now)}</span>}
        </div>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} hidden={docked}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M2 4h7M12 4h2M2 12h2M7 12h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="10.5" cy="4" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="5.5" cy="12" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          Settings
        </button>
      </header>

      <main className="stage">
        <BreathLight
          running={snap.running}
          units={breathUnits(snap.settings.breathPattern, snap.running && snap.sessionStart ? snap.now - snap.sessionStart : null)}
        />
      </main>

      <div className="chrome">
        <section className="gap" aria-label="Heart rate and music tempo">
          <div className="reading heart">
            <span className="what">heart</span>
            <span className="num">{heart == null ? '–' : Math.round(heart)}</span>
            <span className="sub">
              {snap.rawHR != null && heart != null && snap.rawHR !== Math.round(heart) ? `now ${snap.rawHR}` : ' '}
            </span>
          </div>
          <Trend sessionStart={snap.sessionStart} running={snap.running} caption={bridge} />
          <div className="reading music right">
            <span className="what">music</span>
            <span className="num">{music == null ? '–' : Math.round(music)}</span>
            <span className="sub">{snap.running ? ' ' : 'plays once you start'}</span>
          </div>
        </section>

        <div className="controls">
          {needsSource ? (
            // first step: without a heart-rate source the app has nothing to follow
            <>
              {snap.ble.supported && (
                <button className="start" disabled={connecting} onClick={() => controller.connectBle()}>
                  {connecting ? 'Connecting to the smartwatch…' : 'Connect your smartwatch'}
                </button>
              )}
              <button
                className={snap.ble.supported ? 'link-btn' : 'start'}
                onClick={() => controller.setSim(true)}
              >
                {snap.ble.supported ? 'No smartwatch? Simulate a heart rate' : 'Simulate a heart rate'}
              </button>
            </>
          ) : warming ? (
            // the source is there but still warming up: progress instead of a button
            <div
              className="start sync"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={snap.sync.needed}
              aria-valuenow={snap.sync.count}
              style={{ '--p': snap.sync.count / snap.sync.needed } as CSSProperties}
            >
              <span className="sync-fill" aria-hidden />
              <span className="sync-label">
                {snap.ble.state === 'connecting' || snap.ble.state === 'reconnecting'
                  ? 'Connecting to the smartwatch…'
                  : snap.ble.state === 'nocontact'
                    ? 'Waiting for a heart rate…'
                    : `Syncing heart rate ${snap.sync.count} / ${snap.sync.needed}`}
              </span>
            </div>
          ) : (
            <button
              className="start"
              data-running={snap.running}
              disabled={snap.starting}
              onClick={() => controller.toggle()}
            >
              {snap.running ? 'End session' : snap.starting ? 'Starting…' : 'Start session'}
            </button>
          )}
          <p className={`meta${snap.message?.error ? ' error' : ''}`} role="status">
            {sessionLine(snap)}
          </p>
        </div>
      </div>
      </div>

      {docked && <SettingsDock snap={snap} onHide={() => setDockOpen(false)} />}
    </div>
    {!wide && <SettingsSheet snap={snap} open={sheetOpen} onOpenChange={setSheetOpen} />}
    </>
  );
}
