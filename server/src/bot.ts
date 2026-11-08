// ============================================================
//  BOT — heurística simples para jogadores controlados pela CPU
//  Retorna uma lista de ações candidatas em ordem de prioridade;
//  o servidor tenta na ordem até uma ser válida.
// ============================================================
import type { GameAction, GameState, PlayerState, CardColor } from '@md/shared';
import { CARDS, ALL_COLORS, SET_SIZE, cardValue } from '@md/shared';
import type { Engine } from './engine.js';

function complete(engine: Engine, p: PlayerState, color: CardColor): boolean {
  const g = engine.groupOf(p, color);
  return !!g && engine.isComplete(g);
}

/** Melhor cor para um curinga: prefere cores em que o bot JÁ tem propriedade;
 *  curinga de 2 cores pode abrir grupo novo (usa a primeira cor permitida) */
function pickWildColor(engine: Engine, p: PlayerState, allowed: CardColor[]): CardColor | null {
  const pool = allowed.length > 0 ? allowed : ALL_COLORS;
  const owned = pool.filter(c => (engine.groupOf(p, c)?.cards.length ?? 0) > 0);
  if (owned.length > 0) {
    let best = owned[0];
    let bestCount = -1;
    for (const color of owned) {
      const count = engine.groupOf(p, color)!.cards.length;
      if (count > bestCount) { bestCount = count; best = color; }
    }
    return best;
  }
  // sem grupo: curinga de 2 cores ainda pode abrir um (escolhe a cor da carta)
  return allowed.length > 0 ? allowed[0] : null;
}

/** Cores em que o bot possui propriedade (o aluguel é pelas SUAS propriedades) */
function rentOpportunities(engine: Engine, p: PlayerState): CardColor[] {
  return p.groups
    .filter(g => g.cards.length > 0)
    .map(g => g.color)
    .sort((a, b) => (engine.groupOf(p, b)!.cards.length) - (engine.groupOf(p, a)!.cards.length));
}

export function botCandidates(engine: Engine): GameAction[] {
  const s = engine.s;
  const actorId = engine.currentActorId();
  if (!actorId) return [];
  const p = s.players.find(x => x.id === actorId);
  if (!p || !p.isBot || s.phase !== 'playing') return [];

  const out: GameAction[] = [];

  // ---- Precisa descartar (mão acima do limite) ----
  if (s.blocking?.playerId === p.id) {
    const limit = s.settings.handLimit;
    const excess = p.hand.length - limit;
    const worst = [...p.hand]
      .sort((a, b) => cardValue(a.defId) - cardValue(b.defId))
      .slice(0, excess)
      .map(c => c.uid);
    out.push({ t: 'DISCARD', uids: worst });
    return out;
  }

  // ---- Ação pendente: ele é o defensor ----
  if (s.pending) {
    const pend = s.pending;
    if (pend.defenderId !== p.id) return out;

    if (pend.stage === 'SAYNO') {
      const hasNo = p.hand.some(c => CARDS[c.defId].action === 'justSayNo');
      const isSteal = pend.kind !== 'RENT' && pend.kind !== 'DEBT';
      const big = (pend.amount ?? 0) >= 5;
      // Usa "Não!" contra roubos ou cobranças altas (85% das vezes)
      if (hasNo && (isSteal || big) && Math.random() < 0.85) out.push({ t: 'SAY_NO' });
      out.push({ t: 'ACCEPT' });
      return out;
    }

    if (pend.stage === 'PAY') {
      // Paga com dinheiro primeiro, depois propriedades de conjunto incompleto;
      // se não cobrir, entrega tudo que tem (regra: não fica devendo)
      const amount = pend.amount ?? 0;
      const picked: string[] = [];
      let sum = 0;
      const money = [...p.bank].sort((a, b) => cardValue(b.defId) - cardValue(a.defId));
      for (const c of money) {
        if (sum >= amount) break;
        picked.push(c.uid); sum += cardValue(c.defId);
      }
      const props = p.groups
        .filter(g => !engine.isComplete(g))
        .flatMap(g => g.cards)
        .sort((a, b) => cardValue(b.defId) - cardValue(a.defId));
      for (const c of props) {
        if (sum >= amount) break;
        picked.push(c.uid); sum += cardValue(c.defId);
      }
      out.push({ t: 'PAY', uids: picked });
      return out;
    }
  }

  // ---- Turno do bot: ações em ordem de prioridade ----
  const opponents = s.players.filter(o => o.id !== p.id && !o.isOut);

  // 1) Propriedades e curingas da mão
  for (const c of p.hand) {
    const def = CARDS[c.defId];
    if (def.type === 'property') out.push({ t: 'PLAY_PROPERTY', uid: c.uid });
    else if (def.type === 'wildProperty') {
      const chosen = pickWildColor(engine, p, def.colors ?? []);
      // sem cor válida o curinga fica na mão (não vai para o banco)
      if (chosen) out.push({ t: 'PLAY_PROPERTY', uid: c.uid, color: chosen });
    }
  }

  // 2) Construir casa/hotel
  for (const c of p.hand) {
    const def = CARDS[c.defId];
    if (def.type === 'house') {
      for (const g of p.groups) {
        if (engine.isComplete(g) && !g.house && g.color !== 'railroad' && g.color !== 'utility') {
          out.push({ t: 'BUILD', uid: c.uid, color: g.color });
        }
      }
    } else if (def.type === 'hotel') {
      for (const g of p.groups) {
        if (engine.isComplete(g) && g.house && !g.hotel) {
          out.push({ t: 'BUILD', uid: c.uid, color: g.color });
        }
      }
    }
  }

  // 3) Cobrar aluguel (com dobrador se tiver e a conta compensar)
  const opportunities = rentOpportunities(engine, p);
  for (const c of p.hand) {
    const def = CARDS[c.defId];
    if (def.type !== 'rent') continue;
    const colors = (def.rentColors && def.rentColors.length > 0)
      ? def.rentColors
      : opportunities.slice(0, 1);
    const usable = colors.filter(col => opportunities.includes(col));
    if (usable.length === 0) continue;
    const doubleUid = p.hand.find(x => CARDS[x.defId].action === 'doubleRent')?.uid;
    if (doubleUid && s.movesLeft >= 2) {
      out.push({ t: 'RENT', uid: c.uid, color: usable[0], doubleUid });
    }
    out.push({ t: 'RENT', uid: c.uid, color: usable[0] });
  }

  // 4) Pass Go (sempre bom)
  for (const c of p.hand) {
    if (CARDS[c.defId].action === 'passGo') out.push({ t: 'ACTION', uid: c.uid });
  }

  // 5) Cobrador de Dívidas em oponente com dinheiro
  for (const c of p.hand) {
    if (CARDS[c.defId].action !== 'debtCollector') continue;
    const rich = opponents.find(o => o.bank.reduce((t, x) => t + cardValue(x.defId), 0) >= 5);
    if (rich) out.push({ t: 'ACTION', uid: c.uid, targetId: rich.id });
  }

  // 6) Quebra de Acordo (roubar conjunto completo)
  for (const c of p.hand) {
    if (CARDS[c.defId].action !== 'dealBreaker') continue;
    for (const o of opponents) {
      const set = o.groups.find(g => engine.isComplete(g));
      if (set) out.push({ t: 'ACTION', uid: c.uid, targetId: o.id, color: set.color });
    }
  }

  // 7) Negociação Esperta (roubar propriedade avulsa de conjunto incompleto)
  for (const c of p.hand) {
    if (CARDS[c.defId].action !== 'slyDeal') continue;
    for (const o of opponents) {
      for (const g of o.groups) {
        if (!engine.isComplete(g) && g.cards.length > 0) {
          out.push({ t: 'ACTION', uid: c.uid, targetId: o.id, propUid: g.cards[0].uid });
        }
      }
    }
  }

  // 8) Negociação Forçada (trocar propriedade)
  for (const c of p.hand) {
    if (CARDS[c.defId].action !== 'forcedDeal') continue;
    const give = p.groups.find(g => !engine.isComplete(g) && g.cards.length > 0);
    if (!give) continue;
    for (const o of opponents) {
      const take = o.groups.find(g => !engine.isComplete(g) && g.cards.length > 0);
      if (take) {
        out.push({
          t: 'ACTION', uid: c.uid, targetId: o.id,
          giveUid: give.cards[0].uid, propUid: take.cards[0].uid,
        });
      }
    }
  }

  // 9) Dinheiro para o banco
  for (const c of p.hand) {
    if (CARDS[c.defId].type === 'money') out.push({ t: 'PLAY_BANK', uid: c.uid });
  }

  return out;
}
