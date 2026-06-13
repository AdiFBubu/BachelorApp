/// <reference types="jest" />

import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import { addEmotionReadingService } from '../services/doctorService';

jest.mock('../services/doctorService', () => {
  class DoctorServiceError extends Error {
    statusCode: number;

    constructor(statusCode: number, message: string) {
      super(message);
      this.name = 'DoctorServiceError';
      this.statusCode = statusCode;
    }
  }

  return {
    __esModule: true,
    DoctorServiceError,
    addEmotionReadingService: jest.fn(),
    getAvailablePatientsService: jest.fn(),
    getMyPatientsService: jest.fn(),
    getPatientDetailService: jest.fn(),
    takePatientService: jest.fn(),
  };
});

const jwtSecretForTests = 'topdown_step2_secret';
const addEmotionReadingServiceMock = addEmotionReadingService as jest.MockedFunction<typeof addEmotionReadingService>;

let app: Express;

describe('Depth-first Step 2: API orchestration (real controller, service stub)', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecretForTests;
    const appModule = await import('../app');
    app = appModule.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('controller extracts request data and delegates to service boundary', async () => {
    const token = jwt.sign({ sub: 'doctor-step2', role: 'DOCTOR' }, jwtSecretForTests);

    const payload = {
      probabilities: {
        Anger: 0.88,
        Fear: 0.76,
        Sadness: 0.69,
      },
      timestamp: '2026-04-18T11:00:00.000Z',
    };

    addEmotionReadingServiceMock.mockResolvedValue({
      readingId: 'reading-step2',
      storedAt: new Date('2026-04-18T11:00:00.000Z'),
      influxWritten: false,
    });

    const res = await request(app)
      .post('/api/doctor/patients/patient-step2/readings')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      readingId: 'reading-step2',
      influxWritten: false,
    });

    expect(addEmotionReadingServiceMock).toHaveBeenCalledWith(
      'doctor-step2',
      'patient-step2',
      payload,
    );
  });
});
