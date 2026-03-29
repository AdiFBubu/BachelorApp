import { Video, Zap } from 'lucide-react';
import { EmotionType } from '../hooks/useEmotionData';

interface VideoFeedProps {
  isLive: boolean;
  spikeFlash: EmotionType | null;
  showBaseline: boolean;
}

export const VideoFeed = ({ isLive, spikeFlash, showBaseline }: VideoFeedProps) => {
  return (
    <div className="relative bg-slate-900 rounded-lg overflow-hidden aspect-video">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Video className="w-16 h-16 text-slate-600 mx-auto" />
          <p className="text-slate-500 text-sm">Video Feed Placeholder</p>
          <p className="text-slate-600 text-xs">Camera stream simulation active</p>
        </div>
      </div>

      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-80 border-2 rounded-lg transition-all duration-300 ${
          spikeFlash
            ? 'border-teal-400 shadow-lg shadow-teal-400/50'
            : 'border-teal-500/30'
        }`}
      >
        <div className="absolute -top-8 left-0 right-0 flex items-center justify-center space-x-2">
          <div className="bg-slate-800/90 backdrop-blur px-3 py-1 rounded-full text-xs text-teal-400 flex items-center space-x-2">
            <div className="w-1.5 h-1.5 bg-teal-400 rounded-full"></div>
            <span>Face Detection Active</span>
          </div>
        </div>

        {spikeFlash && (
          <div className="absolute -top-3 -right-3 animate-ping">
            <Zap className="w-6 h-6 text-teal-400 fill-teal-400" />
          </div>
        )}
      </div>

      <div className="absolute top-4 left-4 flex items-center space-x-2">
        {isLive && (
          <div className="flex items-center space-x-2 bg-red-500/20 backdrop-blur px-3 py-1.5 rounded-full border border-red-500/50">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-red-400 text-sm font-semibold">LIVE</span>
          </div>
        )}
      </div>

      {showBaseline && (
        <div className="absolute bottom-4 left-4 bg-blue-500/20 backdrop-blur px-4 py-2 rounded-lg border border-blue-500/50">
          <span className="text-blue-400 text-sm font-semibold">Baseline Mode</span>
        </div>
      )}

      <div className="absolute bottom-4 right-4 bg-slate-800/90 backdrop-blur px-3 py-1.5 rounded-lg">
        <span className="text-slate-400 text-xs">30 FPS • 1080p</span>
      </div>
    </div>
  );
};
