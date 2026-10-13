import mongoose from 'mongoose';
import { env } from './env';

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log(`[DB] MongoDB connected: ${mongoose.connection.host}`);
  } catch (error) {
    console.error('[DB] Connection failed:', error);
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[DB] MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('[DB] MongoDB error:', err);
});
