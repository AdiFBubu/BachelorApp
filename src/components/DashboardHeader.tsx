import { Brain, Zap, Shield, TrendingUp } from 'lucide-react';

interface DashboardHeaderProps {
  clinicalStatus: 'normal' | 'high-risk' | 'positive';
  showBaseline: boolean;
  onToggleBaseline: () => void;
}

export const DashboardHeader = ({ clinicalStatus, showBaseline, onToggleBaseline }: DashboardHeaderProps) => {
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
            onClick={onToggleBaseline}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              showBaseline
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {showBaseline ? 'Viewing Baseline' : 'Show Baseline'}
          </button>

          <div className="flex items-center space-x-2 px-4 py-2 bg-slate-800 rounded-lg">
            <Zap className="w-4 h-4 text-teal-400" />
            <span className="text-sm text-slate-300">CSNN Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};
