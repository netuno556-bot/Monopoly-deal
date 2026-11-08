// ============================================================
//  SERVIDOR — HTTP + Socket.io (multiplayer em tempo real)
//  Em produção serve também o build do client (SPA) — assim a
//  nuvem (Render/Fly) sobe UM único serviço com tudo dentro.
//  ============================================================
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import {
  EV,
  type ActionPayload, type ChatSendPayload, type CreatePayload, type ErrorPayload,
  type JoinPayload, type NoticePayload, type RemovePlayerPayload,
  type SettingsPayload, type StatePayload,
} from '@md/shared';
import { GameError } from './engine.js';
import { MIN_PLAYERS, RoomManager } from './roomManager.js';

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

// Diretório do build do client (client/dist) — usado em produção.
// Em dev o Vite serve o client; se o dist não existir, servimos só a API.
const DIST_DIR = process.env.CLIENT_DIST
  ?? fileURLToPath(new URL('../../client/dist', import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** Serve o SPA (arquivos do build; rotas desconhecidas → index.html) */
function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (rel === '/') rel = '/index.html';
  // Evita path traversal: normaliza e mantém dentro do dist
  const file = normalize(join(DIST_DIR, rel));
  let target = file.startsWith(DIST_DIR) && existsSync(file) && statSync(file).isFile()
    ? file
    : join(DIST_DIR, 'index.html'); // fallback SPA

  if (!existsSync(target)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Build do client não encontrado — rode "npm run build" na raiz.');
    return;
  }
  const body = readFileSync(target);
  res.writeHead(200, {
    'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': extname(target) === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

// Socket.io intercepta /socket.io/* e repassa o resto ao handler estático
const httpServer = createServer(serveStatic);
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
  pingTimeout: 20_000,
});

const rooms = new RoomManager(io);

// Envia erro tanto por ack (create/join) quanto por evento
function fail(socket: Socket, err: unknown, ack?: (p: unknown) => void): void {
  const message = err instanceof GameError ? err.message : 'Erro inesperado no servidor';
  const code = err instanceof GameError ? err.code : 'INTERNAL';
  const payload: ErrorPayload = { message, code };
  if (ack) ack({ ok: false, error: payload });
  else socket.emit(EV.ERROR, payload);
}

function roomOf(socket: Socket) {
  const code = socket.data.code as string | undefined;
  return code ? rooms.get(code) : undefined;
}

function leaveRoom(socket: Socket): void {
  const room = roomOf(socket);
  if (!room) return;
  const wasEmpty = room.leave(socket.id);
  socket.data.code = undefined;
  socket.leave(room.code);
  if (wasEmpty) rooms.remove(room.code);
}

io.on('connection', socket => {
  // ---------- Criar sala ----------
  socket.on(EV.CREATE, (payload: CreatePayload, ack?: (r: unknown) => void) => {
    try {
      leaveRoom(socket);
      const visibility = payload?.visibility === 'public' ? 'public' : 'private';
      const room = rooms.create(visibility);
      room.join(socket, payload?.name);
      socket.data.code = room.code;
      socket.join(room.code);
      if (ack) ack({ ok: true, code: room.code });
      socket.emit(EV.JOINED, { code: room.code });
      socket.emit(EV.CHAT_HISTORY, { messages: room.chatHistory() });
      socket.emit(EV.STATE, { room: room.view(socket.id) } satisfies StatePayload);
    } catch (err) { fail(socket, err, ack); }
  });

  // ---------- Entrar com código ----------
  socket.on(EV.JOIN, (payload: JoinPayload, ack?: (r: unknown) => void) => {
    try {
      leaveRoom(socket);
      const room = rooms.get(payload?.code);
      if (!room) throw new GameError('NOT_FOUND', 'Sala não encontrada — confira o código');
      room.join(socket, payload?.name);
      socket.data.code = room.code;
      socket.join(room.code);
      if (ack) ack({ ok: true, code: room.code });
      socket.emit(EV.JOINED, { code: room.code });
      socket.emit(EV.CHAT_HISTORY, { messages: room.chatHistory() });
      socket.emit(EV.STATE, { room: room.view(socket.id) } satisfies StatePayload);
    } catch (err) { fail(socket, err, ack); }
  });

  // ---------- Listar salas públicas ----------
  socket.on(EV.LIST, (ack?: (r: unknown) => void) => {
    const list = rooms.listPublic();
    if (ack) ack({ ok: true, rooms: list });
    else socket.emit(EV.LIST_RESULT, { rooms: list });
  });

  // ---------- Sair ----------
  socket.on(EV.LEAVE, () => leaveRoom(socket));

  // ---------- Iniciar partida ----------
  socket.on(EV.START, (_p?: unknown, ack?: (r: unknown) => void) => {
    try { roomOf(socket)?.start(socket.id); ack?.({ ok: true }); }
    catch (err) { fail(socket, err, ack); }
  });

  // ---------- Configurações ----------
  socket.on(EV.SETTINGS, (payload: SettingsPayload, ack?: (r: unknown) => void) => {
    try { roomOf(socket)?.updateSettings(socket.id, payload?.settings ?? {}); ack?.({ ok: true }); }
    catch (err) { fail(socket, err, ack); }
  });

  // ---------- Adicionar bot ----------
  socket.on(EV.ADD_BOT, (_p?: unknown, ack?: (r: unknown) => void) => {
    try { roomOf(socket)?.addBot(socket.id); ack?.({ ok: true }); }
    catch (err) { fail(socket, err, ack); }
  });

  // ---------- Remover jogador (lobby) ----------
  socket.on(EV.REMOVE_PLAYER, (payload: RemovePlayerPayload, ack?: (r: unknown) => void) => {
    try { roomOf(socket)?.removePlayer(socket.id, payload?.playerId); ack?.({ ok: true }); }
    catch (err) { fail(socket, err, ack); }
  });

  // ---------- Reiniciar (volta ao lobby) ----------
  socket.on(EV.REMATCH, (_p?: unknown, ack?: (r: unknown) => void) => {
    try { roomOf(socket)?.rematch(socket.id); ack?.({ ok: true }); }
    catch (err) { fail(socket, err, ack); }
  });

  // ---------- Ação de jogo ----------
  socket.on(EV.ACTION, (payload: ActionPayload, ack?: (r: unknown) => void) => {
    try {
      const room = roomOf(socket);
      if (!room) throw new GameError('NO_ROOM', 'Você não está em uma sala');
      room.action(socket.id, payload?.action);
      ack?.({ ok: true });
    } catch (err) { fail(socket, err, ack); }
  });

  // ---------- Aviso (mensagens do servidor) ----------
  // (usado internamente; clientes recebem EV.NOTICE quando necessário)

  // ---------- Chat ----------
  socket.on(EV.CHAT, (payload: ChatSendPayload) => {
    try { roomOf(socket)?.chatFrom(socket.id, payload?.text ?? ''); }
    catch (err) { fail(socket, err); }
  });

  // ---------- Desconexão ----------
  socket.on('disconnect', () => leaveRoom(socket));
});

httpServer.listen(PORT, () => {
  console.log(`[server] Monopoly Deal ouvindo em http://localhost:${PORT} (CORS: ${CORS_ORIGIN})`);
  console.log(`[server] Mínimo de jogadores por sala: ${MIN_PLAYERS}`);
});
