import { env } from './config/env';
import { connectDatabase } from './config/database';
import { assignDemoPropertyImages } from './scripts/assignDemoImages';
import app from './app';

async function bootstrap(): Promise<void> {
  // Connect to MongoDB first
  await connectDatabase();

  // Ensure any existing demo/seed properties without images get suitable images assigned (skips properties with existing cover images)
  try {
    await assignDemoPropertyImages();
  } catch (err) {
    console.error('[BOOTSTRAP] Demo property image sync failed:', err);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`[APP] Plinth API running on port ${env.PORT} [${env.NODE_ENV}]`);
    console.log(`[APP] Frontend URL: ${env.FRONTEND_URL}`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n[APP] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('[APP] Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  console.error('[APP] Failed to start:', error);
  process.exit(1);
});
