// ============================================================
//  BARALHO — Monopoly Deal (107 cartas)
//  Nomes em PT-BR. Valores de aluguel/banco ajustáveis aqui.
//  Valor de banco: ÚNICO por cor (oficial) — exceto curingas,
//  que mantêm o valor impresso próprio de cada carta.
// ============================================================

export type CardColor =
  | 'brown' | 'lightblue' | 'pink' | 'orange' | 'red'
  | 'yellow' | 'green' | 'darkblue' | 'railroad' | 'utility';

export const ALL_COLORS: CardColor[] = [
  'brown', 'lightblue', 'pink', 'orange', 'red',
  'yellow', 'green', 'darkblue', 'railroad', 'utility',
];

/** Quantidade de propriedades necessárias para completar o conjunto de cada cor */
export const SET_SIZE: Record<CardColor, number> = {
  brown: 2, lightblue: 3, pink: 3, orange: 3, red: 3,
  yellow: 3, green: 3, darkblue: 2, railroad: 4, utility: 2,
};

/** Aluguel por nº de propriedades da cor (índice 0 = 1 carta, 1 = 2 cartas, ...) */
/** Valores OFICIAIS do Monopoly Deal (por nº de propriedades da cor) */
export const RENT_TABLE: Record<CardColor, number[]> = {
  brown:     [1, 2],
  lightblue: [1, 2, 3],
  pink:      [1, 2, 4],
  orange:    [1, 3, 5],
  red:       [2, 3, 6],
  yellow:    [2, 4, 6],
  green:     [2, 4, 7],
  darkblue:  [3, 8],
  railroad:  [1, 2, 3, 4],
  utility:   [1, 2],
};

/** Bônus de aluguel ao ter Casa/Hotel no conjunto completo */
export const HOUSE_BONUS = 3;
export const HOTEL_BONUS = 4;

export type CardType =
  | 'property' | 'wildProperty' | 'money' | 'action' | 'rent' | 'house' | 'hotel';

export type ActionKind =
  | 'passGo' | 'debtCollector' | 'dealBreaker' | 'slyDeal'
  | 'forcedDeal' | 'justSayNo' | 'doubleRent';

export interface CardDef {
  defId: string;
  type: CardType;
  name: string;
  /** Valor ao pagar (propriedades e dinheiro têm valor próprio) */
  value: number;
  /** Propriedade: 1 cor. Curinga: cores possíveis ([] = qualquer cor) */
  colors?: CardColor[];
  action?: ActionKind;
  /** Cartas de aluguel: cores cobradas */
  rentColors?: CardColor[];
  /** Quantas cópias no baralho */
  copies: number;
}

// ---------- builders ----------
const prop = (
  defId: string, name: string, color: CardColor, value: number,
): CardDef => ({ defId, type: 'property', name, value, colors: [color], copies: 1 });

const money = (value: number, copies: number): CardDef => ({
  defId: `money-${value}`, type: 'money', name: `${value} Milhão${value > 1 ? 's' : ''}`, value, copies,
});

const action = (
  defId: string, name: string, kind: ActionKind, value: number, copies: number,
): CardDef => ({ defId, type: 'action', name, value, action: kind, copies });

// Aluguel DUAS CORES (fiel ao jogo real — não existe aluguel de 1 cor):
// cobra aluguel se o jogador tiver pelo menos UMA das duas cores mostradas.
const rentDual = (a: CardColor, b: CardColor, label: string, copies = 2): CardDef => ({
  defId: `rent-${a}-${b}`, type: 'rent', name: `Aluguel (${label})`, value: 1,
  rentColors: [a, b], copies,
});

// Curinga de propriedade DUAS CORES (fiel ao jogo real): vira propriedade
// de uma das duas cores da carta, só num conjunto que o jogador já tem.
const wild2 = (
  a: CardColor, b: CardColor, label: string, value: number, copies: number,
): CardDef => ({
  defId: `wild-${a}-${b}`, type: 'wildProperty',
  name: `Curinga (${label})`, value, colors: [a, b], copies,
});

// ---------- definições ----------
export const CARD_LIST: CardDef[] = [
  // ---- Dinheiro (20) — distribuição oficial (total M57) ----
  money(1, 6), money(2, 5), money(3, 3), money(4, 3), money(5, 2), money(10, 1),

  // ---- Propriedades (28) — valor de banco ÚNICO por cor (oficial) ----
  // Marrom 1M · Azul-Claro 1M · Rosa 2M · Laranja 2M · Vermelho 3M ·
  // Amarelo 3M · Verde 4M · Azul-Escuro 4M · Ferrovia 2M · Utilidade 2M
  prop('prop-med',     'Avenida Mediterrânea',   'brown',     1),
  prop('prop-baltic',  'Avenida Báltico',        'brown',     1),
  prop('prop-orient',  'Avenida Oriental',       'lightblue', 1),
  prop('prop-vermont', 'Avenida Vermont',        'lightblue', 1),
  prop('prop-conn',    'Avenida Connecticut',    'lightblue', 1),
  prop('prop-stcharles', 'Lugar São Carlos',     'pink',      2),
  prop('prop-states',  'Avenida Estados',        'pink',      2),
  prop('prop-virginia','Avenida Virgínia',       'pink',      2),
  prop('prop-stjames', 'Lugar São James',        'orange',    2),
  prop('prop-tennessee','Avenida Tennessee',     'orange',    2),
  prop('prop-newyork', 'Avenida Nova York',      'orange',    2),
  prop('prop-kentucky','Avenida Kentucky',       'red',       3),
  prop('prop-indiana', 'Avenida Indiana',        'red',       3),
  prop('prop-illinois','Avenida Illinois',       'red',       3),
  prop('prop-atlantic','Avenida Atlântica',      'yellow',    3),
  prop('prop-ventnor', 'Avenida Ventnor',        'yellow',    3),
  prop('prop-marvin',  'Jardim Marvin',          'yellow',    3),
  prop('prop-pacific', 'Avenida Pacífico',       'green',     4),
  prop('prop-carolina','Avenida Carolina do Norte','green',   4),
  prop('prop-pennsy',  'Avenida Pensilvânia',    'green',     4),
  prop('prop-park',    'Lugar Park',             'darkblue',  4),
  prop('prop-boardwalk','Quadra Boardwalk',      'darkblue',  4),
  prop('prop-rr-reading','Estrada de Ferro Reading','railroad',2),
  prop('prop-rr-penn', 'Estrada de Ferro Pennsylvania','railroad',2),
  prop('prop-rr-bo',   'Estrada de Ferro B&O',   'railroad',  2),
  prop('prop-rr-short','Estrada de Ferro Short Line','railroad',2),
  prop('prop-elco',    'Companhia Elétrica',     'utility',   2),
  prop('prop-water',   'Companhia de Água',      'utility',   2),

  // ---- Curingas de propriedade (11) — composição oficial ----
  // 2 curingas multicolor (10 cores) + 9 curingas de DUAS cores (7 pares).
  // Curinga só entra num conjunto que o jogador JÁ tem, numa das cores da carta.
  wild2('darkblue',  'green',    'Azul-Escuro + Verde',    4, 1),
  wild2('lightblue', 'brown',    'Azul-Claro + Marrom',    1, 1),
  wild2('pink',      'orange',   'Rosa + Laranja',         2, 2),
  wild2('green',     'railroad', 'Verde + Ferrovia',       4, 1),
  wild2('lightblue', 'railroad', 'Azul-Claro + Ferrovia',  2, 1),
  wild2('utility',   'railroad', 'Utilidade + Ferrovia',   2, 1),
  wild2('red',       'yellow',   'Vermelho + Amarelo',     3, 2),
  { defId: 'wild-any-1', type: 'wildProperty', name: 'Curinga Geral', value: 5, colors: [], copies: 1 },
  { defId: 'wild-any-2', type: 'wildProperty', name: 'Curinga Geral', value: 5, colors: [], copies: 1 },

  // ---- Cartas de Aluguel (13) — composição oficial do jogo real ----
  // 5 pares de DUAS cores (2 cópias cada) + 3 curingas. Cada carta só
  // cobra se o jogador tiver pelo menos uma das duas cores nela mostradas.
  rentDual('pink', 'orange', 'Rosa + Laranja'),
  rentDual('railroad', 'utility', 'Ferrovia + Utilidade'),
  rentDual('green', 'darkblue', 'Verde + Azul-Escuro'),
  rentDual('brown', 'lightblue', 'Marrom + Azul-Claro'),
  rentDual('red', 'yellow', 'Vermelho + Amarelo'),
  // Curingas de aluguel valem 3M ao pagar (valor oficial)
  { defId: 'rent-wild-1', type: 'rent', name: 'Aluguel Curinga', value: 3, rentColors: [], copies: 1 },
  { defId: 'rent-wild-2', type: 'rent', name: 'Aluguel Curinga', value: 3, rentColors: [], copies: 1 },
  { defId: 'rent-wild-3', type: 'rent', name: 'Aluguel Curinga', value: 3, rentColors: [], copies: 1 },

  // ---- Cartas de ação (35) — contagens oficiais ----
  action('act-passgo',      'Pass Go (Compre 2)',   'passGo',       1, 10),
  action('act-sayno',       'Não!',                 'justSayNo',    1, 3),
  action('act-debt',        'Cobrador de Dívidas',  'debtCollector',1, 4),
  action('act-sly',         'Negociação Esperta',   'slyDeal',      1, 3),
  action('act-dealbreaker', 'Quebra de Acordo',     'dealBreaker',  1, 2),
  action('act-forced',      'Negociação Forçada',   'forcedDeal',   1, 4),
  action('act-double',      'Aluguel em Dobro',     'doubleRent',   1, 3),

  // ---- Casa / Hotel (6) ----
  { defId: 'act-house', type: 'house', name: 'Casa', value: 4, copies: 3 },
  { defId: 'act-hotel', type: 'hotel', name: 'Hotel', value: 5, copies: 3 },
];

/** Índice defId -> definição */
export const CARDS: Record<string, CardDef> = {};
for (const c of CARD_LIST) CARDS[c.defId] = c;

/** Baralho completo (107 defIds com repetição) */
export const DECK_DEF_IDS: string[] = CARD_LIST.flatMap(c =>
  Array.from({ length: c.copies }, () => c.defId),
);

export const DECK_SIZE = DECK_DEF_IDS.length; // 107

/** Valor de uma carta no pagamento/banco */
export function cardValue(defId: string): number {
  return CARDS[defId]?.value ?? 0;
}
