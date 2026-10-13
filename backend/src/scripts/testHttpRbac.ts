import http from 'http';
import express from 'express';
import axios from 'axios';
import { connectDatabase } from '../config/database';
import { User, UserRole, AccountStatus } from '../models/User';
import authRoutes from '../routes/auth.routes';
import propertyRoutes from '../routes/property.routes';
import cookieParser from 'cookie-parser';

async function runHttpTests() {
  console.log('--- STARTING HTTP INTEGRATION & RBAC TESTS ---');
  await connectDatabase();

  const testEmail = `builder_http_${Date.now()}@example.com`;
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  app.use('/api/properties', propertyRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  let tempPass = 'TempPass@123';
  let newPass = 'ValidNewPass123';

  try {
    // Create builder user with mustChangePassword = true
    const builder = await User.create({
      name: 'Builder HTTP Test',
      email: testEmail,
      phone: '9876543210',
      passwordHash: await (await import('bcryptjs')).default.hash(tempPass, 12),
      role: UserRole.BUILDER,
      accountStatus: AccountStatus.ACTIVE,
      mustChangePassword: true,
    });

    // 1. Builder logs in with temporary password
    const loginRes = await axios.post(`${baseUrl}/api/auth/login`, {
      email: testEmail,
      password: tempPass,
    }, { validateStatus: () => true });

    if (loginRes.status !== 200) {
      throw new Error(`Login failed: ${JSON.stringify(loginRes.data)}`);
    }
    const cookie = loginRes.headers['set-cookie']?.[0];
    if (!cookie) throw new Error('No cookie set on login');

    // 2. Test 3: Builder with mustChangePassword=true cannot access builder dashboard resources
    const propRes = await axios.get(`${baseUrl}/api/properties/mine`, {
      headers: { Cookie: cookie },
      validateStatus: () => true,
    });

    if (propRes.status !== 403 || propRes.data.code !== 'PASSWORD_CHANGE_REQUIRED') {
      throw new Error(`Expected 403 PASSWORD_CHANGE_REQUIRED, got: ${propRes.status} ${JSON.stringify(propRes.data)}`);
    }
    console.log('✓ Test 3 Passed: Builder with mustChangePassword=true is BLOCKED from Builder protected routes (403 PASSWORD_CHANGE_REQUIRED)');

    // 3. /api/auth/me should still be accessible
    const meRes = await axios.get(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookie },
      validateStatus: () => true,
    });

    if (meRes.status !== 200 || meRes.data.data.user.mustChangePassword !== true) {
      throw new Error(`Expected 200 from /auth/me, got: ${meRes.status}`);
    }
    console.log('✓ Test 4 Passed: Builder can access /auth/me while mustChangePassword=true');

    // 4. Test 17: User ID injection rejected / cannot change another user's password
    const spoofUserId = new (await import('mongoose')).default.Types.ObjectId().toString();
    const changeRes = await axios.post(
      `${baseUrl}/api/auth/change-password`,
      {
        currentPassword: tempPass,
        newPassword: newPass,
        userId: spoofUserId, // Injected user ID should be ignored
      },
      {
        headers: { Cookie: cookie },
        validateStatus: () => true,
      }
    );

    if (changeRes.status !== 200) {
      throw new Error(`Password change failed: ${JSON.stringify(changeRes.data)}`);
    }
    if (changeRes.data.data.user.id !== builder._id.toString()) {
      throw new Error('Spoofed user ID was honored instead of req.user.id!');
    }
    console.log('✓ Test 17 Passed: req.user.id is strictly enforced and spoofed user IDs are ignored');

    // 5. Check builder can now access /properties/mine
    const freshCookie = changeRes.headers['set-cookie']?.[0] || cookie;
    const afterChangePropRes = await axios.get(`${baseUrl}/api/properties/mine`, {
      headers: { Cookie: freshCookie },
      validateStatus: () => true,
    });

    if (afterChangePropRes.status !== 200) {
      throw new Error(`Expected 200 on /properties/mine after password change, got: ${afterChangePropRes.status}`);
    }
    console.log('✓ Test 18 Passed: Builder can access dashboard/properties after password change');

    console.log('\n--- ALL HTTP & RBAC INTEGRATION TESTS PASSED! ---');
  } finally {
    server.close();
    await User.deleteMany({ email: testEmail });
    await (await import('mongoose')).default.disconnect();
  }
}

runHttpTests().catch((err) => {
  console.error('HTTP TEST FAILED:', err);
  process.exit(1);
});
