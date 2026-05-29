import Peer, { type DataConnection } from 'peerjs';
import { getIceServers } from '../turn';

export type { DataConnection };
export type PeerErrorInfo = { type?: string; message: string };

export type HostHandlers = {
  onReady(): void;
  onConnection(conn: DataConnection): void;
  onError(err: PeerErrorInfo): void;
};

export type ParticipantHandlers = {
  onConnected(): void;
  onData(raw: unknown): void;
  onDisconnected(): void;
  onError(err: PeerErrorInfo): void;
};

const TURN_FALLBACK_MS = 10_000;

export class RoomConnection {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  private constructor() {}

  static host(roomCode: string, handlers: HostHandlers): RoomConnection {
    const c = new RoomConnection();
    c.openHost(roomCode, handlers);
    return c;
  }

  static participant(roomCode: string, handlers: ParticipantHandlers): RoomConnection {
    const c = new RoomConnection();
    c.connectParticipant(roomCode, handlers);
    return c;
  }

  get isOpen(): boolean {
    return this.conn?.open ?? false;
  }

  send(msg: unknown): void {
    this.conn?.send(msg);
  }

  destroy(): void {
    this.destroyed = true;
    this.clearFallback();
    this.peer?.destroy();
    this.peer = null;
    this.conn = null;
  }

  private openHost(roomCode: string, handlers: HostHandlers): void {
    if (this.destroyed) return;
    this.peer = new Peer('lcv-' + roomCode.toLowerCase());
    this.peer.on('open', () => handlers.onReady());
    this.peer.on('connection', (conn) => handlers.onConnection(conn));
    this.peer.on('error', (err) => handlers.onError(err as PeerErrorInfo));
  }

  private connectParticipant(
    roomCode: string,
    handlers: ParticipantHandlers,
    iceServers?: RTCIceServer[],
  ): void {
    if (this.destroyed) return;
    this.peer?.destroy();
    this.conn = null;

    this.peer = new Peer(iceServers ? { config: { iceServers } } : {});

    this.peer.on('open', () => {
      this.conn = this.peer!.connect('lcv-' + roomCode.toLowerCase(), { reliable: true });

      if (!iceServers) {
        this.fallbackTimer = setTimeout(async () => {
          this.fallbackTimer = null;
          if (!this.conn?.open && !this.destroyed) {
            const servers = await getIceServers();
            if (servers) {
              this.connectParticipant(roomCode, handlers, servers);
            } else {
              handlers.onError({ message: 'Could not connect to the meeting.' });
            }
          }
        }, TURN_FALLBACK_MS);
      }

      let established = false;

      this.conn.on('open', () => {
        this.clearFallback();
        established = true;
        handlers.onConnected();
      });

      this.conn.on('data', (raw) => handlers.onData(raw));

      this.conn.on('close', () => {
        this.clearFallback();
        if (established) handlers.onDisconnected();
      });

      this.conn.on('error', () => this.clearFallback());
    });

    this.peer.on('error', (err) => {
      this.clearFallback();
      handlers.onError(err as PeerErrorInfo);
    });
  }

  private clearFallback(): void {
    if (this.fallbackTimer !== null) { clearTimeout(this.fallbackTimer); this.fallbackTimer = null; }
  }
}
