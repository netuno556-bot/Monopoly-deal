// Teste de roubos: propriedade roubada deve mudar de dono
// (Negociação Esperta, Quebra de Acordo, Negociação Forçada)
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
const newGame = () => new Engine(metas, { ...DEFAULT_SETTINGS, turnTimerSec: 0, movesPerTurn: 5 });
const P = (e: Engine, i: number) => e.s.players[i];
const has = (p: ReturnType<P>, uid: string) =>
  p.groups.some(g => g.cards.some(c => c.uid === uid));

// ============================================================
console.log('CENARIO 1: Negociação Esperta — propriedade vai para o ladrão');
{
  const e = newGame();
  P(e, 0).hand = [{ uid: 's1', defId: 'act-sly' }];
  P(e, 1).hand = [];
  P(e, 1).groups = [{ color: 'pink', cards: [{ uid: 'bp', defId: 'prop-stcharles', color: 'pink' }] }];

  e.act('a', { t: 'ACTION', uid: 's1', targetId: 'b', propUid: 'bp' });
  check(e.s.pending?.kind === 'SLY_DEAL', 'roubo pendente criado');
  check(e.s.pending?.defenderId === 'b', 'Bob (vítima) é quem responde');

  e.act('b', { t: 'ACCEPT' });
  check(has(P(e, 0), 'bp'), 'propriedade está com ALICE (executou o roubo)');
  check(!has(P(e, 1), 'bp'), 'propriedade saiu de BOB');
  check(P(e, 1).groups.length === 0, 'Bob ficou sem grupo rosa');
}

// ============================================================
console.log('CENARIO 2: Quebra de Acordo — conjunto completo vai para o ladrão');
{
  const e = newGame();
  P(e, 0).hand = [{ uid: 'db', defId: 'act-dealbreaker' }];
  P(e, 1).hand = [];
  P(e, 1).groups = [{
    color: 'lightblue',
    cards: [
      { uid: 'l1', defId: 'prop-orient', color: 'lightblue' },
      { uid: 'l2', defId: 'prop-vermont', color: 'lightblue' },
      { uid: 'l3', defId: 'prop-conn', color: 'lightblue' },
    ],
  }];

  e.act('a', { t: 'ACTION', uid: 'db', targetId: 'b', color: 'lightblue' });
  check(e.s.pending?.kind === 'DEAL_BREAKER', 'roubo de conjunto pendente');
  e.act('b', { t: 'ACCEPT' });

  const gAlice = P(e, 0).groups.find(g => g.color === 'lightblue');
  check(!!gAlice && gAlice.cards.length === 3, 'conjunto completo está com ALICE (3 cartas)');
  check(P(e, 1).groups.length === 0, 'Bob perdeu o conjunto');
}

// ============================================================
console.log('CENARIO 3: Negociação Forçada — troca de propriedades entre donos');
{
  const e = newGame();
  // Alice dá uma rosa e leva uma vermelha do Bob
  P(e, 0).hand = [{ uid: 'fd', defId: 'act-forced' }];
  P(e, 0).groups = [{ color: 'pink', cards: [{ uid: 'ap', defId: 'prop-stjames', color: 'pink' }] }];
  P(e, 1).hand = [];
  P(e, 1).groups = [{ color: 'red', cards: [{ uid: 'br', defId: 'prop-kentucky', color: 'red' }] }];

  e.act('a', { t: 'ACTION', uid: 'fd', targetId: 'b', giveUid: 'ap', propUid: 'br' });
  check(e.s.pending?.kind === 'FORCED_DEAL', 'troca pendente criada');
  e.act('b', { t: 'ACCEPT' });

  check(has(P(e, 0), 'br'), 'Alice levou a vermelha de Bob');
  check(!has(P(e, 1), 'br'), 'Bob não tem mais a vermelha');
  check(has(P(e, 1), 'ap'), 'Bob recebeu a rosa de Alice');
  check(!has(P(e, 0), 'ap'), 'Alice não tem mais a rosa');
}

// ============================================================
console.log('CENARIO 4: vítima joga "Não!" → papel inverte (revidar ou desistir)');
{
  const e = newGame();
  P(e, 0).hand = [{ uid: 's1', defId: 'act-sly' }];
  P(e, 1).hand = [{ uid: 'n1', defId: 'act-sayno' }];
  P(e, 1).groups = [{ color: 'pink', cards: [{ uid: 'bp', defId: 'prop-stcharles', color: 'pink' }] }];

  e.act('a', { t: 'ACTION', uid: 's1', targetId: 'b', propUid: 'bp' });
  e.act('b', { t: 'SAY_NO' }); // vítima se defende

  const pend = e.s.pending!;
  check(pend.defenderId === 'a', 'papel inverteu: ALICE (atacante) agora responde');
  check(pend.defenderId !== pend.targetId, 'estado invertido detectável (defender ≠ target)');

  // Alice desiste → ação cancelada, propriedade NÃO muda de dono
  e.act('a', { t: 'ACCEPT' });
  check(e.s.pending === null, 'ação cancelada após desistir');
  check(!has(P(e, 0), 'bp') && has(P(e, 1), 'bp'), 'propriedade continua com Bob (roubo cancelado)');
  check(P(e, 1).hand.length === 0, 'Bob gastou a carta "Não!"');
}

// ============================================================
console.log('CENARIO 5: atacante revida com outro "Não!" → roubo volta a valer');
{
  const e = newGame();
  P(e, 0).hand = [{ uid: 's1', defId: 'act-sly' }, { uid: 'n1', defId: 'act-sayno' }];
  P(e, 1).hand = [{ uid: 'n2', defId: 'act-sayno' }];
  P(e, 1).groups = [{ color: 'pink', cards: [{ uid: 'bp', defId: 'prop-stcharles', color: 'pink' }] }];

  e.act('a', { t: 'ACTION', uid: 's1', targetId: 'b', propUid: 'bp' });
  e.act('b', { t: 'SAY_NO' });  // vítima se defende
  e.act('a', { t: 'SAY_NO' });  // atacante revida
  check(e.s.pending?.defenderId === 'b', 'volta para a vítima (Bob) responder');

  e.act('b', { t: 'ACCEPT' });  // vítima sem mais "Não!" aceita
  check(has(P(e, 0), 'bp'), 'roubo concluído: propriedade está com ALICE');
  check(!has(P(e, 1), 'bp'), 'propriedade saiu de BOB');
}

console.log(failures === 0 ? '\nTESTE DE ROUBO PASSOU ✅' : `\n${failures} FALHA(S) ❌`);
process.exitCode = failures === 0 ? 0 : 1;
