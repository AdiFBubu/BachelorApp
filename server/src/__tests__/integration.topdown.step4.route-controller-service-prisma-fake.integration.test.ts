/// <reference types="jest" />

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { execSync } from 'child_process';
import path from 'path';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

jest.mock('../lib/influx', () => ({
  __esModule: true,
  writePatientEmotionPoint: jest.fn().mockResolvedValue(false),
  readPatientEmotionTimeline: jest.fn().mockResolvedValue([]),
  isInfluxConfigured: jest.fn().mockReturnValue(false),
}));

const isContainerRuntimeAvailable = () => {
  try {
    execSync('docker info --format "{{.ServerVersion}}"', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const runContainerIntegration = process.env.RUN_CONTAINER_INTEGRATION === '1';
const hasContainerRuntime = isContainerRuntimeAvailable();
const describeContainers = runContainerIntegration && hasContainerRuntime ? describe : describe.skip;

jest.setTimeout(180000);

const jwtSecretForTests = 'depthfirst_step4_container_secret';
const doctorId = 'doctor-step4-container';
const wardId = 'ward-step4-container';
const bedId = 'bed-step4-container';
const patientId = 'patient-step4-container';

const signDoctorToken = () => jwt.sign({ sub: doctorId, role: 'DOCTOR' }, jwtSecretForTests);

describeContainers('Depth-first Step 4: Data Access (Postgres container + Influx mock)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let postgresContainer: StartedTestContainer;

  beforeAll(async () => {
    postgresContainer = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_DB: 'neuro_guardian_step4',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'postgres',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/i))
      .start();

    const databaseUrl = `postgresql://postgres:postgres@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/neuro_guardian_step4?schema=public`;

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = jwtSecretForTests;

    process.env.INFLUX_URL = '';
    process.env.INFLUX_TOKEN = '';
    process.env.INFLUX_ORG = '';
    process.env.INFLUX_BUCKET = '';

    const serverRoot = path.resolve(__dirname, '../../');
    execSync('npx prisma migrate deploy', {
      cwd: serverRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: 'inherit',
    });

    const appModule = await import('../app');
    app = appModule.default;

    const prismaModule = await import('../lib/prisma');
    prisma = prismaModule.default;

    await prisma.user.upsert({
      where: { id: doctorId },
      update: {
        email: 'doctor.step4@example.com',
        passwordHash: 'hash-step4',
        role: 'DOCTOR',
      },
      create: {
        id: doctorId,
        email: 'doctor.step4@example.com',
        passwordHash: 'hash-step4',
        role: 'DOCTOR',
      },
    });

    await prisma.ward.upsert({
      where: { id: wardId },
      update: { name: 'Ward Step 4' },
      create: {
        id: wardId,
        name: 'Ward Step 4',
      },
    });

    await prisma.bed.upsert({
      where: { id: bedId },
      update: {
        wardId,
        label: 'B-104',
        cameraStatus: 'ONLINE',
        isOccupied: true,
      },
      create: {
        id: bedId,
        wardId,
        label: 'B-104',
        cameraStatus: 'ONLINE',
        isOccupied: true,
      },
    });

    await prisma.patient.upsert({
      where: { id: patientId },
      update: {
        firstName: 'Step',
        lastName: 'Four',
        nationalId: '9000000000104',
        diagnosis: 'Container data access test',
        bed: { connect: { id: bedId } },
        doctor: { connect: { id: doctorId } },
        isArchived: false,
      },
      create: {
        id: patientId,
        firstName: 'Step',
        lastName: 'Four',
        nationalId: '9000000000104',
        diagnosis: 'Container data access test',
        bed: { connect: { id: bedId } },
        doctor: { connect: { id: doctorId } },
      },
    });
  });

  beforeEach(async () => {
    await prisma.patientAlert.deleteMany({ where: { patientId } });
    await prisma.emotionReading.deleteMany({ where: { patientId } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.patientAlert.deleteMany({ where: { patientId } });
      await prisma.emotionReading.deleteMany({ where: { patientId } });
      await prisma.patient.deleteMany({ where: { id: patientId } });
      await prisma.bed.deleteMany({ where: { id: bedId } });
      await prisma.ward.deleteMany({ where: { id: wardId } });
      await prisma.user.deleteMany({ where: { id: doctorId } });
      await prisma.$disconnect();
    }

    if (postgresContainer) {
      await postgresContainer.stop();
    }
  });

  it('persists relational data to Postgres container while telemetry remains mocked', async () => {
    const token = signDoctorToken();

    const res = await request(app)
      .post(`/api/doctor/patients/${patientId}/readings`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        probabilities: {
          Anger: 0.9,
          Fear: 0.8,
          Sadness: 0.7,
          Disgust: 0.1,
        },
        timestamp: '2026-04-18T13:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      readingId: expect.any(String),
      influxWritten: false,
    });

    const reading = await prisma.emotionReading.findUnique({
      where: { id: res.body.readingId },
    });

    expect(reading).not.toBeNull();
    if (!reading) {
      throw new Error('Reading was not stored in Postgres container');
    }

    expect(reading.patientId).toBe(patientId);
    expect(reading.anger).toBeCloseTo(90, 4);
    expect(reading.fear).toBeCloseTo(80, 4);
    expect(reading.sadness).toBeCloseTo(70, 4);
    expect(reading.distressScore).toBeCloseTo(80, 4);
    expect(reading.painScore).toBeCloseTo(65.5, 4);

    const alert = await prisma.patientAlert.findFirst({
      where: {
        patientId,
        active: true,
        type: 'DISTRESS',
      },
    });

    expect(alert).not.toBeNull();
    expect(alert?.severity).toBe('MEDIUM');
  });
});
