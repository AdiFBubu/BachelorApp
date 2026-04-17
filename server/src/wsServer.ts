import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
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
    // delegate connection handling to a small bridge object
    new WsTcpBridge(ws, tcpClient, ensureConnected, MAX_QUEUE);
  });

  wss.on('listening', () => console.log('WebSocket server listening on /ws'));
}
