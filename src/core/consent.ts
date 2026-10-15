import { WinbotError } from "./model";
/** Consent is deliberately in memory and is never restored from disk. */
export class ConsentGate {
  granted = false;
  enabled = false;
  grant() {
    this.granted = true;
  }
  revoke() {
    this.granted = false;
    this.enabled = false;
  }
  setMode(enabled: boolean) {
    if (enabled && !this.granted) throw new WinbotError("consent");
    this.enabled = enabled;
  }
  assertCapture() {
    if (!this.granted || !this.enabled) throw new WinbotError("consent");
  }
}
