import type {
  ClientMessage,
  GameAction,
  GameRules,
  OwnerAction,
  RoomView,
  ServerMessage,
} from "@stacked/shared";
import { useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toast";
import { translateError, translateMessage } from "./i18n";
import { playSound } from "./sound";

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface EmoteEvent {
  key: number;
  playerId: string;
  emote: string;
}

export interface ChatEvent {
  key: number;
  playerId: string;
  lineId: string;
  at: number;
}

export interface FriendInviteEvent {
  key: number;
  inviteId: string;
  fromName: string;
  roomCode: string;
  players: number;
  maxPlayers: number;
  expiresAt: number;
}

export interface GameStore {
  status: ConnectionStatus;
  room: RoomView | null;
  emotes: EmoteEvent[];
  chats: ChatEvent[];
  invites: FriendInviteEvent[];
  offset: number;
}

interface Waiter {
  resolve: (room: RoomView) => void;
  reject: (error: Error) => void;
  timer: number;
}

class GameClient {
  private socket: WebSocket | null = null;
  private state: GameStore = { status: "idle", room: null, emotes: [], chats: [], invites: [], offset: 0 };
  private listeners = new Set<() => void>();
  private queue: ClientMessage[] = [];
  private waiters: Waiter[] = [];
  private currentRoomCode: string | null = null;
  private intentional = false;
  private retries = 0;
  private reconnectTimer: number | null = null;
  private connectPromise: Promise<void> | null = null;
  private resolveConnect: (() => void) | null = null;
  private hasConnected = false;
  private emoteKey = 0;
  private chatKey = 0;
  private inviteKey = 0;
  private emoteTimers = new Set<number>();
  private inviteTimers = new Set<number>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): GameStore => this.state;

  private setState(patch: Partial<GameStore>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(): Promise<void> {
    if (this.isOpen()) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.intentional = false;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.resolveConnect = resolve;
      const guard = window.setTimeout(() => {
        this.resolveConnect = null;
        this.connectPromise = null;
        reject(new Error("Could not reach the table."));
      }, 9000);
      const original = this.resolveConnect;
      this.resolveConnect = () => {
        window.clearTimeout(guard);
        original?.();
      };
    });

    this.openSocket();
    return this.connectPromise;
  }

  private openSocket(): void {
    if (typeof window === "undefined") return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    this.socket = socket;
    this.setState({ status: this.hasConnected ? "reconnecting" : "connecting" });

    socket.onopen = () => {
      this.hasConnected = true;
      this.retries = 0;
      this.setState({ status: "open" });
      this.resolveConnect?.();
      this.resolveConnect = null;
      this.connectPromise = null;
      if (this.currentRoomCode) this.sendRaw({ t: "join", code: this.currentRoomCode });
      for (const message of this.queue.splice(0)) this.sendRaw(message);
    };

    socket.onmessage = (event) => {
      this.handle(event.data);
    };

    socket.onerror = () => {
      // onclose does the cleanup
    };

    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.resolveConnect = null;
      this.connectPromise = null;
      if (this.intentional) {
        this.setState({ status: "idle" });
        return;
      }
      if (this.state.room || this.currentRoomCode) {
        this.setState({ status: "reconnecting" });
        this.scheduleReconnect();
      } else {
        this.setState({ status: "idle" });
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    if (this.retries >= 7) {
      this.setState({ status: "closed" });
      toast.error(translateMessage("Lost connection to the table."));
      return;
    }
    const delay = Math.min(8000, 500 * 2 ** this.retries);
    this.retries++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentional || this.isOpen()) return;
      void this.connect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  private handle(raw: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    switch (message.t) {
      case "room": {
        const previous = this.state.room;
        const room = message.room;
        this.currentRoomCode = room.code;
        this.setState({
          room,
          offset: room.serverTime - Date.now(),
          ...(previous && previous.code !== room.code ? { chats: [] } : {}),
        });
        for (const waiter of this.waiters.splice(0)) {
          window.clearTimeout(waiter.timer);
          waiter.resolve(room);
        }
        if (previous?.phase === "playing" && room.phase === "ended") {
          window.dispatchEvent(new CustomEvent("stacked:refresh-session"));
        }
        break;
      }
      case "left":
        this.currentRoomCode = null;
        this.setState({ room: null, emotes: [], chats: [] });
        break;
      case "error":
        toast.error(translateError(message.code, message.message));
        this.rejectWaiters(new Error(translateError(message.code, message.message)));
        break;
      case "action_error":
        toast.warning(translateError(message.code, message.message));
        break;
      case "toast":
        if (message.tone === "error") toast.error(translateMessage(message.message));
        else if (message.tone === "success") toast.success(translateMessage(message.message));
        else toast.info(translateMessage(message.message));
        break;
      case "emote": {
        const key = ++this.emoteKey;
        this.setState({ emotes: [...this.state.emotes.slice(-8), { key, playerId: message.playerId, emote: message.emote }] });
        playSound("emote");
        const timer = window.setTimeout(() => {
          this.emoteTimers.delete(timer);
          this.setState({ emotes: this.state.emotes.filter((emote) => emote.key !== key) });
        }, 2800);
        this.emoteTimers.add(timer);
        break;
      }
      case "chat": {
        const key = ++this.chatKey;
        this.setState({
          chats: [
            ...this.state.chats.slice(-59),
            { key, playerId: message.playerId, lineId: message.lineId, at: message.at },
          ],
        });
        break;
      }
      case "friend_invite": {
        const key = ++this.inviteKey;
        const invite: FriendInviteEvent = {
          key,
          inviteId: message.inviteId,
          fromName: message.fromName,
          roomCode: message.roomCode,
          players: message.players,
          maxPlayers: message.maxPlayers,
          expiresAt: message.expiresAt,
        };
        this.setState({ invites: [...this.state.invites.slice(-3), invite] });
        const ttl = Math.max(1000, message.expiresAt - Date.now());
        const timer = window.setTimeout(() => {
          this.inviteTimers.delete(timer);
          this.dismissInvite(key);
        }, ttl);
        this.inviteTimers.add(timer);
        break;
      }
      case "pong":
        break;
    }
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of this.waiters.splice(0)) {
      window.clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private waitForRoom(timeout = 7000): Promise<RoomView> {
    return new Promise<RoomView>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: window.setTimeout(() => {
          this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
          reject(new Error("The table did not answer."));
        }, timeout),
      };
      this.waiters.push(waiter);
    });
  }

  private sendRaw(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.queue.push(message);
      return;
    }
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      this.queue.push(message);
    }
  }

  async join(code: string): Promise<RoomView> {
    const normalised = code.trim().toUpperCase();
    this.currentRoomCode = normalised;
    const wait = this.waitForRoom();
    if (this.isOpen()) this.sendRaw({ t: "join", code: normalised });
    else void this.connect().catch((error: Error) => this.rejectWaiters(error));
    return wait;
  }

  async createRoom(rules: Partial<GameRules> = {}, visibility: "public" | "private" = "private"): Promise<RoomView> {
    this.currentRoomCode = null;
    const wait = this.waitForRoom();
    await this.connect();
    this.sendRaw({ t: "create", rules, visibility });
    return wait;
  }

  async quickPlay(): Promise<RoomView> {
    this.currentRoomCode = null;
    const wait = this.waitForRoom();
    await this.connect();
    this.sendRaw({ t: "quick" });
    return wait;
  }

  leaveRoom(): void {
    this.sendRaw({ t: "leave" });
    this.currentRoomCode = null;
    this.setState({ room: null });
  }

  action(action: GameAction): void {
    const seq = this.state.room?.game?.seq;
    if (seq === undefined) return;
    this.send({ t: "action", action, seq });
  }

  start(): void {
    this.send({ t: "start" });
  }

  rematch(): void {
    this.send({ t: "rematch" });
  }

  setReady(ready: boolean): void {
    this.send({ t: "ready", ready });
  }

  updateRules(rules: Partial<GameRules>): void {
    this.send({ t: "rules", rules });
  }

  addBot(): void {
    this.send({ t: "bot", add: true });
  }

  removeBot(): void {
    this.send({ t: "bot", add: false });
  }

  kick(playerId: string): void {
    this.send({ t: "kick", playerId });
  }

  emote(emote: string): void {
    this.send({ t: "emote", emote });
  }

  chat(lineId: string): void {
    this.send({ t: "chat", lineId });
  }

  dismissInvite(key: number): void {
    this.setState({ invites: this.state.invites.filter((invite) => invite.key !== key) });
  }

  ownerAction(action: OwnerAction): void {
    this.send({ t: "owner", action });
  }

  ping(): void {
    this.send({ t: "ping", at: Date.now() });
  }

  send(message: ClientMessage): void {
    if (this.isOpen()) this.sendRaw(message);
    else {
      this.queue.push(message);
      void this.connect().catch(() => undefined);
    }
  }

  reset(): void {
    this.intentional = true;
    this.currentRoomCode = null;
    this.queue = [];
    this.rejectWaiters(new Error("Signed out."));
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.socket?.close(1000, "bye");
    } catch {
      // ignore
    }
    this.socket = null;
    for (const timer of this.emoteTimers) window.clearTimeout(timer);
    this.emoteTimers.clear();
    for (const timer of this.inviteTimers) window.clearTimeout(timer);
    this.inviteTimers.clear();
    this.setState({ status: "idle", room: null, emotes: [], chats: [], invites: [], offset: 0 });
  }

  now(): number {
    return Date.now() + this.state.offset;
  }
}

export const game = new GameClient();

export function useGame(): GameStore {
  return useSyncExternalStore(game.subscribe, game.getSnapshot, game.getSnapshot);
}
