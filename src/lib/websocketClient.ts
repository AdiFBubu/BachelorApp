export type WebSocketClientOptions = {
  binaryType?: 'arraybuffer' | 'blob' | 'fragments';
  autoReconnect?: boolean;
  reconnectIntervalMs?: number;
};

export default class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private binaryType: WebSocketClientOptions['binaryType'];
  private autoReconnect: boolean;
  private reconnectIntervalMs: number;
  private reconnectTimer: number | null = null;
  private isManualClose = false;

  onOpen?: () => void;
  onClose?: (ev?: CloseEvent) => void;
  onError?: (ev?: Event) => void;
  onParsedMessage?: (msg: any) => void;
  onRawMessage?: (data: any) => void;

  constructor(url: string, options?: WebSocketClientOptions) {
    this.url = url;
    this.binaryType = options?.binaryType ?? 'arraybuffer';
    this.autoReconnect = options?.autoReconnect ?? false;
    this.reconnectIntervalMs = options?.reconnectIntervalMs ?? 2000;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.isManualClose = false;
    try {
      const ws = new WebSocket(this.url);
      try {
        ws.binaryType = this.binaryType as any;
      } catch {}

      ws.onopen = () => {
        this.onOpen?.();
      };

      ws.onmessage = (ev: MessageEvent) => {
        try {
          if (typeof ev.data === 'string') {
            const parsed = JSON.parse(ev.data);
            this.onParsedMessage?.(parsed);
            return;
          }

          // ArrayBuffer or typed array
          if (ev.data instanceof ArrayBuffer || ArrayBuffer.isView(ev.data)) {
            try {
              const decoded = typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(ev.data as ArrayBuffer) : null;
              if (decoded) {
                const parsed = JSON.parse(decoded);
                this.onParsedMessage?.(parsed);
                return;
              }
            } catch {}
            this.onRawMessage?.(ev.data);
            return;
          }

          // Blob or other
          if (ev.data instanceof Blob) {
            ev.data.text().then((t) => {
              try {
                const parsed = JSON.parse(t);
                this.onParsedMessage?.(parsed);
              } catch {
                this.onRawMessage?.(ev.data);
              }
            }).catch(() => this.onRawMessage?.(ev.data));
            return;
          }

          this.onRawMessage?.(ev.data);
        } catch (err) {
          this.onRawMessage?.(ev.data);
        }
      };

      ws.onclose = (ev) => {
        this.ws = null;
        this.onClose?.(ev);
        if (this.autoReconnect && !this.isManualClose) {
          this.reconnectTimer = window.setTimeout(() => this.connect(), this.reconnectIntervalMs) as unknown as number;
        }
      };

      ws.onerror = (ev) => {
        this.onError?.(ev);
      };

      this.ws = ws;
    } catch (err) {
      this.onError?.(err as any);
      if (this.autoReconnect) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), this.reconnectIntervalMs) as unknown as number;
      }
    }
  }

  send(data: ArrayBuffer | string | Blob) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(data as any);
      return true;
    } catch (err) {
      return false;
    }
  }

  close() {
    this.isManualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  isOpen() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
