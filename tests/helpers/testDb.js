"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTestDB = startTestDB;
exports.stopTestDB = stopTestDB;
exports.clearTestDB = clearTestDB;
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
let mongoServer;
async function startTestDB() {
    mongoServer = await mongodb_memory_server_1.MongoMemoryServer.create({
        // Default launchTimeout (10s) is too tight on a loaded machine — mongod
        // itself starts fine, it just needs longer to bind under contention.
        // This only affects how long we wait for it, not what we're testing.
        instance: { launchTimeout: 60_000 },
    });
    await mongoose_1.default.connect(mongoServer.getUri());
}
async function stopTestDB() {
    await mongoose_1.default.connection.dropDatabase();
    await mongoose_1.default.disconnect();
    await mongoServer?.stop();
}
async function clearTestDB() {
    const collections = mongoose_1.default.connection.collections;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
}
//# sourceMappingURL=testDb.js.map