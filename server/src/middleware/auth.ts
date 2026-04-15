import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import prisma from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

type JwtPayload = {
  sub: string;
  role?: UserRole;
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing authorization header' });

  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid authorization format' });

  try {
    const payload = jwt.verify(parts[1], JWT_SECRET) as JwtPayload;
    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const requireRole = (...allowedRoles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      let role = req.userRole;
      if (!role) {
        const user = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { role: true },
        });
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }
        role = user.role;
        req.userRole = role;
      }

      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};
