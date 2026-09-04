"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// One-time (but safely re-runnable) maintenance script: finds Property/Lead
// documents left behind by a User (or Property) deleted directly in the
// database rather than through the app — the cascade middleware in
// models/User.ts only fires for deletes that go through Mongoose, so a
// document removed straight from the Atlas UI or mongosh bypasses it
// entirely and leaves orphaned references behind. This finds and (if asked)
// removes those.
//
// Usage (from api/):
//   npm run cleanup:orphans            -- dry run, reports only
//   npm run cleanup:orphans -- --apply -- actually deletes
const db_1 = require("../src/config/db");
const User_1 = require("../src/models/User");
const Property_1 = require("../src/models/Property");
const Lead_1 = require("../src/models/Lead");
async function main() {
    const apply = process.argv.includes('--apply');
    await (0, db_1.connectDB)();
    const existingUserIds = new Set((await User_1.User.find().select('_id')).map((u) => u._id.toString()));
    const existingPropertyIds = new Set((await Property_1.Property.find().select('_id')).map((p) => p._id.toString()));
    const properties = await Property_1.Property.find().select('_id title createdBy');
    const orphanedProperties = properties.filter((p) => !existingUserIds.has(p.createdBy.toString()));
    const leads = await Lead_1.Lead.find().select('_id name agent property');
    const orphanedLeads = leads.filter((l) => !existingUserIds.has(l.agent.toString()) || !existingPropertyIds.has(l.property.toString()));
    console.log(`Orphaned listings (creator no longer exists): ${orphanedProperties.length}`);
    orphanedProperties.forEach((p) => console.log(`  - ${p._id} "${p.title}"`));
    console.log(`Orphaned leads (agent or property no longer exists): ${orphanedLeads.length}`);
    orphanedLeads.forEach((l) => console.log(`  - ${l._id} from "${l.name}"`));
    if (apply) {
        if (orphanedProperties.length > 0) {
            await Property_1.Property.deleteMany({ _id: { $in: orphanedProperties.map((p) => p._id) } });
        }
        if (orphanedLeads.length > 0) {
            await Lead_1.Lead.deleteMany({ _id: { $in: orphanedLeads.map((l) => l._id) } });
        }
        console.log('Deleted.');
    }
    else if (orphanedProperties.length > 0 || orphanedLeads.length > 0) {
        console.log('\nDry run only — nothing was deleted. Re-run with --apply to actually delete these.');
    }
    else {
        console.log('\nNo orphans found.');
    }
    await (0, db_1.disconnectDB)();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=cleanupOrphans.js.map