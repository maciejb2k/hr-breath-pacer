import * as RSelect from '@radix-ui/react-select';
import { CaretDown, Globe } from '@phosphor-icons/react';
import { LANGS, t, type Lang } from '../i18n';

/** Compact language menu for the header: globe and code on the button, full names in the list. */
export function LangSelect({ value, onChange }: { value: Lang; onChange: (v: Lang) => void }) {
  const current = LANGS.find((l) => l.value === value) ?? LANGS[0];
  return (
    <RSelect.Root value={value} onValueChange={(v) => onChange(v as Lang)}>
      <RSelect.Trigger className="icon-btn lang-btn" aria-label={t('lang.label')}>
        <Globe size={16} weight="regular" aria-hidden />
        <span>{current.short}</span>
        <CaretDown size={10} weight="bold" aria-hidden />
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content className="select-content" position="popper" side="bottom" align="end" sideOffset={6}>
          <RSelect.Viewport>
            {LANGS.map((l) => (
              <RSelect.Item key={l.value} value={l.value} className="select-item" lang={l.value}>
                <RSelect.ItemText>{l.name}</RSelect.ItemText>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
