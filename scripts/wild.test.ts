// Teste temporário — SET_WILD (trocar cor de curinga na mesa)
import { Engine } from '../server/src/engine.js';
import { DEFAULT_SETTINGS, CARDS, DECK_DEF_IDS, DECK_SIZE } from '../shared/src/index.js';

let failures = 0;
const check = (cond: boolean, msg: string) => {
  if (cond) console.log('  ✅', msg);
  else { failures++; console.error('  ❌', msg); }
};

const metas = [
  { id: 'a', name: 'Alice', isHost: true, isBot: false },
  { id: 'b', name: 'Bob', isHost: false, isBot: false },
];
const newGame = () => new Engine(metas, { ...DEFAULT_SETTINGS, turnTimerSec: 0, movesPerTurn: 5 });
const P = (e: Engine, i: number) => e.s.players[i];
const expectErr = (fn: () => void, code: string, msg: string) => {
  try { fn(); check(false, msg + ' (não lançou erro)'); }
  catch (err: any) {
    check(err?.code === code || err?.message?.includes(code), `${msg} → ${err?.code ?? err?.message}`);
  }
};

// ============================================================
console.log('CENARIO 1: curinga de 2 cores troca de cor (custa 1 jogada)');
{
  const e = newGame();
  P(e, 0).hand = [
    { uid: 'w1', defId: 'wild-lightblue-brown' },
    { uid: 'p1', defId: 'prop-orient' }, // azul-claro
    { uid: 'm1', defId: 'money-1' },
  ];
  const before = e.s.movesLeft;
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'w1', color: 'lightblue' });
  check(P(e, 0).groups.length === 1 && P(e, 0).groups[0].color === 'lightblue', 'curinga abriu grupo azul-claro');
  e.act('a', { t: 'SET_WILD', uid: 'w1', color: 'brown' });
  const g = P(e, 0).groups;
  check(g.length === 1 && g[0].color === 'brown' && g[0].cards.length === 1, 'curinga migrou para marrom (grupo vazio some)');
  check(e.s.movesLeft === before - 2, 'SET_WILD custou 1 jogada');
}

console.log('CENARIO 2: curinga de 2 cores NÃO vai para cor fora da carta');
{
  const e = newGame();
  P(e, 0).hand = [{ uid: 'w1', defId: 'wild-lightblue-brown' }];
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'w1', color: 'brown' });
  expectErr(() => e.act('a', { t: 'SET_WILD', uid: 'w1', color: 'red' }), 'BAD_COLOR', 'cor fora da carta recusada');
}

console.log('CENARIO 3: curinga geral exige grupo existente da nova cor');
{
  const e = newGame();
  P(e, 0).hand = [
    { uid: 'p1', defId: 'prop-med' },     // marrom
    { uid: 'w1', defId: 'wild-any-1' },   // curinga geral
    { uid: 'p2', defId: 'prop-orient' },  // azul-claro
  ];
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'p1' });
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'w1', color: 'brown' });
  expectErr(() => e.act('a', { t: 'SET_WILD', uid: 'w1', color: 'lightblue' }), 'NO_GROUP', 'sem grupo da nova cor → recusa');
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'p2' });
  e.act('a', { t: 'SET_WILD', uid: 'w1', color: 'lightblue' });
  const g = P(e, 0).groups;
  check(g.find(x => x.color === 'lightblue')?.cards.some(c => c.uid === 'w1') === true, 'com grupo pronto, migrou');
}

console.log('CENARIO 4: propriedade comum NÃO troca de cor');
{
  const e = newGame();
  P(e, 0).hand = [{ uid: 'p1', defId: 'prop-med' }];
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'p1' });
  expectErr(() => e.act('a', { t: 'SET_WILD', uid: 'p1', color: 'red' }), 'BAD_TYPE', 'propriedade comum recusada');
}

console.log('CENARIO 5: conjunto com Casa/Hotel não perde o curinga');
{
  const e = newGame();
  P(e, 0).hand = [
    { uid: 'p1', defId: 'prop-park' },            // azul-escuro
    { uid: 'w1', defId: 'wild-darkblue-green' },  // curinga 2 cores
    { uid: 'h1', defId: 'act-house' },
  ];
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'p1' });
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'w1', color: 'darkblue' });
  e.act('a', { t: 'BUILD', uid: 'h1', color: 'darkblue' });
  expectErr(() => e.act('a', { t: 'SET_WILD', uid: 'w1', color: 'green' }), 'HAS_BUILDING', 'casa no conjunto → curinga não sai');
}

console.log('CENARIO 6: sem jogadas restantes não troca');
{
  const e = newGame();
  P(e, 0).hand = [{ uid: 'w1', defId: 'wild-lightblue-brown' }];
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'w1', color: 'brown' });
  e.s.movesLeft = 0;
  expectErr(() => e.act('a', { t: 'SET_WILD', uid: 'w1', color: 'lightblue' }), 'NO_MOVES', 'sem jogadas → recusa');
}

console.log('CENARIO 7: valores de banco únicos por cor');
{
  const v = (id: string) => CARDS[id].value;
  check(v('prop-med') === 1 && v('prop-baltic') === 1, 'marrom = 1M (as duas)');
  check(v('prop-orient') === 1 && v('prop-vermont') === 1 && v('prop-conn') === 1, 'azul-claro = 1M (as três)');
  check(v('prop-stcharles') === 2 && v('prop-states') === 2 && v('prop-virginia') === 2, 'rosa = 2M');
  check(v('prop-stjames') === 2 && v('prop-tennessee') === 2 && v('prop-newyork') === 2, 'laranja = 2M');
  check(v('prop-kentucky') === 3 && v('prop-indiana') === 3 && v('prop-illinois') === 3, 'vermelho = 3M');
  check(v('prop-atlantic') === 3 && v('prop-ventnor') === 3 && v('prop-marvin') === 3, 'amarelo = 3M');
  check(v('prop-pacific') === 4 && v('prop-carolina') === 4 && v('prop-pennsy') === 4, 'verde = 4M');
  check(v('prop-park') === 4 && v('prop-boardwalk') === 4, 'azul-escuro = 4M');
  check(v('prop-rr-reading') === 2 && v('prop-elco') === 2 && v('prop-water') === 2, 'ferrovia = 2M · utilidade = 2M');
  check(v('wild-darkblue-green') === 4 && v('wild-red-yellow') === 3, 'curingas mantêm valor próprio');
}

console.log('CENARIO 8: contagens oficiais — 3 "Não!" e 2 "Quebra de Acordo"');
{
  const count = (id: string) => DECK_DEF_IDS.filter(d => d === id).length;
  check(count('act-sayno') === 3, 'Não! = 3 cópias');
  check(count('act-dealbreaker') === 2, 'Quebra de Acordo = 2 cópias');
  check(DECK_SIZE === 107, `baralho = 107 cartas (foi ${DECK_SIZE})`);
}

console.log(failures === 0 ? '\nTESTE DO CURINGA PASSOU ✅' : `\n${failures} FALHA(S) ❌`);
process.exit(failures === 0 ? 0 : 1);
