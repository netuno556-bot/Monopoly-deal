// Área do jogador — inferior da mesa.
import { useDroppable } from '@dnd-kit/core';
import type { ColorGroup, PlayerView } from '@md/shared';
import { RENT_TABLE, SET_SIZE, cardValue } from '@md/shared';
import Card, { COLOR_HEX, COLOR_LABEL } from './Card';

function Group({ g }: { g: ColorGroup }) {
  const { isOver, setNodeRef } = useDroppable({ id: `group:${g.color}` });
  const complete = g.cards.length >= SET_SIZE[g.color];
  const rentTable = RENT_TABLE[g.color];
  const baseRent = rentTable[Math.min(g.cards.length, rentTable.length) - 1];
  const rent = baseRent + (g.house ? 3 : 0) + (g.hotel ? 4 : 0);

  return (
    <div
      ref={setNodeRef}
      className={`gpanel${isOver ? ' gpanel--drop' : ''}${complete ? ' gpanel--complete' : ''}`}
    >
      <div className="g-head">
        <span>
          <i className="g-dot" style={{ background: COLOR_HEX[g.color] }} />
          {COLOR_LABEL[g.color]} · {g.cards.length}/{SET_SIZE[g.color]}
          {complete ? ' ★' : ''}
        </span>
        <span className={complete ? 'g-set' : ''}>{rent}M</span>
      </div>
      <div className="g-cards">
        {g.cards.map(c => (
          <Card key={c.uid} card={c} style={{ width: 62, height: 89 }} />
        ))}
        {g.house && <span className="g-building" title="Casa (+3M de aluguel)">🏡</span>}
        {g.hotel && <span className="g-building" title="Hotel (+4M de aluguel)">🏨</span>}
      </div>
    </div>
  );
}

export default function MyArea({ me }: { me: PlayerView }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'bank' });
  const bankTotal = me.bank.reduce((t, c) => t + cardValue(c.defId), 0);

  return (
    <div className="my-area">
      <div className="area-title">
        Suas propriedades {me.groups.length > 0 && `(${me.groups.length} grupos)`}
      </div>
      <div className="groups">
        {me.groups.length === 0 && (
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            Arraste propriedades aqui (ou toque na carta)
          </span>
        )}
        {me.groups.map(g => <Group key={g.color} g={g} />)}
      </div>

      <div className="area-title" style={{ marginTop: 6 }}>Seu banco</div>
      <div ref={setNodeRef} className={`bank${isOver ? ' bank--drop' : ''}`}>
        {me.bank.length === 0 ? (
          <span className="empty">Arraste cartas aqui (viram dinheiro)</span>
        ) : (
          <>
            {me.bank.map(c => (
              <Card key={c.uid} card={c} style={{ width: 56, height: 81 }} />
            ))}
            <b className="bank-total">Σ {bankTotal}M</b>
          </>
        )}
      </div>
    </div>
  );
}

/** Total de grupos completos (para vitória) */
export function completeSets(groups: ColorGroup[]): number {
  return groups.filter(g => g.cards.length >= SET_SIZE[g.color as ColorGroup['color']]).length;
}