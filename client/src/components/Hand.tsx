// Mão do jogador — cartas arrastáveis (dnd-kit) com toque/click para menu
import { useDraggable } from '@dnd-kit/core';
import type { CardInst } from '@md/shared';
import { CARDS } from '@md/shared';
import Card from './Card';
import { useStore } from '../store';

function DraggableCard({ card, selected }: { card: CardInst; selected: boolean }) {
  const setFlow = useStore(s => s.setFlow);
  const selecting = useStore(s => s.selecting);
  const toggleSelect = useStore(s => s.toggleSelect);
  const flow = useStore(s => s.flow);
  const act = useStore(s => s.act);
  const game = useStore(s => s.room?.game);
  const myId = useStore(s => s.myId);

  // Em modais de seleção (descarte), o toque marca/desmarca
  const inSelectMode = flow?.kind === 'discard';

  // Dinheiro não tem outra utilidade: com um clique já vai para o banco
  // (só na sua vez e com jogada disponível — fora disso abre o menu)
  const isMoney = CARDS[card.defId]?.type === 'money';
  const canBankNow =
    !!game &&
    game.pending == null &&
    game.blocking == null &&
    game.players[game.turnIndex]?.id === myId &&
    game.movesLeft > 0;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.uid,
    data: { card },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // pan-x libera o scroll horizontal da mão no mobile;
      // o arrasto vertical para a mesa continua funcionando
      style={{ opacity: isDragging ? 0.35 : 1, touchAction: 'pan-x' }}
      onClick={() => {
        if (inSelectMode) toggleSelect(card.uid);
        else if (isMoney && canBankNow) act({ t: 'PLAY_BANK', uid: card.uid });
        else setFlow({ kind: 'menu', card });
      }}
    >
      <Card card={card} selected={selected || selecting.has(card.uid)} />
    </div>
  );
}

export default function Hand() {
  const me = useStore(s => s.room?.game?.players.find(p => p.id === s.myId));
  const selecting = useStore(s => s.selecting);

  if (!me?.hand) return null;

  return (
    <div className="hand-wrap">
      <div className="hand">
        {me.hand.map(c => (
          <DraggableCard key={c.uid} card={c} selected={selecting.has(c.uid)} />
        ))}
      </div>
    </div>
  );
}
