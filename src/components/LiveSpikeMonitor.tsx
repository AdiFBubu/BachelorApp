import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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

export const LiveSpikeMonitor = ({ emotionHistory }: LiveSpikeMonitorProps) => {
  const [selectedEmotions, setSelectedEmotions] = useState<EmotionType[]>([
    'Anger',
    'Fear',
    'Happiness',
    'Sadness',
  ]);
  const [activeInterval, setActiveInterval] = useState<IntervalKey>('5m');

  const sortedHistory = useMemo(() => {
    return [...emotionHistory].sort((a, b) => a.timestamp - b.timestamp);
  }, [emotionHistory]);

  const timeFilteredHistory = useMemo(() => {
    if (activeInterval === '7d') {
      return sortedHistory;
    }

    const latestTimestamp = sortedHistory.length > 0
      ? sortedHistory[sortedHistory.length - 1].timestamp
      : Date.now();
    const cutoff = latestTimestamp - intervalMs[activeInterval];
    return sortedHistory.filter((point) => point.timestamp >= cutoff);
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
          <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse"></div>
          <span className="text-teal-400 text-sm">Streaming</span>
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
            <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                type="number"
                dataKey="timestamp"
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
                labelFormatter={(value: number) => new Date(value).toLocaleString()}
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
                  dataKey={emotion}
                  stroke={emotionColor[emotion]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
