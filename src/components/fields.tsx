import * as RSelect from '@radix-ui/react-select';
import * as RSlider from '@radix-ui/react-slider';
import * as RSwitch from '@radix-ui/react-switch';
import { ArrowCounterClockwise, CaretDown, Play, type Icon } from '@phosphor-icons/react';
import { useId, useRef, type PointerEvent, type ReactNode } from 'react';

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
  const touch = useTouchDrag(props);
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
          {...touch}
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

const DECIDE_PX = 8; // movement before a touch counts as a horizontal drag or a scroll

/**
 * Touch handling for sliders in a scrolling list. Radix jumps to the finger on touch-down,
 * so scrolling past a slider used to change it. Here a touch does nothing until it moves:
 * mostly vertical is left to the page as a scroll, mostly horizontal moves the value by the
 * distance dragged (no jump, and it can start anywhere on the slider). Mouse and keyboard keep Radix's behaviour.
 */
function useTouchDrag({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const drag = useRef<{ id: number; x0: number; y0: number; v0: number; width: number; active: boolean } | null>(null);
  const snap = (v: number) => Math.min(max, Math.max(min, Number((min + Math.round((v - min) / step) * step).toFixed(6))));
  // preventDefault() is Radix's switch: its own pointer handler is skipped when ours called it
  const mine = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') return false;
    e.preventDefault();
    return true;
  };
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (!mine(e)) return;
      const width = e.currentTarget.getBoundingClientRect().width || 1;
      drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, v0: value, width, active: false };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (!mine(e)) return;
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (!d.active) {
        if (Math.abs(dx) > DECIDE_PX && Math.abs(dx) > Math.abs(dy)) {
          d.active = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        } else if (Math.abs(dy) > DECIDE_PX) {
          drag.current = null; // a scroll: the browser takes it from here
        }
        return;
      }
      const v = snap(d.v0 + (dx / d.width) * (max - min));
      if (v !== value) onChange(v);
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      if (mine(e)) drag.current = null;
    },
    onPointerCancel() {
      drag.current = null;
    },
  };
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
