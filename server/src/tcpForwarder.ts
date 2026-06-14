import net from 'net';

export class TcpModelClient {
  public host: string;
  public port: number;
  private socket: net.Socket | null = null;
  private buffer: string = ''; 
  private lineQueue: string[] = []; 
  private lineResolvers: ((line: string) => void)[] = []; 

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  public isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed && this.socket.writable;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        this.socket.destroy();
      }

      this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
        this.socket!.setNoDelay(true);
        console.log(`[TCP] Connected to ${this.host}:${this.port}`);
        resolve();
      });

      this.socket.on('data', (data) => {
        this.onSocketData(data);
      });

      this.socket.on('error', (err) => {
        console.error(`[TCP] Socket error on ${this.port}:`, err.message);
        this.cleanup();
        reject(err);
      });

      this.socket.on('close', () => {
        console.log(`[TCP] Connection closed on ${this.port}`);
        this.cleanup();
      });
    });
  }

  private cleanup() {
    this.socket = null;
    this.buffer = '';
    this.lineQueue = [];
    this.lineResolvers.forEach(resolve => resolve('{"status":"error","message":"Connection lost"}'));
    this.lineResolvers = [];
  }

  close() {
    if (this.socket) {
      this.socket.end();
      this.cleanup();
    }
  }

  private onSocketData(data: Buffer) {
    this.buffer += data.toString();
    while (true) {
      const idx = this.buffer.indexOf('\n');
      if (idx < 0) break;
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);

      const resolver = this.lineResolvers.shift();
      if (resolver) {
        resolver(line);
      } else {
        this.lineQueue.push(line);
      }
    }
  }

  private receiveLine(): Promise<string> {
    if (this.lineQueue.length > 0) {
      return Promise.resolve(this.lineQueue.shift()!);
    }
    return new Promise((resolve) => {
      this.lineResolvers.push(resolve);
    });
  }

  async sendFrame(jpegBuffer: Buffer): Promise<any> {
    if (!this.isConnected()) {
        return { status: "error", message: "TCP Socket not connected" };
    }

    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(jpegBuffer.length, 0);

    return new Promise((resolve, reject) => {
      this.socket!.write(lenBuf, (err) => {
        if (err) return reject(err);
        
        this.socket!.write(jpegBuffer, async (err2) => {
          if (err2) return reject(err2);
          
          const line = await this.receiveLine();
          try {
            resolve(JSON.parse(line));
          } catch {
            resolve(line);
          }
        });
      });
    });
  }
}