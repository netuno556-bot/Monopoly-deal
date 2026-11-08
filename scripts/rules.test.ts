// Teste das regras novas:
//  - mão nunca passa de 7: compra limitada ao espaço disponível
//  - Pass Go também respeita o limite
//  - pagamento obrigatório: dinheiro → propriedades → paga só o que tem
//    (sem dívida pendente e sem falência/eliminação)
import { Engine } from '../server/src/engine.js';
import { DEFAULT_SETTINGS } from '../shared/src/index.js';

let failures = 0;
const check = (cond: boolean, msg: string) => {
  if (cond) console.log('  ✅', msg);
  else { failures++; console.error('  ❌', msg); }
};

const metas = [
  { id: 'a', name: 'Alice', isHost: true, isBot: false },
  { id: 'b', name: 'Bob', isHost: false, isBot: false },
];

const newGame = (over: Partial<typeof DEFAULT_SETTINGS> = {}) =>
  new Engine(metas, { ...DEFAULT_SETTINGS, turnTimerSec: 0, movesPerTurn: 5, ...over });
const P = (e: Engine, i: number) => e.s.players[i];

const m = (uid: string) => ({ uid, defId: 'money-1' });
const handOf = (prefix: string, n: number, first?: string) =>
  Array.from({ length: n }, (_, i) => (i === 0 && first ? { uid: `${prefix}${i}`, defId: first } : m(`${prefix}${i}`)));

// ============================================================
console.log('CENARIO A: início do turno — 7 cartas não compra nada; 6 compra só 1');
{
  const e = newGame();
  P(e, 0).hand = handOf('a', 7); // Alice: mão cheia
  P(e, 1).hand = handOf('b', 7); // Bob: mão cheia

  e.act('a', { t: 'END_TURN' });
  check(P(e, 1).hand.length === 7, 'Bob com 7 cartas NÃO comprou (mão cheia)');
  check(e.s.log[e.s.log.length - 1].text.includes('mão cheia'), 'log avisa "mão cheia"');

  e.act('b', { t: 'PLAY_BANK', uid: 'b0' }); // Bob fica com 6
  e.act('b', { t: 'END_TURN' });
  check(P(e, 0).hand.length === 7, 'Alice com 7 cartas NÃO comprou');

  e.act('a', { t: 'PLAY_BANK', uid: 'a0' }); // Alice fica com 6
  e.act('a', { t: 'END_TURN' });
  check(P(e, 1).hand.length === 7, 'Bob com 6 cartas comprou só 1 → 7 (nunca passa de 7)');
}

// ============================================================
console.log('CENARIO B: Pass Go respeita o limite de mão');
{
  const e = newGame();
  // mão cheia (7) com Pass Go: a carta liberou 1 espaço → compra 1
  P(e, 0).hand = handOf('a', 7, 'act-passgo');
  e.act('a', { t: 'ACTION', uid: 'a0' });
  check(P(e, 0).hand.length === 7, 'Pass Go com 7 cartas: compra 1 e fica com 7');
}

{
  const e = newGame();
  // 6 cartas com Pass Go: compra 2 → 7
  P(e, 0).hand = handOf('a', 6, 'act-passgo');
  e.act('a', { t: 'ACTION', uid: 'a0' });
  check(P(e, 0).hand.length === 7, 'Pass Go com 6 cartas: compra 2 → 7');
}

// ============================================================
console.log('CENARIO C: se não cobrir a dívida, paga só o que tem (sem falência)');
{
  const e = newGame();
  P(e, 0).hand = [
    { uid: 'p1', defId: 'prop-kentucky' },
    { uid: 'p2', defId: 'prop-indiana' },
    { uid: 'p3', defId: 'prop-illinois' },
    { uid: 'r1', defId: 'rent-red-yellow' },
  ];
  // Bob deve 6M mas só tem 1M no banco + 1 propriedade rosa (incompleta) = 3M
  P(e, 1).hand = [];
  P(e, 1).bank = [{ uid: 'bm1', defId: 'money-1' }];
  P(e, 1).groups = [{
    color: 'pink',
    cards: [{ uid: 'bp1', defId: 'prop-stcharles', color: 'pink' }],
  }];

  e.act('a', { t: 'PLAY_PROPERTY', uid: 'p1' });
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'p2' });
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'p3' });
  e.act('a', { t: 'RENT', uid: 'r1' });
  check(e.s.pending?.amount === 6, 'dívida de 6M (vermelho completo: 2+3+6)');

  e.act('b', { t: 'ACCEPT' });
  check(e.s.pending?.stage === 'PAY', 'aceitou → escolha de pagamento aberta');
  e.act('b', { t: 'PAY', uids: ['bm1', 'bp1'] }); // entrega tudo que tem (3M de 6M)

  check(P(e, 1).isOut === false, 'Bob NÃO foi eliminado (só pagou o que tinha)');
  check(P(e, 1).bank.length === 0, 'entregou o dinheiro do banco (1M)');
  check(P(e, 1).groups.length === 0, 'entregou as propriedades (conjunto incompleto)');
  check(P(e, 0).bank.some(x => x.uid === 'bm1'), 'Alice recebeu o dinheiro');
  check(P(e, 0).groups.some(g => g.color === 'pink' && g.cards.length === 1),
    'Alice recebeu as propriedades');
  check(e.s.pending === null, 'cobrança encerrada — Bob não fica devendo');
  check(e.s.log.some(l => l.text.includes('só o que tinha')), 'log registra pagamento parcial (3M de 6M)');
}

// ============================================================
console.log('CENARIO D: Cobrador de Dívidas em alvo quebrado → erro antes de gastar a carta');
{
  const e = newGame();
  P(e, 0).hand = [{ uid: 'd1', defId: 'act-debt' }];
  P(e, 1).hand = []; P(e, 1).bank = []; P(e, 1).groups = [];

  let threw = '';
  try { e.act('a', { t: 'ACTION', uid: 'd1', targetId: 'b' }); }
  catch (err) { threw = (err as Error).message; }
  check(threw.includes('nada para pagar'), `erro claro: "${threw}"`);
  check(P(e, 0).hand.some(x => x.uid === 'd1'), 'carta continua na mão');
}

console.log(failures === 0 ? '\nTESTE DE REGRAS NOVAS PASSOU ✅' : `\n${failures} FALHA(S) ❌`);
process.exitCode = failures === 0 ? 0 : 1;
