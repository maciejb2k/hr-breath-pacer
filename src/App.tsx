import { Heartbeat, SlidersHorizontal } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { controller, useController, type Snapshot } from './core/controller';
import { BreathLight } from './components/BreathLight';
import { NightSky } from './components/NightSky';
import { SettingsDock, SettingsSheet } from './components/SettingsSheet';
import { Trend } from './components/Trend';
import { UpdateBar } from './components/UpdateBar';
import { t } from './i18n';
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
  if (sim.enabled) return <span><i className="dot warn" />{t('status.sim')}</span>;
  if (ble.state === 'connected') {
    return ble.stale
      ? <span><i className="dot warn" />{t('status.stale', { name: ble.deviceName })}</span>
      : <span><i className="dot ok" />{ble.deviceName}</span>;
  }
  if (ble.state === 'nocontact') return <span><i className="dot warn" />{t('status.nocontact', { name: ble.deviceName })}</span>;
  if (ble.state === 'reconnecting') return <span><i className="dot bad" />{t('status.reconnecting')}</span>;
  if (ble.state === 'connecting') return <span><i className="dot warn" />{t('status.connecting')}</span>;
  return <span><i className="dot" />{t('status.none')}</span>;
}

/** nothing connected yet: the status line explains what's needed, signed by the author */
const awaitingSource = (snap: Snapshot) => !snap.message && !snap.running && !snap.sim.enabled && snap.ble.state === 'off';

function sessionLine(snap: Snapshot) {
  if (snap.message) return t(snap.message.key, snap.message.vars);
  if (awaitingSource(snap)) {
    if (snap.ble.supported) return t('line.needSource');
    return snap.ble.reason ? t(snap.ble.reason.key, snap.ble.reason.vars) : '';
  }
  if (!snap.running && !snap.sync.ready) return t(snap.ble.state === 'nocontact' ? 'line.nocontact' : 'line.settling');
  if (!snap.running || !snap.sessionStart) return '';
  let line = t('line.running', { time: clock(snap.now - snap.sessionStart) });
  if (snap.sessionStartHR != null && snap.smoothedHR != null) {
    const d = Math.round(snap.smoothedHR - snap.sessionStartHR);
    if (d < 0) line += t('line.hrDown', { n: -d });
    else if (d > 0) line += t('line.hrUp', { n: d });
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
  let bridge = t('gap.caption');
  if (heart != null && music != null) {
    const diff = Math.round(heart - music);
    bridge = diff >= 1 ? t('gap.slower', { n: diff }) : t('gap.inStep');
  }

  return (
    <>
    <NightSky running={snap.running} glow={snap.settings.skyGlow} />
    <div className="app" data-dim={dim} data-docked={docked}>
      <div className="main">
      <header className="topbar chrome">
        <h1 className="wordmark">
          <Heartbeat className="wordmark-icon" size={26} weight="light" aria-hidden />
          {t('app.title')}
        </h1>
        <div className="status" aria-live="polite">
          <SourceStatus snap={snap} />
          {snap.running && snap.timer.endAt != null && <span>{t('status.endsIn', { time: clock(snap.timer.endAt - snap.now) })}</span>}
        </div>
        <button className="icon-btn settings-btn" onClick={() => setSettingsOpen(true)} hidden={docked} aria-label={t('app.settings')}>
          <SlidersHorizontal size={16} weight="regular" aria-hidden />
          <span className="settings-label">{t('app.settings')}</span>
        </button>
      </header>

      <main className="stage">
        <BreathLight
          running={snap.running}
          units={breathUnits(snap.settings.breathPattern, snap.running && snap.sessionStart ? snap.now - snap.sessionStart : null)}
        />
      </main>

      <div className="chrome">
        <section className="gap" aria-label={t('gap.aria')}>
          <div className="reading heart">
            <span className="what">{t('gap.heart')}</span>
            <span className="num">{heart == null ? '–' : Math.round(heart)}</span>
            <span className="sub">
              {snap.rawHR != null && heart != null && snap.rawHR !== Math.round(heart) ? t('gap.now', { n: snap.rawHR }) : ' '}
            </span>
          </div>
          <Trend sessionStart={snap.sessionStart} running={snap.running} caption={bridge} lang={snap.settings.lang} />
          <div className="reading music right">
            <span className="what">{t('gap.music')}</span>
            <span className="num">{music == null ? '–' : Math.round(music)}</span>
            <span className="sub idle-hint">{snap.running ? ' ' : t('gap.playsOnStart')}</span>
          </div>
        </section>

        <div className="controls">
          {needsSource ? (
            // first step: without a heart-rate source the app has nothing to follow
            <>
              {snap.ble.supported && (
                <button className="start" disabled={connecting} onClick={() => controller.connectBle()}>
                  {t(connecting ? 'controls.connecting' : 'controls.connect')}
                </button>
              )}
              <button
                className={snap.ble.supported ? 'link-btn' : 'start'}
                onClick={() => controller.setSim(true)}
              >
                {t(snap.ble.supported ? 'controls.simAlt' : 'controls.sim')}
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
                  ? t('controls.connecting')
                  : snap.ble.state === 'nocontact'
                    ? t('controls.waitingHR')
                    : t('controls.syncing', { count: snap.sync.count, needed: snap.sync.needed })}
              </span>
            </div>
          ) : (
            <button
              className="start"
              data-running={snap.running}
              disabled={snap.starting}
              onClick={() => controller.toggle()}
            >
              {t(snap.running ? 'controls.end' : snap.starting ? 'controls.starting' : 'controls.start')}
            </button>
          )}
          <p className={`meta${snap.message?.error ? ' error' : ''}${awaitingSource(snap) ? ' quiet' : ''}`} role="status">
            {awaitingSource(snap) && <span className="credit">{t('app.credit')} · </span>}
            {sessionLine(snap)}
          </p>
        </div>
      </div>
      </div>

      {docked && <SettingsDock snap={snap} onHide={() => setDockOpen(false)} />}
    </div>
    {!wide && <SettingsSheet snap={snap} open={sheetOpen} onOpenChange={setSheetOpen} />}
    <UpdateBar running={snap.running} />
    </>
  );
}
