import http from 'http';
import WebSocket, { RawData, WebSocketServer } from 'ws';
import { TcpModelClient } from './tcpForwarder';
import { WsTcpBridge } from './lib/wsTcpBridge';

const DEFAULT_MODEL_HOST = process.env.MODEL_TCP_HOST || '127.0.0.1';
const DEFAULT_MODEL_PORT = parseInt(process.env.MODEL_TCP_PORT || '12345', 10);
const MAX_QUEUE = 10; // max frames to queue per client, to avoid memory issues if model is slow

export function setupWebsocketServer(server: http.Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const tcpClient = new TcpModelClient(DEFAULT_MODEL_HOST, DEFAULT_MODEL_PORT);
  let tcpConnected = false;
  let connecting = false;

  async function ensureConnected(): Promise<boolean> {
    if (tcpConnected || connecting) return tcpConnected;
    connecting = true;
    try {
      await tcpClient.connect();
      tcpConnected = true;
      console.log(`Connected to model TCP ${DEFAULT_MODEL_HOST}:${DEFAULT_MODEL_PORT}`);
    } catch (err) {
      console.error('Failed to connect to model TCP:', err);
      tcpConnected = false;
    } finally {
      connecting = false;
    }
    return tcpConnected;
  }

  // Try initial connection but don't block server start
  void ensureConnected();

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');

    const bridge = new WsTcpBridge(tcpClient, ensureConnected);
    const queue: Buffer[] = [];
    let busy = false;
    let closed = false;

    const toBuffer = (data: RawData): Buffer => {
      if (Buffer.isBuffer(data)) return data;
      if (Array.isArray(data)) return Buffer.concat(data);
      return Buffer.from(data);
    };

    const processNext = async () => {
      if (busy || closed) return;

      const frame = queue.shift();
      if (!frame) return;

      busy = true;
      try {
        const result = await bridge.forwardFrame(frame);

        if (closed || ws.readyState !== WebSocket.OPEN) {
          return;
        }

        if (result.status === 'buffering') {
          console.log('[wsServer] Model buffering, skipping frontend notification');
          return;
        }

        if (result.status === 'ok') {
          const out = { status: 'ok', probabilities: result.probabilities };
          console.log('[wsServer] Sending probs to frontend:', JSON.stringify(out).substring(0, 200));
          ws.send(JSON.stringify(out));
          return;
        }

        if (result.status === 'error') {
          ws.send(JSON.stringify({ status: 'error', message: result.message }));
          return;
        }

        console.log('[wsServer] Model response has no probabilities, skipping');
      } finally {
        busy = false;
        if (!closed && queue.length > 0) {
          setImmediate(() => {
            void processNext();
          });
        }
      }
    };

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (!isBinary) {
        try {
          const ctrl = JSON.parse(toBuffer(data).toString('utf8')) as { type?: string };
          if (ctrl.type === 'ping' && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {
          // Ignore invalid control messages.
        }
        return;
      }

      const buf = toBuffer(data);
      queue.push(buf);
      if (queue.length > MAX_QUEUE) {
        // Drop older frames and keep the most recent ones.
        queue.splice(0, queue.length - MAX_QUEUE);
      }

      setImmediate(() => {
        void processNext();
      });
    });

    ws.on('close', () => {
      closed = true;
      queue.length = 0;
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      closed = true;
      queue.length = 0;
      console.error('WebSocket error', err);
    });
  });

  wss.on('listening', () => console.log('WebSocket server listening on /ws'));
}
