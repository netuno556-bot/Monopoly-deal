// ============================================================
//  TIPOS DO JOGO (compartilhado entre servidor e cliente)
// ============================================================
import type { CardColor } from './cards.js';

// ---------- Configurações da sala ----------
export interface GameSettings {
  /** Conjuntos completos necessários para vencer (padrão: 3) */
  setsToWin: number;
  /** Jogadas por turno (padrão: 3) */
  movesPerTurn: number;
  /** Cartas compradas no início do turno (padrão: 2) */
  drawCardsPerTurn: number;
  /** Limite de mão (padrão: 7) — compras são limitadas ao espaço disponível */
  handLimit: number;
  /** Timer de turno em segundos (0 = desativado) */
  turnTimerSec: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  setsToWin: 3,
  movesPerTurn: 3,
  drawCardsPerTurn: 2,
  handLimit: 7,
  turnTimerSec: 60,
};

// ---------- Cartas em jogo ----------
export interface CardInst {
  uid: string;
  defId: string;
  /** Cor atribuída (curingas ao entrarem num grupo) */
  color?: CardColor;
}

export interface ColorGroup {
  color: CardColor;
  cards: CardInst[];
  house?: CardInst | null;
  hotel?: CardInst | null;
}

// ---------- Jogador ----------
export interface PlayerState {
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  connected: boolean;
  isOut: boolean;
  bank: CardInst[];
  groups: ColorGroup[];
  hand: CardInst[];
  /** Visível apenas no payload do próprio dono */
  handCount?: number;
}

// ---------- Ação pendente (cobrança/roubo aguardando resposta) ----------
export type PendingKind =
  | 'RENT' | 'DEBT' | 'DEAL_BREAKER' | 'SLY_DEAL' | 'FORCED_DEAL';

export interface PendingAction {
  id: string;
  kind: PendingKind;
  /** Quem iniciou a ação (cobra/rouba) */
  initiatorId: string;
  /** Alvo atual da fila (aluguéis têm vários) */
  targetId: string;
  /** Demais alvos esperando (fila do aluguel) */
  queue: string[];
  /** Quem deve responder AGORA (alterna com Just Say No) */
  defenderId: string;
  /** Já houve pelo menos um Just Say No na cadeia */
  flipped: boolean;
  sayNoCount: number;
  amount?: number;
  /** Cores cobradas no aluguel */
  rentColors?: CardColor[];
  double?: boolean;
  /** SLY_DEAL: uid da carta roubada */
  propUid?: string;
  /** FORCED_DEAL: uid da carta entregue pelo iniciador */
  giveUid?: string;
  /** DEAL_BREAKER / RENT: cor do conjunto alvo */
  color?: CardColor;
  /** SAYNO = aguardando "Não!"/aceitar; PAY = jogador escolhe com o que paga */
  stage: 'SAYNO' | 'PAY';
  /** timestamp (ms) da expiração */
  deadline: number;
}

// ---------- Estado completo do jogo ----------
export type LogEntry = { id: number; text: string; playerId?: string };

export interface GameState {
  phase: 'playing' | 'ended';
  players: PlayerState[];
  drawPile: CardInst[];
  discardPile: CardInst[];
  turnIndex: number;
  movesLeft: number;
  pending: PendingAction | null;
  /** Bloqueio local: jogador deve descartar excesso de mão */
  blocking: { type: 'discard'; playerId: string } | null;
  winnerId?: string;
  log: LogEntry[];
  /** timestamp (ms) da ação atual (timer do turno/resposta) */
  deadline: number;
  settings: GameSettings;
  seq: number;
}

// ---------- Ações do cliente ----------
export type GameAction =
  /** Jogar propriedade/curinga para um grupo de cor */
  | { t: 'PLAY_PROPERTY'; uid: string; color?: CardColor }
  /** Jogar dinheiro para o banco */
  | { t: 'PLAY_BANK'; uid: string }
  /** Construir Casa/Hotel num conjunto completo */
  | { t: 'BUILD'; uid: string; color: CardColor }
  /** Cobrar aluguel (doubleUid = carta Aluguel em Dobro, paga 1 jogada extra) */
  | { t: 'RENT'; uid: string; color?: CardColor; doubleUid?: string }
  /** Jogar carta de ação: passGo / debtCollector / slyDeal / dealBreaker / forcedDeal */
  | { t: 'ACTION'; uid: string; targetId?: string; propUid?: string; giveUid?: string; color?: CardColor }
  /** Responder a uma ação pendente com "Não!" */
  | { t: 'SAY_NO' }
  /** Aceitar a ação pendente (pagar/permitir o roubo) — no aluguel/dívida,
   *  aceitar abre a fase de ESCOLHA de pagamento (PAY) */
  | { t: 'ACCEPT' }
  /** Escolher as cartas com que vai pagar (dinheiro do banco e/ou propriedades
   *  de conjuntos incompletos) — tem que cobrir a dívida ou entregar tudo */
  | { t: 'PAY'; uids: string[] }
  /** Descartar até o limite de mão */
  | { t: 'DISCARD'; uids: string[] }
  /** Encerrar o turno */
  | { t: 'END_TURN' };

// ---------- Visão do jogo para um cliente específico ----------
export interface PlayerView extends Omit<PlayerState, 'hand'> {
  hand?: CardInst[];
  handCount: number;
}

export interface GameStateView extends Omit<GameState, 'players' | 'drawPile'> {
  players: PlayerView[];
  /** Baralho oculto — apenas a contagem */
  drawPile: never[];
  drawCount: number;
}

// ---------- Sala ----------
export type Visibility = 'public' | 'private';

export interface RoomPlayerMeta {
  id: string;
  name: string;
  isHost: boolean;
  isBot: boolean;
  connected: boolean;
}

export interface RoomView {
  code: string;
  visibility: Visibility;
  hostId: string;
  settings: GameSettings;
  players: RoomPlayerMeta[];
  phase: 'lobby' | 'playing' | 'ended';
  game?: GameStateView;
}

export interface PublicRoomInfo {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  phase: string;
}
