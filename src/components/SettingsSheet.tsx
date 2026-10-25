import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ArrowCounterClockwise, BellSimple, DeviceMobile, Flask, Heartbeat, Metronome, MoonStars, MusicNotes,
  Sparkle, SpeakerSimpleHigh, SunHorizon, Timer, Watch, Waveform, Wind, type Icon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { controller, type Snapshot } from '../core/controller';
import { DEFAULT_SETTINGS, isDefault, isPhone, type AudioQuality, type BreathMode, type BreathPattern, type CueKind, type ExhaleTexture, type InhaleTexture, type Settings, type VolumeKey } from '../core/settings';
import { t, type Key } from '../i18n';
import { LangSelect } from './LangSelect';
import { GroupAction, GroupHead, PlayButton, SelectField, SliderField, SwitchField, type Option } from './fields';

// Option lists hold translation keys; opts() turns them into labels in the current language
type Choices<T extends string> = [T, Key][];
const opts = <T extends string>(list: Choices<T>): Option<T>[] => list.map(([value, key]) => ({ value, label: t(key) }));

const INHALE_CUES: Choices<CueKind> = [
  ['double', 'cue.double.in'],
  ['ping', 'cue.ping'],
  ['kalimba', 'cue.kalimba'],
  ['glass', 'cue.glass'],
  ['bowl', 'cue.bowl.in'],
  ['wood', 'cue.wood'],
  ['glide', 'cue.glide.in'],
  ['none', 'cue.none'],
];
const EXHALE_CUES: Choices<CueKind> = [
  ['double', 'cue.double.out'],
  ['ping', 'cue.ping'],
  ['gong', 'cue.gong'],
  ['deep', 'cue.deep'],
  ['bowl', 'cue.bowl.out'],
  ['kalimba', 'cue.kalimba'],
  ['wood', 'cue.wood'],
  ['glide', 'cue.glide.out'],
  ['none', 'cue.none'],
];
const TEXTURES: Choices<ExhaleTexture> = [
  ['airhum', 'tex.airhum'],
  ['air', 'tex.air.out'],
  ['sigh', 'tex.sigh'],
  ['hum', 'tex.hum.out'],
  ['none', 'tex.none'],
];
const INHALE_TEXTURES: Choices<InhaleTexture> = [
  ['none', 'tex.none'],
  ['airhum', 'tex.airhum'],
  ['air', 'tex.air.in'],
  ['hum', 'tex.hum.in'],
];
const qualities = (): Option<AudioQuality>[] => [
  { value: 'low', label: t('quality.low') + (isPhone ? t('quality.phoneDefault') : '') },
  { value: 'medium', label: t('quality.medium') },
  { value: 'high', label: t('quality.high') + (isPhone ? '' : t('quality.computerDefault')) },
];
const INHALE_PITCH: Choices<string> = [
  ['-12', 'pitch.low'],
  ['-7', 'pitch.medium'],
  ['0', 'pitch.high'],
];
const EXHALE_PITCH: Choices<string> = [
  ['0', 'pitch.same'],
  ['-5', 'pitch.fourth'],
  ['-7', 'pitch.fifth'],
  ['-12', 'pitch.octave'],
];
const MODES: Choices<BreathMode> = [
  ['fixed', 'breath.mode.fixed'],
  ['sync', 'breath.mode.sync'],
];
const patterns = (): Option<BreathPattern>[] => [
  { value: '4:6', label: '4 : 6' },
  { value: '4:7', label: '4 : 7' },
  { value: '4:8', label: '4 : 8' },
  { value: 'prog', label: t('breath.pattern.prog') },
];
const timers = (): Option<string>[] => [
  { value: '0', label: t('timer.none') },
  ...[15, 30, 60].map((n) => ({ value: String(n), label: t('timer.minutes', { n }) })),
];
// the mixer in sections: each breath phase, then everything that plays regardless of it
const VOLUME_SECTIONS: { title: Key; icon: Icon; tone?: 'in' | 'out'; sliders: { key: VolumeKey; label: Key }[] }[] = [
  { title: 'mix.inhale', icon: SunHorizon, tone: 'in', sliders: [
    { key: 'inhale', label: 'mix.startSound' },
    { key: 'inhaleTex', label: 'mix.inTex' },
  ] },
  { title: 'mix.exhale', icon: MoonStars, tone: 'out', sliders: [
    { key: 'cues', label: 'mix.startSound' },
    { key: 'exhaleTex', label: 'mix.outTex' },
  ] },
  { title: 'mix.backdrop', icon: MusicNotes, sliders: [
    { key: 'breath', label: 'mix.waves' },
    { key: 'drone', label: 'mix.ambient' },
    { key: 'heart', label: 'mix.pulse' },
    { key: 'bowl', label: 'mix.bowls' },
  ] },
];
const ALL_VOLUMES = Object.keys(DEFAULT_SETTINGS.vols) as VolumeKey[];
const volsAtDefault = (s: Settings, keys: VolumeKey[]) => keys.every((k) => s.vols[k] === DEFAULT_SETTINGS.vols[k]);

const BOWL_KEYS: (keyof Settings)[] = ['bowlInterval', 'bowlProb'];
// Reset all leaves the language alone, so it doesn't count towards "at defaults" either
const ALL_KEYS = (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).filter((k) => k !== 'lang');

const db = (v: number) => (v <= -40 ? t('common.off') : `${v > 0 ? '+' : ''}${v} dB`);

const BLE_STATE: Record<Snapshot['ble']['state'], Key> = {
  off: 'watch.state.off',
  connecting: 'watch.state.connecting',
  connected: 'watch.state.connected',
  nocontact: 'watch.state.nocontact',
  reconnecting: 'watch.state.reconnecting',
};

/** Docked settings panel for wide screens: always at hand, the sky shows through it. */
export function SettingsDock({ snap, onHide }: { snap: Snapshot; onHide: () => void }) {
  return (
    <aside className="dock chrome" aria-label={t('settings.title')}>
      <div className="sheet-head">
        <h2>{t('settings.title')}</h2>
        <div className="sheet-actions">
          <LangSelect value={snap.settings.lang} onChange={(lang) => controller.update({ lang })} />
          <button className="close" onClick={onHide}>
            {t('settings.hide')}
          </button>
        </div>
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
            <Dialog.Title>{t('settings.title')}</Dialog.Title>
            {/* here rather than in a tab: whoever can't read the current language finds it at once */}
            <div className="sheet-actions">
              <LangSelect value={snap.settings.lang} onChange={(lang) => controller.update({ lang })} />
              <Dialog.Close className="close">{t('settings.close')}</Dialog.Close>
            </div>
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
            <Tabs.List className="tabs-list" aria-label={t('settings.sections')}>
              <Tabs.Trigger className="tab" value="heart">{t('tab.heart')}</Tabs.Trigger>
              <Tabs.Trigger className="tab" value="breath">{t('tab.breath')}</Tabs.Trigger>
              <Tabs.Trigger className="tab" value="mix">{t('tab.mix')}</Tabs.Trigger>
              <Tabs.Trigger className="tab" value="session">{t('tab.session')}</Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content className="tab-panel" value="breath">
              <div className="group">
                <GroupHead title={t('breath.rhythm')} icon={Metronome} />
                <SelectField label={t('breath.timing')} value={s.breathMode} options={opts(MODES)} onChange={(v) => c.update({ breathMode: v })} />
                <SelectField label={t('breath.pattern')} value={s.breathPattern} options={patterns()} onChange={(v) => c.update({ breathPattern: v })} />
              </div>
              <div className="group">
                <GroupHead title={t('breath.inStart')} icon={BellSimple} tone="in" />
                <SelectField
                  label={t('breath.sound')}
                  value={s.inhaleCue}
                  options={opts(INHALE_CUES)}
                  onChange={(v) => c.update({ inhaleCue: v })}
                  after={<PlayButton label={t('breath.playIn')} onClick={() => c.preview('in')} />}
                />
                <SelectField
                  label={t('breath.pitch')}
                  value={String(s.inhalePitch)}
                  options={opts(INHALE_PITCH)}
                  onChange={(v) => c.update({ inhalePitch: Number(v) })}
                  after={<PlayButton label={t('breath.playIn')} onClick={() => c.preview('in')} />}
                />
              </div>
              <div className="group">
                <GroupHead title={t('breath.outStart')} icon={BellSimple} tone="out" />
                <SelectField
                  label={t('breath.sound')}
                  value={s.exhaleCue}
                  options={opts(EXHALE_CUES)}
                  onChange={(v) => c.update({ exhaleCue: v })}
                  after={<PlayButton label={t('breath.playOut')} onClick={() => c.preview('out')} />}
                />
                <SelectField
                  label={t('breath.pitch')}
                  value={String(s.exhalePitch)}
                  options={opts(EXHALE_PITCH)}
                  onChange={(v) => c.update({ exhalePitch: Number(v) })}
                  after={<PlayButton label={t('breath.playOut')} onClick={() => c.preview('out')} />}
                />
              </div>
              <div className="group">
                <GroupHead title={t('breath.inUnder')} icon={Wind} tone="in" />
                <p>{t('breath.inUnderHint')}</p>
                <SelectField
                  label={t('breath.sound')}
                  value={s.inhaleSound}
                  options={opts(INHALE_TEXTURES)}
                  onChange={(v) => c.update({ inhaleSound: v })}
                  after={<PlayButton label={t('breath.playInTex')} onClick={() => c.preview('intex')} />}
                />
              </div>
              <div className="group">
                <GroupHead title={t('breath.outUnder')} icon={Wind} tone="out" />
                <p>{t('breath.outUnderHint')}</p>
                <SelectField
                  label={t('breath.sound')}
                  value={s.exhaleSound}
                  options={opts(TEXTURES)}
                  onChange={(v) => c.update({ exhaleSound: v })}
                  after={<PlayButton label={t('breath.playOutTex')} onClick={() => c.preview('tex')} />}
                />
                <div className="btn-row">
                  <button className="btn accent" onClick={() => c.preview('pair')}>
                    {t('breath.playPair')}
                  </button>
                </div>
              </div>
            </Tabs.Content>

            <Tabs.Content className="tab-panel" value="heart">
              <div className="group">
                <GroupHead title={t('watch.title')} icon={Watch} />
                {ble.supported ? (
                  <>
                    <p>{t('line.needSource')}</p>
                    <div className="btn-row">
                      <button className="btn accent" disabled={busy} onClick={() => c.connectBle()}>
                        {t('watch.connect')}
                      </button>
                      <button className="btn" disabled={ble.state === 'off'} onClick={() => c.disconnectBle()}>
                        {t('watch.disconnect')}
                      </button>
                    </div>
                    <p className="note">
                      {ble.deviceName && ble.state !== 'off' ? `${ble.deviceName}: ` : ''}
                      {t(BLE_STATE[ble.state])}
                      {ble.state === 'reconnecting' ? t('watch.retry', { s: ble.retryIn }) : ''}
                      {ble.stale ? t('watch.stale') : ''}
                    </p>
                  </>
                ) : (
                  ble.reason && <p className="note warn">{t(ble.reason.key, ble.reason.vars)}</p>
                )}
              </div>
              <div className="group">
                <GroupHead title={t('sim.title')} icon={Flask} />
                <p>{t('sim.hint')}</p>
                <SwitchField label={t('sim.toggle')} checked={snap.sim.enabled} onChange={(v) => c.setSim(v)} />
                <SliderField label={t('sim.value')} value={snap.sim.value} min={45} max={120} step={1} format={(v) => `${Math.round(v)} BPM`} onChange={(v) => c.setSimValue(v)} />
                <div className="btn-row">
                  <button className="btn" onClick={() => c.toggleAsleep()}>
                    {snap.sim.asleepProgress == null
                      ? t('sim.asleep')
                      : t('sim.asleepStop', { p: Math.round(snap.sim.asleepProgress * 100) })}
                  </button>
                </div>
              </div>
              <div className="group">
                <GroupHead title={t('follow.title')} icon={Heartbeat} />
                <p>{t('follow.hint')}</p>
                <SliderField
                  label={t('follow.smoothing')}
                  value={s.alpha}
                  min={0.05}
                  max={0.6}
                  step={0.01}
                  format={(v) => t(v < 0.15 ? 'follow.smoothing.strong' : v < 0.35 ? 'follow.smoothing.medium' : 'follow.smoothing.light') + ` (${v.toFixed(2)})`}
                  onChange={(v) => c.update({ alpha: v })}
                />
                <SliderField label={t('follow.offset')} value={s.offset} min={0} max={15} step={1} format={(v) => `${v} BPM`} onChange={(v) => c.update({ offset: v })} />
                <SliderField label={t('follow.min')} value={s.minBPM} min={40} max={65} step={1} format={(v) => `${v} BPM`} onChange={(v) => c.update({ minBPM: v })} />
                <SliderField label={t('follow.rsa')} value={s.rsaDepth} min={0} max={0.1} step={0.01} format={(v) => (v ? `${Math.round(v * 100)}%` : t('common.off'))} onChange={(v) => c.update({ rsaDepth: v })} />
              </div>
            </Tabs.Content>

            <Tabs.Content className="tab-panel" value="mix">
              <div className="group">
                <GroupHead title={t('mix.volume')} icon={SpeakerSimpleHigh}>
                  <GroupAction label={t('mix.resetAll')} disabled={volsAtDefault(s, ALL_VOLUMES)} onClick={() => c.resetVolumes(ALL_VOLUMES)} />
                </GroupHead>
                <SliderField label={t('mix.master')} value={s.vols.master} min={-40} max={6} step={1} format={db} onChange={(v) => c.setVolume('master', v)} />
              </div>
              {VOLUME_SECTIONS.map(({ title, icon, tone, sliders }) => {
                const keys = sliders.map((x) => x.key);
                return (
                  <div className="group" key={title}>
                    <GroupHead title={t(title)} icon={icon} tone={tone}>
                      <GroupAction label={t('mix.reset')} disabled={volsAtDefault(s, keys)} onClick={() => c.resetVolumes(keys)} />
                    </GroupHead>
                    {sliders.map(({ key, label }) => (
                      <SliderField key={key} label={t(label)} value={s.vols[key]} min={-40} max={6} step={1} format={db} onChange={(v) => c.setVolume(key, v)} />
                    ))}
                  </div>
                );
              })}
              <div className="group">
                <GroupHead title={t('bowls.title')} icon={Sparkle}>
                  <GroupAction label={t('mix.reset')} disabled={isDefault(s, BOWL_KEYS)} onClick={() => c.reset(BOWL_KEYS)} />
                </GroupHead>
                <p>{t('bowls.hint')}</p>
                <SelectField
                  label={t('bowls.every')}
                  value={s.bowlInterval}
                  options={opts<'1m' | '2m'>([
                    ['1m', 'bowls.every4'],
                    ['2m', 'bowls.every8'],
                  ])}
                  onChange={(v) => c.update({ bowlInterval: v })}
                />
                <SliderField label={t('bowls.chance')} value={s.bowlProb} min={0.1} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => c.update({ bowlProb: v })} />
              </div>
            </Tabs.Content>

            <Tabs.Content className="tab-panel" value="session">
              <div className="group">
                <GroupHead title={t('timer.title')} icon={Timer} />
                <p>{t('timer.hint')}</p>
                <SelectField
                  label={t('timer.after')}
                  value={String(s.timerMinutes)}
                  options={timers()}
                  onChange={(v) => c.update({ timerMinutes: Number(v) })}
                />
              </div>
              <div className="group">
                <GroupHead title={t('screen.title')} icon={DeviceMobile} />
                <p>{t(snap.wakeLock === 'unsupported' ? 'screen.noWakeLock' : 'screen.wakeLock')}</p>
                <SwitchField label={t('screen.dim')} checked={s.autoDim} onChange={(v) => c.update({ autoDim: v })} />
                <p>{t('screen.dimHint')}</p>
                <SliderField
                  label={t('screen.sky')}
                  value={s.skyGlow}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => (v === 0 ? t('screen.noAurora') : `${Math.round(v * 100)}%`)}
                  onChange={(v) => c.update({ skyGlow: v })}
                />
              </div>
              <div className="group">
                <GroupHead title={t('quality.title')} icon={Waveform} />
                <p>{t('quality.hint')}</p>
                <SelectField label={t('quality.label')} value={s.audioQuality} options={qualities()} onChange={(v) => c.update({ audioQuality: v })} />
                {snap.running && s.audioQuality !== snap.audioQuality && (
                  <p className="note">{t('quality.later')}</p>
                )}
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
      <GroupHead title={t('defaults.title')} icon={ArrowCounterClockwise} />
      <p>{t('defaults.hint')}</p>
      <div className="btn-row" aria-live="polite">
        {!asking ? (
          <button className="btn" disabled={atDefaults} onClick={() => setAsking(true)}>
            {t(atDefaults ? 'defaults.atDefaults' : 'defaults.reset')}
          </button>
        ) : (
          <>
            <span className="confirm-q">{t('defaults.confirm')}</span>
            <button
              className="btn danger"
              autoFocus
              onClick={() => {
                controller.reset();
                setAsking(false);
              }}
            >
              {t('defaults.yes')}
            </button>
            <button className="btn" onClick={() => setAsking(false)}>
              {t('defaults.no')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
