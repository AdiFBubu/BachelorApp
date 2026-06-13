/// <reference types="jest" />

import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';

jest.mock('../lib/prisma', () => {
  const mockTx = {
    emotionReading: {
      create: jest.fn().mockResolvedValue({
        id: 'reading-step3',
        timestamp: new Date('2026-04-18T12:00:00.000Z'),
      }),
    },
    patientAlert: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  return {
    __esModule: true,
    default: {
      patient: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: typeof mockTx) => Promise<unknown> | unknown) => cb(mockTx)),
      __mockTx: mockTx,
    },
  };
});

jest.mock('../lib/influx', () => ({
  __esModule: true,
  writePatientEmotionPoint: jest.fn().mockResolvedValue(true),
  readPatientEmotionTimeline: jest.fn().mockResolvedValue([]),
  isInfluxConfigured: jest.fn().mockReturnValue(false),
}));

import prisma from '../lib/prisma';
import { writePatientEmotionPoint } from '../lib/influx';

type EmotionReadingCreateData = {
  patientId: string;
  timestamp: Date;
  anger: number;
  contempt: number;
  disgust: number;
  fear: number;
  happiness: number;
  sadness: number;
  surprise: number;
  distressScore: number;
  painScore: number;
};

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

const prismaMock = prisma as unknown as PrismaMock;
const writePatientEmotionPointMock = writePatientEmotionPoint as jest.MockedFunction<typeof writePatientEmotionPoint>;

const jwtSecretForTests = 'topdown_step3_secret';
let app: Express;

describe('Depth-first Step 3: Business Logic (real service, Prisma+Influx mocked)', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecretForTests;
    const appModule = await import('../app');
    app = appModule.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    prismaMock.patient.findUnique.mockResolvedValue({
      id: 'patient-step3',
      isArchived: false,
      doctorId: 'doctor-step3',
    });

    prismaMock.__mockTx.emotionReading.create.mockImplementation(async ({ data }: { data: EmotionReadingCreateData }) => ({
      id: 'reading-step3',
      timestamp: data.timestamp,
    }));
    prismaMock.__mockTx.patientAlert.findFirst.mockResolvedValue(null);
    prismaMock.__mockTx.patientAlert.update.mockResolvedValue({});
    prismaMock.__mockTx.patientAlert.create.mockResolvedValue({});
    prismaMock.__mockTx.patientAlert.updateMany.mockResolvedValue({ count: 1 });

    writePatientEmotionPointMock.mockResolvedValue(true);
  });

  it('validates score/alert logic via real service while infra boundaries are mocked', async () => {
    const token = jwt.sign({ sub: 'doctor-step3', role: 'DOCTOR' }, jwtSecretForTests);

    const res = await request(app)
      .post('/api/doctor/patients/patient-step3/readings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        probabilities: {
          Anger: 0.9,
          Fear: 0.8,
          Sadness: 0.7,
          Disgust: 0.1,
        },
        timestamp: '2026-04-18T12:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      readingId: 'reading-step3',
      influxWritten: true,
    });

    expect(prismaMock.patient.findUnique).toHaveBeenCalledWith({
      where: { id: 'patient-step3' },
      select: { id: true, isArchived: true, doctorId: true },
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.__mockTx.emotionReading.create).toHaveBeenCalledTimes(1);

    const createCallArg = prismaMock.__mockTx.emotionReading.create.mock.calls[0][0];
    expect(createCallArg.data.anger).toBe(90);
    expect(createCallArg.data.fear).toBe(80);
    expect(createCallArg.data.sadness).toBe(70);
    expect(createCallArg.data.distressScore).toBeCloseTo(80, 4);
    expect(createCallArg.data.painScore).toBeCloseTo(65.5, 4);

    expect(prismaMock.__mockTx.patientAlert.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.__mockTx.patientAlert.updateMany).not.toHaveBeenCalled();

    expect(writePatientEmotionPointMock).toHaveBeenCalledTimes(1);
    expect(writePatientEmotionPointMock).toHaveBeenCalledWith(
      'patient-step3',
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
