import { Brain, Zap, Shield, TrendingUp } from 'lucide-react';
import { InferenceModel, inferenceModelLabels } from '../types/inference';

interface DashboardHeaderProps {
  clinicalStatus: 'normal' | 'high-risk' | 'positive';
  showLiveMonitor: boolean;
  onToggleLiveMonitor: () => void;
  showClinicalInsights: boolean;
  onToggleClinicalInsights: () => void;
  modelType: InferenceModel;
  onModelChange: (model: InferenceModel) => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onLogout: () => void;
}

export const DashboardHeader = ({
  clinicalStatus,
  showLiveMonitor,
  onToggleLiveMonitor,
  showClinicalInsights,
  onToggleClinicalInsights,
  modelType,
  onModelChange,
  panelOpen,
  onTogglePanel,
  onLogout,
}: DashboardHeaderProps) => {
  const statusConfig = {
    normal: {
      label: 'Normal Session',
      icon: Shield,
      color: 'text-slate-400',
      bgColor: 'bg-slate-800/50',
      borderColor: 'border-slate-700',
    },
    'high-risk': {
      label: 'High Risk: Agitation',
      icon: Zap,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/50 animate-pulse',
    },
    'positive': {
      label: 'Positive Engagement',
      icon: TrendingUp,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/50',
    },
  };

  const config = statusConfig[clinicalStatus];
  const Icon = config.icon;
  const modelOptions: InferenceModel[] = ['ann', 'csnn'];

  return (
    <div className="bg-slate-900/50 border-b border-slate-800 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Neuro-Guardian</h1>
              <p className="text-xs text-slate-400">Edge-AI Emotion Analysis Platform</p>
            </div>
          </div>

          <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
            <Icon className={`w-4 h-4 ${config.color}`} />
            <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
          </div>
        </div>

        <div className="flex items-center space-x-3">

          <button
            onClick={onToggleLiveMonitor}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              showLiveMonitor ? 'bg-teal-500 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            Live Monitor
          </button>

          <button
            onClick={onToggleClinicalInsights}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              showClinicalInsights ? 'bg-teal-500 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            Insights
          </button>

          {/* <div className="flex items-center space-x-1 rounded-lg bg-slate-800/80 p-1">
            <span className="px-2 text-[10px] uppercase tracking-wide text-slate-400">Model</span>
            {modelOptions.map((option) => {
              const active = option === modelType;
              return (
                <button
                  key={option}
                  onClick={() => onModelChange(option)}
                  aria-pressed={active}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                    active
                      ? 'bg-teal-500 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {inferenceModelLabels[option]}
                </button>
              );
            })}
          </div> */}

          <button
            onClick={onTogglePanel}
            className="px-3 py-2 rounded-lg text-sm bg-slate-800 text-slate-300 hover:bg-slate-700"
            title={panelOpen ? 'Hide panel' : 'Show panel'}
          >
            {panelOpen ? '← Hide Panel' : '→ Show Panel'}
          </button>

          <button
            onClick={onLogout}
            className="px-3 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-500"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};
