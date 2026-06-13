/// <reference types="jest" />

import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Express } from 'express';

jest.mock('../lib/prisma', () => {
  const mockTx = {
    emotionReading: {
      create: jest.fn().mockResolvedValue({
        id: 'reading-blackbox-1',
        timestamp: new Date('2026-04-18T00:00:00.000Z'),
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
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: 'DOCTOR' }),
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

type PatientRecord = {
  id: string;
  isArchived: boolean;
  doctorId: string | null;
};

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

type AlertType = 'DISTRESS' | 'PAIN';
type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

type PrismaMock = {
  patient: {
    findUnique: jest.Mock<Promise<PatientRecord | null>, [unknown]>;
  };
  user: {
    findUnique: jest.Mock<Promise<{ role: string } | null>, [unknown]>;
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

const jwtSecretForTests = 'blackbox_test_secret';
const defaultPatientId = 'patient-1';
const defaultDoctorId = 'doctor-123';

const signDoctorToken = () => jwt.sign({ sub: defaultDoctorId, role: 'DOCTOR' }, jwtSecretForTests);
const signAdminToken = () => jwt.sign({ sub: 'admin-1', role: 'ADMIN' }, jwtSecretForTests);

const prismaMock = prisma as unknown as PrismaMock;
const writePatientEmotionPointMock = writePatientEmotionPoint as jest.MockedFunction<typeof writePatientEmotionPoint>;

let app: Express;

const defaultPatientRecord: PatientRecord = {
  id: defaultPatientId,
  isArchived: false,
  doctorId: defaultDoctorId,
};

const postReading = async (payload: Record<string, unknown>, token: string | null = signDoctorToken()) => {
  const req = request(app).post(`/api/doctor/patients/${defaultPatientId}/readings`).send(payload);
  if (!token) {
    return req;
  }
  return req.set('Authorization', `Bearer ${token}`);
};

const getLastEmotionCreateData = (): EmotionReadingCreateData => {
  const calls = prismaMock.__mockTx.emotionReading.create.mock.calls;
  if (calls.length === 0) {
    throw new Error('Expected emotionReading.create to be called at least once');
  }
  const [arg] = calls[calls.length - 1] as [{ data: EmotionReadingCreateData }];
  return arg.data;
};

const getLastAlertCreate = (): { type: AlertType; severity: AlertSeverity; message: string } => {
  const calls = prismaMock.__mockTx.patientAlert.create.mock.calls;
  if (calls.length === 0) {
    throw new Error('Expected patientAlert.create to be called at least once');
  }
  const [arg] = calls[calls.length - 1] as [{ data: { type: AlertType; severity: AlertSeverity; message: string } }];
  return arg.data;
};

const getResolveCallsForType = (type: AlertType) => {
  return prismaMock.__mockTx.patientAlert.updateMany.mock.calls
    .map((call) => call[0] as { where: { type: AlertType } })
    .filter((arg) => arg.where.type === type);
};

beforeAll(async () => {
  process.env.JWT_SECRET = jwtSecretForTests;
  const appModule = await import('../app');
  app = appModule.default;
});

beforeEach(() => {
  jest.clearAllMocks();

  prismaMock.patient.findUnique.mockResolvedValue(defaultPatientRecord);
  prismaMock.user.findUnique.mockResolvedValue({ role: 'DOCTOR' });

  prismaMock.__mockTx.emotionReading.create.mockImplementation(async ({ data }: { data: EmotionReadingCreateData }) => ({
    id: 'reading-blackbox-1',
    timestamp: data.timestamp,
  }));
  prismaMock.__mockTx.patientAlert.findFirst.mockResolvedValue(null);
  prismaMock.__mockTx.patientAlert.update.mockResolvedValue({});
  prismaMock.__mockTx.patientAlert.create.mockResolvedValue({});
  prismaMock.__mockTx.patientAlert.updateMany.mockResolvedValue({ count: 1 });

  writePatientEmotionPointMock.mockResolvedValue(true);
});

describe('Black-box ECP for POST /api/doctor/patients/:patientId/readings', () => {
  it('ECP-A1: missing auth header -> 401', async () => {
    const res = await postReading({ probabilities: { Anger: 0.8 } }, null);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing authorization header' });
  });

  it('ECP-A2: invalid auth format -> 401', async () => {
    const res = await request(app)
      .post(`/api/doctor/patients/${defaultPatientId}/readings`)
      .set('Authorization', 'Token abc')
      .send({ probabilities: { Anger: 0.8 } });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid authorization format' });
  });

  it('ECP-A3: invalid JWT -> 401', async () => {
    const res = await request(app)
      .post(`/api/doctor/patients/${defaultPatientId}/readings`)
      .set('Authorization', 'Bearer not-a-valid-jwt')
      .send({ probabilities: { Anger: 0.8 } });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid token' });
  });

  it('ECP-A4: authenticated non-doctor role -> 403', async () => {
    const res = await postReading({ probabilities: { Anger: 0.8 } }, signAdminToken());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('ECP-A5: authenticated doctor role -> 201', async () => {
    const res = await postReading({ probabilities: { Anger: 0.8 } }, signDoctorToken());

    expect(res.status).toBe(201);
  });

  it('ECP-B1: patient missing -> 404', async () => {
    prismaMock.patient.findUnique.mockResolvedValueOnce(null);

    const res = await postReading({ probabilities: { Anger: 0.8 } });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Patient not found' });
  });

  it('ECP-B2: archived patient -> 404', async () => {
    prismaMock.patient.findUnique.mockResolvedValueOnce({
      id: defaultPatientId,
      isArchived: true,
      doctorId: defaultDoctorId,
    });

    const res = await postReading({ probabilities: { Anger: 0.8 } });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Patient not found' });
  });

  it('ECP-B3: patient assigned to another doctor -> 403', async () => {
    prismaMock.patient.findUnique.mockResolvedValueOnce({
      id: defaultPatientId,
      isArchived: false,
      doctorId: 'doctor-other',
    });

    const res = await postReading({ probabilities: { Anger: 0.8 } });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'You can only push readings for your assigned patients' });
  });

  it('ECP-B4: patient valid -> 201', async () => {
    prismaMock.patient.findUnique.mockResolvedValueOnce(defaultPatientRecord);

    const res = await postReading({ probabilities: { Anger: 0.8 } });

    expect(res.status).toBe(201);
  });

  it('ECP-C1: payload in probabilities object -> 201', async () => {
    const res = await postReading({
      probabilities: {
        Anger: 0.4,
        Fear: 0.5,
        Sadness: 0.6,
      },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ readingId: 'reading-blackbox-1', influxWritten: true });

    const createData = getLastEmotionCreateData();
    expect(createData.anger).toBeCloseTo(40, 4);
    expect(createData.fear).toBeCloseTo(50, 4);
    expect(createData.sadness).toBeCloseTo(60, 4);
  });

  it('ECP-C2: payload in top-level body -> 201', async () => {
    const res = await postReading({
      anger: 15,
      fear: 25,
      sadness: 35,
    });

    expect(res.status).toBe(201);
    const createData = getLastEmotionCreateData();
    expect(createData.anger).toBe(15);
    expect(createData.fear).toBe(25);
    expect(createData.sadness).toBe(35);
  });

  it('ECP-C3: unknown emotions only -> 400', async () => {
    const res = await postReading({ probabilities: { Joy: 0.9, Calmness: 0.8 } });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Reading payload does not contain emotion values' });
  });

  it('ECP-C4: recognized emotions but non-numeric values only -> 400', async () => {
    const res = await postReading({
      probabilities: {
        Anger: 'abc',
        Fear: null,
        Sadness: 'not-a-number',
      },
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Reading payload does not contain emotion values' });
  });

  it('ECP-D1: invalid timestamp -> 400', async () => {
    const res = await postReading({
      probabilities: { Anger: 0.8 },
      timestamp: 'invalid-date',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid timestamp' });
  });

  it('ECP-D2: missing timestamp uses server time -> 201', async () => {
    const res = await postReading({ probabilities: { Anger: 0.8 } });

    expect(res.status).toBe(201);
    const createData = getLastEmotionCreateData();
    expect(createData.timestamp).toBeInstanceOf(Date);
  });

  it('ECP-E1: values are clamped to [0, 100] -> 201', async () => {
    const res = await postReading({
      probabilities: {
        Anger: 150,
        Fear: -10,
        Sadness: 20,
      },
    });

    expect(res.status).toBe(201);
    const createData = getLastEmotionCreateData();
    expect(createData.anger).toBe(100);
    expect(createData.fear).toBe(0);
    expect(createData.sadness).toBe(20);
  });

  it('ECP-F1: no alert is created when both distress and pain are below threshold', async () => {
    const res = await postReading({
      probabilities: {
        Anger: 30,
        Fear: 30,
        Sadness: 30,
      },
    });

    expect(res.status).toBe(201);
    expect(prismaMock.__mockTx.patientAlert.create).not.toHaveBeenCalled();
    expect(prismaMock.__mockTx.patientAlert.update).not.toHaveBeenCalled();
  });

  it('ECP-F2: distress-dominant high score creates DISTRESS alert', async () => {
    const res = await postReading({
      probabilities: {
        Anger: 90,
        Fear: 80,
        Sadness: 70,
        Disgust: 10,
      },
      timestamp: '2026-04-18T10:00:00.000Z',
    });

    expect(res.status).toBe(201);
    const alert = getLastAlertCreate();
    expect(alert.type).toBe('DISTRESS');
    expect(alert.severity).toBe('MEDIUM');
    expect(alert.message.toLowerCase()).toContain('distress');
  });

  it('ECP-F3: pain-dominant high score creates PAIN alert', async () => {
    const res = await postReading({
      probabilities: {
        Anger: 0,
        Fear: 100,
        Sadness: 100,
        Disgust: 100,
      },
      timestamp: '2026-04-18T10:01:00.000Z',
    });

    expect(res.status).toBe(201);
    const alert = getLastAlertCreate();
    expect(alert.type).toBe('PAIN');
    expect(alert.severity).toBe('HIGH');
    expect(alert.message.toLowerCase()).toContain('pain');
  });

  it('ECP-F4: existing active alert gets updated instead of created', async () => {
    prismaMock.__mockTx.patientAlert.findFirst.mockResolvedValueOnce({ id: 'active-alert-1' });

    const res = await postReading({
      probabilities: {
        Anger: 90,
        Fear: 80,
        Sadness: 70,
      },
      timestamp: '2026-04-18T10:02:00.000Z',
    });

    expect(res.status).toBe(201);
    expect(prismaMock.__mockTx.patientAlert.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.__mockTx.patientAlert.create).not.toHaveBeenCalled();
  });

  it('ECP-F5: low scores trigger resolve logic for active alerts', async () => {
    const res = await postReading({
      probabilities: {
        Anger: 10,
        Fear: 10,
        Sadness: 10,
      },
      timestamp: '2026-04-18T10:03:00.000Z',
    });

    expect(res.status).toBe(201);

    const distressResolveCalls = getResolveCallsForType('DISTRESS');
    const painResolveCalls = getResolveCallsForType('PAIN');
    expect(distressResolveCalls.length).toBeGreaterThan(0);
    expect(painResolveCalls.length).toBeGreaterThan(0);
  });
});

describe('Black-box BVA for POST /api/doctor/patients/:patientId/readings', () => {
  it.each([
    { label: '-1', value: -1, expectedStatus: 400 },
    { label: '0', value: 0, expectedStatus: 400 },
    { label: '+1', value: 1, expectedStatus: 201 },
  ])('BVA-1 hasData boundary around 0 (%s)', async ({ value, expectedStatus }) => {
    const res = await postReading({ probabilities: { Anger: value } });
    expect(res.status).toBe(expectedStatus);
  });

  it.each([
    { label: '0.99', value: 0.99, expectedNormalized: 99 },
    { label: '1.00', value: 1, expectedNormalized: 100 },
    { label: '1.01', value: 1.01, expectedNormalized: 1.01 },
  ])('BVA-2 scaling boundary at 1 (%s)', async ({ value, expectedNormalized }) => {
    const res = await postReading({ probabilities: { Anger: value } });
    expect(res.status).toBe(201);
    const createData = getLastEmotionCreateData();
    expect(createData.anger).toBeCloseTo(expectedNormalized, 6);
  });

  it.each([
    { label: '99', value: 99, expectedNormalized: 99 },
    { label: '100', value: 100, expectedNormalized: 100 },
    { label: '101', value: 101, expectedNormalized: 100 },
  ])('BVA-3 clamp boundary at 100 (%s)', async ({ value, expectedNormalized }) => {
    const res = await postReading({ probabilities: { Anger: value } });
    expect(res.status).toBe(201);
    const createData = getLastEmotionCreateData();
    expect(createData.anger).toBeCloseTo(expectedNormalized, 6);
  });

  it.each([
    { label: '69', value: 69, expectAlert: false },
    { label: '70', value: 70, expectAlert: true, expectedSeverity: 'LOW' as AlertSeverity },
    { label: '71', value: 71, expectAlert: true, expectedSeverity: 'LOW' as AlertSeverity },
  ])('BVA-4 distress alert threshold 70 +-1 (%s)', async ({ value, expectAlert, expectedSeverity }) => {
    const res = await postReading({ probabilities: { Anger: value, Fear: value, Sadness: value } });
    expect(res.status).toBe(201);

    if (!expectAlert) {
      expect(prismaMock.__mockTx.patientAlert.create).not.toHaveBeenCalled();
      return;
    }

    expect(prismaMock.__mockTx.patientAlert.create).toHaveBeenCalledTimes(1);
    const alert = getLastAlertCreate();
    expect(alert.type).toBe('DISTRESS');
    expect(alert.severity).toBe(expectedSeverity);
  });

  it.each([
    { label: '71', value: 71, expectedSeverity: 'LOW' as AlertSeverity },
    { label: '72', value: 72, expectedSeverity: 'MEDIUM' as AlertSeverity },
    { label: '73', value: 73, expectedSeverity: 'MEDIUM' as AlertSeverity },
  ])('BVA-5 severity threshold 72 +-1 (%s)', async ({ value, expectedSeverity }) => {
    const res = await postReading({ probabilities: { Anger: value, Fear: value, Sadness: value } });
    expect(res.status).toBe(201);
    const alert = getLastAlertCreate();
    expect(alert.severity).toBe(expectedSeverity);
  });

  it.each([
    { label: '84', value: 84, expectedSeverity: 'MEDIUM' as AlertSeverity },
    { label: '85', value: 85, expectedSeverity: 'HIGH' as AlertSeverity },
    { label: '86', value: 86, expectedSeverity: 'HIGH' as AlertSeverity },
  ])('BVA-6 severity threshold 85 +-1 (%s)', async ({ value, expectedSeverity }) => {
    const res = await postReading({ probabilities: { Anger: value, Fear: value, Sadness: value } });
    expect(res.status).toBe(201);
    const alert = getLastAlertCreate();
    expect(alert.severity).toBe(expectedSeverity);
  });

  it.each([
    { label: '54', value: 54, expectDistressResolve: true },
    { label: '55', value: 55, expectDistressResolve: false },
    { label: '56', value: 56, expectDistressResolve: false },
  ])('BVA-7 distress resolve threshold 55 +-1 (%s)', async ({ value, expectDistressResolve }) => {
    const res = await postReading({ probabilities: { Anger: value, Fear: value, Sadness: value } });
    expect(res.status).toBe(201);

    const distressResolveCalls = getResolveCallsForType('DISTRESS');
    if (expectDistressResolve) {
      expect(distressResolveCalls.length).toBeGreaterThan(0);
    } else {
      expect(distressResolveCalls.length).toBe(0);
    }
  });

  it.each([
    { label: '54', sadness: 22.5, expectPainResolve: true },
    { label: '55', sadness: 25, expectPainResolve: false },
    { label: '56', sadness: 27.5, expectPainResolve: false },
  ])('BVA-8 pain resolve threshold 55 +-1 (%s)', async ({ sadness, expectPainResolve }) => {
    const res = await postReading({
      probabilities: {
        Anger: 0,
        Fear: 100,
        Sadness: sadness,
        Disgust: 0,
      },
    });
    expect(res.status).toBe(201);

    const painResolveCalls = getResolveCallsForType('PAIN');
    if (expectPainResolve) {
      expect(painResolveCalls.length).toBeGreaterThan(0);
    } else {
      expect(painResolveCalls.length).toBe(0);
    }
  });
});
