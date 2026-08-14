const SCOPE = 'drawnix-mindmap-cloud';
const URL_KEY = 'drawnix_cloud_backend_url_v1';

type Pending = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: number;
};

export class CloudBridge {
  private iframe: HTMLIFrameElement | null = null;
  private targetWindow: Window | null = null;
  private ready = false;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;

  constructor() {
    window.addEventListener('message', this.onMessage);
  }

  getSavedUrl() {
    return localStorage.getItem(URL_KEY) || '';
  }

  saveUrl(url: string) {
    const normalized = url.trim().replace(/\?.*$/, '');
    localStorage.setItem(URL_KEY, normalized);
    return normalized;
  }

  clearUrl() {
    localStorage.removeItem(URL_KEY);
    this.disconnect();
  }

  disconnect() {
    this.ready = false;
    if (this.iframe) this.iframe.remove();
    this.iframe = null;
    this.targetWindow = null;
    this.readyPromise = null;
    this.readyResolve = null;
    this.pending.forEach((p) => {
      window.clearTimeout(p.timer);
      p.reject(new Error('云端桥接已断开'));
    });
    this.pending.clear();
  }

  connect(rawUrl: string) {
    const url = this.saveUrl(rawUrl);
    this.disconnect();
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });

    // Preferred mode on iPhone/Safari: the Drawnix page is opened inside the
    // Apps Script wrapper. In that case google.script.run lives in the parent,
    // so no third-party Apps Script iframe is needed at all.
    if (window.parent && window.parent !== window) {
      this.targetWindow = window.parent;
      window.parent.postMessage({ scope: SCOPE, type: 'hello' }, '*');
      return this.waitReady();
    }

    // Fallback for desktop/direct GitHub Pages access.
    const iframe = document.createElement('iframe');
    iframe.title = 'Google Apps Script 云端桥接';
    iframe.style.position = 'fixed';
    iframe.style.width = '2px';
    iframe.style.height = '2px';
    iframe.style.opacity = '0.01';
    iframe.style.pointerEvents = 'none';
    iframe.style.border = '0';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.zIndex = '-1';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.src = `${url}?mode=bridge&v=${Date.now()}`;
    document.body.appendChild(iframe);
    this.iframe = iframe;
    this.targetWindow = iframe.contentWindow;
    return this.waitReady();
  }

  async waitReady(timeoutMs = 20000) {
    if (this.ready) return;
    if (!this.readyPromise) throw new Error('尚未配置云端地址');
    await Promise.race([
      this.readyPromise,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('Apps Script 云端桥接连接超时')), timeoutMs)),
    ]);
  }

  async call<T = any>(action: string, payload: any = null): Promise<T> {
    await this.waitReady();
    if (!this.targetWindow) throw new Error('云端桥接不可用');
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`云端操作超时：${action}`));
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.targetWindow!.postMessage({ scope: SCOPE, type: 'request', id, action, payload }, '*');
    });
  }

  private onMessage = (event: MessageEvent) => {
    const msg = event.data;
    if (!msg || msg.scope !== SCOPE) return;
    if (msg.type === 'ready') {
      this.ready = true;
      this.readyResolve?.();
      return;
    }
    if (msg.type !== 'response' || typeof msg.id !== 'number') return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    window.clearTimeout(pending.timer);
    if (msg.ok) pending.resolve(msg.result);
    else pending.reject(new Error(msg.error || '云端操作失败'));
  };
}
