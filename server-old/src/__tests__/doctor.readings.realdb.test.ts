/// <reference types="jest" />

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { execSync } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';
import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const runDbIntegration = process.env.RUN_DB_INTEGRATION === '1';
const describeDb = runDbIntegration ? describe : describe.skip;

jest.setTimeout(180000);

const jwtSecretForTests = 'real_db_integration_secret';
const doctorId = 'doctor-real-1';
const adminId = 'admin-real-1';
const wardId = 'ward-real-1';
const bedId = 'bed-real-1';
const patientId = 'patient-real-1';

const toSchemaDatabaseUrl = (baseDatabaseUrl: string, schemaName: string) => {
  const parsed = new URL(baseDatabaseUrl);
  parsed.searchParams.set('schema', schemaName);
  return parsed.toString();
};

const signDoctorToken = () => jwt.sign({ sub: doctorId, role: 'DOCTOR' }, jwtSecretForTests);
const signAdminToken = () => jwt.sign({ sub: adminId, role: 'ADMIN' }, jwtSecretForTests);

describeDb('POST /api/doctor/patients/:patientId/readings (real DB flow)', () => {
  let container: StartedTestContainer;
  let app: Express;
  let prisma: PrismaClient;
  let usingContainer = false;

  beforeAll(async () => {
    let databaseUrl = '';
    const localDatabaseUrl = process.env.DATABASE_URL;

    if (localDatabaseUrl) {
      // Isolate integration writes in a dedicated schema when a local DB already exists.
      databaseUrl = toSchemaDatabaseUrl(localDatabaseUrl, 'integration_test');
    } else {
      usingContainer = true;
      container = await new GenericContainer('postgres:16-alpine')
        .withEnvironment({
          POSTGRES_DB: 'neuro_guardian_test',
          POSTGRES_USER: 'postgres',
          POSTGRES_PASSWORD: 'postgres',
        })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/i))
        .start();

      databaseUrl = `postgresql://postgres:postgres@${container.getHost()}:${container.getMappedPort(5432)}/neuro_guardian_test?schema=public`;
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = jwtSecretForTests;

    // Keep Influx disabled in integration tests to avoid external dependencies.
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
        email: 'doctor.real@example.com',
        passwordHash: 'hash-doctor',
        role: 'DOCTOR',
      },
      create: {
        id: doctorId,
        email: 'doctor.real@example.com',
        passwordHash: 'hash-doctor',
        role: 'DOCTOR',
      },
    });

    await prisma.user.upsert({
      where: { id: adminId },
      update: {
        email: 'admin.real@example.com',
        passwordHash: 'hash-admin',
        role: 'ADMIN',
      },
      create: {
        id: adminId,
        email: 'admin.real@example.com',
        passwordHash: 'hash-admin',
        role: 'ADMIN',
      },
    });

    await prisma.ward.upsert({
      where: { id: wardId },
      update: {
        name: 'Ward Real Integration',
      },
      create: {
        id: wardId,
        name: 'Ward Real Integration',
      },
    });

    await prisma.bed.upsert({
      where: { id: bedId },
      update: {
        wardId,
        label: 'B-101',
        cameraStatus: 'ONLINE',
        isOccupied: true,
      },
      create: {
        id: bedId,
        wardId,
        label: 'B-101',
        cameraStatus: 'ONLINE',
        isOccupied: true,
      },
    });

    await prisma.patient.upsert({
      where: { id: patientId },
      update: {
        firstName: 'Real',
        lastName: 'Patient',
        nationalId: '9900000000001',
        diagnosis: 'Integration test case',
        wardId,
        bedId,
        doctorId,
        isArchived: false,
      },
      create: {
        id: patientId,
        firstName: 'Real',
        lastName: 'Patient',
        nationalId: '9900000000001',
        diagnosis: 'Integration test case',
        wardId,
        bedId,
        doctorId,
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
      await prisma.user.deleteMany({ where: { id: { in: [doctorId, adminId] } } });
      await prisma.$disconnect();
    }

    if (usingContainer && container) {
      await container.stop();
    }
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app)
      .post(`/api/doctor/patients/${patientId}/readings`)
      .send({ probabilities: { Anger: 0.8 } });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing authorization header' });
  });

  it('returns 403 for authenticated ADMIN role', async () => {
    const token = signAdminToken();

    const res = await request(app)
      .post(`/api/doctor/patients/${patientId}/readings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ probabilities: { Anger: 0.9, Fear: 0.8, Sadness: 0.7 } });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('persists reading + creates active alert through full route/middleware/service stack', async () => {
    const token = signDoctorToken();
    const timestamp = '2026-04-18T10:00:00.000Z';

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
        timestamp,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      readingId: expect.any(String),
      influxWritten: false,
    });

    const reading = await prisma.emotionReading.findUnique({ where: { id: res.body.readingId } });
    expect(reading).not.toBeNull();

    if (!reading) {
      throw new Error('Reading was not stored in database');
    }

    expect(reading.patientId).toBe(patientId);
    expect(reading.anger).toBeCloseTo(90, 4);
    expect(reading.fear).toBeCloseTo(80, 4);
    expect(reading.sadness).toBeCloseTo(70, 4);
    expect(reading.disgust).toBeCloseTo(10, 4);
    expect(reading.distressScore).toBeCloseTo(80, 4);
    expect(reading.painScore).toBeCloseTo(65.5, 4);
    expect(reading.timestamp.toISOString()).toBe(timestamp);

    const alert = await prisma.patientAlert.findFirst({
      where: {
        patientId,
        active: true,
        type: 'DISTRESS',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(alert).not.toBeNull();
    expect(alert?.severity).toBe('MEDIUM');
    expect(alert?.message).toContain('distress');
  });
});
