import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { ensureHospitalSeed } from '../services/hospitalSetup';
import { getMonitoringSnapshot } from '../services/monitoringService';
import { TimelineWindow } from '../lib/influx';
import { writePatientEmotionPoint } from '../lib/influx';
import { AlertSeverity } from '@prisma/client';

const timelineWindows: TimelineWindow[] = ['24h', '7d'];
const emotionNames = ['Anger', 'Contempt', 'Disgust', 'Fear', 'Happiness', 'Sadness', 'Surprise'] as const;

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

const serializePatient = (patient: {
  id: string;
  firstName: string;
  lastName: string;
  nationalId: string;
  diagnosis: string | null;
  medicalHistory: string | null;
  checkedInAt: Date;
  ward: { id: string; name: string };
  bed: { id: string; label: string; cameraStatus: string; isOccupied: boolean };
  doctorId: string | null;
}) => ({
  id: patient.id,
  firstName: patient.firstName,
  lastName: patient.lastName,
  fullName: `${patient.firstName} ${patient.lastName}`,
  nationalId: patient.nationalId,
  diagnosis: patient.diagnosis,
  medicalHistory: patient.medicalHistory,
  checkedInAt: patient.checkedInAt,
  ward: patient.ward,
  bed: patient.bed,
  doctorId: patient.doctorId,
});

export const getAvailablePatients = async (req: Request, res: Response) => {
  await ensureHospitalSeed();

  const patients = await prisma.patient.findMany({
    where: {
      isArchived: false,
      doctorId: null,
    },
    include: {
      ward: { select: { id: true, name: true } },
      bed: { select: { id: true, label: true, cameraStatus: true, isOccupied: true } },
    },
    orderBy: { checkedInAt: 'desc' },
  });

  return res.json({
    patients: patients.map((patient) => serializePatient(patient)),
  });
};

export const getMyPatients = async (req: Request, res: Response) => {
  const doctorId = req.userId;
  if (!doctorId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const patients = await prisma.patient.findMany({
    where: {
      isArchived: false,
      doctorId,
    },
    include: {
      ward: { select: { id: true, name: true } },
      bed: { select: { id: true, label: true, cameraStatus: true, isOccupied: true } },
    },
    orderBy: { checkedInAt: 'desc' },
  });

  return res.json({
    patients: patients.map((patient) => serializePatient(patient)),
  });
};

export const takePatient = async (req: Request, res: Response) => {
  const doctorId = req.userId;
  if (!doctorId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const patientId = req.params.patientId;
  if (!patientId) {
    return res.status(400).json({ error: 'Missing patientId' });
  }

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
      return res.status(404).json({ error: 'Patient not found' });
    }

    if (existing.doctorId !== doctorId) {
      return res.status(409).json({ error: 'Patient already assigned to another doctor' });
    }
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      ward: { select: { id: true, name: true } },
      bed: { select: { id: true, label: true, cameraStatus: true, isOccupied: true } },
    },
  });

  if (!patient) {
    return res.status(404).json({ error: 'Patient not found after assignment' });
  }

  return res.json({ patient: serializePatient(patient) });
};

export const getPatientDetail = async (req: Request, res: Response) => {
  const doctorId = req.userId;
  if (!doctorId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const patientId = req.params.patientId;
  if (!patientId) {
    return res.status(400).json({ error: 'Missing patientId' });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      ward: { select: { id: true, name: true } },
      bed: { select: { id: true, label: true, cameraStatus: true, isOccupied: true } },
    },
  });

  if (!patient || patient.isArchived) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  if (patient.doctorId !== doctorId) {
    return res.status(403).json({ error: 'You can only access patients assigned to you' });
  }

  const window = parseWindow(req.query.window);
  const monitoring = await getMonitoringSnapshot(patient.id, window);

  return res.json({
    patient: serializePatient(patient),
    monitoring: {
      window,
      availableWindows: timelineWindows,
      ...monitoring,
    },
  });
};

export const addEmotionReading = async (req: Request, res: Response) => {
  const doctorId = req.userId;
  if (!doctorId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const patientId = req.params.patientId;
  if (!patientId) {
    return res.status(400).json({ error: 'Missing patientId' });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, isArchived: true, doctorId: true },
  });

  if (!patient || patient.isArchived) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  if (patient.doctorId !== doctorId) {
    return res.status(403).json({ error: 'You can only push readings for your assigned patients' });
  }

  const body = req.body as {
    probabilities?: Record<string, unknown>;
    timestamp?: string;
    [key: string]: unknown;
  };

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
    return res.status(400).json({ error: 'Reading payload does not contain emotion values' });
  }

  const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    return res.status(400).json({ error: 'Invalid timestamp' });
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

  return res.status(201).json({
    readingId: reading.id,
    storedAt: reading.timestamp,
    influxWritten,
  });
};
