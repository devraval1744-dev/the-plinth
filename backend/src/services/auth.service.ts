import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, UserRole, AccountStatus, SafeUser } from '../models/User';
import { env } from '../config/env';
import { JwtPayload } from '../middleware/auth.middleware';

const SALT_ROUNDS = 12;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: SafeUser;
  token: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export async function signupCustomer(input: SignupInput): Promise<AuthResult> {
  const { name, email, password, phone } = input;

  // Check for existing account
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    const err: any = new Error('An account with this email address already exists');
    err.statusCode = 409;
    throw err;
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Always create CUSTOMER — never allow role injection from input
  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role: UserRole.CUSTOMER,           // Hardcoded — never from request
    accountStatus: AccountStatus.ACTIVE,
    phone,
    loginCount: 1, // Newly registered customer starts with 1st login upon signup
  });

  const token = generateToken(user._id.toString(), user.role);

  return { user: user.toSafeObject(), token };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const { email, password } = input;

  // Fetch user including passwordHash (excluded by default)
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) {
    // Generic message — don't reveal whether email exists
    const err: any = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  // Check account status before password check
  if (user.accountStatus === AccountStatus.SUSPENDED) {
    const err: any = new Error('Account has been suspended. Please contact support.');
    err.statusCode = 403;
    throw err;
  }

  if (user.accountStatus === AccountStatus.REJECTED) {
    const err: any = new Error('Account application was rejected. Please contact support.');
    err.statusCode = 403;
    throw err;
  }

  if (user.accountStatus === AccountStatus.PENDING) {
    const err: any = new Error('Your account is pending admin approval. You will be notified once reviewed.');
    err.statusCode = 403;
    throw err;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    const err: any = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  user.loginCount = (user.loginCount || 0) + 1;
  await user.save();

  const token = generateToken(user._id.toString(), user.role);

  return { user: user.toSafeObject(), token };
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string }
): Promise<AuthResult> {
  const { currentPassword, newPassword } = input;

  // 1. Fetch user including passwordHash
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    const err: any = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  // 2. Verify current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    const err: any = new Error('Current password is incorrect');
    err.statusCode = 400;
    throw err;
  }

  // 3. New password must not equal current/temporary password
  if (currentPassword === newPassword) {
    const err: any = new Error('New password must be different from current password');
    err.statusCode = 400;
    throw err;
  }

  // 4. Validate new password strength
  // Minimum 8 chars, 1 uppercase, 1 lowercase, 1 number
  if (
    newPassword.length < 8 ||
    !/[A-Z]/.test(newPassword) ||
    !/[a-z]/.test(newPassword) ||
    !/[0-9]/.test(newPassword)
  ) {
    const err: any = new Error(
      'Password must be at least 8 characters and include uppercase, lowercase, and numbers'
    );
    err.statusCode = 400;
    throw err;
  }

  // 5. Hash new password
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.passwordHash = passwordHash;
  user.mustChangePassword = false;
  await user.save();

  // 6. Invalidate / rotate auth session by issuing fresh token
  const token = generateToken(user._id.toString(), user.role);

  return { user: user.toSafeObject(), token };
}

function generateToken(userId: string, role: UserRole): string {
  const payload: JwtPayload = { userId, role };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
}

