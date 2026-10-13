import http from 'http';
import express from 'express';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/database';
import { User, UserRole, AccountStatus } from '../models/User';
import { BuilderApplication, ApplicationStatus } from '../models/BuilderApplication';
import authRoutes from '../routes/auth.routes';
import userRoutes from '../routes/user.routes';
import cookieParser from 'cookie-parser';

async function runProfileTests() {
  console.log('--- STARTING PROFILE FEATURE & SECURITY TESTS ---');
  await connectDatabase();

  const timestamp = Date.now();
  const customerEmail = `profile_cust_${timestamp}@example.com`;
  const builderEmail = `profile_builder_${timestamp}@example.com`;
  const otherCustomerEmail = `profile_other_cust_${timestamp}@example.com`;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Seed Customer 1
    const cust1 = await User.create({
      name: 'Original Customer',
      email: customerEmail,
      phone: '9876543210',
      passwordHash: await bcrypt.hash('CustPass123', 12),
      role: UserRole.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    });

    // Seed Customer 2 (for IDOR / cross-user checks)
    const cust2 = await User.create({
      name: 'Other Customer',
      email: otherCustomerEmail,
      phone: '9876543211',
      passwordHash: await bcrypt.hash('OtherPass123', 12),
      role: UserRole.CUSTOMER,
      accountStatus: AccountStatus.ACTIVE,
    });

    // Seed Builder
    const builder = await User.create({
      name: 'Builder Rep',
      email: builderEmail,
      phone: '9876543212',
      passwordHash: await bcrypt.hash('BuilderPass123', 12),
      role: UserRole.BUILDER,
      accountStatus: AccountStatus.ACTIVE,
    });

    // Seed BuilderApplication linked to builder
    await BuilderApplication.create({
      applicantName: 'Builder Rep',
      email: builderEmail,
      phone: '9876543212',
      companyName: 'Apex Heights Ltd',
      businessType: 'Private Limited',
      yearsOfExperience: 8,
      numberOfProjects: 15,
      officeAddress: 'Apex Towers, SG Highway, Ahmedabad',
      city: 'Ahmedabad',
      state: 'Gujarat',
      website: 'apexheights.com',
      description: 'Premier residential builder in Ahmedabad specializing in luxury apartments and villas across the city.',
      status: ApplicationStatus.APPROVED,
      userId: builder._id,
    });

    // Log in Customer 1
    const custLogin = await axios.post(`${baseUrl}/api/auth/login`, {
      email: customerEmail,
      password: 'CustPass123',
    });
    const custToken = custLogin.data.data.token;

    // Log in Builder
    const builderLogin = await axios.post(`${baseUrl}/api/auth/login`, {
      email: builderEmail,
      password: 'BuilderPass123',
    });
    const builderToken = builderLogin.data.data.token;

    // ── Test 1: GET /api/users/me for Customer ───────────────────────────────
    const custProfileRes = await axios.get(`${baseUrl}/api/users/me`, {
      headers: { Authorization: `Bearer ${custToken}` },
    });
    if (custProfileRes.status !== 200) throw new Error('Customer profile get failed');
    if (custProfileRes.data.data.user.name !== 'Original Customer') throw new Error('Wrong customer name returned');
    if (custProfileRes.data.data.user.passwordHash) throw new Error('CRITICAL: passwordHash exposed in profile!');
    if (custProfileRes.data.data.builderProfile !== null) throw new Error('Customer should not have builderProfile data');
    console.log('✓ Test 1 Passed: Customer profile returns correct user record without passwordHash or builder data');

    // ── Test 2: GET /api/users/me for Builder ────────────────────────────────
    const builderProfileRes = await axios.get(`${baseUrl}/api/users/me`, {
      headers: { Authorization: `Bearer ${builderToken}` },
    });
    if (builderProfileRes.status !== 200) throw new Error('Builder profile get failed');
    if (!builderProfileRes.data.data.builderProfile) throw new Error('Builder should have associated builderProfile');
    if (builderProfileRes.data.data.builderProfile.companyName !== 'Apex Heights Ltd') {
      throw new Error(`Unexpected company name: ${builderProfileRes.data.data.builderProfile.companyName}`);
    }
    console.log('✓ Test 2 Passed: Builder profile returns personal record + linked BuilderApplication data');

    // ── Test 3: PATCH /api/users/me (Edit Profile) for Customer ──────────────
    const updateCustRes = await axios.patch(
      `${baseUrl}/api/users/me`,
      { name: 'Updated Customer Name', phone: '9123456780' },
      { headers: { Authorization: `Bearer ${custToken}` } }
    );
    if (updateCustRes.status !== 200) throw new Error('Customer profile update failed');
    if (updateCustRes.data.data.user.name !== 'Updated Customer Name') throw new Error('Customer name was not updated');
    if (updateCustRes.data.data.user.phone !== '9123456780') throw new Error('Customer phone was not updated');

    // Verify persistence directly in DB
    const refreshedCust = await User.findById(cust1._id);
    if (refreshedCust?.name !== 'Updated Customer Name' || refreshedCust?.phone !== '9123456780') {
      throw new Error('Customer update did not persist to database');
    }
    console.log('✓ Test 3 Passed: Customer profile update succeeds and persists to database');

    // ── Test 4: Security - Cannot change role, email, or accountStatus ────────
    const maliciousUpdate = await axios.patch(
      `${baseUrl}/api/users/me`,
      {
        name: 'Hacker Attempt',
        role: 'ADMIN',
        accountStatus: 'SUSPENDED',
        email: 'hacked@example.com',
      },
      { headers: { Authorization: `Bearer ${custToken}` } }
    );
    const checkedCust = await User.findById(cust1._id);
    if (checkedCust?.role !== UserRole.CUSTOMER) throw new Error('SECURITY VIOLATION: Role was altered!');
    if (checkedCust?.accountStatus !== AccountStatus.ACTIVE) throw new Error('SECURITY VIOLATION: AccountStatus was altered!');
    if (checkedCust?.email !== customerEmail) throw new Error('SECURITY VIOLATION: Email was altered!');
    console.log('✓ Test 4 Passed: Protected fields (role, accountStatus, email) cannot be altered');

    // ── Test 5: Security - IDOR prevention / userId injection ignored ─────────
    const idorUpdate = await axios.patch(
      `${baseUrl}/api/users/me`,
      {
        userId: cust2._id.toString(), // Attempting to modify other customer
        name: 'Compromised Name',
      },
      { headers: { Authorization: `Bearer ${custToken}` } }
    );
    const untouchedCust2 = await User.findById(cust2._id);
    if (untouchedCust2?.name !== 'Other Customer') {
      throw new Error('SECURITY VIOLATION: IDOR successful! Modified another customer!');
    }
    console.log('✓ Test 5 Passed: IDOR strictly prevented; req.body.userId is ignored');

    // ── Test 6: PATCH /api/users/me/password (Change Password) ───────────────
    // 6a: Reject wrong current password
    const wrongPassRes = await axios.patch(
      `${baseUrl}/api/users/me/password`,
      { currentPassword: 'WrongPassword123', newPassword: 'BrandNewPass123' },
      { headers: { Authorization: `Bearer ${custToken}` }, validateStatus: () => true }
    );
    if (wrongPassRes.status !== 400) throw new Error('Should reject incorrect current password');
    console.log('✓ Test 6a Passed: Incorrect current password rejected (400)');

    // 6b: Reject weak password
    const weakPassRes = await axios.patch(
      `${baseUrl}/api/users/me/password`,
      { currentPassword: 'CustPass123', newPassword: 'weak' },
      { headers: { Authorization: `Bearer ${custToken}` }, validateStatus: () => true }
    );
    if (weakPassRes.status !== 422 && weakPassRes.status !== 400) {
      throw new Error('Should reject weak password with 422 or 400');
    }
    console.log('✓ Test 6b Passed: Weak new password rejected');

    // 6c: Successful password change
    const validPassRes = await axios.patch(
      `${baseUrl}/api/users/me/password`,
      { currentPassword: 'CustPass123', newPassword: 'BrandNewPass123' },
      { headers: { Authorization: `Bearer ${custToken}` } }
    );
    if (validPassRes.status !== 200) throw new Error('Password change failed');
    if (!validPassRes.data.data.token) throw new Error('Password change should return rotated token');

    // Verify old password fails and new password works
    const oldLogin = await axios.post(
      `${baseUrl}/api/auth/login`,
      { email: customerEmail, password: 'CustPass123' },
      { validateStatus: () => true }
    );
    if (oldLogin.status !== 401) throw new Error('Old password should fail');

    const newLogin = await axios.post(`${baseUrl}/api/auth/login`, {
      email: customerEmail,
      password: 'BrandNewPass123',
    });
    if (newLogin.status !== 200) throw new Error('New password login failed');
    console.log('✓ Test 6c Passed: Password change works, old password invalidated, new password logs in');

    // ── Test 7: Unauthorized request rejection ───────────────────────────────
    const noAuthRes = await axios.get(`${baseUrl}/api/users/me`, {
      validateStatus: () => true,
    });
    if (noAuthRes.status !== 401) throw new Error('Unauthenticated request must return 401');
    console.log('✓ Test 7 Passed: Unauthenticated requests properly return 401');

    console.log('\n--- ALL PROFILE & SECURITY TESTS PASSED! ---');
  } finally {
    server.close();
    await User.deleteMany({ email: { $in: [customerEmail, builderEmail, otherCustomerEmail] } });
    await BuilderApplication.deleteMany({ email: builderEmail });
    await (await import('mongoose')).default.disconnect();
  }
}

runProfileTests().catch((err) => {
  console.error('PROFILE TEST FAILED:', err);
  process.exit(1);
});
