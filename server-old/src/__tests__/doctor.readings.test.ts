/// <reference types="jest" />

import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';

// Mock Prisma and Influx so the test runs isolated without a real DB or Influx instance.
jest.mock('../lib/prisma', () => {
  const mockTx = {
    emotionReading: { create: jest.fn().mockResolvedValue({ id: 'reading-1', timestamp: new Date().toISOString() }) },
    patientAlert: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    },
  };

  return {
    __esModule: true,
    default: {
      patient: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          isArchived: false,
          doctorId: 'doctor-123',
        })),
      },
      $transaction: jest.fn(async (cb: (tx: typeof mockTx) => Promise<unknown> | unknown) => cb(mockTx)),
        __mockTx: mockTx,
    },
  };
});

jest.mock('../lib/influx', () => ({
  __esModule: true,
  writePatientEmotionPoint: jest.fn().mockResolvedValue(true),
  isInfluxConfigured: jest.fn().mockReturnValue(false),
}));

import prisma from '../lib/prisma';
import { writePatientEmotionPoint } from '../lib/influx';

type PrismaMock = {
  patient: {
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
  __mockTx: {
    emotionReading: {
      create: jest.Mock;
    };
    patientAlert: {
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };
};

const jwtSecretForTests = 'integration_test_secret';

const signDoctorToken = () => jwt.sign({ sub: 'doctor-123', role: 'DOCTOR' }, jwtSecretForTests);
const signAdminToken = () => jwt.sign({ sub: 'admin-1', role: 'ADMIN' }, jwtSecretForTests);

const prismaMock = prisma as unknown as PrismaMock;
const writePatientEmotionPointMock = writePatientEmotionPoint as jest.MockedFunction<typeof writePatientEmotionPoint>;

let app: Express;

describe('POST /api/doctor/patients/:patientId/readings', () => {
  beforeAll(async () => {
    // Make middleware and test token generation use the same secret.
    process.env.JWT_SECRET = jwtSecretForTests;
    const appModule = await import('../app');
    app = appModule.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app)
      .post('/api/doctor/patients/patient-1/readings')
      .send({ probabilities: { Anger: 0.8 } });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing authorization header' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated users without DOCTOR role', async () => {
    const token = signAdminToken();

    const res = await request(app)
      .post('/api/doctor/patients/patient-1/readings')
      .set('Authorization', `Bearer ${token}`)
      .send({ probabilities: { Anger: 0.8 } });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('stores a valid reading and returns 201 through full app flow', async () => {
    const token = signDoctorToken();
    const timestamp = '2026-04-18T10:00:00.000Z';

    const payload = {
      probabilities: {
        Anger: 0.9,
        Fear: 0.8,
        Sadness: 0.7,
      },
      timestamp,
    };

    const res = await request(app)
      .post('/api/doctor/patients/patient-1/readings')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      readingId: 'reading-1',
      influxWritten: true,
    });

    expect(prismaMock.patient.findUnique).toHaveBeenCalledWith({
      where: { id: 'patient-1' },
      select: { id: true, isArchived: true, doctorId: true },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.__mockTx.emotionReading.create).toHaveBeenCalledTimes(1);

    const createCallArg = prismaMock.__mockTx.emotionReading.create.mock.calls[0][0];
    expect(createCallArg.data.anger).toBe(90);
    expect(createCallArg.data.fear).toBe(80);
    expect(createCallArg.data.sadness).toBe(70);
    expect(createCallArg.data.distressScore).toBeCloseTo(80, 4);
    expect(createCallArg.data.painScore).toBeCloseTo(64, 4);
    expect(createCallArg.data.timestamp.toISOString()).toBe(timestamp);

    expect(prismaMock.__mockTx.patientAlert.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.__mockTx.patientAlert.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.__mockTx.patientAlert.updateMany).not.toHaveBeenCalled();

    expect(writePatientEmotionPointMock).toHaveBeenCalledTimes(1);
    expect(writePatientEmotionPointMock).toHaveBeenCalledWith(
      'patient-1',
      expect.objectContaining({
        anger: 90,
        fear: 80,
        sadness: 70,
        distressScore: expect.any(Number),
        painScore: expect.any(Number),
      }),
    );
  });
});
