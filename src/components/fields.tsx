import * as RSelect from '@radix-ui/react-select';
import * as RSlider from '@radix-ui/react-slider';
import * as RSwitch from '@radix-ui/react-switch';
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
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
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
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path d="M4 2.5v9l7.5-4.5z" fill="currentColor" />
      </svg>
    </button>
  );
}

/** A group's heading with room on the right for the group's own actions. */
export function GroupHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="group-head">
      <h3>{title}</h3>
      {children && <div className="group-actions">{children}</div>}
    </div>
  );
}

/** Quiet text action for a group heading; greyed out when there's nothing for it to do. */
export function GroupAction({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="group-action" disabled={disabled} onClick={onClick}>
      <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden>
        <path d="M2.75 7a4.25 4.25 0 1 0 1.3-3.06" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M3.6 1.6v2.6h2.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
