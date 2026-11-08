// Chat da sala — botão flutuante + painel com mensagens em tempo real
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

export default function Chat() {
  const open = useStore(s => s.chatOpen);
  const unread = useStore(s => s.chatUnread);
  const messages = useStore(s => s.chat);
  const myId = useStore(s => s.myId);
  const roomCode = useStore(s => s.room?.code);
  const openChat = useStore(s => s.openChat);
  const closeChat = useStore(s => s.closeChat);
  const sendChat = useStore(s => s.sendChat);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [open, messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    sendChat(text);
    setText('');
  };

  return (
    <>
      <button
        className={`chat-fab${unread > 0 ? ' chat-fab--new' : ''}`}
        title="Chat da sala"
        onClick={() => (open ? closeChat() : openChat())}
      >
        💬
        {unread > 0 && <span className="chat-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <b>💬 Chat da sala</b>
            <span className="chat-code">#{roomCode}</span>
            <button className="chat-x" title="Fechar" onClick={closeChat}>×</button>
          </div>

          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && (
              <p className="chat-empty">Nenhuma mensagem ainda — diga oi! 👋</p>
            )}
            {messages.map((m, i) => (
              <div
                key={`${m.ts}-${i}`}
                className={`chat-msg${m.from === myId ? ' chat-msg--mine' : ''}`}
              >
                <span className="chat-author">{m.from === myId ? 'Você' : m.name}</span>
                <span className="chat-text">{m.text}</span>
              </div>
            ))}
          </div>

          <form className="chat-form" onSubmit={submit}>
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={200}
              placeholder="Mensagem… (Enter envia)"
              aria-label="Mensagem do chat"
            />
            <button className="btn btn--gold btn--sm" type="submit" disabled={!text.trim()}>
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
