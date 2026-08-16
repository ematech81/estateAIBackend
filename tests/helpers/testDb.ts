import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer | undefined;

export async function startTestDB(): Promise<void> {
  mongoServer = await MongoMemoryServer.create({
    // Default launchTimeout (10s) is too tight on a loaded machine — mongod
    // itself starts fine, it just needs longer to bind under contention.
    // This only affects how long we wait for it, not what we're testing.
    instance: { launchTimeout: 60_000 },
  });
  await mongoose.connect(mongoServer.getUri());
}

export async function stopTestDB(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongoServer?.stop();
}

export async function clearTestDB(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}
