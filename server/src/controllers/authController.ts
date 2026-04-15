import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { add } from 'date-fns';
import { UserRole } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ACCESS_TOKEN_EXP = '15m';
const REFRESH_TOKEN_DAYS = 30;
const VALID_ROLES = new Set<UserRole>(['DOCTOR', 'ADMIN']);

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

export const register = async (req: Request, res: Response) => {
  const { email, password, role } = req.body as { email?: string; password?: string; role?: UserRole };
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
  if (role && !VALID_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role' });

  const normalizedEmail = email.trim().toLowerCase();
  const selectedRole = role || 'DOCTOR';

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash: hash, role: selectedRole },
  });

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = await createRefreshToken(user.id);
  return res.json({ accessToken, refreshToken, user: publicUser(user) });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = await createRefreshToken(user.id);
  return res.json({ accessToken, refreshToken, user: publicUser(user) });
};

export const refresh = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Missing refreshToken' });

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: { select: { id: true, role: true } } },
  });
  if (!stored) return res.status(401).json({ error: 'Invalid refresh token' });
  if (stored.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    return res.status(401).json({ error: 'Refresh token expired' });
  }

  // rotate
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  const newRefresh = await createRefreshToken(stored.userId);
  const accessToken = signAccessToken(stored.user.id, stored.user.role);
  return res.json({ accessToken, refreshToken: newRefresh });
};

export const logout = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Missing refreshToken' });

  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  return res.json({ ok: true });
};

export const me = async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.json(user);
};
