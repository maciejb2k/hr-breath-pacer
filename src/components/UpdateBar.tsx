import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '../i18n';

const CHECK_EVERY_MS = 60 * 60 * 1000; // the app is left open for hours: look for a new version hourly

/**
 * Offers a reload when a new version has been downloaded. Never during a session:
 * reloading would cut the music and drop the smartwatch, so it waits until the session ends.
 */
export function UpdateBar({ running }: { running: boolean }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) window.setInterval(() => reg.update(), CHECK_EVERY_MS);
    },
    onRegisterError(err) {
      console.warn('Service worker registration failed:', err);
    },
  });

  if (!needRefresh || running) return null;
  return (
    <div className="update-bar chrome" role="status">
      <span>{t('update.ready')}</span>
      <button className="btn accent" onClick={() => updateServiceWorker(true)}>
        {t('update.reload')}
      </button>
      <button className="close" onClick={() => setNeedRefresh(false)}>
        {t('update.later')}
      </button>
    </div>
  );
}
