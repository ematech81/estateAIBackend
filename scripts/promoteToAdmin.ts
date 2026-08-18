// Grants the admin role to an existing account — there's no self-serve way
// to become an admin through the app itself (deliberate), so this is the
// only path. Reruns safely (no-op if already admin).
//
// Usage (from api/):
//   npm run promote:admin -- --email=someone@example.com
import { connectDB, disconnectDB } from '../src/config/db';
import { User } from '../src/models/User';

async function main() {
  const emailArg = process.argv.find((arg) => arg.startsWith('--email='));
  const email = emailArg?.split('=')[1];
  if (!email) {
    console.error('Usage: npm run promote:admin -- --email=someone@example.com');
    process.exit(1);
  }

  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    console.error(`No account found for ${email}`);
    await disconnectDB();
    process.exit(1);
  }

  if (user.role === 'admin') {
    console.log(`${user.email} is already an admin.`);
  } else {
    const previousRole = user.role;
    user.role = 'admin';
    await user.save();
    console.log(`Promoted ${user.email} from '${previousRole}' to 'admin'.`);
  }

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
