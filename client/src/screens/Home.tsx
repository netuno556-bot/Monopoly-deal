import { useEffect, useState } from 'react';
import { EV } from '@md/shared';
import { socket } from '../net/socket';
import { useStore } from '../store';

interface PublicRoom {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  phase: string;
}

export default function Home() {
  const createRoom = useStore(s => s.createRoom);
  const joinRoom = useStore(s => s.joinRoom);
  const [name, setName] = useState(() => localStorage.getItem('md-name') ?? '');
  const [code, setCode] = useState('');
  const [rooms, setRooms] = useState<PublicRoom[]>([]);

  // Salva o nome para próxima vez
  useEffect(() => {
    localStorage.setItem('md-name', name);
  }, [name]);

  // Lista de salas públicas (atualiza ao pedir e a cada 5s)
  const refresh = () => {
    socket.emit(EV.LIST, (r: { ok: boolean; rooms?: PublicRoom[] }) => {
      if (r?.ok && r.rooms) setRooms(r.rooms);
    });
  };
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const needName = name.trim().length === 0;

  const onCreate = (visibility: 'public' | 'private') => {
    if (needName) return;
    createRoom(name.trim(), visibility);
  };

  const onJoin = () => {
    if (needName) return;
    const c = code.replace(/\D/g, '');
    if (c.length !== 6) return;
    joinRoom(c, name.trim());
  };

  const onQuickJoin = (c: string) => {
    if (needName) return;
    joinRoom(c, name.trim());
  };

  return (
    <div className="center-screen">
      <div>
        <div className="logo">🎩 DEAL <span>LIVRE</span></div>
        <p className="logo-sub">
          Monopoly Deal multiplayer com amigos — crie uma sala, compartilhe o código e jogue
          no celular ou no PC.
        </p>
      </div>

      <div className="panel">
        <h2>Seu nome</h2>
        <div className="field">
          <input
            value={name}
            maxLength={16}
            placeholder="Como te chamamos?"
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div className="row">
          <button className="btn" disabled={needName} onClick={() => onCreate('private')}>
            🔒 Criar sala privada
          </button>
          <button className="btn btn--gold" disabled={needName} onClick={() => onCreate('public')}>
            🌍 Criar sala pública
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Entrar com código</h2>
        <div className="field">
          <input
            value={code}
            inputMode="numeric"
            placeholder="000000"
            maxLength={6}
            style={{ letterSpacing: 6, textAlign: 'center', fontSize: 22, fontWeight: 700 }}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && onJoin()}
          />
        </div>
        <button
          className="btn"
          style={{ width: '100%' }}
          disabled={needName || code.length !== 6}
          onClick={onJoin}
        >
          Entrar na sala
        </button>
      </div>

      {rooms.length > 0 && (
        <div className="panel">
          <h2>Salas públicas abertas</h2>
          <div className="public-rooms">
            {rooms.map(r => (
              <div className="public-room" key={r.code}>
                <span>
                  <b>{r.code}</b> · {r.hostName} · {r.playerCount}/{r.maxPlayers}
                </span>
                <button
                  className="btn btn--sm"
                  disabled={needName || r.playerCount >= r.maxPlayers}
                  onClick={() => onQuickJoin(r.code)}
                >
                  Entrar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="site-footer">
        🎩 Criado por <b>Alexandre Alencar</b>
      </footer>
    </div>
  );
}
