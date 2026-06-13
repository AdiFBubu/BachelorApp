import { Request, Response } from 'express';
import {
  AuthServiceError,
  loginService,
  logoutService,
  meService,
  refreshService,
  registerService,
} from '../services/authService';

const handleServiceError = (res: Response, err: unknown, fallbackMessage: string) => {
  if (err instanceof AuthServiceError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  return res.status(500).json({ error: fallbackMessage });
};

export const register = async (req: Request, res: Response) => {
  try {
    const payload = await registerService(req.body);
    return res.json(payload);
  } catch (err) {
    return handleServiceError(res, err, 'Registration failed');
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const payload = await loginService(req.body);
    return res.json(payload);
  } catch (err) {
    return handleServiceError(res, err, 'Login failed');
  }
};

export const refresh = async (req: Request, res: Response) => {
  try {
    const payload = await refreshService(req.body);
    return res.json(payload);
  } catch (err) {
    return handleServiceError(res, err, 'Unable to refresh token');
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const payload = await logoutService(req.body);
    return res.json(payload);
  } catch (err) {
    return handleServiceError(res, err, 'Logout failed');
  }
};

export const me = async (req: Request, res: Response) => {
  try {
    const user = await meService(req.userId);
    return res.json(user);
  } catch (err) {
    return handleServiceError(res, err, 'Unable to load current user');
  }
};
