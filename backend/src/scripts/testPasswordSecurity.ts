import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/database';
import { User, UserRole, AccountStatus } from '../models/User';
import * as AuthService from '../services/auth.service';
import * as AppService from '../services/application.service';
import { BuilderApplication } from '../models/BuilderApplication';

async function runTests() {
  console.log('--- STARTING BUILDER PASSWORD FLOW SECURITY TESTS ---');
  await connectDatabase();

  const testEmail = `testbuilder_${Date.now()}@example.com`;
  const adminEmail = `admin_${Date.now()}@example.com`;
  const customerEmail = `customer_${Date.now()}@example.com`;
  const dsaEmail = `dsa_${Date.now()}@example.com`;

  try {
    // 1. Create mock Admin
    const admin = await User.create({
      name: 'Test Admin',
      email: adminEmail,
      passwordHash: await bcrypt.hash('Admin@1234', 12),
      role: UserRole.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
    });

    // 2. Submit Builder Application
    const app = await AppService.submitBuilderApplication({
      applicantName: 'Test Builder Co',
      email: testEmail,
      phone: '9876543210',
      companyName: 'Test Co Infra',
      businessType: 'Private Limited',
      yearsOfExperience: 5,
      numberOfProjects: 10,
      officeAddress: '123 Test Street, Ahmedabad',
      city: 'Ahmedabad',
      state: 'Gujarat',
      description: 'A test builder application with sufficient character count for validation requirements.',
    });

    // Test 1: Admin approval creates Builder with mustChangePassword = true
    const { application, temporaryPassword } = await AppService.approveBuilderApplication(
      app._id.toString(),
      { adminUserId: admin._id.toString(), adminNotes: 'Approved for test' }
    );

    const builderUser = await User.findById(application.userId);
    if (!builderUser) throw new Error('Builder user was not created');
    if (builderUser.mustChangePassword !== true) {
      throw new Error(`Expected mustChangePassword to be true, got ${builderUser.mustChangePassword}`);
    }
    console.log('✓ Test 1 Passed: Admin approval creates Builder with mustChangePassword=true');

    // Test 2: Temporary password login succeeds
    const loginResult = await AuthService.login({
      email: testEmail,
      password: temporaryPassword,
    });
    if (!loginResult.user || loginResult.user.mustChangePassword !== true) {
      throw new Error('Login failed or mustChangePassword was not true in safe user');
    }
    console.log('✓ Test 2 Passed: Temporary password login succeeds');

    // Test 3: Password hash verification — check DB stores bcrypt hash, not plaintext
    const dbUserWithHash = await User.findById(builderUser._id).select('+passwordHash');
    if (!dbUserWithHash?.passwordHash || !dbUserWithHash.passwordHash.startsWith('$2')) {
      throw new Error('Password hash does not look like a bcrypt hash');
    }
    if (dbUserWithHash.passwordHash === temporaryPassword) {
      throw new Error('CRITICAL SECURITY: Temporary password stored in plaintext!');
    }
    console.log('✓ Test 10 Passed: Password is stored strictly as bcrypt hash');

    // Test 4: Reject incorrect current password
    try {
      await AuthService.changePassword(builderUser._id.toString(), {
        currentPassword: 'WrongPassword123!',
        newPassword: 'ValidNewPassword123',
      });
      throw new Error('Should have failed with wrong current password');
    } catch (err: any) {
      if (err.message !== 'Current password is incorrect') {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
      console.log('✓ Test 6 Passed: Wrong current password is rejected');
    }

    // Test 5: Reject new password same as temporary password
    try {
      await AuthService.changePassword(builderUser._id.toString(), {
        currentPassword: temporaryPassword,
        newPassword: temporaryPassword,
      });
      throw new Error('Should have failed when new password equals temporary password');
    } catch (err: any) {
      if (!err.message.includes('must be different')) {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
      console.log('✓ Test 9 Passed: New password cannot equal temporary password');
    }

    // Test 6: Reject weak new password (< 8 chars, or missing upper/lower/number)
    const weakPasswords = ['short1', 'lowercase123', 'UPPERCASE123', 'NoNumbersHere'];
    for (const weak of weakPasswords) {
      try {
        await AuthService.changePassword(builderUser._id.toString(), {
          currentPassword: temporaryPassword,
          newPassword: weak,
        });
        throw new Error(`Should have failed for weak password: ${weak}`);
      } catch (err: any) {
        if (!err.message.includes('must be at least 8 characters')) {
          throw new Error(`Unexpected error message for weak password: ${err.message}`);
        }
      }
    }
    console.log('✓ Test 7 Passed: Weak new password is rejected');

    // Test 7: Correct temporary password can be changed successfully
    const newValidPassword = 'SecureNewPassword123';
    const changeResult = await AuthService.changePassword(builderUser._id.toString(), {
      currentPassword: temporaryPassword,
      newPassword: newValidPassword,
    });
    if (changeResult.user.mustChangePassword !== false) {
      throw new Error('mustChangePassword was not set to false after password change');
    }
    console.log('✓ Test 5 Passed: Correct temporary password can be changed');
    console.log('✓ Test 11 Passed: After successful change mustChangePassword=false');

    // Test 8: Old temporary password no longer works
    try {
      await AuthService.login({
        email: testEmail,
        password: temporaryPassword,
      });
      throw new Error('Old temporary password should have failed');
    } catch (err: any) {
      if (err.message !== 'Invalid email or password') {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
      console.log('✓ Test 13 Passed: Old temporary password no longer works');
    }

    // Test 9: Login succeeds with NEW password
    const newLoginResult = await AuthService.login({
      email: testEmail,
      password: newValidPassword,
    });
    if (newLoginResult.user.mustChangePassword !== false) {
      throw new Error('Expected mustChangePassword to be false on new login');
    }
    console.log('✓ Test 12 Passed: Builder can login with new password and mustChangePassword=false');

    // Test 10: Customer login unaffected
    const cust = await AuthService.signupCustomer({
      name: 'Test Customer',
      email: customerEmail,
      password: 'CustomerPass123',
    });
    if (cust.user.mustChangePassword !== false) {
      throw new Error('Customer should have mustChangePassword=false');
    }
    const custLogin = await AuthService.login({
      email: customerEmail,
      password: 'CustomerPass123',
    });
    if (custLogin.user.mustChangePassword !== false) {
      throw new Error('Customer login returned mustChangePassword true');
    }
    console.log('✓ Test 14 Passed: Customer login remains unaffected');

    // Test 11: Admin login unaffected
    const adminLogin = await AuthService.login({
      email: adminEmail,
      password: 'Admin@1234',
    });
    if (adminLogin.user.mustChangePassword !== false) {
      throw new Error('Admin should have mustChangePassword=false');
    }
    console.log('✓ Test 15 Passed: Admin login remains unaffected');

    // Test 12: DSA partner flow verification
    const dsaApp = await AppService.submitDSAApplication({
      applicantName: 'Test DSA',
      email: dsaEmail,
      phone: '9876543211',
      employmentType: 'Self-Employed',
      yearsOfExperience: 3,
      address: 'Test DSA Office, Ahmedabad',
      city: 'Ahmedabad',
      state: 'Gujarat',
      description: 'A test DSA application with sufficient character count for validation requirements.',
    });
    const dsaApproval = await AppService.approveDSAApplication(
      dsaApp._id.toString(),
      { adminUserId: admin._id.toString(), adminNotes: 'Approved DSA' }
    );
    const dsaUser = await User.findById(dsaApproval.application.userId);
    if (!dsaUser || dsaUser.mustChangePassword !== true) {
      throw new Error('DSA mustChangePassword should be true upon approval');
    }
    console.log('✓ Test 16 Passed: DSA approval generates temp password and mustChangePassword=true');

    console.log('\n--- ALL TEST SUITE ASSERTIONS PASSED! ---');
  } finally {
    // Cleanup test accounts
    await User.deleteMany({ email: { $in: [testEmail, adminEmail, customerEmail, dsaEmail] } });
    await BuilderApplication.deleteMany({ email: testEmail });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('TEST RUNNER FAILED:', err);
  process.exit(1);
});
