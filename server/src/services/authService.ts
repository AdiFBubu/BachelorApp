import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { add } from 'date-fns';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import prisma from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ACCESS_TOKEN_EXP = '15m';
const REFRESH_TOKEN_DAYS = 30;
const VALID_ROLES = new Set<UserRole>(['DOCTOR', 'ADMIN']);

type RegisterBody = {
  email?: string;
  password?: string;
  role?: UserRole;
};

type LoginBody = {
  email?: string;
  password?: string;
};

type RefreshBody = {
  refreshToken?: string;
};

type LogoutBody = {
  refreshToken?: string;
};

export class AuthServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AuthServiceError';
    this.statusCode = statusCode;
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as Record<string, unknown>;
};

function signAccessToken(userId: string, role: UserRole) {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXP });
}

function publicUser(user: { id: string; email: string; role: UserRole; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

async function createRefreshToken(userId: string) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = add(new Date(), { days: REFRESH_TOKEN_DAYS });
  await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
  return token;
}

export async function registerService(rawBody: unknown) {
  const body = asRecord(rawBody) as RegisterBody;
  const email = body.email;
  const password = body.password;
  const role = body.role;

  if (!email || !password) {
    throw new AuthServiceError(400, 'Missing email or password');
  }

  if (role && !VALID_ROLES.has(role)) {
    throw new AuthServiceError(400, 'Invalid role');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const selectedRole = role || 'DOCTOR';

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new AuthServiceError(409, 'Email already registered');
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash: hash, role: selectedRole },
  });

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = await createRefreshToken(user.id);

  return { accessToken, refreshToken, user: publicUser(user) };
}

export async function loginService(rawBody: unknown) {
  const body = asRecord(rawBody) as LoginBody;
  const email = body.email;
  const password = body.password;

  if (!email || !password) {
    throw new AuthServiceError(400, 'Missing email or password');
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    throw new AuthServiceError(401, 'Invalid credentials');
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw new AuthServiceError(401, 'Invalid credentials');
  }

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = await createRefreshToken(user.id);

  return { accessToken, refreshToken, user: publicUser(user) };
}

export async function refreshService(rawBody: unknown) {
  const body = asRecord(rawBody) as RefreshBody;
  const refreshToken = body.refreshToken;

  if (!refreshToken) {
    throw new AuthServiceError(400, 'Missing refreshToken');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: { select: { id: true, role: true } } },
  });

  if (!stored) {
    throw new AuthServiceError(401, 'Invalid refresh token');
  }

  if (stored.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw new AuthServiceError(401, 'Refresh token expired');
  }

  await prisma.refreshToken.delete({ where: { id: stored.id } });
  const newRefresh = await createRefreshToken(stored.userId);
  const accessToken = signAccessToken(stored.user.id, stored.user.role);

  return { accessToken, refreshToken: newRefresh };
}

export async function logoutService(rawBody: unknown) {
  const body = asRecord(rawBody) as LogoutBody;
  const refreshToken = body.refreshToken;

  if (!refreshToken) {
    throw new AuthServiceError(400, 'Missing refreshToken');
  }

  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  return { ok: true };
}

export async function meService(userIdInput: string | undefined) {
  if (!userIdInput) {
    throw new AuthServiceError(401, 'Unauthorized');
  }

  const user = await prisma.user.findUnique({
    where: { id: userIdInput },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  if (!user) {
    throw new AuthServiceError(404, 'User not found');
  }

  return user;
}