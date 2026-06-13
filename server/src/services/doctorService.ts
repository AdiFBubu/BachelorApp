import { AlertSeverity } from '@prisma/client';
import prisma from '../lib/prisma';
import { TimelineWindow, writePatientEmotionPoint } from '../lib/influx';
import { ensureHospitalSeed } from './hospitalSetup';
import { getMonitoringSnapshot } from './monitoringService';

const timelineWindows: TimelineWindow[] = ['24h', '7d'];
const emotionNames = ['Anger', 'Contempt', 'Disgust', 'Fear', 'Happiness', 'Sadness', 'Surprise'] as const;

type PatientWithRelations = {
  id: string;
  firstName: string;
  lastName: string;
  nationalId: string;
  diagnosis: string | null;
  medicalHistory: string | null;
  checkedInAt: Date;
  bed: { id: string; label: string; cameraStatus: string; isOccupied: boolean; ward?: { id: string; name: string } } | null;
  doctorId: string | null;
};

type EmotionBody = {
  probabilities?: Record<string, unknown>;
  timestamp?: string;
  [key: string]: unknown;
};

export class DoctorServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'DoctorServiceError';
    this.statusCode = statusCode;
  }
}

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const normalizeEmotionValue = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  const scaled = value <= 1 ? value * 100 : value;
  return clamp(scaled, 0, 100);
};

const parseSeverity = (score: number): AlertSeverity => {
  if (score >= 85) return 'HIGH';
  if (score >= 72) return 'MEDIUM';
  return 'LOW';
};

const parseWindow = (value: unknown): TimelineWindow => {
  return value === '7d' ? '7d' : '24h';
};

const findEmotion = (source: Record<string, unknown>, emotion: string) => {
  for (const [key, value] of Object.entries(source)) {
    if (key.toLowerCase() === emotion.toLowerCase()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  return undefined;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as Record<string, unknown>;
};

const requireDoctorId = (doctorId: string | undefined): string => {
  if (!doctorId) {
    throw new DoctorServiceError(401, 'Unauthorized');
  }

  return doctorId;
};

const requirePatientId = (patientId: string | undefined): string => {
  if (!patientId) {
    throw new DoctorServiceError(400, 'Missing patientId');
  }

  return patientId;
};

const serializePatient = (patient: PatientWithRelations) => ({
  id: patient.id,
  firstName: patient.firstName,
  lastName: patient.lastName,
  fullName: `${patient.firstName} ${patient.lastName}`,
  nationalId: patient.nationalId,
  diagnosis: patient.diagnosis,
  medicalHistory: patient.medicalHistory,
  checkedInAt: patient.checkedInAt,
  ward: patient.bed ? patient.bed.ward : null,
  bed: patient.bed,
  doctorId: patient.doctorId,
});

export async function getAvailablePatientsService() {
  await ensureHospitalSeed();

  const patients = await prisma.patient.findMany({
    where: {
      isArchived: false,
      doctorId: null,
    },
    include: {
      bed: { include: { ward: { select: { id: true, name: true } } } },
    },
    orderBy: { checkedInAt: 'desc' },
  });

  return patients.map((patient) => serializePatient(patient));
}

export async function getMyPatientsService(doctorIdInput: string | undefined) {
  const doctorId = requireDoctorId(doctorIdInput);

  const patients = await prisma.patient.findMany({
    where: {
      isArchived: false,
      doctorId,
    },
    include: {
      bed: { include: { ward: { select: { id: true, name: true } } } },
    },
    orderBy: { checkedInAt: 'desc' },
  });

  return patients.map((patient) => serializePatient(patient));
}

export async function takePatientService(doctorIdInput: string | undefined, patientIdInput: string | undefined) {
  const doctorId = requireDoctorId(doctorIdInput);
  const patientId = requirePatientId(patientIdInput);

  const result = await prisma.patient.updateMany({
    where: {
      id: patientId,
      isArchived: false,
      doctorId: null,
    },
    data: {
      doctorId,
    },
  });

  if (result.count === 0) {
    const existing = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, doctorId: true, isArchived: true },
    });

    if (!existing || existing.isArchived) {
      throw new DoctorServiceError(404, 'Patient not found');
    }

    if (existing.doctorId !== doctorId) {
      throw new DoctorServiceError(409, 'Patient already assigned to another doctor');
    }
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      bed: { include: { ward: { select: { id: true, name: true } } } },
    },
  });

  if (!patient) {
    throw new DoctorServiceError(404, 'Patient not found after assignment');
  }

  return serializePatient(patient);
}

export async function getPatientDetailService(
  doctorIdInput: string | undefined,
  patientIdInput: string | undefined,
  windowValue: unknown,
) {
  const doctorId = requireDoctorId(doctorIdInput);
  const patientId = requirePatientId(patientIdInput);

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      bed: { select: { id: true, label: true, cameraStatus: true, isOccupied: true, ward: { select: { id: true, name: true } } } },
    },
  });

  if (!patient || patient.isArchived) {
    throw new DoctorServiceError(404, 'Patient not found');
  }

  if (patient.doctorId !== doctorId) {
    throw new DoctorServiceError(403, 'You can only access patients assigned to you');
  }

  const window = parseWindow(windowValue);
  const monitoring = await getMonitoringSnapshot(patient.id, window);

  return {
    patient: serializePatient(patient),
    monitoring: {
      window,
      availableWindows: timelineWindows,
      ...monitoring,
    },
  };
}

export async function addEmotionReadingService(
  doctorIdInput: string | undefined,
  patientIdInput: string | undefined,
  rawBody: unknown,
) {
  const doctorId = requireDoctorId(doctorIdInput);
  const patientId = requirePatientId(patientIdInput);

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, isArchived: true, doctorId: true },
  });

  if (!patient || patient.isArchived) {
    throw new DoctorServiceError(404, 'Patient not found');
  }

  if (patient.doctorId !== doctorId) {
    throw new DoctorServiceError(403, 'You can only push readings for your assigned patients');
  }

  const body = asRecord(rawBody) as EmotionBody;
  const source = body.probabilities && typeof body.probabilities === 'object'
    ? body.probabilities
    : body;

  const values = {
    anger: normalizeEmotionValue(findEmotion(source, emotionNames[0]) ?? 0),
    contempt: normalizeEmotionValue(findEmotion(source, emotionNames[1]) ?? 0),
    disgust: normalizeEmotionValue(findEmotion(source, emotionNames[2]) ?? 0),
    fear: normalizeEmotionValue(findEmotion(source, emotionNames[3]) ?? 0),
    happiness: normalizeEmotionValue(findEmotion(source, emotionNames[4]) ?? 0),
    sadness: normalizeEmotionValue(findEmotion(source, emotionNames[5]) ?? 0),
    surprise: normalizeEmotionValue(findEmotion(source, emotionNames[6]) ?? 0),
  };

  const hasData = Object.values(values).some((value) => value > 0);
  if (!hasData) {
    throw new DoctorServiceError(400, 'Reading payload does not contain emotion values');
  }

  const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    throw new DoctorServiceError(400, 'Invalid timestamp');
  }

  const distressScore = clamp((values.anger + values.fear + values.sadness) / 3, 0, 100);
  const painScore = clamp((values.fear * 0.45 + values.sadness * 0.4 + values.disgust * 0.15), 0, 100);

  const reading = await prisma.$transaction(async (tx) => {
    const created = await tx.emotionReading.create({
      data: {
        patientId,
        timestamp,
        ...values,
        distressScore,
        painScore,
      },
    });

    if (distressScore >= 70 || painScore >= 70) {
      const type = distressScore >= painScore ? 'DISTRESS' : 'PAIN';
      const score = Math.max(distressScore, painScore);
      const severity = parseSeverity(score);
      const label = type === 'DISTRESS' ? 'distress' : 'pain';
      const message = `Prolonged ${label} risk detected (score ${score.toFixed(1)}%).`;

      const existing = await tx.patientAlert.findFirst({
        where: {
          patientId,
          type,
          active: true,
        },
        select: { id: true },
      });

      if (existing) {
        await tx.patientAlert.update({
          where: { id: existing.id },
          data: {
            severity,
            message,
            createdAt: timestamp,
          },
        });
      } else {
        await tx.patientAlert.create({
          data: {
            patientId,
            type,
            severity,
            message,
            createdAt: timestamp,
            active: true,
          },
        });
      }
    }

    if (distressScore < 55) {
      await tx.patientAlert.updateMany({
        where: {
          patientId,
          type: 'DISTRESS',
          active: true,
        },
        data: {
          active: false,
          resolvedAt: timestamp,
        },
      });
    }

    if (painScore < 55) {
      await tx.patientAlert.updateMany({
        where: {
          patientId,
          type: 'PAIN',
          active: true,
        },
        data: {
          active: false,
          resolvedAt: timestamp,
        },
      });
    }

    return created;
  });

  const influxWritten = await writePatientEmotionPoint(patientId, {
    timestamp,
    ...values,
    distressScore,
    painScore,
  });

  return {
    readingId: reading.id,
    storedAt: reading.timestamp,
    influxWritten,
  };
}