import { useState } from 'react';
import { useStore } from '../store';

const SET_OPTS = [1, 2, 3, 4, 5];
const MOVE_OPTS = [2, 3, 4, 5];
const DRAW_OPTS = [1, 2, 3];
const HAND_OPTS = [5, 6, 7, 8, 9, 10];
const TIMER_OPTS = [0, 15, 30, 60, 120];

export default function Lobby() {
  const room = useStore(s => s.room)!;
  const myId = useStore(s => s.myId);
  const startGame = useStore(s => s.startGame);
  const updateSettings = useStore(s => s.updateSettings);
  const addBot = useStore(s => s.addBot);
  const removePlayer = useStore(s => s.removePlayer);
  const leaveRoom = useStore(s => s.leaveRoom);
  const [copied, setCopied] = useState(false);

  const isHost = room.hostId === myId;
  const me = room.players.find(p => p.id === myId);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível — o código está na tela mesmo */
    }
  };

  const set = (k: keyof typeof room.settings, v: number) =>
    updateSettings({ [k]: v } as Partial<typeof room.settings>);

  return (
    <div className="center-screen">
      <div>
        <div className="logo">Sala de espera</div>
        <p className="logo-sub">
          Compartilhe o código com seus amigos. Todo mundo pode jogar — celular, tablet ou PC.
        </p>
      </div>

      <div
        className="code-box"
        onClick={copyCode}
        title="Clique para copiar"
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && copyCode()}
      >
        {copied ? '✓ Copiado!' : room.code}
      </div>

      <div className="panel">
        <h2>
          Jogadores ({room.players.length}/6){' '}
          {isHost && room.players.length < 2 && '— adicione bots para começar'}
        </h2>
        <div className="player-list">
          {room.players.map(p => (
            <div className="player-item" key={p.id}>
              <div className="avatar">{p.name.slice(0, 1).toUpperCase()}</div>
              <div className="name">
                {p.name}
                {p.id === myId ? ' (você)' : ''}
              </div>
              {p.isHost && <span className="badge">Anfitrião</span>}
              {p.isBot && <span className="badge badge--bot">Bot</span>}
              {isHost && !p.isHost && (
                <button
                  className="btn btn--sm btn--danger"
                  onClick={() => removePlayer(p.id)}
                  title="Remover jogador"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {isHost && room.players.length < 6 && (
          <button className="btn btn--ghost" style={{ width: '100%' }} onClick={addBot}>
            🤖 Adicionar bot
          </button>
        )}
      </div>

      <div className="panel">
        <h2>Configurações {isHost ? '' : '(somente o anfitrião altera)'}</h2>
        <div className="settings-grid">
          <div className="field">
            <label>Conjuntos para vencer</label>
            <select
              disabled={!isHost}
              value={room.settings.setsToWin}
              onChange={e => set('setsToWin', Number(e.target.value))}
            >
              {SET_OPTS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Jogadas por turno</label>
            <select
              disabled={!isHost}
              value={room.settings.movesPerTurn}
              onChange={e => set('movesPerTurn', Number(e.target.value))}
            >
              {MOVE_OPTS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Cartas compradas por turno</label>
            <select
              disabled={!isHost}
              value={room.settings.drawCardsPerTurn}
              onChange={e => set('drawCardsPerTurn', Number(e.target.value))}
            >
              {DRAW_OPTS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Limite de mão</label>
            <select
              disabled={!isHost}
              value={room.settings.handLimit}
              onChange={e => set('handLimit', Number(e.target.value))}
            >
              {HAND_OPTS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tempo por ação (seg)</label>
            <select
              disabled={!isHost}
              value={room.settings.turnTimerSec}
              onChange={e => set('turnTimerSec', Number(e.target.value))}
            >
              {TIMER_OPTS.map(v => (
                <option key={v} value={v}>{v === 0 ? 'Desativado' : `${v}s`}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="row">
          <button className="btn btn--danger" onClick={leaveRoom}>Sair da sala</button>
          <button
            className="btn btn--gold"
            disabled={!isHost || room.players.length < 2}
            onClick={startGame}
          >
            🎮 Começar jogo
          </button>
        </div>
        {!isHost && me && (
          <p className="logo-sub" style={{ marginTop: 10 }}>
            Aguardando {room.players.find(p => p.id === room.hostId)?.name} iniciar a partida…
          </p>
        )}
      </div>
    </div>
  );
}
