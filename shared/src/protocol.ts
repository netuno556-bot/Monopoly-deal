// ============================================================
//  PROTOCOLO — eventos Socket.io (cliente <-> servidor)
// ============================================================
import type { GameAction, GameSettings, PublicRoomInfo, RoomView } from './types.js';

export const EV = {
  // cliente -> servidor
  CREATE: 'room:create',
  JOIN: 'room:join',
  LEAVE: 'room:leave',
  LIST: 'room:list',
  START: 'room:start',
  SETTINGS: 'room:settings',
  ADD_BOT: 'room:addBot',
  REMOVE_PLAYER: 'room:removePlayer',
  REMATCH: 'room:rematch',
  ACTION: 'game:action',
  CHAT: 'chat:msg',

  // servidor -> cliente
  CREATED: 'room:created',
  JOINED: 'room:joined',
  LIST_RESULT: 'room:listResult',
  STATE: 'state',
  NOTICE: 'notice',
  ERROR: 'error',
  CHAT_MSG: 'chat:message',
  CHAT_HISTORY: 'chat:history',
} as const;

// ---------- payloads ----------
export interface CreatePayload { name: string; visibility?: 'public' | 'private'; }
export interface JoinPayload { code: string; name: string; }
export interface SettingsPayload { settings: Partial<GameSettings>; }
export interface RemovePlayerPayload { playerId: string; }
export interface ActionPayload { action: GameAction; }
export interface ChatSendPayload { text: string; }

export interface CreatedPayload { code: string; }
export interface JoinedPayload { code: string; }
export interface ListResultPayload { rooms: PublicRoomInfo[]; }
export interface StatePayload { room: RoomView; }
export interface NoticePayload { text: string; kind?: 'info' | 'success' | 'warn' | 'error'; }
export interface ErrorPayload { message: string; code?: string; }

// ---------- chat ----------
export interface ChatMsg {
  from: string;
  name: string;
  text: string;
  /** timestamp (ms) */
  ts: number;
}
export interface ChatMsgPayload { msg: ChatMsg; }
export interface ChatHistoryPayload { messages: ChatMsg[]; }
