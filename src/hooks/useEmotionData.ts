import { useState, useEffect, useCallback } from 'react';

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

const BASELINE_EMOTIONS: EmotionData = {
  Anger: 5,
  Contempt: 3,
  Disgust: 4,
  Fear: 8,
  Happiness: 45,
  Sadness: 12,
  Surprise: 8,
};

export const useEmotionData = () => {
  const [currentEmotions, setCurrentEmotions] = useState<EmotionData>(BASELINE_EMOTIONS);
  const [emotionHistory, setEmotionHistory] = useState<EmotionSnapshot[]>([]);
  const [clinicalEvents, setClinicalEvents] = useState<ClinicalEvent[]>([]);
  const [spikeFlash, setSpikeFlash] = useState<EmotionType | null>(null);
  const [showBaseline, setShowBaseline] = useState(false);

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
      message: messages[emotion][Math.floor(Math.random() * messages[emotion].length)],
    };

    setClinicalEvents(prev => [event, ...prev].slice(0, 20));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentEmotions(prev => {
        const newEmotions = { ...prev };
        const emotions = Object.keys(newEmotions) as EmotionType[];

        emotions.forEach(emotion => {
          const shouldSpike = Math.random() < 0.15;

          if (shouldSpike) {
            const spikeIntensity = Math.random() * 40 + 20;
            newEmotions[emotion] = Math.min(100, newEmotions[emotion] + spikeIntensity);

            if (spikeIntensity > 30) {
              setSpikeFlash(emotion);
              setTimeout(() => setSpikeFlash(null), 300);
              addClinicalEvent(emotion, newEmotions[emotion]);
            }
          } else {
            const drift = (Math.random() - 0.5) * 8;
            const baseline = BASELINE_EMOTIONS[emotion];
            const decay = (newEmotions[emotion] - baseline) * 0.15;
            newEmotions[emotion] = Math.max(0, Math.min(100, newEmotions[emotion] + drift - decay));
          }
        });

        return newEmotions;
      });
    }, 150);

    return () => clearInterval(interval);
  }, [addClinicalEvent]);

  useEffect(() => {
    const historyInterval = setInterval(() => {
      setEmotionHistory(prev => {
        const newSnapshot: EmotionSnapshot = {
          ...currentEmotions,
          timestamp: Date.now(),
        };
        return [...prev, newSnapshot].slice(-50);
      });
    }, 500);

    return () => clearInterval(historyInterval);
  }, [currentEmotions]);

  return {
    currentEmotions: showBaseline ? BASELINE_EMOTIONS : currentEmotions,
    baselineEmotions: BASELINE_EMOTIONS,
    emotionHistory,
    clinicalEvents,
    spikeFlash,
    showBaseline,
    setShowBaseline,
  };
};
