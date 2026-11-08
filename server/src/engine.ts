// ============================================================
//  MOTOR DE JOGO — LÓGICA AUTORITATIVA DO SERVIDOR
//  Regras do Monopoly Deal. Nenhuma validação vem do cliente.
// ============================================================
import {
  CARDS, DECK_DEF_IDS, SET_SIZE, RENT_TABLE, HOUSE_BONUS, HOTEL_BONUS, cardValue,
  type CardColor, type CardDef, type CardInst, type ColorGroup,
  type GameAction, type GameSettings, type GameState, type GameStateView,
  type PendingAction, type PendingKind, type PlayerState, type PlayerView,
} from '@md/shared';

export class GameError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface PlayerMeta {
  id: string; name: string; isHost: boolean; isBot: boolean;
}

let uidSeq = 0;
const newUid = (p: string) =>
  `${p}${(uidSeq++).toString(36)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Engine {
  s: GameState;
  private logSeq = 0;

  constructor(metas: PlayerMeta[], settings: GameSettings) {
    const deck: CardInst[] = shuffle(DECK_DEF_IDS.map(defId => ({ uid: newUid('c'), defId })));

    const players: PlayerState[] = metas.map(m => ({
      id: m.id, name: m.name, isHost: m.isHost, isBot: m.isBot,
      connected: true, isOut: false, bank: [], groups: [], hand: [],
    }));

    // Distribui 5 cartas para cada jogador
    for (const p of players) {
      for (let i = 0; i < 5; i++) p.hand.push(deck.pop()!);
    }

    this.s = {
      phase: 'playing',
      players,
      drawPile: deck,
      discardPile: [],
      turnIndex: 0,
      movesLeft: 0,
      pending: null,
      blocking: null,
      log: [],
      deadline: 0,
      settings: { ...settings },
      seq: 0,
    };

    this.log(this.s, `Jogo iniciado — meta: ${settings.setsToWin} conjuntos completos`);
    this.startTurn(this.s);
  }

  // ==========================================================
  //  API PÚBLICA
  // ==========================================================

  /** Aplica uma ação de um jogador. Lança GameError em validação. */
  act(playerId: string, action: GameAction): void {
    const s = structuredClone(this.s);
    this.dispatch(s, playerId, action);
    this.checkEnd(s);
    this.maybeAutoEnd(s);
    this.s = s;
  }

  /** Ações automáticas quando o timer expira. Retorna true se agiu. */
  autoAct(): boolean {
    const s = this.s;
    if (s.phase !== 'playing') return false;
    if (!s.deadline || Date.now() < s.deadline) return false;

    const next = structuredClone(s);
    if (next.blocking?.type === 'discard') {
      this.autoDiscard(next);
    } else if (next.pending?.stage === 'SAYNO') {
      this.log(next, 'Tempo esgotado — ação aceita automaticamente');
      this.accept(next, this.player(next, next.pending.defenderId));
    } else if (next.pending?.stage === 'PAY') {
      // Tempo esgotado escolhendo o pagamento → paga automático
      const pend = next.pending;
      this.log(next, 'Tempo esgotado — pagamento automático');
      this.chargeAuto(
        next,
        this.player(next, pend.defenderId),
        this.player(next, pend.initiatorId),
      );
    } else {
      this.endTurn(next);
    }
    this.checkEnd(next);
    this.maybeAutoEnd(next);
    this.s = next;
    return true;
  }

  /**
   * Turno automático: quando o jogador gasta todas as jogadas do turno,
   * a vez passa sozinha. Se ainda houver uma ação pendente (aluguel/
   * cobrança aguardando resposta), o turno espera a resposta resolver.
   * O botão 🏁 continua permitindo encerrar o turno antes das jogadas.
   */
  private maybeAutoEnd(s: GameState): void {
    if (s.phase !== 'playing') return;
    if (s.pending || s.blocking) return;
    if (s.movesLeft > 0) return;
    this.endTurn(s);
  }

  /** Elimina um jogador que saiu da partida no meio do jogo */
  eliminate(playerId: string): void {
    if (this.s.phase !== 'playing') return;
    const s = structuredClone(this.s);
    const p = s.players.find(x => x.id === playerId);
    if (!p || p.isOut) return;
    p.isOut = true;
    for (const c of p.hand) { delete c.color; s.discardPile.push(c); }
    p.hand = [];

    // Resolve pendências envolvendo o jogador que saiu
    if (s.pending) {
      const pend = s.pending;
      if (pend.initiatorId === playerId) s.pending = null;
      else if (pend.defenderId === playerId) {
        if (pend.kind === 'RENT') this.nextTarget(s);
        else s.pending = null;
      }
    }
    if (s.blocking?.playerId === playerId) s.blocking = null;

    // Se era dele a vez, avança para o próximo
    if (s.players[s.turnIndex]?.id === playerId && !s.pending && !s.blocking) {
      this.finishEndTurn(s);
    }
    this.checkEnd(s);
    this.s = s;
  }

  /** Visão do jogo para um cliente (oculta mãos alheias e o baralho) */
  view(meId: string): GameStateView {
    const s = this.s;
    return {
      ...s,
      drawPile: [],
      drawCount: s.drawPile.length,
      players: s.players.map<PlayerView>(p => ({
        id: p.id, name: p.name, isHost: p.isHost, isBot: p.isBot,
        connected: p.connected, isOut: p.isOut, bank: p.bank, groups: p.groups,
        hand: p.id === meId ? p.hand : undefined,
        handCount: p.hand.length,
      })),
    };
  }

  /** Quem precisa agir agora (timer/bot) */
  currentActorId(): string | null {
    const s = this.s;
    if (s.phase !== 'playing') return null;
    if (s.blocking) return s.blocking.playerId;
    if (s.pending) return s.pending.defenderId;
    return s.players[s.turnIndex]?.id ?? null;
  }

  // ==========================================================
  //  DESPACHO
  // ==========================================================
  private dispatch(s: GameState, playerId: string, a: GameAction): void {
    if (s.phase !== 'playing') throw new GameError('ENDED', 'A partida já terminou');
    const p = this.player(s, playerId);
    if (p.isOut) throw new GameError('OUT', 'Você está fora da partida');

    // ---- Resposta a ação pendente (cobrança/roubo) ----
    if (s.pending) {
      const pend = s.pending;
      if (pend.defenderId !== playerId) {
        throw new GameError('BLOCKED', 'Aguardando a resposta de outro jogador');
      }
      if (pend.stage === 'PAY') {
        // Cobrança aceita: agora o jogador ESCOLHE com o que paga
        if (a.t === 'PAY') return this.pay(s, p, a.uids);
        throw new GameError('BLOCKED', 'Escolha com quais cartas vai pagar');
      }
      if (a.t === 'SAY_NO') return this.sayNo(s, p);
      if (a.t === 'ACCEPT') return this.accept(s, p);
      throw new GameError('BLOCKED', 'Responda à ação pendente (Não! ou Aceitar)');
    }

    // ---- Bloqueio de descarte (mão acima do limite) ----
    if (s.blocking) {
      if (s.blocking.playerId !== playerId) {
        throw new GameError('BLOCKED', 'Outro jogador está descartando cartas');
      }
      if (a.t === 'DISCARD') return this.discard(s, p, a.uids);
      throw new GameError('BLOCKED', `Você deve descartar até ${s.settings.handLimit} cartas`);
    }

    // ---- Turno ----
    const isCurrent = s.players[s.turnIndex]?.id === playerId;

    if (a.t === 'END_TURN') {
      if (!isCurrent) throw new GameError('NOT_YOUR_TURN', 'Não é seu turno');
      return this.endTurn(s);
    }
    if (a.t === 'SAY_NO' || a.t === 'ACCEPT' || a.t === 'PAY' || a.t === 'DISCARD') {
      throw new GameError('NO_PENDING', 'Nada para responder agora');
    }
    if (!isCurrent) throw new GameError('NOT_YOUR_TURN', 'Não é seu turno');
    if (s.movesLeft <= 0) {
      throw new GameError('NO_MOVES', 'Suas jogadas acabaram — encerre o turno');
    }

    const cost = a.t === 'RENT' && a.doubleUid ? 2 : 1;
    if (s.movesLeft < cost) {
      throw new GameError('NO_MOVES', `Você precisa de ${cost} jogada(s) para isso`);
    }

    switch (a.t) {
      case 'PLAY_PROPERTY': this.playProperty(s, p, a); break;
      case 'SET_WILD': this.setWild(s, p, a); break;
      case 'PLAY_BANK': this.playBank(s, p, a); break;
      case 'BUILD': this.build(s, p, a); break;
      case 'RENT': this.playRent(s, p, a); break;
      case 'ACTION': this.playAction(s, p, a); break;
      default: throw new GameError('BAD_ACTION', 'Ação inválida');
    }
    s.movesLeft -= cost;
  }

  // ==========================================================
  //  JOGADAS BÁSICAS
  // ==========================================================
  private playProperty(s: GameState, p: PlayerState, a: { uid: string; color?: CardColor }): void {
    const card = this.inHand(p, a.uid);
    const def = CARDS[card.defId];
    if (def.type === 'property') {
      card.color = def.colors![0];
    } else if (def.type === 'wildProperty') {
      if (!a.color) throw new GameError('COLOR_REQUIRED', 'Escolha a cor do curinga');
      // Curinga de 2 cores só aceita UMA das duas cores impressas na carta
      if (def.colors && def.colors.length > 0 && !def.colors.includes(a.color)) {
        throw new GameError(
          'BAD_COLOR',
          `Essa curinga só aceita uma das cores da carta (${def.colors.join(' ou ')})`,
        );
      }
      // Curinga de 2 cores pode ABRIR um grupo novo (você escolhe o lado).
      // O curinga geral (10 cores) continua complementando um grupo existente.
      if (!def.colors || def.colors.length === 0) {
        const g = this.groupOf(p, a.color);
        if (!g || g.cards.length === 0) {
          throw new GameError(
            'NO_GROUP',
            'Curinga geral só entra em um conjunto que você já tem — jogue antes a propriedade dessa cor',
          );
        }
      }
      card.color = a.color;
    } else {
      throw new GameError('BAD_TYPE', 'Só propriedades e curingas vão para grupos');
    }
    this.takeFromHand(p, a.uid);
    this.addToGroup(p, card);
    this.log(s, `${p.name} jogou ${def.name}${card.color ? ` (${card.color})` : ''}`, p.id);
  }

  /** Trocar a cor de um curinga que já está na mesa (custa 1 jogada) */
  private setWild(s: GameState, p: PlayerState, a: { uid: string; color: CardColor }): void {
    const src = p.groups.find(g => g.cards.some(c => c.uid === a.uid));
    if (!src) throw new GameError('NOT_FOUND', 'Essa carta não está nas suas propriedades');
    const card = src.cards.find(c => c.uid === a.uid)!;
    const def = CARDS[card.defId];
    if (def.type !== 'wildProperty') {
      throw new GameError('BAD_TYPE', 'Só curingas podem trocar de cor');
    }
    if (src.color === a.color) {
      throw new GameError('BAD_COLOR', 'O curinga já está nessa cor');
    }
    // Curinga de 2 cores só vai para uma das duas cores impressas na carta
    if (def.colors && def.colors.length > 0 && !def.colors.includes(a.color)) {
      throw new GameError(
        'BAD_COLOR',
        `Essa curinga só aceita uma das cores da carta (${def.colors.join(' ou ')})`,
      );
    }
    // Curinga geral: precisa de um grupo existente da nova cor (mesma regra de jogar)
    if (!def.colors || def.colors.length === 0) {
      const g = this.groupOf(p, a.color);
      if (!g || g.cards.length === 0) {
        throw new GameError(
          'NO_GROUP',
          'Você ainda não tem um conjunto dessa cor na mesa',
        );
      }
    }
    // Conjunto com prédio não pode ficar incompleto (o curinga sai da conta)
    if ((src.house || src.hotel) && src.cards.length - 1 < SET_SIZE[src.color]) {
      throw new GameError(
        'HAS_BUILDING',
        'Esse conjunto tem Casa/Hotel — o curinga não pode sair dele agora',
      );
    }
    // Sai do grupo atual (grupo que ficar vazio é removido)
    src.cards = src.cards.filter(c => c.uid !== a.uid);
    if (src.cards.length === 0) p.groups = p.groups.filter(g => g !== src);
    // Entra no grupo da nova cor
    card.color = a.color;
    this.addToGroup(p, card);
    this.log(s, `${p.name} moveu um curinga para ${a.color}`, p.id);
  }

  private playBank(s: GameState, p: PlayerState, a: { uid: string }): void {
    const card = this.inHand(p, a.uid);
    const def = CARDS[card.defId];
    // Qualquer carta pode virar dinheiro no banco — menos o curinga
    // (o curinga é sempre propriedade: escolhe a cor ao jogar)
    if (def.type === 'wildProperty') {
      throw new GameError('BAD_TYPE', 'Curinga não vai para o banco — jogue como propriedade');
    }
    this.takeFromHand(p, a.uid);
    p.bank.push(card);
    this.log(s, `${p.name} depositou ${def.name} no banco (${cardValue(card.defId)}M)`, p.id);
  }

  private build(s: GameState, p: PlayerState, a: { uid: string; color: CardColor }): void {
    const card = this.inHand(p, a.uid);
    const def = CARDS[card.defId];
    if (def.type !== 'house' && def.type !== 'hotel') {
      throw new GameError('BAD_TYPE', 'Só Casa/Hotel podem ser construídos');
    }
    if (a.color === 'railroad' || a.color === 'utility') {
      throw new GameError('BAD_COLOR', 'Não se constrói em ferrovias/utilidades');
    }
    const g = this.groupOf(p, a.color);
    if (!g || !this.isComplete(g)) {
      throw new GameError('INCOMPLETE', 'Você precisa de um conjunto completo dessa cor');
    }
    if (def.type === 'house') {
      if (g.house) throw new GameError('HAS_HOUSE', 'Já existe uma casa nesse conjunto');
    } else {
      if (!g.house) throw new GameError('NEED_HOUSE', 'Construa a casa antes do hotel');
      if (g.hotel) throw new GameError('HAS_HOTEL', 'Já existe um hotel nesse conjunto');
    }
    this.takeFromHand(p, a.uid);
    if (def.type === 'house') g.house = card; else g.hotel = card;
    this.log(s, `${p.name} construiu ${def.name} em ${a.color}`, p.id);
  }

  // ==========================================================
  //  ALUGUEL
  // ==========================================================
  private playRent(
    s: GameState, p: PlayerState,
    a: { uid: string; color?: CardColor; doubleUid?: string },
  ): void {
    const card = this.inHand(p, a.uid);
    const def = CARDS[card.defId];
    if (def.type !== 'rent') throw new GameError('BAD_TYPE', 'Essa não é uma carta de aluguel');

    let colors: CardColor[];
    if (def.rentColors && def.rentColors.length > 0) colors = [...def.rentColors];
    else {
      if (!a.color) throw new GameError('COLOR_REQUIRED', 'Escolha a cor do aluguel');
      colors = [a.color];
    }

    // O iniciador precisa ter propriedade em ao menos uma cor cobrada
    const owned = colors.filter(c => (this.groupOf(p, c)?.cards.length ?? 0) > 0);
    if (owned.length === 0) {
      throw new GameError('NO_PROPERTY', 'Você não tem propriedades dessa cor');
    }

    let double = false;
    if (a.doubleUid) {
      const dcard = this.inHand(p, a.doubleUid);
      const ddef = CARDS[dcard.defId];
      if (ddef.type !== 'action' || ddef.action !== 'doubleRent') {
        throw new GameError('BAD_TYPE', 'Carta inválida para dobrar o aluguel');
      }
      this.takeFromHand(p, a.doubleUid);
      this.toDiscard(s, dcard);
      double = true;
    }

    // Alvos: TODOS os oponentes pagam — o aluguel é pelas MINHAS propriedades
    // (só pula quem não tem nada para pagar: sem cartas na frente, não se paga)
    const targets = s.players.filter(o =>
      o.id !== p.id && !o.isOut && this.availableTotal(o) > 0);

    if (targets.length === 0) {
      throw new GameError('NO_TARGETS', 'Nenhum oponente tem nada para pagar agora');
    }

    this.takeFromHand(p, a.uid);
    this.toDiscard(s, card);

    const pend: PendingAction = {
      id: newUid('p'), kind: 'RENT', initiatorId: p.id,
      targetId: targets[0].id, queue: targets.slice(1).map(t => t.id),
      defenderId: targets[0].id, flipped: false, sayNoCount: 0,
      amount: this.rentAmountFor(s, p, colors, double),
      rentColors: colors, double, color: colors[0],
      stage: 'SAYNO', deadline: this.timer(s),
    };
    s.pending = pend;
    this.log(s, `${p.name} cobrou aluguel${double ? ' EM DOBRO' : ''} (${colors.join(' + ')})`, p.id);
  }

  /** Aluguel devido nas cores cobradas — calculado só pelas propriedades de `source` */
  rentAmountFor(
    s: GameState, source: PlayerState,
    colors: CardColor[], double: boolean,
  ): number {
    let total = 0;
    for (const color of colors) {
      const sg = this.groupOf(source, color);
      if (!sg || sg.cards.length === 0) continue;
      let rent = RENT_TABLE[color][Math.min(sg.cards.length, RENT_TABLE[color].length) - 1];
      if (this.isComplete(sg)) {
        if (sg.house) rent += HOUSE_BONUS;
        if (sg.hotel) rent += HOTEL_BONUS;
      }
      total += rent;
    }
    return double ? total * 2 : total;
  }

  // ==========================================================
  //  CARTAS DE AÇÃO
  // ==========================================================
  private playAction(
    s: GameState, p: PlayerState,
    a: { uid: string; targetId?: string; propUid?: string; giveUid?: string; color?: CardColor },
  ): void {
    const card = this.inHand(p, a.uid);
    const def = CARDS[card.defId];
    if (def.type !== 'action' || !def.action) {
      throw new GameError('BAD_TYPE', 'Carta não jogável como ação');
    }

    switch (def.action) {
      case 'passGo': {
        this.takeFromHand(p, a.uid);
        this.toDiscard(s, card);
        // Comprar também respeita o limite de mão (a carta jogada já liberou espaço)
        const room = Math.max(0, s.settings.handLimit - p.hand.length);
        const drawn = this.draw(s, Math.min(2, room));
        p.hand.push(...drawn);
        this.log(s, drawn.length > 0
          ? `${p.name} jogou Pass Go e comprou ${drawn.length} carta(s)`
          : `${p.name} jogou Pass Go (mão cheia — não comprou)`, p.id);
        break;
      }
      case 'debtCollector': {
        const target = this.requireTarget(s, p, a.targetId);
        if (this.availableTotal(target) <= 0) {
          throw new GameError('NO_TARGETS', `${target.name} não tem nada para pagar`);
        }
        this.takeFromHand(p, a.uid);
        this.toDiscard(s, card);
        this.openPending(s, 'DEBT', p, [target], { amount: 5 });
        this.log(s, `${p.name} usou Cobrador de Dívidas em ${target.name} (5M)`, p.id);
        break;
      }
      case 'slyDeal': {
        const target = this.requireTarget(s, p, a.targetId);
        if (!a.propUid) throw new GameError('NEED_CARD', 'Escolha a propriedade a roubar');
        const found = this.findInGroups(target, a.propUid);
        if (!found) throw new GameError('BAD_CARD', 'Propriedade inválida');
        if (this.isComplete(found.group)) {
          throw new GameError('COMPLETE_SET', 'Não é possível roubar de um conjunto completo');
        }
        this.takeFromHand(p, a.uid);
        this.toDiscard(s, card);
        this.openPending(s, 'SLY_DEAL', p, [target], { propUid: a.propUid });
        this.log(s, `${p.name} usou Negociação Esperta em ${target.name}`, p.id);
        break;
      }
      case 'dealBreaker': {
        const target = this.requireTarget(s, p, a.targetId);
        if (!a.color) throw new GameError('COLOR_REQUIRED', 'Escolha o conjunto a roubar');
        const g = this.groupOf(target, a.color);
        if (!g || !this.isComplete(g)) {
          throw new GameError('INCOMPLETE', 'O alvo não tem um conjunto completo dessa cor');
        }
        this.takeFromHand(p, a.uid);
        this.toDiscard(s, card);
        this.openPending(s, 'DEAL_BREAKER', p, [target], { color: a.color });
        this.log(s, `${p.name} usou Quebra de Acordo em ${target.name} (${a.color})`, p.id);
        break;
      }
      case 'forcedDeal': {
        const target = this.requireTarget(s, p, a.targetId);
        if (!a.propUid || !a.giveUid) {
          throw new GameError('NEED_CARD', 'Escolha as duas propriedades da troca');
        }
        const give = this.findInGroups(p, a.giveUid);
        if (!give) throw new GameError('BAD_CARD', 'Propriedade sua inválida');
        if (this.isComplete(give.group)) {
          throw new GameError('COMPLETE_SET', 'Você não pode dar uma propriedade de conjunto completo');
        }
        const take = this.findInGroups(target, a.propUid);
        if (!take) throw new GameError('BAD_CARD', 'Propriedade do alvo inválida');
        if (this.isComplete(take.group)) {
          throw new GameError('COMPLETE_SET', 'Não se pode tomar de um conjunto completo');
        }
        this.takeFromHand(p, a.uid);
        this.toDiscard(s, card);
        this.openPending(s, 'FORCED_DEAL', p, [target], { propUid: a.propUid, giveUid: a.giveUid });
        this.log(s, `${p.name} propôs Negociação Forçada com ${target.name}`, p.id);
        break;
      }
      default:
        throw new GameError('BAD_TYPE', 'Essa carta não pode ser jogada diretamente');
    }
  }

  // ==========================================================
  //  AÇÕES PENDENTES (Just Say No / Pagamento / Roubos)
  // ==========================================================
  private openPending(
    s: GameState, kind: PendingKind, initiator: PlayerState,
    targets: PlayerState[], extra: Partial<PendingAction>,
  ): void {
    const first = targets[0];
    s.pending = {
      id: newUid('p'), kind, initiatorId: initiator.id,
      targetId: first.id, queue: targets.slice(1).map(t => t.id),
      defenderId: first.id, flipped: false, sayNoCount: 0,
      stage: 'SAYNO', deadline: this.timer(s), ...extra,
    };
  }

  private sayNo(s: GameState, p: PlayerState): void {
    const pend = s.pending!;
    if (pend.defenderId !== p.id) throw new GameError('NOT_DEFENDER', 'Não é você quem responde');
    const idx = p.hand.findIndex(c => CARDS[c.defId].action === 'justSayNo');
    if (idx < 0) throw new GameError('NO_CARD', 'Você não tem a carta "Não!"');
    const [card] = p.hand.splice(idx, 1);
    this.toDiscard(s, card);
    pend.sayNoCount++;
    pend.flipped = true;
    pend.defenderId = pend.defenderId === pend.initiatorId ? pend.targetId : pend.initiatorId;
    pend.deadline = this.timer(s);
    this.log(s, `${p.name} jogou "Não!" (${pend.sayNoCount}ª vez)`, p.id);
  }

  private accept(s: GameState, p: PlayerState): void {
    const pend = s.pending!;
    if (pend.defenderId !== p.id) throw new GameError('NOT_DEFENDER', 'Não é você quem responde');
    const initiator = this.player(s, pend.initiatorId);

    // Iniciador aceitou depois de um "Não!" → ação cancelada
    if (pend.defenderId !== pend.targetId) {
      this.log(s, `A ação de ${initiator.name} foi cancelada`, initiator.id);
      if (pend.kind === 'RENT') this.nextTarget(s);
      else s.pending = null;
      return;
    }

    switch (pend.kind) {
      case 'RENT':
      case 'DEBT':
        // Pagamento obrigatório: aceitar abre a fase de ESCOLHA — o jogador
        // decide com o que paga (dinheiro e/ou propriedades da mesa)
        pend.stage = 'PAY';
        pend.deadline = this.timer(s);
        this.log(s, `${p.name} aceitou pagar — escolha as cartas do pagamento`, p.id);
        break;

      case 'DEAL_BREAKER': {
        const from = this.player(s, pend.targetId);
        const color = pend.color!;
        const g = this.groupOf(from, color)!;
        from.groups = from.groups.filter(x => x !== g);
        this.mergeGroup(s, initiator, g);
        this.log(s, `${initiator.name} roubou o conjunto ${color} de ${from.name}`, initiator.id);
        s.pending = null;
        break;
      }
      case 'SLY_DEAL': {
        const from = this.player(s, pend.targetId);
        const card = this.takeFromGroups(s, from, pend.propUid!);
        card.color = card.color ?? CARDS[card.defId].colors?.[0];
        this.addToGroup(initiator, card);
        this.log(s, `${initiator.name} roubou ${CARDS[card.defId].name} de ${from.name}`, initiator.id);
        s.pending = null;
        break;
      }
      case 'FORCED_DEAL': {
        const from = this.player(s, pend.targetId);
        const taken = this.takeFromGroups(s, from, pend.propUid!);
        const given = this.takeFromGroups(s, initiator, pend.giveUid!);
        this.addToGroup(initiator, taken);
        this.addToGroup(from, given);
        this.log(s, `${initiator.name} e ${from.name} fizeram uma troca de propriedades`, initiator.id);
        s.pending = null;
        break;
      }
    }
  }

  /**
   * Pagamento escolhido pelo jogador: cartas do banco (dinheiro) e/ou
   * propriedades de conjuntos INCOMPLETOS. Regras:
   *  - tem que cobrir a dívida, OU
   *  - entregar TUDO que tem na mesa (paga só o que tiver — sem dívida e
   *    sem falência, nunca fica devendo)
   * O destino é decidido pela ORIGEM: banco → dinheiro do credor;
   * grupo → propriedade do credor.
   */
  private pay(s: GameState, p: PlayerState, uids: string[]): void {
    const pend = s.pending!;
    if (pend.stage !== 'PAY' || pend.defenderId !== p.id) {
      throw new GameError('NOT_PAYER', 'Não é você quem paga agora');
    }
    const amount = pend.amount ?? 0;
    const initiator = this.player(s, pend.initiatorId);

    const picked: CardInst[] = [];
    const seen = new Set<string>();
    let sum = 0;

    for (const uid of uids) {
      if (seen.has(uid)) throw new GameError('DUP', 'Carta repetida no pagamento');
      seen.add(uid);
      const inBank = p.bank.find(c => c.uid === uid);
      if (inBank) { sum += cardValue(inBank.defId); picked.push(inBank); continue; }
      const found = this.findInGroups(p, uid);
      if (found) {
        if (this.isComplete(found.group)) {
          throw new GameError('COMPLETE_SET', 'Conjuntos completos não podem ser pagos');
        }
        sum += cardValue(found.card.defId); picked.push(found.card);
        continue;
      }
      throw new GameError('BAD_CARD', 'Carta de pagamento inválida');
    }

    const available = this.availableTotal(p);
    if (picked.length === 0 && available > 0) {
      throw new GameError('EMPTY_PAYMENT', 'Escolha pelo menos uma carta para pagar');
    }
    // Pagamento menor que a dívida só é válido se for TUDO que o jogador tem
    if (sum < amount && sum < available) {
      throw new GameError(
        'INSUFFICIENT',
        `Pagamento insuficiente (${sum}M de ${amount}M) — selecione tudo que tem (${available}M)`,
      );
    }

    if (picked.length > 0) this.transfer(s, p, initiator, picked);

    this.log(s, sum >= amount
      ? `${p.name} escolheu pagar ${sum}M para ${initiator.name}`
      : `${p.name} pagou só o que tinha: ${sum}M de ${amount}M`, p.id);

    if (pend.kind === 'RENT') this.nextTarget(s);
    else s.pending = null;
  }

  /** Move cartas escolhidas: banco → dinheiro do credor, grupo → propriedade */
  private transfer(s: GameState, payer: PlayerState, creditor: PlayerState, picked: CardInst[]): void {
    const fromBank = new Set(payer.bank.map(c => c.uid));
    for (const c of picked) {
      const bi = payer.bank.findIndex(x => x.uid === c.uid);
      if (bi >= 0) payer.bank.splice(bi, 1);
      else this.takeFromGroups(s, payer, c.uid);
    }
    for (const c of picked) {
      if (fromBank.has(c.uid)) creditor.bank.push(c);
      else this.addToGroup(creditor, c);
    }
  }

  /**
   * Pagamento automático quando o timer expira (ou quando o jogador não
   * tem nada): dinheiro do banco (maior primeiro) → propriedades de
   * conjuntos incompletos. Se não cobrir, entrega tudo que tem na mesa.
   */
  private chargeAuto(s: GameState, payer: PlayerState, creditor: PlayerState): void {
    const pend = s.pending!;
    const amount = pend.amount ?? 0;
    const picked: CardInst[] = [];
    let sum = 0;

    // 1) dinheiro do banco
    const money = [...payer.bank].sort((a, b) => cardValue(b.defId) - cardValue(a.defId));
    for (const c of money) {
      if (sum >= amount) break;
      picked.push(c); sum += cardValue(c.defId);
    }
    // 2) propriedades de conjuntos incompletos
    if (sum < amount) {
      const props = payer.groups
        .filter(g => !this.isComplete(g))
        .flatMap(g => g.cards)
        .sort((a, b) => cardValue(b.defId) - cardValue(a.defId));
      for (const c of props) {
        if (sum >= amount) break;
        picked.push(c); sum += cardValue(c.defId);
      }
    }

    if (picked.length === 0) {
      this.log(s, `${payer.name} não tem nada para pagar`, payer.id);
    } else {
      this.transfer(s, payer, creditor, picked);
      this.log(s, sum >= amount
        ? `${payer.name} pagou automaticamente ${sum}M para ${creditor.name}`
        : `${payer.name} pagou só o que tinha: ${sum}M de ${amount}M`, payer.id);
    }

    if (pend.kind === 'RENT') this.nextTarget(s);
    else s.pending = null;
  }

  private nextTarget(s: GameState): void {
    const pend = s.pending!;
    while (pend.queue.length > 0) {
      const nextId = pend.queue.shift()!;
      const target = this.player(s, nextId);
      // Regra oficial: quem não tem cartas na frente não paga — pula a vez dele
      if (this.availableTotal(target) <= 0) {
        this.log(s, `${target.name} não tem nada para pagar — não pagou aluguel`);
        continue;
      }
      pend.targetId = nextId;
      pend.defenderId = nextId;
      pend.flipped = false;
      pend.stage = 'SAYNO';
      if (pend.kind === 'RENT') {
        const source = this.player(s, pend.initiatorId);
        pend.amount = this.rentAmountFor(s, source, pend.rentColors!, !!pend.double);
      }
      pend.deadline = this.timer(s);
      return;
    }
    s.pending = null;
  }

  // ==========================================================
  //  TURNO
  // ==========================================================
  private endTurn(s: GameState): void {
    const p = s.players[s.turnIndex];
    if (p.hand.length > s.settings.handLimit) {
      s.blocking = { type: 'discard', playerId: p.id };
      s.deadline = this.timer(s);
      this.log(s, `${p.name} deve descartar ${p.hand.length - s.settings.handLimit} carta(s)`, p.id);
      return;
    }
    this.finishEndTurn(s);
  }

  private finishEndTurn(s: GameState): void {
    s.blocking = null;
    let i = s.turnIndex;
    for (let n = 0; n < s.players.length; n++) {
      i = (i + 1) % s.players.length;
      if (!s.players[i].isOut) break;
    }
    s.turnIndex = i;
    this.startTurn(s);
  }

  private startTurn(s: GameState): void {
    const p = s.players[s.turnIndex];
    // Mão nunca passa do limite: com 7 cartas não compra nada; com 6 compra só 1
    const room = Math.max(0, s.settings.handLimit - p.hand.length);
    const want = Math.min(s.settings.drawCardsPerTurn, room);
    const drawn = this.draw(s, want);
    p.hand.push(...drawn);
    s.movesLeft = s.settings.movesPerTurn;
    s.deadline = this.timer(s);
    const note = want < s.settings.drawCardsPerTurn
      ? ` (mão cheia: ${drawn.length} de ${s.settings.drawCardsPerTurn} cartas)`
      : '';
    this.log(s, `Turno de ${p.name}${note}`, p.id);
  }

  private discard(s: GameState, p: PlayerState, uids: string[]): void {
    if (s.blocking?.playerId !== p.id) throw new GameError('NOT_BLOCKED', 'Nada a descartar');
    if (uids.length === 0) throw new GameError('EMPTY', 'Escolha cartas para descartar');
    for (const uid of uids) this.inHand(p, uid);
    const limit = s.settings.handLimit;
    const after = p.hand.length - uids.length;
    if (after > limit) {
      throw new GameError('NEED_MORE', `Descarte mais: sua mão ficaria com ${after} cartas`);
    }
    if (after < limit) {
      throw new GameError('TOO_MANY', `Você deve descartar exatamente até ${limit} cartas`);
    }
    for (const uid of uids) {
      const idx = p.hand.findIndex(c => c.uid === uid);
      const [card] = p.hand.splice(idx, 1);
      this.toDiscard(s, card);
    }
    this.log(s, `${p.name} descartou ${uids.length} carta(s)`, p.id);
    if (p.hand.length <= limit) this.finishEndTurn(s);
  }

  private autoDiscard(s: GameState): void {
    const p = this.player(s, s.blocking!.playerId);
    const limit = s.settings.handLimit;
    while (p.hand.length > limit) {
      // descarta a carta de menor valor
      let worst = 0;
      for (let i = 1; i < p.hand.length; i++) {
        if (cardValue(p.hand[i].defId) < cardValue(p.hand[worst].defId)) worst = i;
      }
      const [card] = p.hand.splice(worst, 1);
      this.toDiscard(s, card);
    }
    this.log(s, `${p.name} descartou automaticamente (tempo esgotado)`, p.id);
    this.finishEndTurn(s);
  }

  // ==========================================================
  //  FIM DE JOGO
  // ==========================================================
  private checkEnd(s: GameState): void {
    if (s.phase === 'ended') return;
    const alive = s.players.filter(p => !p.isOut);

    let winner: PlayerState | undefined;
    for (const p of alive) {
      if (this.completeColors(p).length >= s.settings.setsToWin) { winner = p; break; }
    }
    if (!winner && alive.length === 1 && s.players.length > 1) winner = alive[0];

    if (winner) {
      s.phase = 'ended';
      s.winnerId = winner.id;
      s.pending = null;
      s.blocking = null;
      s.deadline = 0;
      this.log(s, `🏆 ${winner.name} venceu a partida!`, winner.id);
    }
  }

  // ==========================================================
  //  UTILITÁRIOS
  // ==========================================================
  private timer(s: GameState): number {
    return s.settings.turnTimerSec > 0 ? Date.now() + s.settings.turnTimerSec * 1000 : 0;
  }

  private log(s: GameState, text: string, playerId?: string): void {
    s.log.push({ id: ++this.logSeq, text, playerId });
    if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
  }

  player(s: GameState, id: string): PlayerState {
    const p = s.players.find(x => x.id === id);
    if (!p) throw new GameError('NO_PLAYER', 'Jogador não encontrado');
    return p;
  }

  private requireTarget(s: GameState, from: PlayerState, targetId?: string): PlayerState {
    if (!targetId) throw new GameError('NEED_TARGET', 'Escolha um oponente');
    if (targetId === from.id) throw new GameError('SELF', 'Não pode ser você mesmo');
    const t = s.players.find(x => x.id === targetId);
    if (!t || t.isOut) throw new GameError('BAD_TARGET', 'Oponente inválido');
    return t;
  }

  private inHand(p: PlayerState, uid: string): CardInst {
    const c = p.hand.find(x => x.uid === uid);
    if (!c) throw new GameError('NOT_IN_HAND', 'Carta não está na sua mão');
    return c;
  }

  private takeFromHand(p: PlayerState, uid: string): CardInst {
    const i = p.hand.findIndex(x => x.uid === uid);
    if (i < 0) throw new GameError('NOT_IN_HAND', 'Carta não está na sua mão');
    return p.hand.splice(i, 1)[0];
  }

  private toDiscard(s: GameState, card: CardInst): void {
    delete card.color;
    s.discardPile.push(card);
  }

  groupOf(p: PlayerState, color: CardColor): ColorGroup | undefined {
    return p.groups.find(g => g.color === color);
  }

  isComplete(g: ColorGroup): boolean {
    return g.cards.length >= SET_SIZE[g.color];
  }

  completeColors(p: PlayerState): CardColor[] {
    return p.groups.filter(g => this.isComplete(g)).map(g => g.color);
  }

  private addToGroup(p: PlayerState, card: CardInst): void {
    const color = card.color;
    if (!color) throw new GameError('NO_COLOR', 'Propriedade sem cor atribuída');
    let g = this.groupOf(p, color);
    if (!g) { g = { color, cards: [], house: null, hotel: null }; p.groups.push(g); }
    g.cards.push(card);
  }

  private mergeGroup(s: GameState, to: PlayerState, g: ColorGroup): void {
    const existing = this.groupOf(to, g.color);
    if (!existing) { to.groups.push(g); return; }
    existing.cards.push(...g.cards);
    if (!existing.house && g.house) existing.house = g.house;
    if (!existing.hotel && g.hotel) existing.hotel = g.hotel;
    if (g.house && existing.house && g.house !== existing.house) s.discardPile.push(g.house);
    if (g.hotel && existing.hotel && g.hotel !== existing.hotel) s.discardPile.push(g.hotel);
  }

  findInGroups(p: PlayerState, uid: string): { card: CardInst; group: ColorGroup } | null {
    for (const g of p.groups) {
      const card = g.cards.find(c => c.uid === uid);
      if (card) return { card, group: g };
    }
    return null;
  }

  /** Remove carta de um grupo; limpa casa/hotel se o conjunto quebrar */
  private takeFromGroups(s: GameState, p: PlayerState, uid: string): CardInst {
    const found = this.findInGroups(p, uid);
    if (!found) throw new GameError('NOT_FOUND', 'Propriedade não encontrada');
    const { card, group } = found;
    const wasComplete = this.isComplete(group);
    group.cards = group.cards.filter(c => c.uid !== uid);
    if (group.cards.length === 0) {
      p.groups = p.groups.filter(g => g !== group);
    } else if (wasComplete && !this.isComplete(group)) {
      if (group.house) { this.toDiscard(s, group.house); group.house = null; }
      if (group.hotel) { this.toDiscard(s, group.hotel); group.hotel = null; }
    }
    return card;
  }

  private draw(s: GameState, n: number): CardInst[] {
    const out: CardInst[] = [];
    for (let i = 0; i < n; i++) {
      if (s.drawPile.length === 0) {
        if (s.discardPile.length === 0) break;
        s.drawPile = shuffle(s.discardPile.splice(0));
        this.log(s, 'Baralho embaralhado de novo');
      }
      const c = s.drawPile.pop();
      if (c) out.push(c);
    }
    return out;
  }

  /** Soma do que o jogador PODE pagar (banco + grupos incompletos) */
  private availableTotal(p: PlayerState): number {
    let total = 0;
    for (const c of p.bank) total += cardValue(c.defId);
    for (const g of p.groups) {
      if (this.isComplete(g)) continue;
      for (const c of g.cards) total += cardValue(c.defId);
    }
    return total;
  }
}
