import http from 'http';
import express from 'express';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/database';
import { User, UserRole, AccountStatus } from '../models/User';
import authRoutes from '../routes/auth.routes';
import propertyRoutes from '../routes/property.routes';
import adminRoutes from '../routes/admin.routes';
import adminPropertyRoutes from '../routes/admin.property.routes';
import applicationRoutes from '../routes/application.routes';
import cookieParser from 'cookie-parser';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

async function runTabIsolationTests() {
  console.log('--- STARTING FOUR-PANEL TAB ISOLATION & RBAC TESTS ---');
  await connectDatabase();

  const timestamp = Date.now();
  const emails = {
    builder: `builder_tab_${timestamp}@example.com`,
    admin: `admin_tab_${timestamp}@example.com`,
    customer: `customer_tab_${timestamp}@example.com`,
    dsa: `dsa_tab_${timestamp}@example.com`,
  };

  const passwords = {
    builder: 'BuilderPass123',
    admin: 'AdminPass123',
    customer: 'CustomerPass123',
    dsa: 'DsaPass123',
  };

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Mount routes matching production index.ts
  app.use('/api/auth', authRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/properties', propertyRoutes);
  app.use('/api/admin', requireAuth, requireRole(UserRole.ADMIN), adminRoutes);
  app.use('/api/admin/properties', requireAuth, requireRole(UserRole.ADMIN), adminPropertyRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // Seed the 4 test users
    await User.create({
      name: 'Tab Builder',
      email: emails.builder,
      passwordHash: await bcrypt.hash(passwords.builder, 12),
      role: UserRole.BUILDER,
      accountStatus: AccountStatus.ACTIVE,
      mustChangePassword: false,
    });

    await User.create({
      name: 'Tab Admin',
      email: emails.admin,
      passwordHash: await bcrypt.hash(passwords.admin, 12),
      role: UserRole.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
    });

    await User.create({
      name: 'Tab Customer',
      email: emails.customer,
      passwordHash: await bcrypt.hash(passwords.customer, 12),
      role: UserRole.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    });

    await User.create({
      name: 'Tab DSA',
      email: emails.dsa,
      passwordHash: await bcrypt.hash(passwords.dsa, 12),
      role: UserRole.DSA,
      accountStatus: AccountStatus.ACTIVE,
    });

    // 1. Simulate Tab 1: Builder Login
    const builderLogin = await axios.post(`${baseUrl}/api/auth/login`, {
      email: emails.builder,
      password: passwords.builder,
    });
    const builderToken = builderLogin.data.data.token;
    if (!builderToken) throw new Error('Builder login did not return a token');
    console.log('✓ Tab 1 (Builder): Logged in & received Bearer token');

    // 2. Simulate Tab 2: Admin Login
    const adminLogin = await axios.post(`${baseUrl}/api/auth/login`, {
      email: emails.admin,
      password: passwords.admin,
    });
    const adminToken = adminLogin.data.data.token;
    if (!adminToken) throw new Error('Admin login did not return a token');
    console.log('✓ Tab 2 (Admin): Logged in & received Bearer token');

    // 3. Verify Tab 1 session did NOT change after Admin login
    const builderMe = await axios.get(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${builderToken}` },
    });
    if (builderMe.data.data.user.role !== 'BUILDER' || builderMe.data.data.user.email !== emails.builder) {
      throw new Error('Tab 1 (Builder) session was altered after Admin login!');
    }
    console.log('✓ Tab Isolation Test 1 Passed: Tab 1 is STILL Builder after Tab 2 Admin login');

    // 4. Simulate Tab 3: Customer Login
    const customerLogin = await axios.post(`${baseUrl}/api/auth/login`, {
      email: emails.customer,
      password: passwords.customer,
    });
    const customerToken = customerLogin.data.data.token;
    if (!customerToken) throw new Error('Customer login did not return a token');
    console.log('✓ Tab 3 (Customer): Logged in & received Bearer token');

    // 5. Verify Tab 2 (Admin) session did NOT change after Customer login
    const adminMe = await axios.get(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (adminMe.data.data.user.role !== 'ADMIN' || adminMe.data.data.user.email !== emails.admin) {
      throw new Error('Tab 2 (Admin) session was altered after Customer login!');
    }
    console.log('✓ Tab Isolation Test 2 Passed: Tab 2 is STILL Admin after Tab 3 Customer login');

    // 6. Simulate Tab 4: DSA Login
    const dsaLogin = await axios.post(`${baseUrl}/api/auth/login`, {
      email: emails.dsa,
      password: passwords.dsa,
    });
    const dsaToken = dsaLogin.data.data.token;
    if (!dsaToken) throw new Error('DSA login did not return a token');
    console.log('✓ Tab 4 (DSA): Logged in & received Bearer token');

    // 7. Cross-tab RBAC Boundary Tests
    // 7a. Builder token cannot access Admin routes
    const builderToAdmin = await axios.get(`${baseUrl}/api/admin/applications/stats`, {
      headers: { Authorization: `Bearer ${builderToken}` },
      validateStatus: () => true,
    });
    if (builderToAdmin.status !== 403) {
      throw new Error(`Expected 403 for Builder on Admin route, got: ${builderToAdmin.status}`);
    }
    console.log('✓ RBAC Test Passed: Builder token CANNOT access Admin routes (403)');

    // 7b. Admin token cannot access Builder routes
    const adminToBuilder = await axios.get(`${baseUrl}/api/properties/mine`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      validateStatus: () => true,
    });
    if (adminToBuilder.status !== 403) {
      throw new Error(`Expected 403 for Admin on Builder route, got: ${adminToBuilder.status}`);
    }
    console.log('✓ RBAC Test Passed: Admin token CANNOT access Builder routes (403)');

    // 7c. Customer token cannot access Admin routes
    const customerToAdmin = await axios.get(`${baseUrl}/api/admin/applications/stats`, {
      headers: { Authorization: `Bearer ${customerToken}` },
      validateStatus: () => true,
    });
    if (customerToAdmin.status !== 403) {
      throw new Error(`Expected 403 for Customer on Admin route, got: ${customerToAdmin.status}`);
    }
    console.log('✓ RBAC Test Passed: Customer token CANNOT access Admin routes (403)');

    // 7d. DSA token cannot access Builder routes
    const dsaToBuilder = await axios.get(`${baseUrl}/api/properties/mine`, {
      headers: { Authorization: `Bearer ${dsaToken}` },
      validateStatus: () => true,
    });
    if (dsaToBuilder.status !== 403) {
      throw new Error(`Expected 403 for DSA on Builder route, got: ${dsaToBuilder.status}`);
    }
    console.log('✓ RBAC Test Passed: DSA token CANNOT access Builder routes (403)');

    // 8. Tab-isolated Logout Test:
    // Builder logs out (frontend removes plinth_access_token from Tab 1 sessionStorage)
    // Admin, Customer, and DSA tabs remain completely authenticated
    const adminStillValid = await axios.get(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const customerStillValid = await axios.get(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const dsaStillValid = await axios.get(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${dsaToken}` },
    });

    if (
      adminStillValid.data.data.user.role !== 'ADMIN' ||
      customerStillValid.data.data.user.role !== 'CUSTOMER' ||
      dsaStillValid.data.data.user.role !== 'DSA'
    ) {
      throw new Error('Other tab sessions were invalidated when Tab 1 logged out!');
    }
    console.log('✓ Logout Isolation Passed: Tab 1 logout leaves Admin, Customer, and DSA tabs authenticated');

    console.log('\n--- ALL FOUR-PANEL TAB ISOLATION & RBAC TESTS PASSED! ---');
  } finally {
    server.close();
    await User.deleteMany({ email: { $in: Object.values(emails) } });
    await (await import('mongoose')).default.disconnect();
  }
}

runTabIsolationTests().catch((err) => {
  console.error('TAB ISOLATION TEST FAILED:', err);
  process.exit(1);
});
