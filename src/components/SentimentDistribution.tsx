import { BarChart3 } from 'lucide-react';
import { EmotionData, EmotionType } from '../hooks/useEmotionData';

interface SentimentDistributionProps {
  emotions: EmotionData;
  spikeFlash: EmotionType | null;
}

const emotionColors: Record<EmotionType, string> = {
  Anger: 'bg-red-500',
  Contempt: 'bg-purple-500',
  Disgust: 'bg-orange-500',
  Fear: 'bg-amber-500',
  Happiness: 'bg-emerald-500',
  Sadness: 'bg-blue-500',
  Surprise: 'bg-cyan-500',
};

const emotionTextColors: Record<EmotionType, string> = {
  Anger: 'text-red-400',
  Contempt: 'text-purple-400',
  Disgust: 'text-orange-400',
  Fear: 'text-amber-400',
  Happiness: 'text-emerald-400',
  Sadness: 'text-blue-400',
  Surprise: 'text-cyan-400',
};

export const SentimentDistribution = ({ emotions, spikeFlash }: SentimentDistributionProps) => {
  const emotionEntries = Object.entries(emotions) as [EmotionType, number][];

  return (
    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
      <div className="flex items-center space-x-2 mb-6">
        <BarChart3 className="w-5 h-5 text-teal-400" />
        <h3 className="text-white font-semibold">Sentiment Distribution</h3>
      </div>

      <div className="space-y-4">
        {emotionEntries.map(([emotion, value]) => (
          <div key={emotion} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${emotionTextColors[emotion]} ${
                spikeFlash === emotion ? 'animate-pulse' : ''
              }`}>
                {emotion}
              </span>
              <span className="text-slate-400 text-sm tabular-nums">{value.toFixed(1)}%</span>
            </div>
            <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${emotionColors[emotion]} transition-all duration-300 ${
                  spikeFlash === emotion ? 'shadow-lg' : ''
                }`}
                style={{ width: `${value}%` }}
              >
                {spikeFlash === emotion && (
                  <div className="absolute inset-0 bg-white/30 animate-pulse"></div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Detection Confidence</span>
          <span className="text-teal-400 font-semibold">94.7%</span>
        </div>
      </div>
    </div>
  );
};
