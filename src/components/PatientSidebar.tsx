import { User, Clock, Activity } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PatientSidebarProps {
  riskLevel: 'Low' | 'Medium' | 'High';
}

export const PatientSidebar = ({ riskLevel }: PatientSidebarProps) => {
  const [sessionDuration, setSessionDuration] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const riskColors = {
    Low: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    Medium: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    High: 'text-red-400 bg-red-400/10 border-red-400/30',
  };

  return (
    <div className="bg-slate-900/50 border-r border-slate-800 p-6 space-y-6">
      <div className="flex items-center space-x-3 pb-4 border-b border-slate-800">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center">
          <User className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-white font-semibold">Sarah Mitchell</h2>
          <p className="text-slate-400 text-sm">ID: NP-2847</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center space-x-2 text-slate-300">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">Session Duration</span>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{formatDuration(sessionDuration)}</p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center space-x-2 text-slate-300">
            <Activity className="w-4 h-4" />
            <span className="text-sm font-medium">Clinical Risk Level</span>
          </div>
          <div className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold border ${riskColors[riskLevel]}`}>
            {riskLevel}
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
          <h3 className="text-slate-300 text-sm font-medium">Patient Info</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Age</span>
              <span className="text-slate-200">34</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Diagnosis</span>
              <span className="text-slate-200">GAD, MDD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Session #</span>
              <span className="text-slate-200">12</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Provider</span>
              <span className="text-slate-200">Dr. Chen</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
