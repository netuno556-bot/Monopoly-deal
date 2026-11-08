import { useEffect } from 'react';
import { useStore } from './store';
import { installAudio } from './audio';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Game from './screens/Game';
import AudioControls from './components/AudioControls';
import Chat from './components/Chat';

export default function App() {
  const connected = useStore(s => s.connected);
  const room = useStore(s => s.room);
  const error = useStore(s => s.error);
  const notice = useStore(s => s.notice);
  const clearError = useStore(s => s.clearError);

  // Sons/música/narrador (instalação única)
  useEffect(() => { installAudio(); }, []);

  // Auto-esconde avisos/erros após 3.5s
  useEffect(() => {
    if (!error && !notice) return;
    const t = setTimeout(clearError, 3500);
    return () => clearTimeout(t);
  }, [error, notice, clearError]);

  let screen: JSX.Element;
  if (!room) screen = <Home />;
  else if (room.phase === 'lobby') screen = <Lobby />;
  else screen = <Game />;

  return (
    <div className="app">
      {!connected && <div className="conn-badge">🔴 Conectando ao servidor…</div>}
      {screen}
      <AudioControls />
      {room && <Chat />}
      {error && <div className="toast toast--error" onClick={clearError}>{error}</div>}
      {notice && !error && (
        <div className="toast toast--info">{notice.text}</div>
      )}
    </div>
  );
}
