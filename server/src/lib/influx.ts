import { InfluxDB, Point } from '@influxdata/influxdb-client';

export type TimelineWindow = '24h' | '7d';

export interface InfluxEmotionPoint {
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
}

export interface InfluxEmotionWritePoint {
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
}

const influxConfig = {
  url: process.env.INFLUX_URL || '',
  token: process.env.INFLUX_TOKEN || '',
  org: process.env.INFLUX_ORG || '',
  bucket: process.env.INFLUX_BUCKET || '',
};

const isEnabled = Boolean(
  influxConfig.url && influxConfig.token && influxConfig.org && influxConfig.bucket,
);

const influxClient = isEnabled
  ? new InfluxDB({ url: influxConfig.url, token: influxConfig.token })
  : null;

const queryApi = influxClient ? influxClient.getQueryApi(influxConfig.org) : null;
const writeApi = influxClient
  ? influxClient.getWriteApi(influxConfig.org, influxConfig.bucket, 'ms')
  : null;

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const isInfluxConfigured = () => isEnabled;

export async function readPatientEmotionTimeline(
  patientId: string,
  window: TimelineWindow,
): Promise<InfluxEmotionPoint[]> {
  if (!queryApi) {
    return [];
  }

  const escapedPatientId = patientId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const fluxRange = window === '24h' ? '-24h' : '-7d';

  const query = `
from(bucket: "${influxConfig.bucket}")
  |> range(start: ${fluxRange})
  |> filter(fn: (r) => r["_measurement"] == "emotion_history")
  |> filter(fn: (r) => r["patientId"] == "${escapedPatientId}")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "anger", "contempt", "disgust", "fear", "happiness", "sadness", "surprise", "distressScore", "painScore"])
  |> sort(columns: ["_time"])
`;

  try {
    const rows = await queryApi.collectRows<Record<string, unknown>>(query);
    return rows
      .filter((row) => Boolean(row._time))
      .map((row) => ({
        timestamp: new Date(String(row._time)).toISOString(),
        anger: toNumber(row.anger),
        contempt: toNumber(row.contempt),
        disgust: toNumber(row.disgust),
        fear: toNumber(row.fear),
        happiness: toNumber(row.happiness),
        sadness: toNumber(row.sadness),
        surprise: toNumber(row.surprise),
        distressScore: toNumber(row.distressScore),
        painScore: toNumber(row.painScore),
      }));
  } catch (err) {
    console.error('Influx timeline query failed', err);
    return [];
  }
}

export async function writePatientEmotionPoint(
  patientId: string,
  reading: InfluxEmotionWritePoint,
): Promise<boolean> {
  if (!writeApi) {
    return false;
  }

  try {
    const point = new Point('emotion_history')
      .tag('patientId', patientId)
      .floatField('anger', reading.anger)
      .floatField('contempt', reading.contempt)
      .floatField('disgust', reading.disgust)
      .floatField('fear', reading.fear)
      .floatField('happiness', reading.happiness)
      .floatField('sadness', reading.sadness)
      .floatField('surprise', reading.surprise)
      .floatField('distressScore', reading.distressScore)
      .floatField('painScore', reading.painScore)
      .timestamp(reading.timestamp);

    writeApi.writePoint(point);
    await writeApi.flush();
    return true;
  } catch (err) {
    console.error('Influx write failed', err);
    return false;
  }
}
