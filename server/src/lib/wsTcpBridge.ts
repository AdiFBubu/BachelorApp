import { TcpModelClient } from '../tcpForwarder';

export type BridgeResponse =
  | { status: 'ok'; probabilities: unknown }
  | { status: 'buffering' }
  | { status: 'ignored' }
  | { status: 'error'; message: string };

export class WsTcpBridge {
  private tcpClient: TcpModelClient;
  private ensureConnected: () => Promise<boolean>;

  constructor(tcpClient: TcpModelClient, ensureConnected: () => Promise<boolean>) {
    this.tcpClient = tcpClient;
    this.ensureConnected = ensureConnected;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  public async forwardFrame(frame: Buffer): Promise<BridgeResponse> {
    try {
      if (!await this.ensureConnected()) {
        return { status: 'error', message: 'model unavailable' };
      }

      const resp = await this.tcpClient.sendFrame(frame);
      console.log('[wsBridge] Raw model response:', JSON.stringify(resp).substring(0, 300));

      if (this.isObject(resp) && resp.status === 'buffering') {
        return { status: 'buffering' };
      }

      if (this.isObject(resp) && resp.status === 'ok' && 'probabilities' in resp) {
        return {
          status: 'ok',
          probabilities: resp.probabilities,
        };
      }

      return { status: 'ignored' };
    } catch (err: unknown) {
      return {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public close() {
    // no-op for now; bridge no longer owns websocket/tcp lifecycle
  }
}
