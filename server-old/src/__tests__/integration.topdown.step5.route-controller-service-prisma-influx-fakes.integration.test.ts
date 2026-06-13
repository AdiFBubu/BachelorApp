/// <reference types="jest" />

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { execSync } from 'child_process';
import path from 'path';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

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

jest.setTimeout(240000);

const jwtSecretForTests = 'depthfirst_step5_container_secret';
const doctorId = 'doctor-step5-container';
const wardId = 'ward-step5-container';
const bedId = 'bed-step5-container';
const patientId = 'patient-step5-container';

const influxAdminToken = 'step5_admin_token_for_tests';
const influxOrg = 'step5_org';
const influxBucket = 'step5_bucket';

const signDoctorToken = () => jwt.sign({ sub: doctorId, role: 'DOCTOR' }, jwtSecretForTests);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForInfluxHealth = async (influxUrl: string) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const res = await fetch(`${influxUrl}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // Retry until the container is ready.
    }

    await wait(1000);
  }

  throw new Error('InfluxDB container did not become healthy in time');
};

describeContainers('Depth-first Step 5: Time-series/Telemetry (Postgres + Influx containers)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let postgresContainer: StartedTestContainer;
  let influxContainer: StartedTestContainer;

  beforeAll(async () => {
    postgresContainer = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_DB: 'neuro_guardian_step5',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'postgres',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/i))
      .start();

    influxContainer = await new GenericContainer('influxdb:2.7-alpine')
      .withEnvironment({
        DOCKER_INFLUXDB_INIT_MODE: 'setup',
        DOCKER_INFLUXDB_INIT_USERNAME: 'admin',
        DOCKER_INFLUXDB_INIT_PASSWORD: 'admin-password-123',
        DOCKER_INFLUXDB_INIT_ORG: influxOrg,
        DOCKER_INFLUXDB_INIT_BUCKET: influxBucket,
        DOCKER_INFLUXDB_INIT_ADMIN_TOKEN: influxAdminToken,
      })
      .withExposedPorts(8086)
      .withWaitStrategy(Wait.forLogMessage(/Listening on HTTP/i))
      .start();

    const databaseUrl = `postgresql://postgres:postgres@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/neuro_guardian_step5?schema=public`;
    const influxUrl = `http://${influxContainer.getHost()}:${influxContainer.getMappedPort(8086)}`;

    await waitForInfluxHealth(influxUrl);

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = jwtSecretForTests;

    process.env.INFLUX_URL = influxUrl;
    process.env.INFLUX_TOKEN = influxAdminToken;
    process.env.INFLUX_ORG = influxOrg;
    process.env.INFLUX_BUCKET = influxBucket;

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
        email: 'doctor.step5@example.com',
        passwordHash: 'hash-step5',
        role: 'DOCTOR',
      },
      create: {
        id: doctorId,
        email: 'doctor.step5@example.com',
        passwordHash: 'hash-step5',
        role: 'DOCTOR',
      },
    });

    await prisma.ward.upsert({
      where: { id: wardId },
      update: { name: 'Ward Step 5' },
      create: {
        id: wardId,
        name: 'Ward Step 5',
      },
    });

    await prisma.bed.upsert({
      where: { id: bedId },
      update: {
        wardId,
        label: 'B-105',
        cameraStatus: 'ONLINE',
        isOccupied: true,
      },
      create: {
        id: bedId,
        wardId,
        label: 'B-105',
        cameraStatus: 'ONLINE',
        isOccupied: true,
      },
    });

    await prisma.patient.upsert({
      where: { id: patientId },
      update: {
        firstName: 'Step',
        lastName: 'Five',
        nationalId: '9000000000105',
        diagnosis: 'Container telemetry test',
        wardId,
        bedId,
        doctorId,
        isArchived: false,
      },
      create: {
        id: patientId,
        firstName: 'Step',
        lastName: 'Five',
        nationalId: '9000000000105',
        diagnosis: 'Container telemetry test',
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
      await prisma.user.deleteMany({ where: { id: doctorId } });
      await prisma.$disconnect();
    }

    if (influxContainer) {
      await influxContainer.stop();
    }

    if (postgresContainer) {
      await postgresContainer.stop();
    }
  });

  it('validates end-to-end telemetry flow with real Influx writes and reads', async () => {
    const token = signDoctorToken();

    const postRes = await request(app)
      .post(`/api/doctor/patients/${patientId}/readings`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        probabilities: {
          Anger: 0.9,
          Fear: 0.8,
          Sadness: 0.7,
          Disgust: 0.1,
        },
        timestamp: '2026-04-18T14:00:00.000Z',
      });

    expect(postRes.status).toBe(201);
    expect(postRes.body).toMatchObject({
      readingId: expect.any(String),
      influxWritten: true,
    });

    const detailRes = await request(app)
      .get(`/api/doctor/patients/${patientId}/detail?window=24h`)
      .set('Authorization', `Bearer ${token}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.monitoring.source).toBe('influx');
    expect(detailRes.body.monitoring.influxConfigured).toBe(true);
    expect(detailRes.body.monitoring.timeline.length).toBeGreaterThan(0);

    const latest = detailRes.body.monitoring.timeline[detailRes.body.monitoring.timeline.length - 1];
    expect(Number(latest.anger)).toBeCloseTo(90, 4);
    expect(Number(latest.distressScore)).toBeCloseTo(80, 4);
    expect(latest.source).toBe('influx');
  });
});
