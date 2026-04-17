import { AlertSeverity, AlertType } from '@prisma/client';
import { differenceInMinutes, subDays, subHours } from 'date-fns';
import prisma from '../lib/prisma';
import {
  isInfluxConfigured,
  readPatientEmotionTimeline,
  TimelineWindow,
} from '../lib/influx';

export type TimelineSource = 'influx' | 'postgres' | 'synthetic';

export interface EmotionTimelinePoint {
  timestamp: string;
  anger: number;
  contempt: number;
  disgust: number;
  fear: number;
  happiness: number;
  sadness: number;
  surprise: number;
  distressScore: number;
  painScore: number;
  source: TimelineSource;
}

export interface PatientAlertNotification {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  createdAt: string;
  source: 'db' | 'snn';
}

export interface MonitoringSnapshot {
  timeline: EmotionTimelinePoint[];
  currentAlerts: PatientAlertNotification[];
  prolongedAlerts: PatientAlertNotification[];
  source: TimelineSource;
  influxConfigured: boolean;
}

const DISTRESS_THRESHOLD = 65;
const PAIN_THRESHOLD = 65;
const PROLONGED_MINUTES = 60;

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const asPercentage = (value: number) => (value <= 1 ? value * 100 : value);

const toFixedNumber = (value: number) => Number(value.toFixed(2));

function buildSyntheticTimeline(window: TimelineWindow): EmotionTimelinePoint[] {
  const pointCount = window === '24h' ? 48 : 56;
  const stepMs = window === '24h' ? 30 * 60 * 1000 : 3 * 60 * 60 * 1000;
  const now = Date.now();
  const start = now - (pointCount - 1) * stepMs;

  return Array.from({ length: pointCount }, (_, index) => {
    const timestamp = new Date(start + index * stepMs).toISOString();
    const anger = clamp(16 + 11 * Math.sin(index / 5) + 8 * Math.sin(index / 11), 1, 95);
    const contempt = clamp(8 + 6 * Math.sin(index / 7 + 1), 0, 60);
    const disgust = clamp(9 + 7 * Math.sin(index / 6 + 0.4), 0, 65);
    const fear = clamp(22 + 14 * Math.sin(index / 4.2 + 0.8), 1, 96);
    const happiness = clamp(50 + 18 * Math.sin(index / 8 + 2.1), 3, 98);
    const sadness = clamp(18 + 10 * Math.sin(index / 4.6 + 1.5), 1, 92);
    const surprise = clamp(12 + 9 * Math.sin(index / 3.7 + 0.3), 0, 88);
    const distressScore = clamp((anger + fear + sadness) / 3, 0, 100);
    const painScore = clamp((fear * 0.45 + sadness * 0.4 + disgust * 0.15), 0, 100);

    return {
      timestamp,
      anger: toFixedNumber(anger),
      contempt: toFixedNumber(contempt),
      disgust: toFixedNumber(disgust),
      fear: toFixedNumber(fear),
      happiness: toFixedNumber(happiness),
      sadness: toFixedNumber(sadness),
      surprise: toFixedNumber(surprise),
      distressScore: toFixedNumber(distressScore),
      painScore: toFixedNumber(painScore),
      source: 'synthetic',
    };
  });
}

async function getTimeline(patientId: string, window: TimelineWindow): Promise<{ timeline: EmotionTimelinePoint[]; source: TimelineSource }> {
  const influxTimeline = await readPatientEmotionTimeline(patientId, window);
  if (influxTimeline.length > 0) {
    return {
      timeline: influxTimeline.map((point) => ({
        ...point,
        anger: toFixedNumber(asPercentage(point.anger)),
        contempt: toFixedNumber(asPercentage(point.contempt)),
        disgust: toFixedNumber(asPercentage(point.disgust)),
        fear: toFixedNumber(asPercentage(point.fear)),
        happiness: toFixedNumber(asPercentage(point.happiness)),
        sadness: toFixedNumber(asPercentage(point.sadness)),
        surprise: toFixedNumber(asPercentage(point.surprise)),
        distressScore: toFixedNumber(asPercentage(point.distressScore)),
        painScore: toFixedNumber(asPercentage(point.painScore)),
        source: 'influx',
      })),
      source: 'influx',
    };
  }

  const rangeStart = window === '24h' ? subHours(new Date(), 24) : subDays(new Date(), 7);
  const postgresTimeline = await prisma.emotionReading.findMany({
    where: {
      patientId,
      timestamp: { gte: rangeStart },
    },
    orderBy: { timestamp: 'asc' },
  });

  if (postgresTimeline.length > 0) {
    return {
      timeline: postgresTimeline.map((point) => ({
        timestamp: point.timestamp.toISOString(),
        anger: toFixedNumber(asPercentage(point.anger)),
        contempt: toFixedNumber(asPercentage(point.contempt)),
        disgust: toFixedNumber(asPercentage(point.disgust)),
        fear: toFixedNumber(asPercentage(point.fear)),
        happiness: toFixedNumber(asPercentage(point.happiness)),
        sadness: toFixedNumber(asPercentage(point.sadness)),
        surprise: toFixedNumber(asPercentage(point.surprise)),
        distressScore: toFixedNumber(asPercentage(point.distressScore)),
        painScore: toFixedNumber(asPercentage(point.painScore)),
        source: 'postgres',
      })),
      source: 'postgres',
    };
  }

  return { timeline: buildSyntheticTimeline(window), source: 'synthetic' };
}

function getSeverity(score: number): AlertSeverity {
  if (score >= 85) return 'HIGH';
  if (score >= 72) return 'MEDIUM';
  return 'LOW';
}

function deriveProlongedAlert(
  timeline: EmotionTimelinePoint[],
  type: AlertType, // what do we want to alert on, either 'DISTRESS' or 'PAIN'
  threshold: number,
  valueSelector: (point: EmotionTimelinePoint) => number, // how to get the relevant score from a timeline point, either point.distressScore or point.painScore
): PatientAlertNotification[] {
  if (timeline.length === 0) {
    return [];
  }

  const alerts: PatientAlertNotification[] = [];
  let streakStart = -1;
  let streakPeak = 0; // track the peak score during the streak to determine severity, since a longer but milder streak might be less concerning than a shorter but more intense one

  // decides if a prolonged streak has ended and if it meets criteria to generate an alert, then resets streak tracking
  const flushStreak = (endIndex: number) => {
    if (streakStart < 0) return;

    const startPoint = timeline[streakStart];
    const endPoint = timeline[endIndex];
    const durationMinutes = differenceInMinutes(new Date(endPoint.timestamp), new Date(startPoint.timestamp));

    if (durationMinutes >= PROLONGED_MINUTES) { // only if the streak lasted long enough to be concerning
      const severity = getSeverity(streakPeak);
      const scoreLabel = type === 'DISTRESS' ? 'distress' : 'pain';
      alerts.push({
        id: `derived-${type.toLowerCase()}-${endPoint.timestamp}`,
        type,
        severity,
        message: `Prolonged ${scoreLabel} detected for ${durationMinutes} minutes (peak ${streakPeak.toFixed(1)}%).`,
        createdAt: endPoint.timestamp,
        source: 'snn',
      });
    }

    streakStart = -1;
    streakPeak = 0;
  };

  timeline.forEach((point, index) => {
    const value = valueSelector(point);
    if (value >= threshold) {
      if (streakStart < 0) {
        streakStart = index;
      }
      streakPeak = Math.max(streakPeak, value);
      return;
    }

    flushStreak(index - 1);
  });

  flushStreak(timeline.length - 1);
  return alerts;
}

export async function getMonitoringSnapshot(
  patientId: string,
  window: TimelineWindow,
): Promise<MonitoringSnapshot> {
  const { timeline, source } = await getTimeline(patientId, window);

  // manual alerts sent by doctors, previously detected alerts by another process etc.
  const persistedAlerts = await prisma.patientAlert.findMany({
    where: {
      patientId,
      active: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const derivedAlerts = [
    ...deriveProlongedAlert(timeline, 'DISTRESS', DISTRESS_THRESHOLD, (point) => point.distressScore),
    ...deriveProlongedAlert(timeline, 'PAIN', PAIN_THRESHOLD, (point) => point.painScore),
  ].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // descending by createdAt
  });

  const dbAlerts: PatientAlertNotification[] = persistedAlerts.map((alert) => ({
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
    createdAt: alert.createdAt.toISOString(),
    source: 'db',
  }));

  return {
    timeline,
    currentAlerts: dbAlerts,
    prolongedAlerts: derivedAlerts,
    source,
    influxConfigured: isInfluxConfigured(),
  };
}
