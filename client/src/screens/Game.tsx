// Mesa de jogo — layout "Frente a Frente" (Layout 1):
// Topo: oponentes (cartas visíveis + banco)
// Centro: monte de compra + monte de descarte + carta jogada brilhante
// Inferior: sua mão + suas propriedades + seu banco
// Direita/bottom-right: timer + controles de turno
// Esquerda/bottom-left: chat (gerenciado pelo PendingBanner/Modals)

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { CardColor, CardInst } from '@md/shared';
import { CARDS } from '@md/shared';
import { useStore } from '../store';
import Hand from '../components/Hand';
import MyArea from '../components/MyArea';
import Opponents from '../components/Opponents';
import CenterZone from '../components/CenterZone';
import Modals, { PendingBanner } from '../components/Modals';

export default function Game() {
  const room = useStore(s => s.room)!;
  const game = room.game!;
  const myId = useStore(s => s.myId);
  const act = useStore(s => s.act);
  const showError = useStore(s => s.showError);
  const leaveRoom = useStore(s => s.leaveRoom);
  const rematch = useStore(s => s.rematch);
  const setFlow = useStore(s => s.setFlow);

  const me = game.players.find(p => p.id === myId);
  const current = game.players[game.turnIndex];
  const isMyTurn = current?.id === myId && !game.pending && !game.blocking;
  const busy = !!game.pending || !!game.blocking;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // ---- drop: soltar carta em banco/grupo ----
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const card = active.data.current?.card as CardInst | undefined;
    if (!card) return;
    const def = CARDS[card.defId];
    const dest = String(over.id);
    if (!isMyTurn) {
      showError('Agora não é a sua vez');
      return;
    }

    if (dest === 'bank') {
      // Qualquer carta pode virar dinheiro no banco — menos o curinga
      if (def.type === 'wildProperty') {
        showError('Curinga não vai para o banco — jogue como propriedade (toque na carta)');
        return;
      }
      act({ t: 'PLAY_BANK', uid: card.uid });
      return;
    }

    if (dest.startsWith('group:')) {
      const color = dest.slice(6) as CardColor;
      if (def.type === 'property') {
        act({ t: 'PLAY_PROPERTY', uid: card.uid });
      } else if (def.type === 'wildProperty') {
        const allowed = def.colors ?? [];
        if (allowed.length > 0 && !allowed.includes(color)) {
          showError('Este curinga não aceita essa cor — escolha outra');
          return;
        }
        // Curinga geral: precisa de grupo existente. De 2 cores: pode abrir grupo novo.
        if (allowed.length === 0) {
          const g = game?.players.find(p => p.id === myId)?.groups.find(g => g.color === color);
          if (!g || g.cards.length === 0) {
            showError('Curinga geral só entra em um conjunto que você já tem');
            return;
          }
        }
        act({ t: 'PLAY_PROPERTY', uid: card.uid, color });
      } else if (def.type === 'rent') {
        const owned = me?.groups.some(g => g.color === color && g.cards.length > 0);
        if (!owned) { showError('Você não tem propriedades dessa cor'); return; }
        act({ t: 'RENT', uid: card.uid, color });
      } else if (def.type === 'house' || def.type === 'hotel') {
        act({ t: 'BUILD', uid: card.uid, color });
      } else {
        showError('Essa carta não pode ir para um grupo');
      }
      return;
    }
  };

  // ---- timer local ----
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const secondsLeft = game.deadline > 0
    ? Math.max(0, Math.ceil((game.deadline - now) / 1000))
    : null;

  const log = useMemo(() => [...game.log].slice(-12).reverse(), [game.log]);

  if (game.phase === 'ended') {
    const winner = game.players.find(p => p.id === game.winnerId);
    const isHost = room.hostId === myId;
    const iWon = game.winnerId === myId;
    return (
      <div className="end-overlay">
        <div className="end-card">
          <div className="trophy">{iWon ? '🏆' : '🎊'}</div>
          <h1>{iWon ? 'Você venceu!' : `${winner?.name ?? '?'} venceu!`}</h1>
          <p>{iWon ? 'Parabéns, magnata imobiliário!' : 'Melhor sorte na próxima!'}</p>
          <div className="row" style={{ maxWidth: 380 }}>
            <button className="btn btn--danger" onClick={leaveRoom}>Sair</button>
            {isHost && (
              <button className="btn btn--gold" onClick={rematch}>🔁 Jogar de novo</button>
            )}
            {!isHost && <span className="logo-sub">Aguardando o anfitrião…</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="table">
        <Opponents game={game} myId={myId} />

        <CenterZone game={game} myId={myId} />

        {/* Barra de turno: de quem é a vez, jogadas restantes, timer e saída */}
        <div className="turn-bar">
          <span className="who">
            {busy
              ? '⏸ Aguardando resposta…'
              : current?.id === myId
                ? '🎯 Sua vez'
                : `⏳ Vez de ${current?.name ?? '?'}`}
          </span>
          <span
            className="moves"
            title={`${game.movesLeft} de ${room.settings.movesPerTurn} jogadas restantes`}
          >
            {Array.from({ length: room.settings.movesPerTurn }, (_, i) => (
              <i key={i} className={i < game.movesLeft ? 'on' : undefined} />
            ))}
          </span>
          <span className="moves-label">
            {game.movesLeft} jogada(s) restante(s)
          </span>
          {secondsLeft !== null && (
            <span className={`timer${secondsLeft <= 10 ? ' timer--low' : ''}`}>
              ⏱ {secondsLeft}s
            </span>
          )}
          <button
            className="btn btn--ghost btn--sm"
            style={{ marginLeft: 'auto' }}
            disabled={!isMyTurn}
            onClick={() => act({ t: 'END_TURN' })}
            title="Encerrar seu turno agora — mesmo com jogadas sobrando"
          >
            🏁 Encerrar sessão
          </button>
        </div>

        <div className="areas">
          {me && <MyArea me={me} />}
          <div className="log" title="Andamento da partida">
            {log.map(l => (
              <span key={l.id} className={l.playerId === myId ? 'l-self' : undefined}>
                {l.text}
              </span>
            ))}
          </div>
        </div>

        <Hand />
      </div>

      <PendingBanner />
      <Modals />
    </DndContext>
  );
}