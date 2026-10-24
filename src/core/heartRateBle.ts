export type BleState = 'off' | 'connecting' | 'connected' | 'nocontact' | 'reconnecting';

export interface BleSupport {
  ok: boolean;
  /** why Web Bluetooth is unavailable, written for the user */
  reason?: string;
}

/** Explains *why* Web Bluetooth is missing, so the user knows what to fix. */
export function bleSupport(): BleSupport {
  if (navigator.bluetooth) return { ok: true };
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: `This page is open over plain http (${location.host}). Bluetooth only works over https or on localhost: open the address that starts with https://.`,
    };
  }
  if ((navigator as Navigator & { brave?: unknown }).brave) {
    return {
      ok: false,
      reason: 'Brave turns Bluetooth off by default. Go to brave://flags, enable “Web Bluetooth API” and restart the browser, or open this page in Chrome.',
    };
  }
  return {
    ok: false,
    reason: 'This browser doesn’t support Bluetooth on web pages. Use Chrome or Edge (Windows, macOS, Android). iPhones don’t support it.',
  };
}

interface Measurement {
  hr: number;
  contact: boolean | null;
  rr: number[];
}

// GATT Heart Rate Measurement (0x2A37)
function parseHeartRate(dv: DataView): Measurement {
  const flags = dv.getUint8(0);
  const is16 = (flags & 0x01) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const contact = (flags & 0x02) !== 0;
  const hasEnergy = (flags & 0x08) !== 0;
  const hasRR = (flags & 0x10) !== 0;
  let off = 1;
  const hr = is16 ? dv.getUint16(off, true) : dv.getUint8(off);
  off += is16 ? 2 : 1;
  if (hasEnergy) off += 2;
  const rr: number[] = [];
  if (hasRR) {
    for (; off + 1 < dv.byteLength; off += 2) rr.push((dv.getUint16(off, true) / 1024) * 1000);
  }
  return { hr, contact: contactSupported ? contact : null, rr };
}

/** Heart-rate strap/watch over Web Bluetooth, with automatic reconnect (backoff up to 30 s). */
export class HeartRateBle {
  private device: BluetoothDevice | null = null;
  private char: BluetoothRemoteGATTCharacteristic | null = null;
  private wanted = false;
  private attempts = 0;
  private retryTimer: number | undefined;
  state: BleState = 'off';
  deviceName = '';
  /** seconds until the next reconnect attempt, while reconnecting */
  retryIn = 0;

  constructor(
    private onReading: (hr: number) => void,
    private onChange: () => void,
  ) {}

  private set(state: BleState) {
    this.state = state;
    this.onChange();
  }

  /** must be called from a click (the browser shows its device picker) */
  async connect() {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    if (this.device && this.device !== device) {
      this.device.removeEventListener('gattserverdisconnected', this.onDisconnected);
    }
    this.device = device;
    this.deviceName = device.name || 'smartwatch';
    this.wanted = true;
    this.attempts = 0;
    device.addEventListener('gattserverdisconnected', this.onDisconnected);
    try {
      await this.gattConnect();
    } catch (err) {
      if (this.wanted) this.scheduleReconnect();
      throw err;
    }
  }

  disconnect() {
    this.wanted = false;
    window.clearTimeout(this.retryTimer);
    if (this.char) {
      this.char.stopNotifications().catch(() => {});
      this.char.removeEventListener('characteristicvaluechanged', this.onNotify);
    }
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.char = null;
    this.set('off');
  }

  private async gattConnect() {
    this.set('connecting');
    const server = await this.device!.gatt!.connect();
    const service = await server.getPrimaryService('heart_rate');
    const ch = await service.getCharacteristic('heart_rate_measurement');
    ch.removeEventListener('characteristicvaluechanged', this.onNotify);
    ch.addEventListener('characteristicvaluechanged', this.onNotify);
    await ch.startNotifications();
    this.char = ch;
    this.attempts = 0;
    this.set('connected');
  }

  private onNotify = (e: Event) => {
    const m = parseHeartRate((e.target as BluetoothRemoteGATTCharacteristic).value!);
    if (m.contact === false) {
      if (this.state !== 'nocontact') this.set('nocontact');
      return;
    }
    if (this.state !== 'connected') this.set('connected');
    this.onReading(m.hr);
  };

  private onDisconnected = () => {
    this.char = null;
    if (!this.wanted) {
      this.set('off');
      return;
    }
    this.scheduleReconnect();
  };

  private scheduleReconnect() {
    window.clearTimeout(this.retryTimer);
    const delay = Math.min(30000, 1000 * Math.pow(2, this.attempts));
    this.attempts++;
    this.retryIn = Math.round(delay / 1000);
    this.set('reconnecting');
    this.retryTimer = window.setTimeout(async () => {
      if (!this.wanted || !this.device) return;
      try {
        await this.gattConnect();
      } catch (err) {
        console.warn('Reconnect failed:', (err as Error)?.message);
        if (this.wanted) this.scheduleReconnect();
      }
    }, delay);
  }
}
