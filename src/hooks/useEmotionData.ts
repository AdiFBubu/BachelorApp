import { useState, useEffect, useCallback, useRef } from 'react';

export type EmotionType = 'Anger' | 'Contempt' | 'Disgust' | 'Fear' | 'Happiness' | 'Sadness' | 'Surprise';

export interface EmotionData {
  Anger: number;
  Contempt: number;
  Disgust: number;
  Fear: number;
  Happiness: number;
  Sadness: number;
  Surprise: number;
}

export interface EmotionSnapshot extends EmotionData {
  timestamp: number;
}

export interface ClinicalEvent {
  id: string;
  timestamp: number;
  time: string;
  emotion: EmotionType;
  intensity: number;
  message: string;
}

// Baseline emotion levels to show when no data is available
const BASELINE_EMOTIONS: EmotionData = {
  Anger: 5,
  Contempt: 3,
  Disgust: 4,
  Fear: 8,
  Happiness: 45,
  Sadness: 12,
  Surprise: 8,
};

const HISTORY_SAMPLE_INTERVAL_MS = 500;
const HISTORY_RETENTION_MINUTES = 65;
const MAX_HISTORY_POINTS = Math.ceil((HISTORY_RETENTION_MINUTES * 60 * 1000) / HISTORY_SAMPLE_INTERVAL_MS);

export const useEmotionData = () => {
  const [currentEmotions, setCurrentEmotions] = useState<EmotionData>(BASELINE_EMOTIONS);
  const [emotionHistory, setEmotionHistory] = useState<EmotionSnapshot[]>([]);
  const [clinicalEvents, setClinicalEvents] = useState<ClinicalEvent[]>([]);
  const [spikeFlash, setSpikeFlash] = useState<EmotionType | null>(null);
  const [showBaseline, setShowBaseline] = useState(false);
  const latestEmotionsRef = useRef<EmotionData>(BASELINE_EMOTIONS);

  const addClinicalEvent = useCallback((emotion: EmotionType, intensity: number) => {
    const now = new Date();
    const timeString = now.toTimeString().substring(0, 5);

    const messages: Record<string, string[]> = {
      Anger: ['Elevated anger detected', 'Sudden spike in anger', 'Anger intensity rising'],
      Contempt: ['Contempt expression detected', 'Sudden spike in contempt', 'Contempt pattern observed'],
      Disgust: ['Disgust response detected', 'Disgust expression rising', 'Strong disgust reaction'],
      Fear: ['Fear response detected', 'Anxiety spike observed', 'Fear intensity rising'],
      Happiness: ['Positive emotion detected', 'Happiness spike observed', 'Positive engagement rising'],
      Sadness: ['Sadness detected', 'Depressive affect observed', 'Sadness intensity rising'],
      Surprise: ['Surprise reaction detected', 'Unexpected response', 'Surprise expression observed'],
    };

    const event: ClinicalEvent = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      time: timeString,
      emotion,
      intensity,
      message: messages[emotion][Math.floor(Math.random() * messages[emotion].length)], // randomize message for variety
    };

    setClinicalEvents(prev => [event, ...prev].slice(0, 20)); // keep only latest 20 events
  }, []);

  const mapProbsToEmotionData = (probs: Record<string, number>): EmotionData => {
    const out: EmotionData = { Anger: 0, Contempt: 0, Disgust: 0, Fear: 0, Happiness: 0, Sadness: 0, Surprise: 0 };
    const find = (label: string) => {
      for (const k in probs) {
        if (k.toLowerCase() === label.toLowerCase()) return probs[k];
      }
      return undefined;
    };

    (Object.keys(out) as EmotionType[]).forEach((k) => {
      const v = find(k);
      const normalized = (v ?? 0) <= 1 ? (v ?? 0) * 100 : (v ?? 0);
      out[k] = Math.max(0, Math.min(100, normalized));
    });

    return out;
  };

  const resetEmotionSession = useCallback(() => {
    setCurrentEmotions(BASELINE_EMOTIONS);
    setEmotionHistory([]);
    setClinicalEvents([]);
    setSpikeFlash(null);
    latestEmotionsRef.current = BASELINE_EMOTIONS;
  }, []);

  const setExternalEmotions = useCallback((probs: Record<string, number> | null) => {
    if (probs === null) {
      setCurrentEmotions(BASELINE_EMOTIONS);
      latestEmotionsRef.current = BASELINE_EMOTIONS;
      return;
    }
    
    // map and update emotions atomically
    const mapped = mapProbsToEmotionData(probs);
    setCurrentEmotions(mapped); // so that UI updates with new emotions
    latestEmotionsRef.current = mapped; // keep ref in sync for history and event detection

    // detect strong spike and add clinical event
    const entries = Object.entries(mapped) as [EmotionType, number][];
    if (entries.length > 0) {
      const max = entries.reduce((acc, cur) => (cur[1] > acc[1] ? cur : acc), entries[0]);
      if (max && max[1] > 60) {
        setSpikeFlash(max[0]);
        setTimeout(() => setSpikeFlash(null), 5000);
        addClinicalEvent(max[0], max[1]);
      }
    }
  }, [addClinicalEvent]);

  useEffect(() => {
    latestEmotionsRef.current = currentEmotions;
  }, [currentEmotions]);


  // emotionHistory helps seeing the constant line in the graphs until a new emotion snapshot arrives
  useEffect(() => {
    const historyInterval = window.setInterval(() => {
      setEmotionHistory(prev => {
        const newSnapshot: EmotionSnapshot = {
          ...latestEmotionsRef.current,
          timestamp: Date.now(),
        };
        return [...prev, newSnapshot].slice(-MAX_HISTORY_POINTS); // last N points based on retention policy
      });
    }, HISTORY_SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(historyInterval);
  }, []);

  return {
    currentEmotions: showBaseline ? BASELINE_EMOTIONS : currentEmotions,
    baselineEmotions: BASELINE_EMOTIONS,
    emotionHistory,
    clinicalEvents,
    spikeFlash,
    showBaseline,
    setShowBaseline,
    resetEmotionSession,
    setExternalEmotions,
  };
};
