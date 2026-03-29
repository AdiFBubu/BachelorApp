import { useEmotionData } from './hooks/useEmotionData';
import { DashboardHeader } from './components/DashboardHeader';
import { PatientSidebar } from './components/PatientSidebar';
import { VideoFeed } from './components/VideoFeed';
import { LiveSpikeMonitor } from './components/LiveSpikeMonitor';
import { SentimentDistribution } from './components/SentimentDistribution';
import { ClinicalInsights } from './components/ClinicalInsights';
import { useMemo } from 'react';

function App() {
  const {
    currentEmotions,
    emotionHistory,
    clinicalEvents,
    spikeFlash,
    showBaseline,
    setShowBaseline,
  } = useEmotionData();

  const clinicalStatus = useMemo(() => {
    if (currentEmotions.Anger > 60 && currentEmotions.Fear > 60) {
      return 'high-risk';
    }
    if (currentEmotions.Happiness > 50 && currentEmotions.Surprise > 30) {
      return 'positive';
    }
    return 'normal';
  }, [currentEmotions]);

  const riskLevel = useMemo(() => {
    const avgNegative = (currentEmotions.Anger + currentEmotions.Fear + currentEmotions.Sadness) / 3;
    if (avgNegative > 50) return 'High';
    if (avgNegative > 25) return 'Medium';
    return 'Low';
  }, [currentEmotions]);

  const borderGlow = clinicalStatus === 'high-risk'
    ? 'shadow-2xl shadow-red-500/20 border-red-500/30'
    : clinicalStatus === 'positive'
    ? 'shadow-2xl shadow-emerald-500/20 border-emerald-500/30'
    : 'border-slate-800';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <DashboardHeader
        clinicalStatus={clinicalStatus}
        showBaseline={showBaseline}
        onToggleBaseline={() => setShowBaseline(!showBaseline)}
      />

      <div className="flex h-[calc(100vh-73px)]">
        <div className="w-72">
          <PatientSidebar riskLevel={riskLevel} />
        </div>

        <div className={`flex-1 p-6 transition-all duration-500 border-l ${borderGlow}`}>
          <div className="grid grid-cols-3 gap-6 h-full">
            <div className="col-span-2 space-y-6">
              <VideoFeed
                isLive={true}
                spikeFlash={spikeFlash}
                showBaseline={showBaseline}
              />

              <LiveSpikeMonitor emotionHistory={emotionHistory} />
            </div>

            <div className="space-y-6">
              <SentimentDistribution
                emotions={currentEmotions}
                spikeFlash={spikeFlash}
              />

              <ClinicalInsights events={clinicalEvents} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
