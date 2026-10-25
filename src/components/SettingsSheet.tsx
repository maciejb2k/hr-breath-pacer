import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { useState } from 'react';
import { controller, type Snapshot } from '../core/controller';
import { DEFAULT_SETTINGS, isDefault, type BreathMode, type BreathPattern, type CueKind, type ExhaleTexture, type Settings, type VolumeKey } from '../core/settings';
import { GroupAction, GroupHead, PlayButton, SelectField, SliderField, SwitchField, type Option } from './fields';

const INHALE_CUES: Option<CueKind>[] = [
  { value: 'double', label: 'Two tones up' },
  { value: 'ping', label: 'Ping, a clear tone' },
  { value: 'kalimba', label: 'Kalimba' },
  { value: 'glass', label: 'Crystal' },
  { value: 'bowl', label: 'Singing bowl' },
  { value: 'wood', label: 'Woodblock, a short knock' },
  { value: 'glide', label: 'Tone gliding up' },
  { value: 'none', label: 'No sound' },
];
const EXHALE_CUES: Option<CueKind>[] = [
  { value: 'double', label: 'Two tones down' },
  { value: 'ping', label: 'Ping, a clear tone' },
  { value: 'gong', label: 'Soft gong' },
  { value: 'deep', label: 'Deep “boom”' },
  { value: 'bowl', label: 'Low singing bowl' },
  { value: 'kalimba', label: 'Kalimba' },
  { value: 'wood', label: 'Woodblock, a short knock' },
  { value: 'glide', label: 'Tone gliding down' },
  { value: 'none', label: 'No sound' },
];
const TEXTURES: Option<ExhaleTexture>[] = [
  { value: 'airhum', label: 'Air and a warm tone' },
  { value: 'air', label: 'Air being let out' },
  { value: 'sigh', label: 'Sigh, “haaa”' },
  { value: 'hum', label: 'Warm hum, “mmm”' },
  { value: 'none', label: 'Nothing' },
];
const INHALE_PITCH: Option<string>[] = [
  { value: '-12', label: 'Low' },
  { value: '-7', label: 'Medium' },
  { value: '0', label: 'High' },
];
const EXHALE_PITCH: Option<string>[] = [
  { value: '0', label: 'Same as the inhale' },
  { value: '-5', label: 'A fourth below the inhale' },
  { value: '-7', label: 'A fifth below the inhale' },
  { value: '-12', label: 'An octave below the inhale' },
];
const MODES: Option<BreathMode>[] = [
  { value: 'fixed', label: 'Fixed seconds, whatever your heart rate' },
  { value: 'sync', label: 'Music beats, faster at a higher heart rate' },
];
const PATTERNS: Option<BreathPattern>[] = [
  { value: '4:6', label: '4 : 6' },
  { value: '4:7', label: '4 : 7' },
  { value: '4:8', label: '4 : 8' },
  { value: 'prog', label: 'Lengthen the exhale from 4 : 6 to 4 : 8 over 15 minutes' },
];
const VOLUMES: { key: VolumeKey; label: string }[] = [
  { key: 'inhale', label: 'Inhale cue' },
  { key: 'cues', label: 'Exhale cue and backdrop' },
  { key: 'breath', label: 'Waves' },
  { key: 'drone', label: 'Ambient' },
  { key: 'heart', label: 'Pulse' },
  { key: 'bowl', label: 'Background bowls' },
  { key: 'master', label: 'Everything' },
];

const BOWL_KEYS: (keyof Settings)[] = ['bowlInterval', 'bowlProb'];
const ALL_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

const db = (v: number) => (v <= -40 ? 'off' : `${v > 0 ? '+' : ''}${v} dB`);

const BLE_STATE: Record<Snapshot['ble']['state'], string> = {
  off: 'Not connected.',
  connecting: 'Connecting…',
  connected: 'Connected, receiving heart rate.',
  nocontact: 'Connected, but the sensor isn’t touching your skin.',
  reconnecting: 'Connection lost, reconnecting…',
};

/** Docked settings panel for wide screens: always at hand, the sky shows through it. */
export function SettingsDock({ snap, onHide }: { snap: Snapshot; onHide: () => void }) {
  return (
    <aside className="dock chrome" aria-label="Settings">
      <div className="sheet-head">
        <h2>Settings</h2>
        <button className="close" onClick={onHide}>
          Hide
        </button>
      </div>
      <SettingsTabs snap={snap} />
    </aside>
  );
}

/** Settings as a sheet over the app, for phones and narrow windows. */
export function SettingsSheet({ snap, open, onOpenChange }: { snap: Snapshot; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="sheet" aria-describedby={undefined}>
          <div className="sheet-head">
            <Dialog.Title>Settings</Dialog.Title>
            <Dialog.Close className="close">Close</Dialog.Close>
          </div>
          <SettingsTabs snap={snap} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingsTabs({ snap }: { snap: Snapshot }) {
  const s = snap.settings;
  const c = controller;
  const ble = snap.ble;
  const busy = ble.state === 'connecting' || ble.state === 'connected' || ble.state === 'nocontact';

  return (
          <Tabs.Root defaultValue="heart" style={{ display: 'contents' }}>
            <Tabs.List className="tabs-list" aria-label="Settings sections">
              <Tabs.Trigger className="tab" value="heart">Smartwatch</Tabs.Trigger>
              <Tabs.Trigger className="tab" value="breath">Breath</Tabs.Trigger>
              <Tabs.Trigger className="tab" value="mix">Mixer</Tabs.Trigger>
              <Tabs.Trigger className="tab" value="session">Session</Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content className="tab-panel" value="breath">
              <div className="group">
                <h3>Rhythm</h3>
                <SelectField label="Breath timing" value={s.breathMode} options={MODES} onChange={(v) => c.update({ breathMode: v })} />
                <SelectField label="Inhale : exhale" value={s.breathPattern} options={PATTERNS} onChange={(v) => c.update({ breathPattern: v })} />
              </div>
              <div className="group">
                <h3>Start of the inhale</h3>
                <SelectField
                  label="Sound"
                  value={s.inhaleCue}
                  options={INHALE_CUES}
                  onChange={(v) => c.update({ inhaleCue: v })}
                  after={<PlayButton label="Play the inhale sound" onClick={() => c.preview('in')} />}
                />
                <SelectField
                  label="Pitch"
                  value={String(s.inhalePitch)}
                  options={INHALE_PITCH}
                  onChange={(v) => c.update({ inhalePitch: Number(v) })}
                  after={<PlayButton label="Play the inhale sound" onClick={() => c.preview('in')} />}
                />
              </div>
              <div className="group">
                <h3>Start of the exhale</h3>
                <SelectField
                  label="Sound"
                  value={s.exhaleCue}
                  options={EXHALE_CUES}
                  onChange={(v) => c.update({ exhaleCue: v })}
                  after={<PlayButton label="Play the exhale sound" onClick={() => c.preview('out')} />}
                />
                <SelectField
                  label="Pitch"
                  value={String(s.exhalePitch)}
                  options={EXHALE_PITCH}
                  onChange={(v) => c.update({ exhalePitch: Number(v) })}
                  after={<PlayButton label="Play the exhale sound" onClick={() => c.preview('out')} />}
                />
              </div>
              <div className="group">
                <h3>Under the exhale</h3>
                <p>Plays beneath the exhale, starting just after its cue.</p>
                <SelectField
                  label="Sound"
                  value={s.exhaleSound}
                  options={TEXTURES}
                  onChange={(v) => c.update({ exhaleSound: v })}
                  after={<PlayButton label="Play the sound under the exhale" onClick={() => c.preview('tex')} />}
                />
                <div className="btn-row">
                  <button className="btn accent" onClick={() => c.preview('pair')}>
                    Play a whole breath
                  </button>
                </div>
              </div>
            </Tabs.Content>

            <Tabs.Content className="tab-panel" value="heart">
              <div className="group">
                <h3>Smartwatch</h3>
                {ble.supported ? (
                  <>
                    <p>Your smartwatch or chest strap must share heart rate over Bluetooth (the standard Heart Rate profile).</p>
                    <div className="btn-row">
                      <button className="btn accent" disabled={busy} onClick={() => c.connectBle()}>
                        Connect smartwatch
                      </button>
                      <button className="btn" disabled={ble.state === 'off'} onClick={() => c.disconnectBle()}>
                        Disconnect
                      </button>
                    </div>
                    <p className="note">
                      {ble.deviceName && ble.state !== 'off' ? `${ble.deviceName}: ` : ''}
                      {BLE_STATE[ble.state]}
                      {ble.state === 'reconnecting' ? ` Next attempt in ${ble.retryIn} s.` : ''}
                      {ble.stale ? ' No new readings for more than 10 seconds.' : ''}
                    </p>
                  </>
                ) : (
                  <p className="note warn">{ble.reason}</p>
                )}
              </div>
              <div className="group">
                <h3>Simulation</h3>
                <p>For trying the app without a smartwatch. While it’s on, smartwatch readings are ignored.</p>
                <SwitchField label="Simulate heart rate" checked={snap.sim.enabled} onChange={(v) => c.setSim(v)} />
                <SliderField label="Simulated heart rate" value={snap.sim.value} min={45} max={120} step={1} format={(v) => `${Math.round(v)} BPM`} onChange={(v) => c.setSimValue(v)} />
                <div className="btn-row">
                  <button className="btn" onClick={() => c.toggleAsleep()}>
                    {snap.sim.asleepProgress == null
                      ? 'Simulate calming down: 80 to 55 BPM in 3 minutes'
                      : `Stop calming down (${Math.round(snap.sim.asleepProgress * 100)}%)`}
                  </button>
                </div>
              </div>
              <div className="group">
                <h3>How the music follows your heart</h3>
                <p>The music tempo is your heart rate minus the gap you set, but never slower than the minimum.</p>
                <SliderField label="Smoothing of readings" value={s.alpha} min={0.05} max={0.6} step={0.01} format={(v) => (v < 0.15 ? 'strong' : v < 0.35 ? 'medium' : 'light') + ` (${v.toFixed(2)})`} onChange={(v) => c.update({ alpha: v })} />
                <SliderField label="Music slower than your heart by" value={s.offset} min={0} max={15} step={1} format={(v) => `${v} BPM`} onChange={(v) => c.update({ offset: v })} />
                <SliderField label="Slowest music tempo" value={s.minBPM} min={40} max={65} step={1} format={(v) => `${v} BPM`} onChange={(v) => c.update({ minBPM: v })} />
                <SliderField label="Slowing down on every exhale" value={s.rsaDepth} min={0} max={0.1} step={0.01} format={(v) => (v ? `${Math.round(v * 100)}%` : 'off')} onChange={(v) => c.update({ rsaDepth: v })} />
              </div>
            </Tabs.Content>

            <Tabs.Content className="tab-panel" value="mix">
              <div className="group">
                <GroupHead title="Volume">
                  <GroupAction label="Reset" disabled={isDefault(s, ['vols'])} onClick={() => c.reset(['vols'])} />
                </GroupHead>
                {VOLUMES.map(({ key, label }) => (
                  <SliderField key={key} label={label} value={s.vols[key]} min={-40} max={6} step={1} format={db} onChange={(v) => c.setVolume(key, v)} />
                ))}
              </div>
              <div className="group">
                <GroupHead title="Background bowls">
                  <GroupAction label="Reset" disabled={isDefault(s, BOWL_KEYS)} onClick={() => c.reset(BOWL_KEYS)} />
                </GroupHead>
                <p>Random strikes in the music’s key. Never right after a breath cue.</p>
                <SelectField
                  label="At most every"
                  value={s.bowlInterval}
                  options={[
                    { value: '1m', label: '4 pulse beats' },
                    { value: '2m', label: '8 pulse beats' },
                  ]}
                  onChange={(v) => c.update({ bowlInterval: v })}
                />
                <SliderField label="Chance of a strike" value={s.bowlProb} min={0.1} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => c.update({ bowlProb: v })} />
              </div>
            </Tabs.Content>

            <Tabs.Content className="tab-panel" value="session">
              <div className="group">
                <h3>Sleep timer</h3>
                <p>The music fades out gently over the last minute, then the session ends.</p>
                <SelectField
                  label="End after"
                  value={String(s.timerMinutes)}
                  options={[
                    { value: '0', label: 'No timer' },
                    { value: '15', label: '15 minutes' },
                    { value: '30', label: '30 minutes' },
                    { value: '60', label: '60 minutes' },
                  ]}
                  onChange={(v) => c.update({ timerMinutes: Number(v) })}
                />
              </div>
              <div className="group">
                <h3>Screen</h3>
                <p>
                  {snap.wakeLock === 'unsupported'
                    ? 'This browser can’t keep the screen awake. Lengthen the screen timeout in your system settings so the smartwatch doesn’t disconnect.'
                    : 'During a session the screen stays on.'}
                </p>
                <SwitchField label="Dim the interface during a session" checked={s.autoDim} onChange={(v) => c.update({ autoDim: v })} />
                <p>After 10 seconds without a touch, everything but the breath light fades out. Touch the screen to bring it back.</p>
                <SliderField
                  label="Sky brightness"
                  value={s.skyGlow}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => (v === 0 ? 'no aurora' : `${Math.round(v * 100)}%`)}
                  onChange={(v) => c.update({ skyGlow: v })}
                />
              </div>
              <ResetAll settings={s} />
            </Tabs.Content>
          </Tabs.Root>
  );
}

/** Restores every setting in every tab; asks once, in place, because it can't be undone. */
function ResetAll({ settings }: { settings: Settings }) {
  const [asking, setAsking] = useState(false);
  const atDefaults = isDefault(settings, ALL_KEYS);
  return (
    <div className="group">
      <h3>Default settings</h3>
      <p>Puts every setting in every tab back the way the app came, volumes included. Your smartwatch stays connected.</p>
      <div className="btn-row" aria-live="polite">
        {!asking ? (
          <button className="btn" disabled={atDefaults} onClick={() => setAsking(true)}>
            {atDefaults ? 'All settings are at their defaults' : 'Reset all settings'}
          </button>
        ) : (
          <>
            <span className="confirm-q">Reset all settings? This can’t be undone.</span>
            <button
              className="btn danger"
              autoFocus
              onClick={() => {
                controller.reset();
                setAsking(false);
              }}
            >
              Reset all
            </button>
            <button className="btn" onClick={() => setAsking(false)}>
              Keep my settings
            </button>
          </>
        )}
      </div>
    </div>
  );
}
