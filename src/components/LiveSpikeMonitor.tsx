import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { EmotionSnapshot } from '../hooks/useEmotionData';
import { Activity } from 'lucide-react';

interface LiveSpikeMonitorProps {
  emotionHistory: EmotionSnapshot[];
}

export const LiveSpikeMonitor = ({ emotionHistory }: LiveSpikeMonitorProps) => {
  const chartData = emotionHistory.map((snapshot, index) => ({
    index,
    Anger: snapshot.Anger,
    Fear: snapshot.Fear,
    Happiness: snapshot.Happiness,
    Sadness: snapshot.Sadness,
  }));

  return (
    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
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

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="index"
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
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#e2e8f0',
              }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Legend
              wrapperStyle={{ color: '#94a3b8', fontSize: '12px' }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="Anger"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Fear"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Happiness"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="Sadness"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
