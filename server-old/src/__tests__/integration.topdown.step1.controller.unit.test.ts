/// <reference types="jest" />

import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import { addEmotionReading } from '../controllers/doctorController';

jest.mock('../controllers/doctorController', () => {
  return {
    __esModule: true,
    getAvailablePatients: jest.fn((_req, res) => res.json({ patients: [] })),
    getMyPatients: jest.fn((_req, res) => res.json({ patients: [] })),
    takePatient: jest.fn((_req, res) => res.json({ patient: null })),
    getPatientDetail: jest.fn((_req, res) => res.json({ patient: null, monitoring: null })),
    addEmotionReading: jest.fn((req, res) => {
      return res.status(202).json({
        routeReached: true,
        patientId: req.params.patientId,
      });
    }),
  };
});

const addEmotionReadingMock = addEmotionReading as unknown as jest.Mock;
const jwtSecretForTests = 'depthfirst_step1_secret';

let app: Express;

describe('Depth-first Step 1: Entry Point & Security (controller stub)', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecretForTests;
    const appModule = await import('../app');
    app = appModule.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows DOCTOR request through auth middleware and reaches controller boundary', async () => {
    const token = jwt.sign({ sub: 'doctor-step1', role: 'DOCTOR' }, jwtSecretForTests);

    const res = await request(app)
      .post('/api/doctor/patients/patient-step1/readings')
      .set('Authorization', `Bearer ${token}`)
      .send({ probabilities: { Anger: 0.9 } });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      routeReached: true,
      patientId: 'patient-step1',
    });
    expect(addEmotionReadingMock).toHaveBeenCalledTimes(1);
  });
});
