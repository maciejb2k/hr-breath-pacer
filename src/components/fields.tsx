import * as RSelect from '@radix-ui/react-select';
import * as RSlider from '@radix-ui/react-slider';
import * as RSwitch from '@radix-ui/react-switch';
import { ArrowCounterClockwise, CaretDown, Play, type Icon } from '@phosphor-icons/react';
import { useId, type ReactNode } from 'react';

export function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {props.label}
      </span>
      <span className="field-value">{props.format(props.value)}</span>
      <div className="field-control">
        <RSlider.Root
          className="slider"
          value={[props.value]}
          min={props.min}
          max={props.max}
          step={props.step}
          onValueChange={([v]) => props.onChange(v)}
          aria-labelledby={id}
        >
          <RSlider.Track className="slider-track">
            <RSlider.Range className="slider-range" />
          </RSlider.Track>
          <RSlider.Thumb className="slider-thumb" aria-labelledby={id} />
        </RSlider.Root>
      </div>
    </div>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

export function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  after?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {props.label}
      </span>
      <span />
      <div className="field-control">
        <RSelect.Root value={props.value} onValueChange={(v) => props.onChange(v as T)}>
          <RSelect.Trigger className="select-trigger" aria-labelledby={id}>
            <RSelect.Value />
            <RSelect.Icon aria-hidden>
              <CaretDown size={12} weight="bold" />
            </RSelect.Icon>
          </RSelect.Trigger>
          <RSelect.Portal>
            <RSelect.Content className="select-content" position="popper" sideOffset={6}>
              <RSelect.Viewport>
                {props.options.map((o) => (
                  <RSelect.Item key={o.value} value={o.value} className="select-item">
                    <RSelect.ItemText>{o.label}</RSelect.ItemText>
                  </RSelect.Item>
                ))}
              </RSelect.Viewport>
            </RSelect.Content>
          </RSelect.Portal>
        </RSelect.Root>
        {props.after}
      </div>
    </div>
  );
}

export function SwitchField(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {props.label}
      </label>
      <RSwitch.Root id={id} className="switch" checked={props.checked} onCheckedChange={props.onChange}>
        <RSwitch.Thumb className="switch-thumb" />
      </RSwitch.Root>
    </div>
  );
}

export function PlayButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="play" onClick={onClick} aria-label={label} title={label}>
      <Play size={14} weight="fill" aria-hidden />
    </button>
  );
}

/**
 * A group's heading: an icon, the title, and room on the right for the group's own actions.
 * tone tints the icon with the breath phase it belongs to (dawn = inhale, dusk = exhale).
 */
export function GroupHead({ title, icon: I, tone, children }: { title: string; icon: Icon; tone?: 'in' | 'out'; children?: ReactNode }) {
  return (
    <div className="group-head">
      <h3>
        <I className="head-icon" data-tone={tone} size={20} weight="light" aria-hidden />
        {title}
      </h3>
      {children && <div className="group-actions">{children}</div>}
    </div>
  );
}

/** Quiet text action for a group heading; greyed out when there's nothing for it to do. */
export function GroupAction({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="group-action" disabled={disabled} onClick={onClick}>
      <ArrowCounterClockwise size={14} weight="regular" aria-hidden />
      {label}
    </button>
  );
}
