import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { TcpModelClient } from './tcpForwarder';

const DEFAULT_MODEL_HOST = process.env.MODEL_TCP_HOST || '127.0.0.1';
const DEFAULT_MODEL_PORT = parseInt(process.env.MODEL_TCP_PORT || '12345', 10);
const MAX_QUEUE = 2;

export function setupWebsocketServer(server: http.Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const tcpClient = new TcpModelClient(DEFAULT_MODEL_HOST, DEFAULT_MODEL_PORT);
  let tcpConnected = false;
  let connecting = false;

  async function ensureConnected() {
    if (tcpConnected || connecting) return;
    connecting = true;
    try {
      await tcpClient.connect();
      tcpConnected = true;
      console.log(`Connected to model TCP ${DEFAULT_MODEL_HOST}:${DEFAULT_MODEL_PORT}`);
    } catch (err: any) {
      console.error('Failed to connect to model TCP:', err && err.message ? err.message : err);
      tcpConnected = false;
    } finally {
      connecting = false;
    }
  }

  // Try initial connection but don't block server start
  ensureConnected();

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    const queue: Buffer[] = [];
    let busy = false;

    async function processNext() {
      if (busy) return;
      const frame = queue.shift();
      if (!frame) return;
      busy = true;
      try {
        if (!tcpConnected) await ensureConnected();
        if (!tcpConnected) {
          ws.send(JSON.stringify({ status: 'error', message: 'model unavailable' }));
          busy = false;
          // Allow next frames to be processed if any
          setImmediate(processNext);
          return;
        }
        const resp = await tcpClient.sendFrame(frame);
        console.log('[wsServer] Raw model response:', JSON.stringify(resp).substring(0, 300));

        // Check if model is still buffering (skip these responses)
        if (resp && resp.status === 'buffering') {
          console.log('[wsServer] Model buffering, skipping frontend notification');
          busy = false;
          if (queue.length > 0) setImmediate(processNext);
          return;
        }

        // Only send successful responses with probabilities to frontend
        if (resp && resp.status === 'ok' && resp.probabilities) {
          const out: any = {
            status: 'ok',
            probabilities: resp.probabilities,
          };
          console.log('[wsServer] Sending probs to frontend:', JSON.stringify(out).substring(0, 200));
          ws.send(JSON.stringify(out));
        } else {
          console.log('[wsServer] Model response has no probabilities, skipping');
        }
      } catch (err: any) {
        ws.send(JSON.stringify({ status: 'error', message: err && err.message ? err.message : String(err) }));
        // Try to reconnect next time
        tcpConnected = false;
      } finally {
        busy = false;
        if (queue.length > 0) setImmediate(processNext);
      }
    }

    ws.on('message', (data) => {
      // Expect binary JPEG frames from the frontend
      if (typeof data === 'string') {
        // ignore text messages or use for control
        try {
          const ctrl = JSON.parse(data);
          if (ctrl && ctrl.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        } catch {}
        return;
      }
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      // push and cap queue
      queue.push(buf);
      if (queue.length > MAX_QUEUE) {
        // drop older frames, keep newest
        queue.splice(0, queue.length - MAX_QUEUE);
      }
      setImmediate(processNext);
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      console.error('WebSocket error', err);
    });
  });

  wss.on('listening', () => console.log('WebSocket server listening on /ws'));
}
