import http from 'http';
import WebSocket, { RawData, WebSocketServer } from 'ws';
import { TcpModelClient } from './tcpForwarder';
import { WsTcpBridge } from './lib/wsTcpBridge';

// ─── CONFIGURĂRI PORTURI ──────────────────────────────────────────
const PYTHON_MODEL_CONFIG = {
  host: process.env.PYTHON_MODEL_HOST || '127.0.0.1',
  port: parseInt(process.env.PYTHON_MODEL_PORT || '12345') // Modelul Python (CNN-LSTM)
};

const CPP_MODEL_CONFIG = {
  host: process.env.CPP_MODEL_HOST || '127.0.0.1',
  port: parseInt(process.env.CPP_MODEL_PORT || '12346') // Modelul C++ (SNN) - pornit cu --port 12346
};

const MAX_QUEUE = 10; 

export function setupWebsocketServer(server: http.Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // 1. Inițializăm ambii clienți TCP la nivel de server
  const pythonClient = new TcpModelClient(PYTHON_MODEL_CONFIG.host, PYTHON_MODEL_CONFIG.port);
  const cppClient = new TcpModelClient(CPP_MODEL_CONFIG.host, CPP_MODEL_CONFIG.port);

  // Funcție generică pentru a asigura conexiunea pe un client specific
  async function ensureConnected(client: TcpModelClient): Promise<boolean> {
    if (client.isConnected && client.isConnected()) return true; 
    try {
      await client.connect();
      console.log(`[TCP] Connected to model at ${client.host}:${client.port}`);
      return true;
    } catch (err) {
      console.error(`[TCP] Connection failed to ${client.host}:${client.port}`);
      return false;
    }
  }

  // Încercăm o conexiune inițială pentru ambele
  void ensureConnected(pythonClient);
  void ensureConnected(cppClient);

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');

    // 2. Starea per conexiune client (fiecare tab de browser poate avea modelul lui)
    let currentModelType: 'python' | 'cpp' = 'python'; 
    
    // Bridge-uri dedicate pentru fiecare client TCP
    const pythonBridge = new WsTcpBridge(pythonClient, () => ensureConnected(pythonClient));
    const cppBridge = new WsTcpBridge(cppClient, () => ensureConnected(cppClient));

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
        // 3. RUTARE: Alegem bridge-ul în funcție de selecția utilizatorului
        const activeBridge = (currentModelType === 'python') ? pythonBridge : cppBridge;
        const result = await activeBridge.forwardFrame(frame);

        if (closed || ws.readyState !== WebSocket.OPEN) return;

        // Nu trimitem nimic la frontend dacă modelul încă adună cadre (sliding window)
        if (result.status === 'buffering') {
          return;
        }

        if (result.status === 'ok') {
          const out = { 
            status: 'ok', 
            model: currentModelType, // Trimitem și sursa ca să știe frontend-ul
            probabilities: result.probabilities 
          };
          ws.send(JSON.stringify(out));
          return;
        }

        if (result.status === 'error') {
          ws.send(JSON.stringify({ status: 'error', message: result.message }));
          return;
        }
      } catch (err) {
        console.error(`[ProcessNext] Error forwarding to ${currentModelType}:`, err);
      } finally {
        busy = false;
        if (!closed && queue.length > 0) {
          setImmediate(() => { void processNext(); });
        }
      }
    };

    ws.on('message', (data: RawData, isBinary: boolean) => {
      // 4. MESAJE DE CONTROL (JSON)
      if (!isBinary) {
        try {
          const ctrl = JSON.parse(toBuffer(data).toString('utf8'));
          
          // Logica de Switch Model
          if (ctrl.type === 'switch_model' && (ctrl.model === 'python' || ctrl.model === 'cpp')) {
            currentModelType = ctrl.model;
            queue.length = 0; // Resetăm coada de cadre pentru noul model
            console.log(`[Control] Client switched to: ${currentModelType}`);
            ws.send(JSON.stringify({ status: 'info', message: `Model switched to ${currentModelType}` }));
            return;
          }

          if (ctrl.type === 'ping' && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {
          // Ignore invalid JSON
        }
        return;
      }

      // 5. MESAJE BINARE (Frame-uri video)
      const buf = toBuffer(data);
      queue.push(buf);
      
      if (queue.length > MAX_QUEUE) {
        queue.splice(0, queue.length - MAX_QUEUE);
      }

      setImmediate(() => { void processNext(); });
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