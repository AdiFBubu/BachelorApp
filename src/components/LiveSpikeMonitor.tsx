import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Brush } from 'recharts';
import { EmotionSnapshot, EmotionType } from '../hooks/useEmotionData';
import { Activity } from 'lucide-react';

interface LiveSpikeMonitorProps {
  emotionHistory: EmotionSnapshot[];
}

const emotions: EmotionType[] = ['Anger', 'Contempt', 'Disgust', 'Fear', 'Happiness', 'Sadness', 'Surprise'];

const emotionColor: Record<EmotionType, string> = {
  Anger: '#ef4444',
  Contempt: '#a855f7',
  Disgust: '#f97316',
  Fear: '#f59e0b',
  Happiness: '#10b981',
  Sadness: '#3b82f6',
  Surprise: '#06b6d4',
};

type IntervalKey = '30s' | '2m' | '5m' | '15m' | '30m' | '1h' | '8h' | '24h' | '3d' | '7d';

const intervalMs: Record<Exclude<IntervalKey, '7d'>, number> = {
  '30s': 30 * 1000,
  '2m': 2 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
};

const MAX_VISIBLE_POINTS = 420;
const MIN_ZOOM_POINTS = 24;
const MIN_BRUSH_SPAN_POINTS = 6;

type ZoomRange = {
  startIndex: number;
  endIndex: number;
};

const pointScore = (point: EmotionSnapshot, trackedEmotions: EmotionType[]) => {
  if (trackedEmotions.length === 0) return 0;

  let score = 0;
  for (const emotion of trackedEmotions) {
    score = Math.max(score, point[emotion]);
  }
  return score;
};

const downsampleEmotionPoints = (
  points: EmotionSnapshot[],
  trackedEmotions: EmotionType[],
  maxPoints: number,
) => {
  if (points.length <= maxPoints) {
    return points;
  }

  const bucketCount = Math.max(1, Math.floor(maxPoints / 2));
  const bucketSize = points.length / bucketCount;
  const uniqueByTimestamp = new Map<number, EmotionSnapshot>();

  uniqueByTimestamp.set(points[0].timestamp, points[0]);

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const bucketStart = Math.floor(bucket * bucketSize);
    const bucketEnd = Math.min(points.length - 1, Math.floor((bucket + 1) * bucketSize) - 1);
    if (bucketStart > bucketEnd) continue;

    let minPoint = points[bucketStart];
    let maxPoint = points[bucketStart];
    let minScore = pointScore(points[bucketStart], trackedEmotions);
    let maxScore = minScore;

    for (let index = bucketStart + 1; index <= bucketEnd; index++) {
      const candidate = points[index];
      const score = pointScore(candidate, trackedEmotions);

      if (score < minScore) {
        minScore = score;
        minPoint = candidate;
      }

      if (score > maxScore) {
        maxScore = score;
        maxPoint = candidate;
      }
    }

    uniqueByTimestamp.set(minPoint.timestamp, minPoint);
    uniqueByTimestamp.set(maxPoint.timestamp, maxPoint);
  }

  uniqueByTimestamp.set(points[points.length - 1].timestamp, points[points.length - 1]);

  return Array.from(uniqueByTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
};

const clampZoomRange = (range: ZoomRange, totalPoints: number): ZoomRange | null => {
  if (totalPoints <= 1) return null;

  const maxIndex = totalPoints - 1;
  const startIndex = Math.max(0, Math.min(range.startIndex, maxIndex));
  const endIndex = Math.max(startIndex, Math.min(range.endIndex, maxIndex));

  if (startIndex === 0 && endIndex === maxIndex) {
    return null;
  }

  return { startIndex, endIndex };
};

const ensureMinimumSpan = (
  range: ZoomRange,
  totalPoints: number,
  minimumSpan: number,
): ZoomRange => {
  const maxIndex = totalPoints - 1;
  const span = range.endIndex - range.startIndex + 1;
  if (span >= minimumSpan || totalPoints <= minimumSpan) {
    return range;
  }

  const center = Math.floor((range.startIndex + range.endIndex) / 2);
  let startIndex = center - Math.floor(minimumSpan / 2);
  let endIndex = startIndex + minimumSpan - 1;

  if (startIndex < 0) {
    startIndex = 0;
    endIndex = minimumSpan - 1;
  }

  if (endIndex > maxIndex) {
    endIndex = maxIndex;
    startIndex = Math.max(0, endIndex - minimumSpan + 1);
  }

  return { startIndex, endIndex };
};

export const LiveSpikeMonitor = ({ emotionHistory }: LiveSpikeMonitorProps) => {
  const [selectedEmotions, setSelectedEmotions] = useState<EmotionType[]>([
    'Anger',
    'Fear',
    'Happiness',
    'Sadness',
  ]);
  const [activeInterval, setActiveInterval] = useState<IntervalKey>('5m');
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [frozenHistory, setFrozenHistory] = useState<EmotionSnapshot[] | null>(null);

  const isLiveStreaming = frozenHistory === null;
  const sourceHistory = frozenHistory ?? emotionHistory;

  const pauseLiveUpdates = () => {
    setFrozenHistory((previous) => {
      if (previous) return previous;
      return [...emotionHistory];
    });
  };

  const resumeLiveUpdates = () => {
    setFrozenHistory(null);
    setZoomRange(null);
  };

  const toggleLiveUpdates = () => {
    if (isLiveStreaming) {
      pauseLiveUpdates();
      return;
    }

    resumeLiveUpdates();
  };

  const sortedHistory = useMemo(() => {
    return [...sourceHistory].sort((a, b) => a.timestamp - b.timestamp);
  }, [sourceHistory]);

  const timeFilteredHistory = useMemo(() => {
    if (activeInterval === '7d') {
      return sortedHistory;
    }

    const latestTimestamp = sortedHistory.length > 0
      ? sortedHistory[sortedHistory.length - 1].timestamp
      : Date.now();
    const cutoff = latestTimestamp - intervalMs[activeInterval];
    return sortedHistory.filter((point) => point.timestamp >= cutoff); // only include points within the selected time window
  }, [activeInterval, sortedHistory]);

  const chartData = useMemo(() => {
    return timeFilteredHistory.map((snapshot) => ({
      timestamp: snapshot.timestamp,
      Anger: snapshot.Anger,
      Contempt: snapshot.Contempt,
      Disgust: snapshot.Disgust,
      Fear: snapshot.Fear,
      Happiness: snapshot.Happiness,
      Sadness: snapshot.Sadness,
      Surprise: snapshot.Surprise,
    }));
  }, [timeFilteredHistory]);

  useEffect(() => {
    setZoomRange(null);
  }, [activeInterval]);

  const overviewChartData = useMemo(() => {
    return downsampleEmotionPoints(chartData, selectedEmotions, MAX_VISIBLE_POINTS);
  }, [chartData, selectedEmotions]);

  useEffect(() => {
    setZoomRange((previous) => {
      if (!previous) return previous;
      return clampZoomRange(previous, overviewChartData.length);
    });
  }, [overviewChartData.length]);

  const visiblePointCount = useMemo(() => {
    if (overviewChartData.length === 0) {
      return 0;
    }

    if (!zoomRange) {
      return overviewChartData.length;
    }

    const normalized = clampZoomRange(zoomRange, overviewChartData.length);
    if (!normalized) {
      return overviewChartData.length;
    }

    return normalized.endIndex - normalized.startIndex + 1;
  }, [overviewChartData, zoomRange]);

  const isZoomActive = zoomRange !== null;
  const brushStartIndex = zoomRange?.startIndex ?? 0;
  const brushEndIndex = zoomRange?.endIndex ?? Math.max(overviewChartData.length - 1, 0);

  const handleBrushChange = (next: { startIndex?: number; endIndex?: number } | undefined) => {
    if (!next) return;

    if (typeof next.startIndex !== 'number' || typeof next.endIndex !== 'number') {
      return;
    }

    pauseLiveUpdates();

    const normalized = clampZoomRange(
      { startIndex: next.startIndex, endIndex: next.endIndex },
      overviewChartData.length,
    );

    if (!normalized) {
      setZoomRange(null);
      return;
    }

    setZoomRange(
      ensureMinimumSpan(normalized, overviewChartData.length, MIN_BRUSH_SPAN_POINTS),
    );
  };

  const applyRelativeZoom = (factor: number) => {
    if (overviewChartData.length <= 1) return;

    pauseLiveUpdates();

    const maxIndex = overviewChartData.length - 1;
    const currentStart = zoomRange?.startIndex ?? 0;
    const currentEnd = zoomRange?.endIndex ?? maxIndex;
    const currentSpan = currentEnd - currentStart + 1;

    const targetSpan = Math.max(
      MIN_ZOOM_POINTS,
      Math.min(maxIndex + 1, Math.round(currentSpan * factor)),
    );

    if (targetSpan >= maxIndex + 1) {
      setZoomRange(null);
      return;
    }

    const center = Math.floor((currentStart + currentEnd) / 2);
    let nextStart = center - Math.floor(targetSpan / 2);
    let nextEnd = nextStart + targetSpan - 1;

    if (nextStart < 0) {
      nextStart = 0;
      nextEnd = targetSpan - 1;
    }

    if (nextEnd > maxIndex) {
      nextEnd = maxIndex;
      nextStart = Math.max(0, nextEnd - targetSpan + 1);
    }

    setZoomRange({ startIndex: nextStart, endIndex: nextEnd });
  };

  const resetZoom = () => {
    setZoomRange(null);
  };

  const toggleEmotion = (emotion: EmotionType) => {
    setSelectedEmotions((previous) => {
      if (previous.includes(emotion)) {
        if (previous.length === 1) {
          return previous;
        }
        return previous.filter((item) => item !== emotion);
      }
      return [...previous, emotion];
    });
  };

  const formatTick = (value: number) => {
    const date = new Date(value);
    if (activeInterval === '7d' || activeInterval === '3d') {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    if (activeInterval === '24h') {
      return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (activeInterval === '8h' || activeInterval === '1h' || activeInterval === '30m') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleTimeString([], { minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800 h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Activity className="w-5 h-5 text-teal-400" />
          <h3 className="text-white font-semibold">Live Spike Monitor</h3>
        </div>
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isLiveStreaming ? 'bg-teal-400 animate-pulse' : 'bg-amber-400'
            }`}
          ></div>
          <span className={`text-sm ${isLiveStreaming ? 'text-teal-400' : 'text-amber-300'}`}>
            {isLiveStreaming ? 'Streaming' : 'Paused for analysis'}
          </span>
          {!isLiveStreaming && (
            <button
              onClick={resumeLiveUpdates}
              className="rounded px-2.5 py-1 text-xs bg-teal-500 text-white hover:bg-teal-400"
            >
              Resume live
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">Graph interval</span>
          {(['30s', '2m', '5m', '15m', '30m', '1h', '8h', '24h', '3d', '7d'] as IntervalKey[]).map((interval) => (
            <button
              key={interval}
              onClick={() => setActiveInterval(interval)}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                activeInterval === interval
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {interval === '7d'
                ? 'Full 7d'
                : interval === '3d'
                ? 'Last 3 days'
                : `Last ${interval}`}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">View</span>
          <button
            onClick={() => applyRelativeZoom(0.5)}
            disabled={overviewChartData.length <= MIN_ZOOM_POINTS}
            className="rounded px-2.5 py-1 text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Zoom in
          </button>
          <button
            onClick={() => applyRelativeZoom(2)}
            disabled={overviewChartData.length <= MIN_ZOOM_POINTS}
            className="rounded px-2.5 py-1 text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Zoom out
          </button>
          <button
            onClick={resetZoom}
            disabled={!isZoomActive}
            className="rounded px-2.5 py-1 text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset zoom
          </button>
          <button
            onClick={toggleLiveUpdates}
            className={`rounded px-2.5 py-1 text-xs text-white transition-colors ${
              isLiveStreaming
                ? 'bg-amber-500 hover:bg-amber-400'
                : 'bg-teal-500 hover:bg-teal-400'
            }`}
          >
            {isLiveStreaming ? 'Pause for analysis' : 'Resume live updates'}
          </button>
          <span className="text-xs text-slate-400">
            {visiblePointCount} / {chartData.length} points shown
            {chartData.length > overviewChartData.length ? ' (adaptive sampling)' : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">Tracked sentiments</span>
          {emotions.map((emotion) => {
            const selected = selectedEmotions.includes(emotion);
            return (
              <button
                key={emotion}
                onClick={() => toggleEmotion(emotion)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  selected
                    ? 'text-white'
                    : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-500'
                }`}
                style={
                  selected
                    ? {
                        borderColor: emotionColor[emotion],
                        backgroundColor: `${emotionColor[emotion]}33`,
                      }
                    : undefined
                }
              >
                {emotion}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {chartData.length === 0 ? (
          <div className="h-full min-h-[240px] rounded-lg border border-slate-800 bg-slate-950/40 flex items-center justify-center text-slate-500 text-sm">
            No data points yet for this interval.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={overviewChartData} margin={{ top: 8, right: 10, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                type="number"
                dataKey="timestamp" // key for x-axis values
                domain={['dataMin', 'dataMax']}
                tickFormatter={formatTick}
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickLine={false}
                domain={[0, 100]}
              />
              <Tooltip
                labelFormatter={(value) => {
                  if (typeof value === 'number') {
                    return new Date(value).toLocaleString();
                  }
                  if (typeof value === 'string') {
                    const parsed = Number(value);
                    if (Number.isFinite(parsed)) {
                      return new Date(parsed).toLocaleString();
                    }
                  }
                  return String(value ?? '');
                }}
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }} iconType="line" />
              {selectedEmotions.map((emotion) => (
                <Line
                  key={emotion}
                  type="monotone"
                  dataKey={emotion} // key for y-axis values
                  stroke={emotionColor[emotion]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
              <Brush
                dataKey="timestamp"
                startIndex={brushStartIndex}
                endIndex={brushEndIndex}
                onChange={handleBrushChange}
                stroke="#14b8a6"
                height={26}
                travellerWidth={10}
                tickFormatter={formatTick}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
