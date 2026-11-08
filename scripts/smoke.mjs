// Teste de fumaça: cria sala, 2 humanos + 4 bots, inicia e joga alguns turnos.
import { io } from 'socket.io-client';

const URL = process.env.URL ?? 'http://localhost:3001';
const errors = [];

const ack = (sock, ev, payload) =>
  new Promise((res) => {
    const t = setTimeout(() => res({ ok: false, timeout: true }), 5000);
    sock.emit(ev, payload, (r) => { clearTimeout(t); res(r); });
  });

const waitState = (sock, pred, ms = 5000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => { sock.off('state', h); rej(new Error('timeout esperando state')); }, ms);
    const h = (p) => { if (pred(p)) { clearTimeout(t); sock.off('state', h); res(p); } };
    sock.on('state', h);
  });

const a = io(URL, { transports: ['websocket'] });
const b = io(URL, { transports: ['websocket'] });
for (const s of [a, b]) s.on('error', (e) => errors.push(e));

try {
  // 1. criar e entrar
  const created = await ack(a, 'room:create', { name: 'Alice', visibility: 'private' });
  if (!created.ok) throw new Error('create falhou: ' + JSON.stringify(created));
  const code = created.code;
  console.log('sala criada:', code);

  const joined = await ack(b, 'room:join', { code, name: 'Bob' });
  if (!joined.ok) throw new Error('join falhou: ' + JSON.stringify(joined));

  // 2. configurações e bots
  await ack(a, 'room:settings', { settings: { turnTimerSec: 30, setsToWin: 3 } });
  for (let i = 0; i < 4; i++) {
    const r = await ack(a, 'room:addBot', {});
    if (!r.ok) throw new Error('addBot falhou: ' + JSON.stringify(r));
  }

  // 3. iniciar
  const started = await new Promise((res) => {
    const t = setTimeout(() => res({ ok: false, timeout: true }), 5000);
    a.once('state', (p) => {
      if (p.room.phase === 'playing') { clearTimeout(t); res({ ok: true, p }); }
    });
    a.emit('room:start', {}, (r) => { if (r && r.ok === false) { clearTimeout(t); res(r); } });
  });
  if (!started.ok) throw new Error('start falhou: ' + JSON.stringify(started));
  console.log('jogo iniciado com', started.p.room.players.length, 'jogadores');

  // 4. valida visão: mão de Alice visível, mão de Bob oculta
  const aliceView = started.p.room.game;
  const alice = aliceView.players.find((p) => p.name === 'Alice');
  const bob = aliceView.players.find((p) => p.name === 'Bob');
  // Alice: 5 iniciais + 2 do primeiro turno = 7; Bob: 5
  if (!alice.hand || alice.hand.length !== 7) throw new Error('mão de Alice não visível/correta: ' + alice.hand?.length);
  if (bob.hand !== undefined || bob.handCount !== 5) throw new Error('mão de Bob deveria estar oculta');
  if (aliceView.drawPile.length !== 0 || typeof aliceView.drawCount !== 'number') {
    throw new Error('baralho deveria estar oculto (só contagem)');
  }
  console.log('OK: mãos privadas e baralho oculto');

  // 5. Alice e Bob passam a vez; depois os bots jogam sozinhos
  a.emit('game:action', { action: { t: 'END_TURN' } });
  await waitState(b, (p) => p.room.game?.players[p.room.game.turnIndex]?.name === 'Bob');
  b.emit('game:action', { action: { t: 'END_TURN' } });
  console.log('turnos humanos ok — aguardando bots...');

  const before = (await waitState(a, (p) => p.room.game?.players[p.room.game.turnIndex]?.name !== 'Bob'))
    .room.game;
  await new Promise((r) => setTimeout(r, 8000));
  const s2 = await ack(a, 'room:settings', { settings: {} }); // noop p/ garantir vivo

  // 6. valida estado coerente
  const g = before;
  if (g.phase !== 'playing') throw new Error('jogo não está em playing');
  if (g.players.some((p) => p.handCount > g.settings.handLimit + 10)) {
    throw new Error('mão anormalmente grande (vazamento de draw?)');
  }
  const totalCards =
    g.players.reduce((t, p) => t + p.handCount + p.bank.length +
      p.groups.reduce((x, gg) => x + gg.cards.length + (gg.house ? 1 : 0) + (gg.hotel ? 1 : 0), 0), 0) +
    g.drawCount + g.discardPile.length;
  if (totalCards !== 107) throw new Error(`cartas no jogo = ${totalCards}, esperado 107`);
  console.log('OK: baralho integro (107 cartas distribuídas)');

  if (errors.length) throw new Error('erros de socket: ' + JSON.stringify(errors));
  console.log('\nSMOKE TESTE PASSOU ✅');
} catch (e) {
  console.error('FALHOU ❌', e.message);
  if (errors.length) console.error('erros:', JSON.stringify(errors));
  process.exitCode = 1;
} finally {
  a.close(); b.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 300);
}
