import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  BUILDER = 'BUILDER',
  ADMIN = 'ADMIN',
  DSA = 'DSA',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',       // Normal active account
  PENDING = 'PENDING',     // Awaiting admin approval (Builder/DSA)
  SUSPENDED = 'SUSPENDED', // Suspended by admin
  REJECTED = 'REJECTED',   // Application rejected (Builder/DSA)
}

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  accountStatus: AccountStatus;
  mustChangePassword?: boolean;
  phone?: string;
  loginCount: number;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  toSafeObject(): SafeUser;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  mustChangePassword?: boolean;
  phone?: string;
  loginCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name must not exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Never returned in queries by default
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
    },
    accountStatus: {
      type: String,
      enum: Object.values(AccountStatus),
      default: AccountStatus.ACTIVE,
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Please provide a valid 10-digit Indian mobile number'],
    },
    loginCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ accountStatus: 1 });

// ─── Instance Methods ────────────────────────────────────────────────────────

UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

UserSchema.methods.toSafeObject = function (): SafeUser {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    accountStatus: this.accountStatus,
    mustChangePassword: this.mustChangePassword ?? false,
    phone: this.phone,
    loginCount: this.loginCount ?? 0,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// ─── Model ───────────────────────────────────────────────────────────────────

export const User = mongoose.model<IUser>('User', UserSchema);
