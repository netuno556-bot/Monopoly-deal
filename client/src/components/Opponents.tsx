// Painéis dos oponentes (topo da mesa) — cada jogador mostra as cartas
// jogadas (propriedades em miniatura) e o banco, estilo "mesa" do exemplo.
// A mão do oponente aparece apenas como verso das cartas.
import type { GameStateView, PlayerView } from '@md/shared';
import { RENT_TABLE, SET_SIZE, cardValue } from '@md/shared';
import Card, { COLOR_HEX } from './Card';

function Opponent({ p, game }: { p: PlayerView; game: GameStateView }) {
  const isTurn = game.players[game.turnIndex]?.id === p.id && game.phase === 'playing';
  const bankTotal = p.bank.reduce((t, c) => t + cardValue(c.defId), 0);
  const sets = p.groups.filter(g => g.cards.length >= SET_SIZE[g.color]).length;

  return (
    <div
      className={[
        'opponent',
        isTurn ? 'opponent--turn' : '',
        p.isOut ? 'opponent--out' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="top">
        <div className="avatar">{p.name.slice(0, 1).toUpperCase()}</div>
        <div className="name" title={p.name}>
          {p.name}
          {p.isBot ? ' 🤖' : ''}
        </div>
        {sets > 0 && <span className="badge">★{sets}</span>}
      </div>

      <div className="stats">
        <span title="Cartas na mão">🂠 {p.handCount}</span>
        <span title="Dinheiro no banco">💰 {bankTotal}M</span>
        {p.isOut && <span style={{ color: 'var(--red)' }}> eliminado</span>}
      </div>

      {/* cartas na mesa do jogador: propriedades + banco */}
      <div className="opp-table">
        {p.groups.map(g => {
          const complete = g.cards.length >= SET_SIZE[g.color];
          const tiers = RENT_TABLE[g.color];
          const baseRent = tiers[Math.min(g.cards.length, tiers.length) - 1];
          const rent = baseRent + (g.house ? 3 : 0) + (g.hotel ? 4 : 0);
          return (
            <div key={g.color} className={`ogroup${complete ? ' ogroup--complete' : ''}`}>
              <div className="og-head">
                <i className="g-dot" style={{ background: COLOR_HEX[g.color] }} />
                {g.cards.length}/{SET_SIZE[g.color]}{complete ? ' ★' : ''}
                {g.house ? ' 🏡' : ''}{g.hotel ? ' 🏨' : ''}
                <span className="og-rent">{rent}M</span>
              </div>
              <div className="og-cards">
                {g.cards.map(c => (
                  <Card key={c.uid} card={c} className="card--opp" />
                ))}
              </div>
            </div>
          );
        })}

        <div className="ogroup">
          <div className="og-head">
            BANCO<span className="og-rent">{bankTotal}M</span>
          </div>
          <div className="og-cards">
            {p.bank.length === 0 ? (
              <span className="og-empty">sem dinheiro</span>
            ) : (
              p.bank.map(c => <Card key={c.uid} card={c} className="card--opp-bank" />)
            )
            }
          </div>
        </div>

        {p.groups.length === 0 && (
          <span className="og-empty">sem propriedades na mesa</span>
        )}
      </div>
    </div>
  );
}

export default function Opponents({
  game,
  myId,
}: { game: GameStateView; myId: string }) {
  // Minhas cartas ficam na minha área (embaixo) — aqui só os adversários
  const others = game.players.filter(p => p.id !== myId);
  if (others.length === 0) return null;
  return (
    <div className="opponents">
      {others.map(p => (
        <Opponent key={p.id} p={p} game={game} />
      ))}
    </div>
  );
}