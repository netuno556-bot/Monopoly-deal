// Conexão Socket.io única compartilhada por todo o app
import { io, type Socket } from 'socket.io-client';

// Em dev usa o proxy do Vite; em build defina VITE_SERVER_URL (ex.: http://192.168.0.10:3001)
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

export const socket: Socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
});
