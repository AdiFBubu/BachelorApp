/// <reference types="jest" />

import { deriveProlongedAlert, EmotionTimelinePoint } from '../services/monitoringService';

const baseTimestamp = new Date('2026-04-18T00:00:00.000Z').getTime();

const pointAt = (minutes: number, distress: number, pain: number = distress): EmotionTimelinePoint => ({
  timestamp: new Date(baseTimestamp + minutes * 60_000).toISOString(),
  anger: distress,
  contempt: 0,
  disgust: 0,
  fear: distress,
  happiness: 0,
  sadness: distress,
  surprise: 0,
  distressScore: distress,
  painScore: pain,
  source: 'synthetic',
});

describe('white-box: deriveProlongedAlert independent paths (P1-P9)', () => {
  it('P1: returns [] for empty timeline (early return)', () => {
    const alerts = deriveProlongedAlert([], 'DISTRESS', 65, (point) => point.distressScore);
    expect(alerts).toEqual([]);
  });

  it('P2: all values below threshold never open a streak', () => {
    const timeline = [
      pointAt(0, 40),
      pointAt(30, 50),
      pointAt(60, 64),
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);
    expect(alerts).toHaveLength(0);
  });

  it('P3: closed streak shorter than 60 minutes does not alert (loop flush, duration < 60)', () => {
    const timeline = [
      pointAt(0, 70),
      pointAt(30, 75),
      pointAt(45, 40),
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);
    expect(alerts).toHaveLength(0);
  });

  it('P4: closed streak of at least 60 minutes creates DISTRESS alert (loop flush, duration >= 60)', () => {
    const timeline = [
      pointAt(0, 70),
      pointAt(30, 80),
      pointAt(60, 78),
      pointAt(90, 40),
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: 'DISTRESS',
      severity: 'MEDIUM',
      source: 'snn',
      createdAt: timeline[2].timestamp,
    });
    expect(alerts[0].message.toLowerCase()).toContain('distress');
    expect(alerts[0].message).toContain('60 minutes');
  });

  it('P5: final flush is a no-op after a streak was already closed and reset', () => {
    const timeline = [
      pointAt(0, 70),
      pointAt(30, 80),
      pointAt(60, 78),
      pointAt(90, 40),
      pointAt(120, 45),
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].createdAt).toBe(timeline[2].timestamp);
  });

  it('P6: open streak at timeline end shorter than 60 minutes does not alert (final flush, duration < 60)', () => {
    const timeline = [
      pointAt(0, 70),
      pointAt(30, 71),
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);
    expect(alerts).toHaveLength(0);
  });

  it('P7: open prolonged PAIN streak at timeline end alerts via final flush (duration >= 60)', () => {
    const timeline = [
      pointAt(0, 10, 90),
      pointAt(30, 10, 88),
      pointAt(60, 10, 86),
    ];

    const alerts = deriveProlongedAlert(timeline, 'PAIN', 65, (point) => point.painScore);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: 'PAIN',
      severity: 'HIGH',
      createdAt: timeline[2].timestamp,
    });
    expect(alerts[0].message.toLowerCase()).toContain('pain');
    expect(alerts[0].message).toContain('60 minutes');
  });

  it('P8: continuous over-threshold run keeps original streak start (D4 false on subsequent points)', () => {
    const timeline = [
      pointAt(0, 70),
      pointAt(30, 71),
      pointAt(60, 72),
      pointAt(90, 73),
      pointAt(120, 40),
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].createdAt).toBe(timeline[3].timestamp);
    expect(alerts[0].message).toContain('90 minutes');
  });

  it('P9: two streaks where only second is prolonged produce exactly one alert', () => {
    const timeline = [
      pointAt(0, 70),
      pointAt(30, 71),
      pointAt(40, 20),
      pointAt(60, 80),
      pointAt(90, 82),
      pointAt(120, 83),
      pointAt(150, 30),
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].createdAt).toBe(timeline[5].timestamp);
    expect(alerts[0].message).toContain('60 minutes');
  });
});
