// Teste da regra de aluguel: cobrança baseada nas MINHAS propriedades,
// todos os oponentes pagam (mesmo sem a cor), o cobrado ESCOLHE com o que
// paga (dinheiro e/ou propriedades) e quem não tem nada não paga
// (sem dívida, sem falência).
import { Engine } from '../server/src/engine.js';
import { DEFAULT_SETTINGS, RENT_TABLE } from '../shared/src/index.js';

let failures = 0;
const check = (cond: boolean, msg: string) => {
  if (cond) console.log('  ✅', msg);
  else { failures++; console.error('  ❌', msg); }
};

const metas = [
  { id: 'a', name: 'Alice', isHost: true, isBot: false },
  { id: 'b', name: 'Bob', isHost: false, isBot: false },
  { id: 'c', name: 'Carol', isHost: false, isBot: false },
];

// act() substitui o estado por um clone — SEMPRE reler os jogadores depois
const newGame = (over: Partial<typeof DEFAULT_SETTINGS> = {}) =>
  new Engine(metas, { ...DEFAULT_SETTINGS, turnTimerSec: 0, ...over });
const P = (e: Engine, i: number) => e.s.players[i];

// ============================================================
console.log('CENARIO 1: oponente SEM a cor cobrada ainda paga (escolha de pagamento)');
{
  const e = newGame();
  P(e, 0).hand = [
    { uid: 'a-prop', defId: 'prop-kentucky' },   // vermelho
    { uid: 'a-rent', defId: 'rent-red-yellow' },
  ];
  P(e, 1).hand = []; P(e, 1).bank = [{ uid: 'b-money', defId: 'money-5' }]; P(e, 1).groups = [];
  P(e, 2).hand = []; P(e, 2).bank = []; P(e, 2).groups = [];

  e.act('a', { t: 'PLAY_PROPERTY', uid: 'a-prop' });
  e.act('a', { t: 'RENT', uid: 'a-rent' });

  const pend = e.s.pending;
  check(!!pend, 'cobrança foi aceita (não caiu em NO_TARGETS)');
  check(pend?.defenderId === 'b', 'Bob (sem a cor) é cobrado primeiro');
  check(pend?.amount === RENT_TABLE.red[0], `valor = ${pend?.amount}M (pelas propriedades da Alice)`);

  // Bob aceita → abre a fase de ESCOLHA de pagamento
  e.act('b', { t: 'ACCEPT' });
  check(e.s.pending?.stage === 'PAY', 'aceitar abriu a escolha de pagamento');
  e.act('b', { t: 'PAY', uids: ['b-money'] });
  check(e.s.pending === null, 'pagamento concluído (Carol pulada: sem nada)');
  check(P(e, 0).bank.some(x => x.uid === 'b-money'), 'dinheiro de Bob foi para a Alice');
  check(P(e, 1).isOut === false, `Bob NÃO falhou (pagou a dívida de ${pend?.amount}M)`);
}

// ============================================================
console.log('CENARIO 2: valor do aluguel só depende das SUAS propriedades');
{
  const e = newGame({ movesPerTurn: 5 });
  P(e, 0).hand = [
    { uid: 'p1', defId: 'prop-kentucky' },
    { uid: 'p2', defId: 'prop-indiana' },
    { uid: 'p3', defId: 'prop-illinois' },
    { uid: 'r1', defId: 'rent-red-yellow' },
  ];
  P(e, 1).hand = []; P(e, 1).bank = [{ uid: 'bm', defId: 'money-10' }]; P(e, 1).groups = [];
  P(e, 2).hand = []; P(e, 2).bank = [{ uid: 'cm', defId: 'money-10' }]; P(e, 2).groups = [];

  e.act('a', { t: 'PLAY_PROPERTY', uid: 'p1' });
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'p2' });
  e.act('a', { t: 'PLAY_PROPERTY', uid: 'p3' });
  e.act('a', { t: 'RENT', uid: 'r1' });

  const full = RENT_TABLE.red[2];
  check(e.s.pending?.amount === full, `3 vermelhas → ${e.s.pending?.amount}M (esperado ${full}M)`);
  check(e.s.pending?.queue.length === 1, 'fila com TODOS os oponentes que podem pagar');

  e.act('b', { t: 'ACCEPT' });
  e.act('b', { t: 'PAY', uids: ['bm'] });
  check(P(e, 0).bank.some(x => x.uid === 'bm'), 'Bob já pagou');
  check(e.s.pending?.defenderId === 'c', 'Carol também é cobrada (mesmo sem vermelhas)');
  e.act('c', { t: 'ACCEPT' });
  e.act('c', { t: 'PAY', uids: ['cm'] });
  check(e.s.pending === null, 'ambos pagaram, cobrança encerrada');
  check(P(e, 0).bank.length === 2, 'Alice recebeu de Bob E de Carol');
}

// ============================================================
console.log('CENARIO 3: sem ninguém com o que pagar → erro (carta não é desperdiçada)');
{
  const e = newGame();
  P(e, 0).hand = [{ uid: 'ap', defId: 'prop-kentucky' }, { uid: 'ar', defId: 'rent-red-yellow' }];
  P(e, 1).hand = []; P(e, 1).bank = []; P(e, 1).groups = [];
  P(e, 2).hand = []; P(e, 2).bank = []; P(e, 2).groups = [];

  e.act('a', { t: 'PLAY_PROPERTY', uid: 'ap' });
  let threw = '';
  try { e.act('a', { t: 'RENT', uid: 'ar' }); } catch (err) { threw = (err as Error).message; }
  check(threw.includes('nada para pagar'), `erro claro: "${threw}"`);
  check(P(e, 0).hand.some(x => x.uid === 'ar'), 'carta de aluguel continua na mão');
  check(e.s.pending === null, 'nenhuma cobrança pendente');
}

// ============================================================
console.log('CENARIO 4: quem não tem nada NÃO é eliminado (regra oficial: não paga)');
{
  const e = newGame();
  P(e, 0).hand = [
    { uid: 'ap', defId: 'prop-kentucky' },
    { uid: 'ar', defId: 'rent-red-yellow' },
  ];
  P(e, 1).hand = []; P(e, 1).bank = []; P(e, 1).groups = [];
  P(e, 2).hand = []; P(e, 2).bank = [{ uid: 'cm', defId: 'money-10' }]; P(e, 2).groups = [];

  e.act('a', { t: 'PLAY_PROPERTY', uid: 'ap' });
  e.act('a', { t: 'RENT', uid: 'ar' });
  // Bob (quebrado) nem entra na fila; cobrança direta em Carol
  check(e.s.pending?.defenderId === 'c', 'só Carol (com dinheiro) foi cobrada');
  e.act('c', { t: 'ACCEPT' });
  e.act('c', { t: 'PAY', uids: ['cm'] });
  check(e.s.pending === null, 'cobrança encerrada');
  check(P(e, 1).isOut === false, 'Bob segue vivo com nada (não pagou, não falhou)');
}

// ============================================================
console.log('CENARIO 5: pagamento usa DINHEIRO primeiro, propriedade só se faltar');
{
  const e = newGame();
  P(e, 0).hand = [
    { uid: 'ap', defId: 'prop-kentucky' },
    { uid: 'ar', defId: 'rent-red-yellow' },
    { uid: 'ap2', defId: 'prop-indiana' },
    { uid: 'ap3', defId: 'prop-illinois' },
  ];
  // Bob: 10M no banco (suficiente) + propriedade rosa na mesa
  P(e, 1).hand = [];
  P(e, 1).bank = [{ uid: 'bm', defId: 'money-10' }];
  P(e, 1).groups = [{ color: 'pink', cards: [{ uid: 'bp', defId: 'prop-stcharles', color: 'pink' }] }];

  e.act('a', { t: 'PLAY_PROPERTY', uid: 'ap' });
  e.act('a', { t: 'RENT', uid: 'ar' });
  e.act('b', { t: 'ACCEPT' });
  e.act('b', { t: 'PAY', uids: ['bm'] });

  check(P(e, 1).bank.length === 0, 'pagou com o dinheiro do banco (10M ≥ 5M)');
  check(P(e, 1).groups[0]?.cards.length === 1, 'propriedade FICOU com Bob (não precisou usar)');
  check(P(e, 0).bank.some(x => x.uid === 'bm'), 'dinheiro recebeu para a Alice');
}

// ============================================================
console.log('CENARIO 6: o jogador ESCOLHE com o que paga (propriedade na mesa)');
{
  const e = newGame();
  P(e, 0).hand = [
    { uid: 'ap', defId: 'prop-kentucky' },
    { uid: 'ar', defId: 'rent-red-yellow' },
  ];
  // Bob: 2M no banco + propriedade rosa (incompleta) = 4M; dívida 3M
  // Ele escolhe pagar SÓ com a propriedade (2M < 3M? não — vamos de 1+2)
  P(e, 1).hand = [];
  P(e, 1).bank = [{ uid: 'bm1', defId: 'money-1' }, { uid: 'bm2', defId: 'money-1' }];
  P(e, 1).groups = [{ color: 'pink', cards: [{ uid: 'bp', defId: 'prop-stcharles', color: 'pink' }] }];

  e.act('a', { t: 'PLAY_PROPERTY', uid: 'ap' });
  e.act('a', { t: 'RENT', uid: 'ar' });
  e.act('b', { t: 'ACCEPT' });

  // Pagamento parcial que NÃO cobre e NÃO é tudo → recusado
  let threw = '';
  try { e.act('b', { t: 'PAY', uids: ['bm1'] }); } catch (err) { threw = (err as Error).message; }
  check(threw.includes('insuficiente'), `pagamento parcial recusado: "${threw}"`);
  check(P(e, 1).bank.length === 2 && P(e, 1).groups[0]?.cards.length === 1,
    'nada mudou depois da tentativa inválida');

  // Escolha válida: dinheiro (1+1) + propriedade (1M) = cobre 3M
  e.act('b', { t: 'PAY', uids: ['bm1', 'bm2', 'bp'] });
  check(e.s.pending === null, 'escolha válida aceita, cobrança encerrada');
  check(P(e, 0).bank.some(x => x.uid === 'bm1') && P(e, 0).bank.some(x => x.uid === 'bm2'),
    'dinheiro escolhido foi para a Alice');
  check(P(e, 0).groups.some(g => g.color === 'pink' && g.cards.some(c => c.uid === 'bp')),
    'propriedade escolhida virou propriedade da Alice');
  check(P(e, 1).groups.length === 0, 'Bob ficou sem o grupo rosa');
}

// ============================================================
console.log('CENARIO 7: sem cobrir a dívida, paga TUDO que tem (sem falência)');
{
  const e = newGame();
  P(e, 0).hand = [
    { uid: 'ap', defId: 'prop-kentucky' },
    { uid: 'ar', defId: 'rent-red-yellow' },
  ];
  // Bob deve 3M mas só tem 1M + propriedade de 1M = 2M
  P(e, 1).hand = [];
  P(e, 1).bank = [{ uid: 'bm', defId: 'money-1' }];
  P(e, 1).groups = [{ color: 'pink', cards: [{ uid: 'bp', defId: 'prop-stcharles', color: 'pink' }] }];

  e.act('a', { t: 'PLAY_PROPERTY', uid: 'ap' });
  e.act('a', { t: 'RENT', uid: 'ar' });
  e.act('b', { t: 'ACCEPT' });
  e.act('b', { t: 'PAY', uids: ['bm', 'bp'] });

  check(P(e, 1).isOut === false, 'Bob NÃO foi eliminado');
  check(P(e, 1).bank.length === 0 && P(e, 1).groups.length === 0, 'entregou tudo que tinha (2M de 3M)');
  check(e.s.pending === null, 'cobrança encerrada — Bob não fica devendo');
}

console.log(failures === 0 ? '\nTESTE DE ALUGUEL PASSOU ✅' : `\n${failures} FALHA(S) ❌`);
process.exitCode = failures === 0 ? 0 : 1;
