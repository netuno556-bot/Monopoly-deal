// Renderização de uma carta — visual fiel à carta física do Monopoly Deal.
// Mantém a mesma API (card/selected/dim/onClick/style/className) usado por
// Hand, MyArea, Opponents e Modals; o layout usa container queries (cqw) para
// escalar de miniaturas (66px) até cartas da mão (82px) sem quebrar.
import type { CardColor, CardInst } from '@md/shared';
import { CARDS, RENT_TABLE, SET_SIZE, cardValue } from '@md/shared';

export const COLOR_HEX: Record<CardColor, string> = {
  brown: '#70442c',
  lightblue: '#79b9e6',
  pink: '#d22b82',
  orange: '#f28d30',
  red: '#e63946',
  yellow: '#f2c14e',
  green: '#2a9d8f',
  darkblue: '#1d4e89',
  railroad: '#5c6670',
  utility: '#2ec4b6', // "verde água" (light green) — cor oficial da utilidade
};

export const COLOR_LABEL: Record<CardColor, string> = {
  brown: 'Marrom',
  lightblue: 'Azul-Claro',
  pink: 'Rosa',
  orange: 'Laranja',
  red: 'Vermelho',
  yellow: 'Amarelo',
  green: 'Verde',
  darkblue: 'Azul-Escuro',
  railroad: 'Ferrovia',
  utility: 'Utilidade',
};

/** Cor do texto sobre a cor da propriedade (contraste) */
function onColor(c: CardColor): string {
  return c === 'lightblue' || c === 'yellow' || c === 'utility' ? '#18212b' : '#fff';
}

/** Cores do dinheiro por valor (fiel às cartas físicas) */
const MONEY_HEX: Record<number, string> = {
  1: '#8fd3c1',
  2: '#8ecae6',
  3: '#f4a261',
  4: '#ef9c9e',
  5: '#a291c5',
  10: '#ffd166',
};

const TYPE_EMOJI: Record<string, string> = {
  money: '💰',
  property: '🏠',
  wildProperty: '🌈',
  rent: '🏷️',
  house: '🏡',
  hotel: '🏨',
  action: '⚡',
};

const ACTION_EMOJI: Record<string, string> = {
  passGo: '🎯',
  debtCollector: '💸',
  dealBreaker: '🔨',
  slyDeal: '🥷',
  forcedDeal: '🤝',
  justSayNo: '🙅',
  doubleRent: '✖️',
};

/** Descrição curta em PT-BR exibida no rodapé da carta de ação */
const ACTION_DESC: Record<string, string> = {
  passGo: 'Compre 2 cartas do baralho.',
  debtCollector: 'Cobrar 5M de um oponente.',
  dealBreaker: 'Roube um conjunto completo.',
  slyDeal: 'Roube 1 propriedade (não completa).',
  forcedDeal: 'Troque 1 propriedade com um oponente.',
  justSayNo: 'Cancele qualquer cobrança contra você.',
  doubleRent: 'Jogue com Aluguel para cobrar em dobro.',
};

const HOUSE_DESC = '+3M de aluguel em conjuntos completos.';
const HOTEL_DESC = '+4M de aluguel em conjuntos completos.';
const RENT_DESC_SINGLE = 'Cobrar aluguel das suas propriedades dessa cor.';
const RENT_DESC_DUAL = 'Cobrar aluguel das duas cores que você tiver na mesa.';
const RENT_DESC_WILD = 'Cobrar 1 oponente em qualquer cor.';

/** Fundos pastéis por carta (fiel às cartas físicas) */
const ACTION_TINT: Record<string, string> = {
  passGo: 'linear-gradient(180deg, #e7f0d8, #d7e6c2)',      // verde (Passe Livre)
  debtCollector: 'linear-gradient(180deg, #e6ddf2, #d6c9ec)', // roxo (Golpe Baixo)
  dealBreaker: 'linear-gradient(180deg, #f6dce6, #f0c8d8)',   // rosa
  slyDeal: 'linear-gradient(180deg, #d9e9f6, #c6ddf0)',       // azul claro
  forcedDeal: 'linear-gradient(180deg, #d9e9f6, #c6ddf0)',    // azul claro
  justSayNo: 'linear-gradient(180deg, #d4e7f6, #c0dbf2)',     // azul (Diga Não!)
  doubleRent: 'linear-gradient(180deg, #f7f1dc, #efe6c8)',    // creme (Aluguel em Dobro)
};
const HOUSE_TINT = 'linear-gradient(180deg, #f7f1dc, #efe6c8)'; // creme
const HOTEL_TINT = 'linear-gradient(180deg, #d4e7f6, #c0dbf2)'; // azul
const RENT_TINT = 'linear-gradient(180deg, #e7f0d8, #d7e6c2)'; // verde

export function cardEmoji(defId: string): string {
  const def = CARDS[defId];
  if (!def) return '🃏';
  if (def.type === 'action' && def.action) return ACTION_EMOJI[def.action] ?? '⚡';
  return TYPE_EMOJI[def.type] ?? '🃏';
}

/** Classe CSS base da carta (o rosto é desenhado pelo componente) */
export function cardStyle(defId: string, color?: CardColor): { cls: string; style: React.CSSProperties } {
  const def = CARDS[defId];
  if (!def) return { cls: 'card', style: {} };
  void color;
  switch (def.type) {
    case 'money': return { cls: 'card card--money', style: {} };
    case 'action': return { cls: 'card card--action', style: {} };
    case 'rent': return { cls: 'card card--rent', style: {} };
    case 'house': return { cls: 'card card--house', style: {} };
    case 'hotel': return { cls: 'card card--hotel', style: {} };
    case 'wildProperty': return { cls: 'card card--wild', style: {} };
    case 'property':
    default: return { cls: 'card card--prop', style: {} };
  }
}

// ------------------------------------------------------------------
//  Rosos (faces) de cada tipo de carta
// ------------------------------------------------------------------

function PropFace({ color, name }: { color: CardColor; name: string }) {
  const tiers = RENT_TABLE[color];
  return (
    <div className="c-face c-face--prop">
      <div className="c-hdr" style={{ background: COLOR_HEX[color], color: onColor(color) }}>
        {name}
      </div>
      <div className="c-body">
        <div className="c-rent-h">ALUGUEL</div>
        <ul className="c-rent">
          {tiers.map((r, i) => (
            <li key={i}>
              <span>
                {i + 1}
                {i === tiers.length - 1 ? ' ★' : ''}
              </span>
              <span>{r}M</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function WildFace({ colors }: { colors: CardColor[] }) {
  if (colors.length < 2) {
    // Curinga geral — roda-dos-cores
    return (
      <div className="c-face c-face--wild c-rainbow">
        <div className="c-wild-band">CURINGA</div>
      </div>
    );
  }
  // Curinga de DUAS cores — igual à carta física: fundo claro com as duas
  // tabelas de aluguel (uma cor em cada coluna) e a faixa com as duas cores.
  const [a, b] = colors;
  return (
    <div className="c-face c-face--wild2">
      <div className="c-a-hdr">CURINGA</div>
      <div className="c-w2-cols">
        {colors.map(c => {
          const tiers = RENT_TABLE[c];
          return (
            <div className="c-w2-col" key={c}>
              <span className="c-w2-chip" style={{ background: COLOR_HEX[c] }} />
              <span className="c-w2-name">{COLOR_LABEL[c]}</span>
              <ul className="c-rent">
                {tiers.map((r, i) => (
                  <li key={i}>
                    <span>
                      {i + 1}
                      {i === tiers.length - 1 ? ' ★' : ''}
                    </span>
                    <span>{r}M</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div
        className="c-w2-band"
        style={{ background: `linear-gradient(135deg, ${COLOR_HEX[a]} 50%, ${COLOR_HEX[b]} 50%)` }}
      >
        {COLOR_LABEL[a]} / {COLOR_LABEL[b]}
      </div>
    </div>
  );
}

function RentFace({ colors }: { colors: CardColor[] }) {
  // Símbolo oficial: CÍRCULO com as duas cores da carta (igual ao curinga);
  // o aluguel curinga mostra a roda de todas as cores.
  const isWild = colors.length === 0;
  const symbol = isWild
    ? 'conic-gradient(from 45deg, #e63946, #f28d30, #f2c14e, #2a9d8f, #79b9e6, #1d4e89, #5c6670, #2ec4b6, #d22b82, #70442c, #e63946)'
    : colors.length >= 2
      ? `linear-gradient(135deg, ${COLOR_HEX[colors[0]]} 50%, ${COLOR_HEX[colors[1]]} 50%)`
      : COLOR_HEX[colors[0]];
  const desc =
    colors.length === 0 ? RENT_DESC_WILD
    : colors.length === 1 ? RENT_DESC_SINGLE
    : RENT_DESC_DUAL;
  return (
    <div className="c-face c-face--action" style={{ background: RENT_TINT }}>
      <div className="c-a-hdr">CARTA DE AÇÃO</div>
      <div className="c-rent-sym">
        <div className="c-rent-circle" style={{ background: symbol }} />
        <span className="c-rent-t">ALUGUEL</span>
      </div>
      <p className="c-desc">{desc}</p>
      <span className="c-use">Para usar: jogue-a no centro.</span>
    </div>
  );
}

function ActionFace({ emoji, title, desc, tint }: {
  emoji: string; title: string; desc: string; tint?: string;
}) {
  return (
    <div className="c-face c-face--action" style={tint ? { background: tint } : undefined}>
      <div className="c-a-hdr">CARTA DE AÇÃO</div>
      <div className="c-circle">
        <span className="c-ic">{emoji}</span>
        <span className="c-t">{title}</span>
      </div>
      <p className="c-desc">{desc}</p>
      <span className="c-use">Para usar: jogue-a no centro.</span>
    </div>
  );
}

function MoneyFace({ value }: { value: number }) {
  return (
    <div className="c-face c-face--money" style={{ background: MONEY_HEX[value] ?? '#cfd8dc' }}>
      <div className="c-orn">
        <div className="c-circle c-circle--money">
          <b>{value}M</b>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
//  Componente
// ------------------------------------------------------------------

interface Props {
  card: CardInst;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export default function Card({ card, selected, dim, onClick, style, className }: Props) {
  const def = CARDS[card.defId];
  const { cls, style: cStyle } = cardStyle(card.defId, card.color);
  const value = cardValue(card.defId);

  let face: React.ReactNode = null;
  if (!def) {
    // Carta virada para trás (monte de compra / descarte vazio)
    face = (
      <div className="c-face c-face--back">
        <span>🎴</span>
      </div>
    );
  } else {
    switch (def.type) {
      case 'money':
        face = <MoneyFace value={def.value} />;
        break;
      case 'property':
        face = <PropFace color={(def.colors?.[0] ?? 'green') as CardColor} name={def.name} />;
        break;
      case 'wildProperty':
        // O curinga CONTINUA sendo curinga na mesa — a cor escolhida fica
        // registrada só no grupo (mostrada pelo selo colorido no canto).
        face = <WildFace colors={def.colors ?? []} />;
        break;
      case 'rent':
        face = <RentFace colors={def.rentColors ?? []} />;
        break;
      case 'house':
        face = <ActionFace emoji="🏡" title="Casa" desc={HOUSE_DESC} tint={HOUSE_TINT} />;
        break;
      case 'hotel':
        face = <ActionFace emoji="🏨" title="Hotel" desc={HOTEL_DESC} tint={HOTEL_TINT} />;
        break;
      case 'action':
        face = (
          <ActionFace
            emoji={cardEmoji(def.defId)}
            title={def.name}
            desc={ACTION_DESC[def.action ?? ''] ?? ''}
            tint={ACTION_TINT[def.action ?? '']}
          />
        );
        break;
    }
  }

  return (
    <div
      className={[
        cls,
        selected ? 'card--selected' : '',
        dim ? 'card--dim' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      style={{ ...cStyle, ...style }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => e.key === 'Enter' && onClick() : undefined}
    >
      {face}
      {def && <span className="c-val">{value}M</span>}
      {def && <span className="c-val c-val--br">{value}M</span>}
      {/* Selo da cor atual do curinga (o grupo é quem define a cor) */}
      {card.color && def?.type === 'wildProperty' && (
        <span className="c-wild-dot" style={{ background: COLOR_HEX[card.color] }} />
      )}
    </div>
  );
}
