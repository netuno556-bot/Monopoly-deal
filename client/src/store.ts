// ============================================================
//  STORE — estado global (Zustand) + ponte com o servidor
// ============================================================
import { create } from 'zustand';
import {
  EV, type ChatHistoryPayload, type ChatMsg, type ChatMsgPayload,
  type ErrorPayload, type GameAction, type GameStateView, type NoticePayload,
  type RoomView, type CardColor, type CardInst,
} from '@md/shared';
import { socket } from './net/socket';
import { narrate, sfx } from './audio';

// ---------- Fluxo de UI em andamento (modais da mesa) ----------
export type Flow =
  /** Menu de opções ao tocar numa carta da mão */
  | { kind: 'menu'; card: CardInst }
  /** Curinga escolhido de qual cor jogar */
  | { kind: 'wild'; card: CardInst }
  /** Construir Casa/Hotel num conjunto completo */
  | { kind: 'build'; card: CardInst }
  /** Carta de ação precisa de alvo */
  | { kind: 'target'; card: CardInst; op: 'debt' | 'sly' | 'dealbreaker' | 'forced' }
  /** Roubos: escolher propriedade do alvo */
  | { kind: 'pickProp'; card: CardInst; op: 'sly' | 'dealbreaker'; targetId: string }
  /** Negociação forçada: escolher sua propriedade primeiro */
  | { kind: 'giveProp'; card: CardInst; targetId: string }
  | { kind: 'giveProp2'; card: CardInst; targetId: string; giveUid: string }
  /** Escolher COMO pagar a cobrança (dinheiro e/ou propriedades) */
  | { kind: 'pay' }
  /** Descarte obrigatório (mão > limite) */
  | { kind: 'discard' }
  /** Escolher cor do aluguel curinga */
  | { kind: 'rentColor'; card: CardInst };

interface Store {
  connected: boolean;
  myId: string;
  room: RoomView | null;
  error: string | null;
  notice: NoticePayload | null;
  flow: Flow | null;
  selecting: Set<string>; // cartas marcadas (pagar/descartar)

  // chat da sala
  chat: ChatMsg[];
  chatOpen: boolean;
  chatUnread: number;

  setConnected: (v: boolean) => void;
  setMyId: (id: string) => void;
  setRoom: (r: RoomView | null) => void;
  showError: (m: string) => void;
  showNotice: (n: NoticePayload) => void;
  clearError: () => void;
  setFlow: (f: Flow | null) => void;
  toggleSelect: (uid: string) => void;
  clearSelection: () => void;
  openChat: () => void;
  closeChat: () => void;
  sendChat: (text: string) => void;

  createRoom: (name: string, visibility: 'public' | 'private') => void;
  joinRoom: (code: string, name: string) => void;
  leaveRoom: () => void;
  listRooms: () => void;
  startGame: () => void;
  updateSettings: (s: Partial<RoomView['settings']>) => void;
  addBot: () => void;
  removePlayer: (playerId: string) => void;
  rematch: () => void;
  act: (action: GameAction, cb?: (ok: boolean, msg?: string) => void) => void;
}

const ack = (ok: boolean, msg?: string) => ({ ok, msg });

export const useStore = create<Store>((set, get) => ({
  connected: false,
  myId: '',
  room: null,
  error: null,
  notice: null,
  flow: null,
  selecting: new Set<string>(),
  chat: [],
  chatOpen: false,
  chatUnread: 0,

  setConnected: v => set({ connected: v }),
  setMyId: id => set({ myId: id }),
  setRoom: r => set({ room: r }),
  showError: m => set({ error: m, notice: null }),
  showNotice: n => set({ notice: n, error: null }),
  clearError: () => set({ error: null }),
  setFlow: f => set({ flow: f, selecting: new Set() }),
  toggleSelect: uid => {
    const cur = new Set(get().selecting);
    cur.has(uid) ? cur.delete(uid) : cur.add(uid);
    set({ selecting: cur });
  },
  clearSelection: () => set({ selecting: new Set() }),
  openChat: () => set({ chatOpen: true, chatUnread: 0 }),
  closeChat: () => set({ chatOpen: false }),
  sendChat: text => {
    const t = text.trim().slice(0, 200);
    if (t) socket.emit(EV.CHAT, { text: t });
  },

  createRoom: (name, visibility) => {
    socket.emit(EV.CREATE, { name, visibility }, (r: { ok: boolean; code?: string; error?: ErrorPayload }) => {
      if (!r?.ok) get().showError(r?.error?.message ?? 'Falha ao criar sala');
    });
  },
  joinRoom: (code, name) => {
    socket.emit(EV.JOIN, { code, name }, (r: { ok: boolean; error?: ErrorPayload }) => {
      if (!r?.ok) get().showError(r?.error?.message ?? 'Falha ao entrar');
    });
  },
  leaveRoom: () => {
    socket.emit(EV.LEAVE);
    set({
      room: null, flow: null, selecting: new Set(),
      chat: [], chatOpen: false, chatUnread: 0,
    });
  },
  listRooms: () => {
    socket.emit(EV.LIST, (r: { ok: boolean; rooms?: unknown[] }) => {
      if (r?.ok) set({ notice: null });
    });
  },
  startGame: () => socket.emit(EV.START, {}, cbAck(set, get)),
  updateSettings: s => socket.emit(EV.SETTINGS, { settings: s }, cbAck(set, get)),
  addBot: () => socket.emit(EV.ADD_BOT, {}, cbAck(set, get)),
  removePlayer: playerId => socket.emit(EV.REMOVE_PLAYER, { playerId }, cbAck(set, get)),
  rematch: () => socket.emit(EV.REMATCH, {}, cbAck(set, get)),

  act: (action, cb) => {
    socket.emit(EV.ACTION, { action }, (r: { ok: boolean; error?: ErrorPayload }) => {
      if (r?.ok) {
        get().clearError();
        sfx(action.t === 'RENT' ? 'coin' : action.t === 'END_TURN' ? 'click' : 'card');
        cb?.(true);
      } else {
        const msg = r?.error?.message ?? 'Ação recusada';
        get().showError(msg);
        sfx('error');
        cb?.(false, msg);
      }
    });
  },
}));

function cbAck(set: (s: Partial<Store>) => void, get: () => Store) {
  return (r: { ok: boolean; error?: ErrorPayload }) => {
    if (!r?.ok) get().showError(r?.error?.message ?? 'Operação recusada');
  };
}

// ---------- Ligação dos eventos do servidor ----------
socket.on('connect', () => {
  useStore.getState().setConnected(true);
  useStore.getState().setMyId(socket.id ?? '');
});

socket.on('disconnect', () => useStore.getState().setConnected(false));

socket.on(EV.STATE, (p: { room: RoomView }) => {
  const store = useStore.getState();
  const prev = store.room;
  useStore.getState().setRoom(p.room);

  // Quando a partida acaba/começa, fecha modais abertos
  if (prev?.phase !== p.room.phase) useStore.getState().setFlow(null);

  // Ações pendentes para mim → abre modal de descarte automaticamente
  const g = p.room.game;
  const isMine = (id?: string) => id === store.myId;

  if (g?.blocking?.type === 'discard' && isMine(g.blocking.playerId)) {
    if (store.flow?.kind !== 'discard') store.setFlow({ kind: 'discard' });
  }

  // Cobrança aceita (estágio PAY) → abre o modal de escolha de pagamento
  const pend = g?.pending;
  const mustPayNow = !!pend && pend.stage === 'PAY' && isMine(pend.defenderId);
  if (mustPayNow) {
    if (store.flow?.kind !== 'pay') store.setFlow({ kind: 'pay' });
  } else if (store.flow?.kind === 'pay') {
    store.setFlow(null); // pagamento concluído/cancelado
  }

  // ---- áudio + narrador ----
  const pg = prev?.game;
  if (g && pg && p.room.phase === 'playing' && prev?.phase === 'playing') {
    hearGameChanges(pg, g, store.myId);
  }
  if (p.room.phase === 'ended' && prev?.phase !== 'ended' && g) {
    const iWon = g.winnerId === store.myId;
    const winnerName = g.players.find(x => x.id === g.winnerId)?.name ?? '';
    sfx('win');
    narrate(iWon ? 'Parabéns! Você venceu a partida!' : `${winnerName} venceu a partida. Fim de jogo.`);
  }
});

/** Sons/narrador para eventos da mesa vistos por este cliente */
function hearGameChanges(pg: GameStateView, g: GameStateView, myId: string): void {
  // turno mudou → avisa quando começa o MEU turno
  const prevActor = pg.players[pg.turnIndex];
  const actor = g.players[g.turnIndex];
  if (actor && prevActor && actor.id !== prevActor.id) {
    if (actor.id === myId) { sfx('chime'); narrate('Sua vez de jogar.'); }
  }

  // nova cobrança/roubo para mim → alerta
  const pend = g.pending;
  if (pend && (!pg.pending || pg.pending.id !== pend.id) && pend.defenderId === myId) {
    const who = g.players.find(x => x.id === pend.initiatorId)?.name ?? '';
    sfx('error');
    if (pend.kind === 'RENT' || pend.kind === 'DEBT') {
      narrate(`Atenção! Você deve pagar ${pend.amount} para ${who}.`);
    } else {
      narrate(`${who} quer roubar sua propriedade. Responda rápido!`);
    }
  }

  // aceitei pagar → escolher com o que pagar
  if (pend && pg.pending && pg.pending.id === pend.id
      && pg.pending.stage === 'SAYNO' && pend.stage === 'PAY' && pend.defenderId === myId) {
    narrate('Escolha com quais cartas vai pagar.');
  }

  // minha cobrança terminou (alguém pagou) → moedas
  if (!pend && pg.pending && pg.pending.initiatorId === myId
      && (pg.pending.kind === 'RENT' || pg.pending.kind === 'DEBT')) {
    sfx('coin');
    narrate('Pagamento recebido.');
  }

  // cartas sendo jogadas na mesa
  const lastId = pg.log.length ? pg.log[pg.log.length - 1].id : 0;
  const fresh = g.log.filter(l => l.id > lastId);
  if (fresh.some(l => /jogou|depositou|construiu|roubou/.test(l.text))) sfx('card');

  // preciso descartar
  if (g.blocking?.type === 'discard' && g.blocking.playerId === myId
      && !(pg.blocking && pg.blocking.playerId === myId)) {
    sfx('error');
    narrate('Você excedeu o limite de mão. Descarte cartas.');
  }
}

socket.on(EV.ERROR, (e: ErrorPayload) => useStore.getState().showError(e.message));
socket.on(EV.NOTICE, (n: NoticePayload) => useStore.getState().showNotice(n));
socket.on(EV.JOINED, () => useStore.getState().clearError());

// ---------- chat ----------
socket.on(EV.CHAT_MSG, (p: ChatMsgPayload) => {
  const st = useStore.getState();
  const mine = p.msg.from === st.myId;
  useStore.setState(s => ({
    chat: [...s.chat, p.msg].slice(-100),
    chatUnread: !s.chatOpen && !mine ? s.chatUnread + 1 : s.chatUnread,
  }));
  if (!mine) sfx('pop');
});
socket.on(EV.CHAT_HISTORY, (p: ChatHistoryPayload) => {
  useStore.setState({ chat: p.messages.slice(-100) });
});
