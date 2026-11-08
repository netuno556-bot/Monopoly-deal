// Modais da mesa: menu de carta, curinga, alvo, roubos, pagamento e descarte
import { useState } from 'react';
import type { CardColor, CardInst, ColorGroup, PlayerView, PendingAction } from '@md/shared';
import { CARDS, SET_SIZE, ALL_COLORS, cardValue } from '@md/shared';
import { useStore, type Flow } from '../store';
import Card, { COLOR_HEX, COLOR_LABEL } from './Card';

// ---------------------------------------------------------------- helpers
const close = () => useStore.getState().setFlow(null);

function Sheet({
  title, sub, children, actions, onClose = close,
}: {
  title: string; sub?: string; children?: React.ReactNode;
  actions?: React.ReactNode; onClose?: () => void;
}) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h3>{title}</h3>
        {sub && <p className="sub">{sub}</p>}
        {children}
        <div className="sheet-actions">
          {actions ?? (
            <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Opt({
  label, meta, disabled, onClick,
}: { label: React.ReactNode; meta?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="opt" disabled={disabled} onClick={onClick}>
      <span className="grow">{label}</span>
      {meta && <span className="meta">{meta}</span>}
    </button>
  );
}

function complete(g: ColorGroup) {
  return g.cards.length >= SET_SIZE[g.color];
}

// ---------------------------------------------------------------- menu
function MenuModal({ card }: { card: CardInst }) {
  const act = useStore(s => s.act);
  const setFlow = useStore(s => s.setFlow);
  const me = useStore(s => s.room?.game?.players.find(p => p.id === s.myId));
  const game = useStore(s => s.room?.game);
  const def = CARDS[card.defId];
  if (!def || !me) return null;

  const run = (action: Parameters<typeof act>[0]) => { close(); act(action); };
  const go = (f: Flow) => setFlow(f);

  type Opt = { label: React.ReactNode; meta?: string; disabled?: boolean; run?: () => void };
  const opts: Opt[] = [];

  // Pergunta antes de jogar: banco OU uso da carta (exceto curinga)
  const bankOpt: Opt = {
    label: '🏦 Jogar no banco (virar dinheiro)',
    meta: `${cardValue(card.defId)}M`,
    run: () => run({ t: 'PLAY_BANK', uid: card.uid }),
  };

  switch (def.type) {
    case 'money':
      opts.push({ label: '💰 Colocar no banco', meta: `${def.value}M`, run: () => run({ t: 'PLAY_BANK', uid: card.uid }) });
      break;
    case 'property':
      opts.push({ label: `🏠 Jogar como propriedade`, meta: COLOR_LABEL[def.colors![0]], run: () => run({ t: 'PLAY_PROPERTY', uid: card.uid }) });
      opts.push(bankOpt);
      break;
    case 'wildProperty':
      opts.push({ label: '🌈 Escolher cor do curinga…', run: () => go({ kind: 'wild', card }) });
      break;
    case 'house':
    case 'hotel':
      opts.push({ label: def.type === 'house' ? '🏡 Construir casa (+3 aluguel)' : '🏨 Construir hotel (+4 aluguel)', run: () => go({ kind: 'build', card }) });
      opts.push(bankOpt);
      break;
    case 'rent': {
      const owned = (def.rentColors?.length ? def.rentColors : [])
        .filter(c => (me.groups.find(g => g.color === c)?.cards.length ?? 0) > 0);
      const can = def.rentColors?.length ? owned.length > 0 : me.groups.length > 0;
      opts.push({ label: '🏷️ Cobrar aluguel…', disabled: !can, meta: can ? undefined : 'sem propriedade', run: () => go({ kind: 'rentColor', card }) });
      opts.push(bankOpt);
      break;
    }
    case 'action':
      switch (def.action) {
        case 'passGo': {
          // Respeita o limite de mão: só compra o espaço que a própria carta libera
          const limit = game?.settings.handLimit ?? 7;
          const n = Math.max(0, Math.min(2, limit - ((me.hand?.length ?? 1) - 1)));
          opts.push({
            label: n > 0 ? `🎯 Pass Go — comprar ${n} carta(s)` : '🎯 Pass Go — mão cheia',
            run: () => run({ t: 'ACTION', uid: card.uid }),
          });
          opts.push(bankOpt);
          break;
        }
        case 'debtCollector':
          opts.push({ label: '💸 Cobrador de Dívidas — cobrar 5M…', run: () => go({ kind: 'target', card, op: 'debt' }) });
          opts.push(bankOpt);
          break;
        case 'slyDeal':
          opts.push({ label: '🥷 Negociação Esperta — roubar 1 propriedade…', run: () => go({ kind: 'target', card, op: 'sly' }) });
          opts.push(bankOpt);
          break;
        case 'dealBreaker':
          opts.push({ label: '🔨 Quebra de Acordo — roubar conjunto completo…', run: () => go({ kind: 'target', card, op: 'dealbreaker' }) });
          opts.push(bankOpt);
          break;
        case 'forcedDeal':
          opts.push({ label: '🤝 Negociação Forçada — trocar propriedades…', run: () => go({ kind: 'target', card, op: 'forced' }) });
          opts.push(bankOpt);
          break;
        case 'justSayNo':
          opts.push({ label: '🙅 Não!', disabled: true, meta: 'só como resposta' });
          opts.push(bankOpt);
          break;
        case 'doubleRent':
          opts.push({ label: '✖️ Aluguel em Dobro', disabled: true, meta: 'use ao cobrar aluguel' });
          opts.push(bankOpt);
          break;
      }
      break;
  }

  const canBank = def.type !== 'wildProperty';
  return (
    <Sheet
      title={def.name}
      sub={def.type === 'money'
        ? `Valor de pagamento: ${cardValue(card.defId)}M`
        : canBank
          ? `Valor no banco: ${cardValue(card.defId)}M — escolha o destino da carta (banco ou uso na mesa).`
          : `Valor de pagamento: ${cardValue(card.defId)}M`}
    >
      <div className="opt-list">
        {opts.map((o, i) => (
          <Opt key={i} label={o.label} meta={o.meta} disabled={o.disabled} onClick={() => o.run?.()} />
        ))}
        <button className="opt" onClick={close}>
          <span className="grow" style={{ color: 'var(--muted)' }}>Fechar</span>
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- curinga
function WildModal({ card }: { card: CardInst }) {
  const act = useStore(s => s.act);
  const me = useStore(s => s.room?.game?.players.find(p => p.id === s.myId));
  const def = CARDS[card.defId];
  const allowed = def.colors ?? [];
  const isDual = allowed.length >= 2;
  const pool: CardColor[] = (allowed.length > 0
    ? allowed
    : (['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'darkblue'] as CardColor[]));

  const pick = (color: CardColor) => { close(); act({ t: 'PLAY_PROPERTY', uid: card.uid, color }); };

  return (
    <Sheet
      title="Escolha a cor do curinga"
      sub={isDual
        ? `Esta curinga só aceita ${pool.map(c => COLOR_LABEL[c]).join(' ou ')} — e entra num conjunto que você já tem na mesa.`
        : 'O curinga entra no grupo da cor escolhida (você já precisa ter essa cor na mesa).'}
    >
      <div className="color-grid">
        {pool.map(c => {
          const g = me?.groups.find(x => x.color === c);
          const has = !!g && g.cards.length > 0;
          // De 2 cores pode abrir grupo novo; curinga geral exige grupo existente
          const can = has || isDual;
          return (
            <button
              key={c}
              className="color-btn"
              disabled={!can}
              style={{
                background: COLOR_HEX[c],
                opacity: can ? 1 : 0.45,
              }}
              onClick={() => pick(c)}
            >
              {COLOR_LABEL[c]}
              <small>{has ? `${g!.cards.length} na mesa` : isDual ? 'grupo novo' : 'você não tem'}</small>
            </button>
          );
        })}
        {!isDual && pool.every(c => !(me?.groups.find(x => x.color === c)?.cards.length)) && (
          <p className="sub">Você ainda não tem nenhuma dessas cores na mesa — jogue a propriedade primeiro.</p>
        )}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------- trocar cor do curinga na mesa
function ReColorModal({ card }: { card: CardInst }) {
  const act = useStore(s => s.act);
  const me = useStore(s => s.room?.game?.players.find(p => p.id === s.myId));
  const def = CARDS[card.defId];
  const allowed = def.colors ?? [];
  const isDual = allowed.length >= 2;
  const pool: CardColor[] = allowed.length > 0 ? allowed : ALL_COLORS;
  const current = me?.groups.find(g => g.cards.some(c => c.uid === card.uid))?.color;

  const pick = (color: CardColor) => { close(); act({ t: 'SET_WILD', uid: card.uid, color }); };

  return (
    <Sheet
      title="Trocar a cor do curinga"
      sub={isDual
        ? `Esta carta continua sendo curinga — pode ir para ${pool.map(c => COLOR_LABEL[c]).join(' ou ')}.`
        : 'Escolha uma cor em que você já tenha um conjunto na mesa.'}
    >
      <div className="color-grid">
        {pool.map(c => {
          const g = me?.groups.find(x => x.color === c);
          const has = !!g && g.cards.length > 0;
          // Não pode escolher a cor atual; curinga geral exige grupo existente
          const can = c !== current && (has || isDual);
          return (
            <button
              key={c}
              className="color-btn"
              disabled={!can}
              style={{ background: COLOR_HEX[c], opacity: can ? 1 : 0.45 }}
              onClick={() => pick(c)}
            >
              {COLOR_LABEL[c]}
              <small>
                {c === current ? 'atual' : has ? `${g!.cards.length} na mesa` : isDual ? 'grupo novo' : 'você não tem'}
              </small>
            </button>
          );
        })}
      </div>
      <p className="sub">Custa 1 jogada no seu turno — a carta continua sendo curinga na mesa.</p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- construir
function BuildModal({ card }: { card: CardInst }) {
  const act = useStore(s => s.act);
  const me = useStore(s => s.room?.game?.players.find(p => p.id === s.myId));
  const isHouse = CARDS[card.defId].type === 'house';

  const targets = (me?.groups ?? []).filter(g =>
    complete(g) && g.color !== 'railroad' && g.color !== 'utility'
    && (isHouse ? !g.house : g.house && !g.hotel));

  return (
    <Sheet
      title={isHouse ? 'Construir casa' : 'Construir hotel'}
      sub={isHouse
        ? 'A casa só pode ir num conjunto completo (dá +3 de aluguel).'
        : 'O hotel exige uma casa previamente construída (+4 de aluguel).'}
    >
      {targets.length === 0 ? (
        <p className="sub">Nenhum conjunto elegível agora. Complete um conjunto {isHouse ? 'sem casa' : 'com casa'} primeiro.</p>
      ) : (
        <div className="opt-list">
          {targets.map(g => (
            <Opt
              key={g.color}
              label={<><i className="g-dot" style={{ background: COLOR_HEX[g.color], display: 'inline-block', width: 12, height: 12, borderRadius: 3, marginRight: 8 }} />{COLOR_LABEL[g.color]} ({g.cards.length}/{SET_SIZE[g.color]})</>}
              meta={isHouse ? '+3M' : '+4M'}
              onClick={() => { close(); act({ t: 'BUILD', uid: card.uid, color: g.color }); }}
            />
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- aluguel
function RentModal({ card }: { card: CardInst }) {
  const act = useStore(s => s.act);
  const me = useStore(s => s.room?.game?.players.find(p => p.id === s.myId));
  const movesLeft = useStore(s => s.room?.game?.movesLeft ?? 0);
  const [picked, setPicked] = useState<CardColor | undefined>(undefined);
  const [double, setDouble] = useState(false);
  const def = CARDS[card.defId];

  const defColors = def.rentColors ?? [];
  const isDual = defColors.length > 0; // par de cores (regra oficial) vs curinga
  const owned = (me?.groups ?? [])
    .filter(g => g.cards.length > 0)
    .map(g => g.color)
    .filter(c => !isDual || defColors.includes(c));

  // Duas cores: cobra as DUAS que você tiver — basta ter pelo menos uma.
  // Curinga: você escolhe uma cor (o motor cobra só ela).
  const color: CardColor | undefined =
    picked && owned.includes(picked) ? picked : owned[0];

  // Dual mostra as duas cores da carta (com aviso se você não tem uma delas);
  // curinga mostra só as cores que você já tem na mesa.
  const shown = isDual ? defColors : owned;

  const hasDouble = (me?.hand ?? []).some(c => CARDS[c.defId].action === 'doubleRent');
  const doubleUsable = hasDouble && movesLeft >= 2;
  const doubleUid = me?.hand?.find(c => CARDS[c.defId].action === 'doubleRent')?.uid;

  return (
    <Sheet
      title="Cobrar aluguel"
      sub={isDual
        ? 'Esta carta cobra as DUAS cores que você tiver na mesa (basta ter qualquer uma delas) — todos os oponentes pagam.'
        : 'Escolha a cor das SUAS propriedades — todos os oponentes pagam aluguel por ela.'}
    >
      <div className="color-grid">
        {shown.map(c => {
          const g = me?.groups.find(x => x.color === c);
          const has = owned.includes(c);
          return (
            <button
              key={c}
              className="color-btn"
              disabled={!has}
              style={{
                background: COLOR_HEX[c],
                borderColor: color === c ? 'var(--gold)' : undefined,
                transform: color === c ? 'scale(1.05)' : undefined,
                opacity: has ? 1 : 0.45,
              }}
              onClick={() => setPicked(c)}
            >
              {COLOR_LABEL[c]}
              <small>{has ? `${g?.cards.length} carta(s)` : 'você não tem'}</small>
            </button>
          );
        })}
        {owned.length === 0 && (
          <p className="sub">Você não tem propriedades cobertas por esta carta.</p>
        )}
      </div>

      {hasDouble && (
        <button
          className="opt"
          style={{ marginTop: 12, opacity: doubleUsable ? 1 : 0.5 }}
          disabled={!doubleUsable}
          onClick={() => setDouble(!double)}
        >
          <span className="grow">✖️ Aluguel em Dobro {double ? '✓' : ''}</span>
          <span className="meta">{doubleUsable ? '+1 jogada · ×2' : 'precisa de 2 jogadas'}</span>
        </button>
      )}

      <div className="sheet-actions">
        <button className="btn btn--ghost" onClick={close}>Cancelar</button>
        <button
          className="btn btn--gold"
          disabled={!color}
          onClick={() => {
            close();
            act({ t: 'RENT', uid: card.uid, color, doubleUid: double && doubleUsable ? doubleUid : undefined });
          }}
        >
          Cobrar!
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- alvo
function TargetModal({ card, op }: { card: CardInst; op: 'debt' | 'sly' | 'dealbreaker' | 'forced' }) {
  const act = useStore(s => s.act);
  const setFlow = useStore(s => s.setFlow);
  const game = useStore(s => s.room?.game);
  const myId = useStore(s => s.myId);
  if (!game) return null;

  const opponents = game.players.filter(p => p.id !== myId && !p.isOut);

  const titles = {
    debt: ['Cobrador de Dívidas', 'Em quem você vai cobrar 5M?'],
    sly: ['Negociação Esperta', 'De quem você vai roubar uma propriedade?'],
    dealbreaker: ['Quebra de Acordo', 'De quem você vai roubar um conjunto completo?'],
    forced: ['Negociação Forçada', 'Com quem você vai trocar propriedades?'],
  } as const;

  const pick = (targetId: string) => {
    if (op === 'debt') {
      close();
      act({ t: 'ACTION', uid: card.uid, targetId });
      return;
    }
    if (op === 'sly' || op === 'dealbreaker') setFlow({ kind: 'pickProp', card, op, targetId });
    else setFlow({ kind: 'giveProp', card, targetId });
  };

  return (
    <Sheet title={titles[op][0]} sub={titles[op][1]}>
      <div className="opt-list">
        {opponents.map(o => {
          const sets = o.groups.filter(complete).length;
          const props = o.groups.reduce((n, g) => n + g.cards.length, 0);
          return (
            <Opt
              key={o.id}
              label={`${o.name}${o.isBot ? ' 🤖' : ''}`}
              meta={op === 'dealbreaker'
                ? (sets > 0 ? `${sets} conjunto(s)` : 'sem conjunto completo')
                : `${props} propriedade(s)`}
              disabled={op === 'dealbreaker' && sets === 0}
              onClick={() => pick(o.id)}
            />
          );
        })}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- roubos
function PickPropModal({
  card, op, targetId,
}: { card: CardInst; op: 'sly' | 'dealbreaker'; targetId: string }) {
  const act = useStore(s => s.act);
  const game = useStore(s => s.room?.game);
  const target = game?.players.find(p => p.id === targetId);
  if (!game || !target) return null;

  const steal = (extra: { propUid?: string; color?: CardColor }) => {
    close();
    act({ t: 'ACTION', uid: card.uid, targetId, ...extra });
  };

  if (op === 'dealbreaker') {
    const sets = target.groups.filter(complete);
    return (
      <Sheet title={`Roubar conjunto de ${target.name}`} sub="Escolha qual conjunto completo levar.">
        <div className="color-grid">
          {sets.map(g => (
            <button
              key={g.color}
              className="color-btn"
              style={{ background: COLOR_HEX[g.color] }}
              onClick={() => steal({ color: g.color })}
            >
              {COLOR_LABEL[g.color]}
              <small>{g.cards.length} cartas{g.house ? ' 🏡' : ''}{g.hotel ? ' 🏨' : ''}</small>
            </button>
          ))}
          {sets.length === 0 && <p className="sub">Este jogador não tem conjuntos completos.</p>}
        </div>
      </Sheet>
    );
  }

  // sly deal: propriedades de conjuntos incompletos
  const cards = target.groups.filter(g => !complete(g)).flatMap(g => g.cards);
  return (
    <Sheet title={`Roubar propriedade de ${target.name}`} sub="Negociação Esperta não pode tirar de conjuntos completos.">
      <div className="pick-grid">
        {cards.map(c => (
          <Card key={c.uid} card={c} onClick={() => steal({ propUid: c.uid })} style={{ width: 74, height: 105 }} />
        ))}
        {cards.length === 0 && <p className="sub">Nada disponível para roubar.</p>}
      </div>
    </Sheet>
  );
}

function GivePropModal({ card, targetId }: { card: CardInst; targetId: string }) {
  const setFlow = useStore(s => s.setFlow);
  const me = useStore(s => s.room?.game?.players.find(p => p.id === s.myId));
  const cards = (me?.groups ?? []).filter(g => !complete(g)).flatMap(g => g.cards);

  return (
    <Sheet title="Negociação Forçada — 1/2" sub="Escolha a propriedade SUA que você vai entregar.">
      <div className="pick-grid">
        {cards.map(c => (
          <Card
            key={c.uid}
            card={c}
            onClick={() => setFlow({ kind: 'giveProp2', card, targetId, giveUid: c.uid })}
            style={{ width: 74, height: 105 }}
          />
        ))}
        {cards.length === 0 && <p className="sub">Você não tem propriedades em conjuntos incompletos.</p>}
      </div>
    </Sheet>
  );
}

function GiveProp2Modal({
  card, targetId, giveUid,
}: { card: CardInst; targetId: string; giveUid: string }) {
  const act = useStore(s => s.act);
  const game = useStore(s => s.room?.game);
  const target = game?.players.find(p => p.id === targetId);
  const cards = (target?.groups ?? []).filter(g => !complete(g)).flatMap(g => g.cards);

  return (
    <Sheet title="Negociação Forçada — 2/2" sub={`Escolha a propriedade DE ${target?.name ?? '?'} que você quer levar.`}>
      <div className="pick-grid">
        {cards.map(c => (
          <Card
            key={c.uid}
            card={c}
            onClick={() => { close(); act({ t: 'ACTION', uid: card.uid, targetId, giveUid, propUid: c.uid }); }}
            style={{ width: 74, height: 105 }}
          />
        ))}
        {cards.length === 0 && <p className="sub">O oponente não tem propriedades em conjuntos incompletos.</p>}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- grade de seleção
function PickGrid({
  cards, selectable,
}: { cards: CardInst[]; selectable: (uid: string) => boolean }) {
  const selecting = useStore(s => s.selecting);
  const toggleSelect = useStore(s => s.toggleSelect);
  return (
    <div className="pick-grid">
      {cards.map(c => {
        const ok = selectable(c.uid);
        return (
          <div key={c.uid} className="pick" style={{ opacity: ok ? 1 : 0.35 }}>
            {selecting.has(c.uid) && <span className="mark">✓</span>}
            <Card card={c} selected={selecting.has(c.uid)} onClick={ok ? () => toggleSelect(c.uid) : undefined} style={{ width: 66, height: 94 }} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- pagamento
function PayModal() {
  const act = useStore(s => s.act);
  const game = useStore(s => s.room?.game);
  const me = useStore(s => s.room?.game?.players.find(p => p.id === s.myId));
  const selecting = useStore(s => s.selecting);
  const clearSelection = useStore(s => s.clearSelection);
  const setFlow = useStore(s => s.setFlow);
  const payMinimized = useStore(s => s.payMinimized);
  const setPayMinimized = useStore(s => s.setPayMinimized);
  const pending = game?.pending;
  if (!game || !me || !pending || pending.stage !== 'PAY' || pending.defenderId !== me.id) return null;

  const amount = pending.amount ?? 0;
  const initiator = game.players.find(p => p.id === pending.initiatorId)?.name ?? '?';

  // Minimizado: vira um chip flutuante (a seleção fica salva no store)
  if (payMinimized) {
    return (
      <button
        className="pay-chip"
        onClick={() => setPayMinimized(false)}
        title="Voltar para a tela de pagamento"
      >
        💸 Pagar {amount}M <span className="pay-chip__who">para {initiator}</span> ▲
      </button>
    );
  }

  // Só pode pagar com dinheiro do banco e propriedades de conjuntos incompletos
  const selectableCards = [
    ...me.bank,
    ...(me.groups ?? []).filter(g => !complete(g)).flatMap(g => g.cards),
  ];
  const available = selectableCards.reduce((t, c) => t + cardValue(c.defId), 0);
  const sum = selectableCards
    .filter(c => selecting.has(c.uid))
    .reduce((t, c) => t + cardValue(c.defId), 0);

  const covers = sum >= amount;
  // Menos que a dívida só vale se for TUDO que tem na mesa
  const paysAll = sum >= available && available > 0;
  const canPay = selecting.size > 0 && (covers || paysAll);

  const setSelection = (uids: string[]) => useStore.setState({ selecting: new Set(uids) });

  /** Dinheiro primeiro, depois propriedades (até cobrir a dívida) */
  const suggest = () => {
    const picked: string[] = [];
    let s = 0;
    const money = [...me.bank].sort((a, b) => cardValue(b.defId) - cardValue(a.defId));
    for (const c of money) { if (s >= amount) break; picked.push(c.uid); s += cardValue(c.defId); }
    const props = (me.groups ?? []).filter(g => !complete(g)).flatMap(g => g.cards)
      .sort((a, b) => cardValue(b.defId) - cardValue(a.defId));
    for (const c of props) { if (s >= amount) break; picked.push(c.uid); s += cardValue(c.defId); }
    setSelection(picked);
  };

  const pay = () => {
    const uids = selectableCards.filter(c => selecting.has(c.uid)).map(c => c.uid);
    clearSelection();
    setFlow(null);
    act({ t: 'PAY', uids });
  };

  return (
    <Sheet
      title={`Pagar ${amount}M para ${initiator}`}
      sub="Escolha como pagar: dinheiro do banco e/ou propriedades de conjuntos incompletos. Se não cobrir a dívida, selecione tudo que tem (você paga só o que tiver — nunca fica devendo)."
      onClose={() => setPayMinimized(true)}
    >
      <div className="pay-total">
        <span>Selecionado: <b className={covers ? 'ok' : 'bad'}>{sum}M</b></span>
        <span>Dívida: <b>{amount}M</b></span>
        <span>Disponível: <b>{available}M</b></span>
      </div>

      <div className="sheet-actions" style={{ marginBottom: 8 }}>
        <button className="btn btn--ghost btn--sm" onClick={suggest}>💡 Dinheiro primeiro</button>
        <button className="btn btn--ghost btn--sm" onClick={() => setSelection(selectableCards.map(c => c.uid))}>
          Selecionar tudo
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => setSelection([])}>Limpar</button>
      </div>

      <div className="area-title">Seu banco (dinheiro)</div>
      <PickGrid cards={me.bank} selectable={() => true} />

      <div className="area-title" style={{ marginTop: 10 }}>
        Propriedades de conjuntos incompletos
      </div>
      <PickGrid
        cards={(me.groups ?? []).filter(g => !complete(g)).flatMap(g => g.cards)}
        selectable={() => true}
      />
      {selectableCards.length === 0 && (
        <p className="sub">Você não tem nada para pagar — a cobrança será encerrada.</p>
      )}
      {!covers && !paysAll && selectableCards.length > 0 && (
        <p className="sub" style={{ marginTop: 8 }}>
          Faltam <b>{amount - sum}M</b> para cobrir a dívida — marque mais cartas,
          ou selecione <b>tudo</b> que tem ({available}M) para pagar só o que tiver.
        </p>
      )}
      {covers && (
        <p className="sub" style={{ marginTop: 8 }}>
          ✅ A seleção cobre a dívida de {amount}M.
        </p>
      )}

      <div className="sheet-actions">
        <button className="btn btn--ghost" onClick={() => setPayMinimized(true)}>
          — Minimizar
        </button>
        <button className="btn btn--gold" disabled={!canPay} onClick={pay}>
          {covers ? `💸 Pagar ${sum}M` : `💸 Pagar tudo (${sum}M)`}
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- descarte
function DiscardModal() {
  const act = useStore(s => s.act);
  const game = useStore(s => s.room?.game);
  const me = useStore(s => s.room?.game?.players.find(p => p.id === s.myId));
  const selecting = useStore(s => s.selecting);
  const clearSelection = useStore(s => s.clearSelection);
  if (!game || !me?.hand) return null;

  const limit = game.settings.handLimit;
  const need = Math.max(0, me.hand.length - limit);

  const confirm = () => {
    const uids = me.hand!.filter(c => selecting.has(c.uid)).map(c => c.uid);
    clearSelection();
    close();
    act({ t: 'DISCARD', uids });
  };

  return (
    <Sheet
      title={`Descarte ${need} carta(s)`}
      sub={`Sua mão tem ${me.hand.length} cartas e o limite é ${limit}. Escolha exatamente ${need}.`}
      onClose={close}
    >
      <PickGrid cards={me.hand} selectable={() => true} />
      <div className="sheet-actions">
        <button className="btn btn--ghost" onClick={close}>Fechar</button>
        <button className="btn btn--gold" disabled={selecting.size !== need} onClick={confirm}>
          Descartar {selecting.size > 0 ? `(${selecting.size})` : ''}
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- roteador
export default function Modals() {
  const flow = useStore(s => s.flow);
  if (!flow) return null;
  switch (flow.kind) {
    case 'menu': return <MenuModal card={flow.card} />;
    case 'wild': return <WildModal card={flow.card} />;
    case 'recolor': return <ReColorModal card={flow.card} />;
    case 'build': return <BuildModal card={flow.card} />;
    case 'rentColor': return <RentModal card={flow.card} />;
    case 'target': return <TargetModal card={flow.card} op={flow.op} />;
    case 'pickProp': return <PickPropModal card={flow.card} op={flow.op} targetId={flow.targetId} />;
    case 'giveProp': return <GivePropModal card={flow.card} targetId={flow.targetId} />;
    case 'giveProp2': return <GiveProp2Modal card={flow.card} targetId={flow.targetId} giveUid={flow.giveUid} />;
    case 'pay': return <PayModal />;
    case 'discard': return <DiscardModal />;
    default: return null;
  }
}

// ---------------------------------------------------------------- banner de resposta
export function PendingBanner() {
  const game = useStore(s => s.room?.game);
  const myId = useStore(s => s.myId);
  const act = useStore(s => s.act);
  const pending = game?.pending;
  if (!game || !pending) return null;

  const me = game.players.find(p => p.id === myId);
  const initiator = game.players.find(p => p.id === pending.initiatorId)?.name ?? '?';
  const target = game.players.find(p => p.id === pending.targetId)?.name ?? '?';
  const iAmDefender = pending.defenderId === myId;
  const iAmInitiator = pending.initiatorId === myId;

  const desc = describePending(pending, target, game);
  const defenderName = game.players.find(p => p.id === pending.defenderId)?.name ?? '?';
  // Estado invertido: alguém já jogou "Não!" e os papéis trocaram —
  // quem responde agora é o atacante original (defenderId !== targetId)
  const flipped = pending.defenderId !== pending.targetId;

  // Fase de escolha: o cobrado decide com o que paga (modal aberto por cima)
  if (pending.stage === 'PAY') {
    const cls = iAmDefender ? 'banner banner--danger' : iAmInitiator ? 'banner banner--gold' : 'banner';
    return (
      <div className={cls}>
        <span className="text">
          💸 <b>{desc}</b> · {iAmDefender ? 'escolha as cartas do pagamento' : `${defenderName} escolhe como pagar…`}
        </span>
      </div>
    );
  }

  if (iAmDefender && pending.stage === 'SAYNO') {
    const hasNo = (me?.hand ?? []).some(c => CARDS[c.defId].action === 'justSayNo');
    const mustPay = pending.kind === 'RENT' || pending.kind === 'DEBT';

    if (flipped) {
      // Eu fui atacado, joguei "Não!" — agora o atacante decide revidar ou desistir
      const victimName = target;
      return (
        <div className="banner banner--danger">
          <span className="text">
            🚫 <b>{victimName} jogou "Não!"</b> — {desc}. Revidar com outro "Não!" ou desistir?
          </span>
          <button className="btn btn--danger btn--sm" disabled={!hasNo} onClick={() => act({ t: 'SAY_NO' })}>
            🙅 Revidar{!hasNo && ' (sem carta)'}
          </button>
          <button className="btn btn--sm" onClick={() => act({ t: 'ACCEPT' })}>
            ❌ Desistir
          </button>
        </div>
      );
    }

    return (
      <div className="banner banner--danger">
        <span className="text">
          ⚠️ <b>{desc}</b>
          {mustPay ? ' — pagamento automático (dinheiro primeiro, depois propriedades)' : ''}
        </span>
        <button className="btn btn--danger btn--sm" disabled={!hasNo} onClick={() => act({ t: 'SAY_NO' })}>
          🙅 Não!{!hasNo && ' (sem carta)'}
        </button>
        <button className="btn btn--sm" onClick={() => act({ t: 'ACCEPT' })}>
          {mustPay ? '💸 Pagar' : '✅ Permitir'}
        </button>
      </div>
    );
  }

  const waiting = flipped
    ? `${initiator} decide se revida…`
    : `${defenderName} responde…`;

  return (
    <div className={`banner${iAmInitiator ? ' banner--gold' : ''}`}>
      <span className="text">
        {iAmInitiator ? '🗡️ Você' : `🗡️ ${initiator}`} — <b>{desc}</b> · {waiting}
      </span>
    </div>
  );
}

function describePending(
  p: PendingAction,
  targetName: string,
  game: { players: { id: string; name: string; groups?: ColorGroup[] }[] },
): string {
  // Acha uma carta roubada/trocada pelo uid (as mesas de todos são públicas)
  const findCard = (uid?: string): CardInst | undefined => {
    if (!uid) return undefined;
    for (const pl of game.players)
      for (const g of pl.groups ?? []) {
        const c = g.cards.find(x => x.uid === uid);
        if (c) return c;
      }
    return undefined;
  };
  const label = (c?: CardInst): string | null => {
    if (!c) return null;
    const def = CARDS[c.defId];
    const col = c.color ?? def?.colors?.[0];
    return `${def?.name ?? c.defId}${col ? ` (${COLOR_LABEL[col]})` : ''}`;
  };

  switch (p.kind) {
    case 'RENT': {
      const colors = p.rentColors ?? [];
      const shown = colors.length ? colors.map(c => COLOR_LABEL[c]).join(' + ') : 'qualquer cor';
      return `Aluguel${p.double ? ' EM DOBRO' : ''} de ${p.amount}M (${shown}) cobrado de ${targetName}`;
    }
    case 'DEBT':
      return `${targetName} deve pagar 5M (Cobrador de Dívidas)`;
    case 'DEAL_BREAKER': {
      const g = game.players
        .find(pl => pl.id === p.targetId)?.groups
        ?.find(x => x.color === p.color);
      const names = g?.cards.map(c => CARDS[c.defId]?.name).join(', ');
      const buildings = `${g?.house ? ' 🏡' : ''}${g?.hotel ? ' 🏨' : ''}`;
      return names
        ? `${targetName} vai perder o conjunto ${p.color ? COLOR_LABEL[p.color] : ''}${buildings}: ${names}`
        : `${targetName} vai perder o conjunto ${p.color ? COLOR_LABEL[p.color] : ''}`;
    }
    case 'SLY_DEAL': {
      const l = label(findCard(p.propUid));
      return l
        ? `${targetName} vai perder ${l}`
        : `${targetName} vai perder uma propriedade`;
    }
    case 'FORCED_DEAL': {
      const take = label(findCard(p.propUid));
      const give = label(findCard(p.giveUid));
      return `Troca forçada com ${targetName}: entrega ${give ?? 'uma propriedade'} e leva ${take ?? 'uma propriedade'}`;
    }
    default:
      return 'Ação pendente';
  }
}
