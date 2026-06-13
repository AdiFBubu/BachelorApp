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

describe('white-box: deriveProlongedAlert execution traces', () => {
  
  it('T1 (R1): returns [] for empty timeline (early return)', () => {
    const alerts = deriveProlongedAlert([], 'DISTRESS', 65, (point) => point.distressScore);
    expect(alerts).toEqual([]);
  });

  it('T2 (R6 -> R3): single value below threshold does not open a streak', () => {
    const timeline = [
      pointAt(0, 20),
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);
    expect(alerts).toHaveLength(0);
  });

  it('T3 (R5 -> R4): single value above threshold opens a streak but fails duration check at final flush', () => {
    const timeline = [
      pointAt(0, 70),
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);
    expect(alerts).toHaveLength(0);
  });

  it('T4 (R5 -> R7 -> R2): prolonged streak at timeline end generates alert at final flush', () => {
    const timeline = [
      pointAt(0, 70),
      pointAt(65, 80), // Duration: 65 - 0 = 65 mins (>= 60)
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: 'DISTRESS',
      severity: 'MEDIUM',
      source: 'snn',
      createdAt: timeline[1].timestamp,
    });
    expect(alerts[0].message).toContain('65 minutes');
    expect(alerts[0].message).toContain('peak 80.0%');
  });

  it('T5 (R5 -> R7 -> R8 -> R3): prolonged streak interrupted by low value generates alert inside the loop', () => {
    const timeline = [
      pointAt(0, 70),
      pointAt(75, 80), // Streak duration will be 75 - 0 = 75 mins
      pointAt(80, 20), // This low value flushes the streak ending at index 1
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].createdAt).toBe(timeline[1].timestamp); // Alert is created for the point at 75 mins
    expect(alerts[0].message).toContain('75 minutes');
  });

  it('T6 (R5 -> R7 -> R9 -> R3): short streak interrupted by low value does not generate alert', () => {
    const timeline = [
      pointAt(0, 70),
      pointAt(30, 80), // Streak duration will be 30 - 0 = 30 mins (< 60)
      pointAt(45, 20), // This low value flushes the streak, but duration is too short
    ];

    const alerts = deriveProlongedAlert(timeline, 'DISTRESS', 65, (point) => point.distressScore);
    expect(alerts).toHaveLength(0);
  });

});