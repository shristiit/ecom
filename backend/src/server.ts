// src/server.ts
import 'dotenv/config';
import app from './app';
import { connectDB } from './config/db';
import { PORT } from './config/env';

const port = Number(PORT || process.env.PORT || 4000);

async function start() {
  try {
    await connectDB();
    const server = app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });

    // Graceful shutdown (optional)
    const shutdown = (signal: string) => {
      console.log(`${signal} received. Shutting down...`);
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
      // Force exit if not closed in time
      setTimeout(() => process.exit(1), 10_000);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
