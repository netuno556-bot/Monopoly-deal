// ============================================================
//  SALAS — código de 6 dígitos, lobby, settings, bots, timers
// ============================================================
import type { Server, Socket } from 'socket.io';
import {
  EV, DEFAULT_SETTINGS,
  type ChatMsg, type GameAction, type GameSettings, type PublicRoomInfo,
  type RoomPlayerMeta, type RoomView, type Visibility,
} from '@md/shared';
import { Engine, GameError } from './engine.js';
import { botCandidates } from './bot.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
const BOT_NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eva', 'Felipe'];

interface RoomPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  connected: boolean;
  socket?: Socket;
}

export class Room {
  players: RoomPlayer[] = [];
  engine: Engine | null = null;
  phase: 'lobby' | 'playing' | 'ended' = 'lobby';
  settings: GameSettings = { ...DEFAULT_SETTINGS };
  chat: ChatMsg[] = [];

  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval>;
  private botSeq = 0;

  constructor(private io: Server, public code: string, public visibility: Visibility) {
    this.ticker = setInterval(() => this.tick(), 1000);
  }

  destroy(): void {
    clearInterval(this.ticker);
    if (this.botTimer) clearTimeout(this.botTimer);
  }

  get isEmpty(): boolean { return this.players.length === 0; }

  // ---------------- lobby ----------------

  join(socket: Socket, rawName: string): void {
    if (this.phase !== 'lobby') {
      throw new GameError('IN_PROGRESS', 'A partida já começou — tente outra sala');
    }
    if (this.players.length >= MAX_PLAYERS) {
      throw new GameError('FULL', 'Sala cheia (máximo 6 jogadores)');
    }
    const name = (rawName ?? '').trim().slice(0, 16) || 'Jogador';
    const isHost = this.players.length === 0;
    this.players.push({
      id: socket.id, name, isHost, isBot: false, connected: true, socket,
    });
    this.broadcast();
  }

  /** Retorna true se a sala ficou vazia e deve ser destruída */
  leave(socketId: string): boolean {
    const idx = this.players.findIndex(p => p.id === socketId);
    if (idx < 0) return false;
    const wasHost = this.players[idx].isHost;
    this.players.splice(idx, 1);

    if (this.players.length === 0) return true;

    if (wasHost) this.players[0].isHost = true;

    // Se a partida estava em andamento, elimina o jogador
    if (this.engine && this.phase === 'playing') {
      try { this.engine.eliminate(socketId); } catch { /* ignora */ }
      this.scheduleBot();
    }
    this.broadcast();
    return false;
  }

  addBot(actorId: string): void {
    this.requireHost(actorId);
    if (this.phase !== 'lobby') throw new GameError('IN_PROGRESS', 'Só no lobby');
    if (this.players.length >= MAX_PLAYERS) throw new GameError('FULL', 'Sala cheia');
    this.botSeq++;
    const base = BOT_NAMES[(this.botSeq - 1) % BOT_NAMES.length];
    const suffix = this.botSeq > BOT_NAMES.length ? ` ${this.botSeq}` : '';
    this.players.push({
      id: `bot-${Date.now().toString(36)}-${this.botSeq}`,
      name: `${base}${suffix}`, isHost: this.players.length === 0,
      isBot: true, connected: true,
    });
    this.broadcast();
  }

  removePlayer(actorId: string, targetId: string): void {
    this.requireHost(actorId);
    if (this.phase !== 'lobby') throw new GameError('IN_PROGRESS', 'Só no lobby');
    const idx = this.players.findIndex(p => p.id === targetId);
    if (idx < 0) throw new GameError('NO_PLAYER', 'Jogador não encontrado');
    const wasHost = this.players[idx].isHost;
    this.players.splice(idx, 1);
    if (wasHost && this.players.length > 0) this.players[0].isHost = true;
    this.broadcast();
  }

  updateSettings(actorId: string, partial: Partial<GameSettings>): void {
    this.requireHost(actorId);
    if (this.phase !== 'lobby') throw new GameError('IN_PROGRESS', 'Só no lobby');
    const clamp = (v: unknown, min: number, max: number, fb: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fb;
    this.settings = {
      setsToWin: clamp(partial.setsToWin, 1, 5, this.settings.setsToWin),
      movesPerTurn: clamp(partial.movesPerTurn, 2, 5, this.settings.movesPerTurn),
      drawCardsPerTurn: clamp(partial.drawCardsPerTurn, 1, 3, this.settings.drawCardsPerTurn),
      handLimit: clamp(partial.handLimit, 5, 10, this.settings.handLimit),
      turnTimerSec: clamp(partial.turnTimerSec, 0, 120, this.settings.turnTimerSec),
    };
    this.broadcast();
  }

  start(actorId: string): void {
    this.requireHost(actorId);
    if (this.phase === 'playing') throw new GameError('IN_PROGRESS', 'Já está jogando');
    if (this.players.length < MIN_PLAYERS) {
      throw new GameError('FEW_PLAYERS', `Mínimo de ${MIN_PLAYERS} jogadores (adicione bots)`);
    }
    this.engine = new Engine(
      this.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost, isBot: p.isBot })),
      this.settings,
    );
    this.phase = 'playing';
    this.broadcast();
    this.scheduleBot();
  }

  rematch(actorId: string): void {
    this.requireHost(actorId);
    this.engine = null;
    this.phase = 'lobby';
    this.broadcast();
  }

  // ---------------- jogo ----------------

  action(actorId: string, action: GameAction): void {
    if (this.phase !== 'playing' || !this.engine) {
      throw new GameError('NOT_PLAYING', 'A partida não está em andamento');
    }
    this.engine.act(actorId, action);
    this.broadcast();
    this.scheduleBot();
  }

  /** Mensagem de chat — só para quem está na sala (máx. 200 caracteres) */
  chatFrom(actorId: string, raw: string): void {
    const player = this.players.find(p => p.id === actorId);
    if (!player) throw new GameError('NO_PLAYER', 'Você não está nesta sala');
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text) return;
    const msg: ChatMsg = { from: actorId, name: player.name, text, ts: Date.now() };
    this.chat.push(msg);
    if (this.chat.length > 50) this.chat.splice(0, this.chat.length - 50);
    this.io.to(this.code).emit(EV.CHAT_MSG, { msg });
  }

  chatHistory(): ChatMsg[] {
    return [...this.chat];
  }

  view(forId: string): RoomView {
    const metas: RoomPlayerMeta[] = this.players.map(p => ({
      id: p.id, name: p.name, isHost: p.isHost, isBot: p.isBot, connected: p.connected,
    }));
    const host = this.players.find(p => p.isHost);
    return {
      code: this.code,
      visibility: this.visibility,
      hostId: host?.id ?? '',
      settings: this.settings,
      players: metas,
      phase: this.phase,
      game: this.engine && this.phase !== 'lobby' ? this.engine.view(forId) : undefined,
    };
  }

  broadcast(): void {
    for (const p of this.players) {
      if (p.socket && p.socket.connected) {
        p.socket.emit(EV.STATE, { room: this.view(p.id) });
      }
    }
  }

  publicInfo(): PublicRoomInfo {
    const host = this.players.find(p => p.isHost);
    return {
      code: this.code, hostName: host?.name ?? '?',
      playerCount: this.players.length, maxPlayers: MAX_PLAYERS, phase: this.phase,
    };
  }

  // ---------------- internals ----------------

  private requireHost(id: string): void {
    const p = this.players.find(x => x.id === id);
    if (!p?.isHost) throw new GameError('NOT_HOST', 'Só o anfitrião pode fazer isso');
  }

  private scheduleBot(): void {
    if (this.botTimer || !this.engine || this.phase !== 'playing') return;
    const actorId = this.engine.currentActorId();
    if (!actorId) return;
    const actor = this.players.find(p => p.id === actorId);
    if (!actor?.isBot) return;
    this.botTimer = setTimeout(() => this.runBot(), 700 + Math.random() * 700);
  }

  private runBot(): void {
    this.botTimer = null;
    if (!this.engine || this.phase !== 'playing') return;
    const actorId = this.engine.currentActorId();
    if (!actorId) return;
    const actor = this.players.find(p => p.id === actorId);
    if (!actor?.isBot) return;

    let acted = false;
    for (const a of botCandidates(this.engine)) {
      try { this.engine.act(actorId, a); acted = true; break; }
      catch { /* tenta a próxima candidata */ }
    }
    if (!acted) {
      try { this.engine.act(actorId, { t: 'END_TURN' }); } catch { /* ignora */ }
    }
    this.broadcast();
    this.scheduleBot();
  }

  private tick(): void {
    if (!this.engine || this.phase !== 'playing') return;
    if (this.engine.autoAct()) {
      this.broadcast();
      this.scheduleBot();
    }
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private io: Server) {}

  create(visibility: Visibility): Room {
    let code = '';
    do {
      code = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
    } while (this.rooms.has(code));
    const room = new Room(this.io, code, visibility);
    this.rooms.set(code, room);
    return room;
  }

  get(code?: string): Room | undefined {
    if (!code) return undefined;
    return this.rooms.get(code.trim());
  }

  remove(code: string): void {
    this.rooms.get(code)?.destroy();
    this.rooms.delete(code);
  }

  listPublic(): PublicRoomInfo[] {
    return [...this.rooms.values()]
      .filter(r => r.visibility === 'public' && r.phase === 'lobby')
      .map(r => r.publicInfo());
  }
}
