const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const defaultHttpOrigin = 'http://localhost:4000';
const defaultWsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';
const defaultWsHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export const BACKEND_HTTP_ORIGIN = trimTrailingSlash(import.meta.env.VITE_API_URL || defaultHttpOrigin);
export const BACKEND_WS_URL = import.meta.env.VITE_WS_URL || `${defaultWsProtocol}://${defaultWsHost}:4000/ws`;

export const backendPaths = {
  health: '/api/health',
  auth: {
    me: '/api/auth/me',
    login: '/api/auth/login',
    register: '/api/auth/register',
    logout: '/api/auth/logout',
  },
  admin: {
    wards: '/api/admin/wards',
    activePatients: '/api/admin/patients/active',
    checkIn: '/api/admin/check-in',
    checkOut: (patientId: string) => `/api/admin/check-out/${patientId}`,
  },
  doctor: {
    availablePatients: '/api/doctor/patients/available',
    myPatients: '/api/doctor/patients/mine',
    patientDetail: (patientId: string, window: '24h' | '7d' = '7d') =>
      `/api/doctor/patients/${patientId}/detail?window=${window}`,
    takePatient: (patientId: string) => `/api/doctor/patients/${patientId}/take`,
    readings: (patientId: string) => `/api/doctor/patients/${patientId}/readings`,
  },
} as const;

export const toBackendUrl = (path: string) => `${BACKEND_HTTP_ORIGIN}${path}`;
