import { FileText, AlertCircle } from 'lucide-react';
import { ClinicalEvent, EmotionType } from '../hooks/useEmotionData';

interface ClinicalInsightsProps {
  events: ClinicalEvent[];
}

const emotionIcons: Record<EmotionType, string> = {
  Anger: '🔴',
  Contempt: '🟣',
  Disgust: '🟠',
  Fear: '🟡',
  Happiness: '🟢',
  Sadness: '🔵',
  Surprise: '🔷',
};

export const ClinicalInsights = ({ events }: ClinicalInsightsProps) => {
  return (
    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800 h-full min-h-0 flex flex-col">
      <div className="flex items-center space-x-2 mb-4">
        <FileText className="w-5 h-5 text-teal-400" />
        <h3 className="text-white font-semibold">Clinical Insights</h3>
      </div>

      {events.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-slate-500 text-sm">Monitoring for events...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 hover:border-teal-500/30 transition-colors"
            >
              <div className="flex items-start space-x-3">
                <span className="text-lg mt-0.5">{emotionIcons[event.emotion]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-teal-400">{event.time}</span>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {event.intensity.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">{event.message}</p>
                  <span className="text-xs text-slate-500">{event.emotion}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Total Events</span>
          <span className="text-teal-400 font-semibold">{events.length}</span>
        </div>
      </div>
    </div>
  );
};
