import { FileText, AlertCircle } from 'lucide-react';
import { ClinicalEvent, EmotionType } from '../hooks/useEmotionData';
import { MonitoringAlert } from '../types/hospital';

interface ClinicalInsightsProps {
  events: ClinicalEvent[];
  currentAlerts: MonitoringAlert[];
  prolongedAlerts: MonitoringAlert[];
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

const severityStyle: Record<MonitoringAlert['severity'], string> = {
  LOW: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30',
  MEDIUM: 'text-amber-300 bg-amber-500/10 border-amber-400/30',
  HIGH: 'text-red-300 bg-red-500/10 border-red-400/30',
};

const formatAlertTime = (value: string) => {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const renderAlertCards = (items: MonitoringAlert[], emptyMessage: string) => {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-xs text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return items.map((alert) => (
    <div
      key={alert.id}
      className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 hover:border-teal-500/30 transition-colors"
    >
      <div className="flex items-start space-x-3">
        <span className="text-lg mt-0.5">⚠️</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono text-teal-400">{formatAlertTime(alert.createdAt)}</span>
            <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${severityStyle[alert.severity]}`}>
              {alert.severity}
            </span>
          </div>
          <p className="text-sm text-slate-300">{alert.message}</p>
          <span className="text-xs text-slate-500">{alert.type}</span>
        </div>
      </div>
    </div>
  ));
};

const renderEventCards = (items: ClinicalEvent[], emptyMessage: string) => {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-xs text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return items.map((event) => (
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
  ));
};

export const ClinicalInsights = ({ events, currentAlerts, prolongedAlerts }: ClinicalInsightsProps) => {
  const totalEvents = currentAlerts.length + prolongedAlerts.length + events.length;

  return (
    <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-800 h-full min-h-0 flex flex-col">
      <div className="flex items-center space-x-2 mb-4">
        <FileText className="w-5 h-5 text-teal-400" />
        <h3 className="text-white font-semibold">Clinical Insights</h3>
      </div>

      {totalEvents === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-slate-500 text-sm">Monitoring for events...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-5 pr-2">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Alerts</h4>
              <span className="text-xs font-semibold text-teal-400">{currentAlerts.length}</span>
            </div>
            <div className="space-y-3">
              {renderAlertCards(currentAlerts, 'No active care-team alerts for this patient.')}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Prolonged Alerts</h4>
              <span className="text-xs font-semibold text-teal-400">{prolongedAlerts.length}</span>
            </div>
            <div className="space-y-3">
              {renderAlertCards(prolongedAlerts, 'No prolonged high-risk streaks in the selected window.')}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Live Session Events</h4>
              <span className="text-xs font-semibold text-teal-400">{events.length}</span>
            </div>
            <div className="space-y-3">
              {renderEventCards(events, 'No live camera events detected yet.')}
            </div>
          </section>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Total Events</span>
          <span className="text-teal-400 font-semibold">{totalEvents}</span>
        </div>
      </div>
    </div>
  );
};
