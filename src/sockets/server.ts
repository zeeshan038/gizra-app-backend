import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { registerSocketHandlers } from './handlers';
import { bindSocketServer } from './publish';

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://vendor.gizra.app',
  'https://www.gizra.app',
];

function parseCorsOrigins(): string[] {
  const fromEnv = process.env.SOCKET_CORS_ORIGINS || process.env.CORS_ORIGINS;
  if (!fromEnv) return DEFAULT_ORIGINS;
  return fromEnv.split(',').map((s) => s.trim()).filter(Boolean);
}

export async function initSocketServer(httpServer: HttpServer): Promise<Server> {
  const io = new Server(httpServer, {
    cors: {
      origin: parseCorsOrigins(),
      credentials: true,
    },
    path: process.env.SOCKET_PATH || '/socket.io',
  });

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      pubClient.on('error', (err) => console.error('[socket] redis pub error', err));
      subClient.on('error', (err) => console.error('[socket] redis sub error', err));
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[socket] Redis adapter enabled');
    } catch (err) {
      console.warn('[socket] Redis adapter failed; running in-memory only', err);
    }
  } else {
    console.warn('[socket] REDIS_URL not set; single-instance in-memory adapter only');
  }

  registerSocketHandlers(io);
  bindSocketServer(io);
  return io;
}
