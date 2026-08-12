import mongoose from 'mongoose';
import { env } from './env';

/**
 * Connects to MongoDB. Accepts an optional URI override so tests can point
 * this at an in-memory MongoDB instance instead of the real Atlas cluster.
 */
export async function connectDB(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  return mongoose.connect(uri);
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
