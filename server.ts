import express from 'express';
import http from 'node:http';
import path from 'node:path';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './server/db.ts';
import { setupWebSocket } from './server/ws.ts';
import authRoutes from './server/routes/auth.ts';
import userRoutes from './server/routes/users.ts';
import requestRoutes from './server/routes/requests.ts';
import conversationRoutes from './server/routes/conversations.ts';
import roomRoutes from './server/routes/rooms.ts';
import notificationRoutes from './server/routes/notifications.ts';
import uploadRoutes from './server/routes/upload.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Initialize Database
  initDatabase();

  const app = express();
  const server = http.createServer(app);
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProduction = process.env.NODE_ENV === 'production';

  // Middlewares
  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Static uploads directory
  const uploadsDir = path.resolve(__dirname, 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      platform: 'Connectly',
      timestamp: new Date().toISOString(),
    });
  });

  // REST API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/requests', requestRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/upload', uploadRoutes);

  // Attach WebSocket Server
  setupWebSocket(server);

  // Frontend Integration: Vite middleware in development or static dist in production
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Connectly Server] Running on http://localhost:${PORT}`);
    console.log(`[Connectly Server] Real-time WebSocket listening at ws://localhost:${PORT}/ws`);
  });
}

startServer().catch((err) => {
  console.error('[Connectly Server] Fatal startup error:', err);
  process.exit(1);
});
