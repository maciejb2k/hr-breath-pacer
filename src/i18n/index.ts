import en from './en.json';
import pl from './pl.json';

// Every user-facing string lives in en.json / pl.json. en.json is the reference:
// pl must have every one of its keys, or this file doesn't compile.
export type Key = keyof typeof en;
export type Lang = 'en' | 'pl';
export type Vars = Record<string, string | number>;

const DICTS: Record<Lang, Record<Key, string>> = { en, pl };

/** offered in the header's language menu, each named in its own language */
export const LANGS: { value: Lang; short: string; name: string }[] = [
  { value: 'en', short: 'EN', name: 'English' },
  { value: 'pl', short: 'PL', name: 'Polski' },
];

/** first visit: Polish for a Polish browser, English for everyone else */
export function browserLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

let current: Lang = 'en';

export function setLang(lang: Lang) {
  current = lang;
  document.documentElement.lang = lang;
}

/** the string for key in the current language, with {name} placeholders filled from vars */
export function t(key: Key, vars?: Vars): string {
  const s = DICTS[current][key] ?? DICTS.en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}
