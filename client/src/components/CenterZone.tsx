// Zona central da mesa — monte de compra (baralho), monte de descarte e
// área de carta jogada (brilha quando há ação pendente).
import type { GameStateView, PendingAction } from '@md/shared';
import Card from './Card';
import { useStore } from '../store';

function DrawPile() {
  const count = useStore(s => s.room?.game?.drawCount ?? 0);
  return (
    <div className="pile draw-pile" title={`Monte de compra — ${count} carta(s)`}>
      <Card card={{ uid: 'draw-back', defId: 'back' }} style={{ width: 70, height: 95 }} />
      <span className="pile-count">{count}</span>
      <span className="pile-label">Compra</span>
    </div>
  );
}

function DiscardPile({ game }: { game: GameStateView }) {
  const count = game?.discardPile?.length ?? 0;
  const lastCard = count > 0 ? game.discardPile[count - 1] : undefined;
  return (
    <div className="pile discard-pile" title={`Monte de descarte — ${count} carta(s)`}>
      {lastCard ? (
        <Card card={lastCard} style={{ width: 70, height: 95 }} />
      ) : (
        <div className="pile-slot" aria-label="Descarte vazio">🗑️</div>
      )}
      <span className="pile-count">{count > 0 ? count : ''}</span>
      <span className="pile-label">Descarte</span>
    </div>
  );
}

function PlayedCardGlowie({ game, myId }: { game: GameStateView; myId: string }) {
  const pending = game?.pending;
  const myPending = pending && pending.defenderId === myId;
  if (!myPending) return null;

  return (
    <div
      className={`played-glow${myPending ? ' played-glow--active' : ''}`}
      title="Carta jogada — clique para ver detalhes"
    />
  );
}

export default function CenterZone({ game, myId }: { game: GameStateView; myId: string }) {
  return (
    <div className="center">
      <DrawPile />
      <DiscardPile game={game} />
      <PlayedCardGlowie game={game} myId={myId} />
    </div>
  );
}
