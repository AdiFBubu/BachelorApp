import WebSocket from 'ws';
import { TcpModelClient } from '../tcpForwarder';

export class WsTcpBridge {
  private ws: WebSocket;
  private tcpClient: TcpModelClient;
  private ensureConnected: () => Promise<boolean>;
  private queue: Buffer[] = [];
  private busy = false;
  private maxQueue: number;

  constructor(ws: WebSocket, tcpClient: TcpModelClient, ensureConnected: () => Promise<boolean>, maxQueue = 10) {
    this.ws = ws;
    this.tcpClient = tcpClient;
    this.ensureConnected = ensureConnected;
    this.maxQueue = maxQueue;

    this.setup();
  }

  private setup() {
    console.log('WebSocket client connected');

    this.ws.on('message', (data) => this.onMessage(data));

    this.ws.on('close', () => {
      console.log('WebSocket client disconnected');
      this.cleanup();
    });

    this.ws.on('error', (err) => {
      console.error('WebSocket error', err);
      this.cleanup();
    });
  }

  private onMessage(data: WebSocket.Data) {
    // Expect binary JPEG frames from the frontend
    if (typeof data === 'string') {
      // ignore text messages or use for control
      try {
        const ctrl = JSON.parse(data);
        if (ctrl && ctrl.type === 'ping') this.ws.send(JSON.stringify({ type: 'pong' }));
      } catch {}
      return;
    }

    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    // push and cap queue
    this.queue.push(buf);
    if (this.queue.length > this.maxQueue) {
      // drop older frames, keep newest
      this.queue.splice(0, this.queue.length - this.maxQueue);
    }
    setImmediate(() => this.processNext());
  }

  private async processNext() {
    if (this.busy) return;
    const frame = this.queue.shift();
    if (!frame) return;
    this.busy = true;
    try {
      if (!await this.ensureConnected()) {
        this.ws.send(JSON.stringify({ status: 'error', message: 'model unavailable' }));
        this.busy = false;
        // Allow next frames to be processed if any
        setImmediate(() => this.processNext());
        return;
      }

      const resp = await this.tcpClient.sendFrame(frame);
      console.log('[wsServer] Raw model response:', JSON.stringify(resp).substring(0, 300));

      // Check if model is still buffering (skip these responses)
      if (resp && resp.status === 'buffering') {
        console.log('[wsServer] Model buffering, skipping frontend notification');
        this.busy = false;
        if (this.queue.length > 0) setImmediate(() => this.processNext());
        return;
      }

      // Only send successful responses with probabilities to frontend
      if (resp && resp.status === 'ok' && resp.probabilities) {
        const out: any = {
          status: 'ok',
          probabilities: resp.probabilities,
        };
        console.log('[wsServer] Sending probs to frontend:', JSON.stringify(out).substring(0, 200));
        // send to frontend (CameraStreamer) as JSON string
        this.ws.send(JSON.stringify(out));
      } else {
        console.log('[wsServer] Model response has no probabilities, skipping');
      }
    } catch (err: any) {
      this.ws.send(JSON.stringify({ status: 'error', message: err && err.message ? err.message : String(err) }));
      // Try to reconnect next time by letting ensureConnected handle it
    } finally {
      this.busy = false;
      if (this.queue.length > 0) setImmediate(() => this.processNext());
    }
  }

  private cleanup() {
    this.queue.length = 0;
  }

  public close() {
    try { this.ws.close(); } catch {}
    this.cleanup();
  }
}
