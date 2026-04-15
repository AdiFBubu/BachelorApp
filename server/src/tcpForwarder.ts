import net from 'net';

export class TcpModelClient {
  private host: string;
  private port: number;
  private socket: net.Socket | null = null;
  private buffer: string = '';
  private lineQueue: string[] = [];
  private lineResolvers: ((line: string) => void)[] = [];

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
        this.socket!.setNoDelay(true);
        // Set up persistent data listener to avoid memory leaks
        this.socket!.on('data', (data) => {
          this.onSocketData(data);
        });
        resolve();
      });
      this.socket.on('error', (err) => {
        reject(err);
      });
    });
  }

  close() {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }

  private onSocketData(data: Buffer) {
    this.buffer += data.toString();
    // Process complete lines from buffer
    while (true) {
      const idx = this.buffer.indexOf('\n');
      if (idx < 0) break;
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      // Try to resolve pending promise, or queue it
      const resolver = this.lineResolvers.shift();
      if (resolver) {
        resolver(line);
      } else {
        this.lineQueue.push(line);
      }
    }
  }

  private receiveLine(): Promise<string> {
    // If we already have a line queued, return it immediately
    if (this.lineQueue.length > 0) {
      return Promise.resolve(this.lineQueue.shift()!);
    }
    // Otherwise, wait for the next line via socket data event
    return new Promise((resolve) => {
      this.lineResolvers.push(resolve);
    });
  }

  async sendFrame(jpegBuffer: Buffer): Promise<any> {
    if (!this.socket) throw new Error('Not connected');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(jpegBuffer.length, 0);
    await new Promise<void>((resolve, reject) => {
      this.socket!.write(lenBuf, (err) => {
        if (err) return reject(err);
        this.socket!.write(jpegBuffer, (err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
    const line = await this.receiveLine();
    try {
      return JSON.parse(line);
    } catch {
      return line;
    }
  }
}

// Usage example:
// const client = new TcpModelClient('127.0.0.1', 12345);
// await client.connect();
// const resp = await client.sendFrame(jpegBuffer);
// console.log(resp);
// client.close();
