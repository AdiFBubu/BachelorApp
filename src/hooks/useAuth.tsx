import React, { createContext, useContext, useEffect, useState } from 'react';
import { backendPaths, toBackendUrl } from '../config/backend';

export type UserRole = 'DOCTOR' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  register: (email: string, password: string, role: UserRole) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  api: (path: string, opts?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const api = (path: string, opts: RequestInit = {}) => {
    const token = localStorage.getItem('accessToken');
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) } as any;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(toBackendUrl(path), { ...opts, headers });
  };

  async function loadMe() {
    setLoading(true);
    try {
      const res = await api(backendPaths.auth.me);
      if (res.ok) {
        const data = (await res.json()) as AuthUser;
        setUser(data);
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function authAndStore(
    path: typeof backendPaths.auth.login | typeof backendPaths.auth.register,
    payload: Record<string, unknown>,
  ) {
    const res = await fetch(toBackendUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentication failed');

    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);

    if (data.user) {
      setUser(data.user as AuthUser);
      setLoading(false);
      return;
    }

    await loadMe();
  }

  async function register(email: string, password: string, role: UserRole) {
    await authAndStore(backendPaths.auth.register, { email, password, role });
  }

  async function login(email: string, password: string) {
    await authAndStore(backendPaths.auth.login, { email, password });
  }

  async function logout() {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await fetch(toBackendUrl(backendPaths.auth.logout), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (err) {}
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout, api }}>{children}</AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
