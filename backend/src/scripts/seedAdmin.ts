import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, UserRole, AccountStatus } from '../models/User';
import { connectDatabase } from '../config/database';

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'The Plinth Admin';

  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.'
    );
  }

  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
  }

  await connectDatabase();

  const existingAdmin = await User.findOne({
    email: email.toLowerCase().trim(),
  });

  if (existingAdmin) {
    if (existingAdmin.role === UserRole.ADMIN) {
      console.log('[SEED] Admin already exists. No changes made.');
    } else {
      console.log(
        '[SEED] A user with this email already exists with another role. No changes made.'
      );
    }

    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await User.create({
    name,
    email: email.toLowerCase().trim(),
    passwordHash,
    role: UserRole.ADMIN,
    accountStatus: AccountStatus.ACTIVE,
  });

  console.log('[SEED] Admin account created successfully.');
  console.log(`[SEED] Admin email: ${email.toLowerCase().trim()}`);

  await mongoose.disconnect();
}

seedAdmin().catch(async (error) => {
  console.error('[SEED] Failed:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
