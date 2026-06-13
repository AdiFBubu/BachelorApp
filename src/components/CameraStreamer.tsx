import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_WS_URL } from '../config/backend';
import { EmotionType } from '../hooks/useEmotionData';
import WebSocketClient from '../lib/websocketClient';
import { InferenceModel, inferenceModelLabels, inferenceModelToBackend } from '../types/inference';

interface CameraStreamerProps {
  isLive: boolean;
  spikeFlash: EmotionType | null;
  modelType: InferenceModel;
  onProbabilities?: (probs: Record<string, number>) => void;
}

export const CameraStreamer = ({ isLive, spikeFlash, modelType, onProbabilities }: CameraStreamerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsClientRef = useRef<WebSocketClient | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const startRequestIdRef = useRef(0);
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [connected, setConnected] = useState(false);
  const [, setLastResp] = useState<unknown>(null);
  const cycleTimerRef = useRef<number | null>(null);
  const captureAbortRef = useRef<boolean>(false);
  const lastModelSentRef = useRef<InferenceModel | null>(null);

  const TARGET_W = 224; // model input width
  const TARGET_H = 224; // model input height
  const QUALITY = 1.0; // JPEG quality
  const BATCH_SIZE = 10;
  const BATCH_INTERVAL_MS = 300; // 10 frames in ~3s
  const PAUSE_MS = 5000; // 5s pause
  const WS_URL = BACKEND_WS_URL;

  useEffect(() => {
    return () => {
      stopStreaming();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLive) {
      void startStreaming();
      return;
    }

    if (!isLive) {
      stopStreaming();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  const sendModelSelection = useCallback((selected: InferenceModel) => {
    const client = wsClientRef.current;
    if (!client || !client.isOpen()) return false;
    const payload = { type: 'switch_model', model: inferenceModelToBackend[selected] };
    const ok = client.send(JSON.stringify(payload));
    if (ok) {
      lastModelSentRef.current = selected;
    }
    return ok;
  }, []);

  function connectWs() {
    if (wsClientRef.current && wsClientRef.current.isOpen()) return;
    try {
      const client = new WebSocketClient(WS_URL, { binaryType: 'arraybuffer', autoReconnect: true, reconnectIntervalMs: 3000 });

      client.onOpen = () => {
        setConnected(true);
        sendModelSelection(modelType);
      };

      client.onClose = () => {
        setConnected(false);
        lastModelSentRef.current = null;
      };

      client.onError = () => {
        setConnected(false);
        lastModelSentRef.current = null;
      };

      client.onParsedMessage = (parsed) => {
        try {
          setLastResp(parsed);
          console.log('[CameraStreamer] Received:', JSON.stringify(parsed).substring(0, 300));

          if (onProbabilities && parsed && typeof parsed === 'object') {
            const source = parsed.probabilities || parsed.result?.probabilities || null;
            if (source && typeof source === 'object') {
              try {
                const indexToEmotion: Record<string, string> = {
                  '1': 'Anger',
                  '2': 'Contempt',
                  '3': 'Disgust',
                  '4': 'Fear',
                  '5': 'Happiness',
                  '6': 'Sadness',
                  '7': 'Surprise',
                };

                const probs: Record<string, number> = {};
                Object.keys(source).forEach((k) => {
                  const emotionKey = indexToEmotion[k] || k;
                  const v = source[k];
                  probs[emotionKey] = typeof v === 'number' ? v : Number(v);
                });

                console.log('[CameraStreamer] Extracted probs:', probs);
                onProbabilities(probs);
              } catch (e) {
                console.warn('[CameraStreamer] Probability extraction failed:', e);
              }
            } else {
              console.log('[CameraStreamer] No probabilities found in:', parsed);
            }
          }
        } catch (err) {
          console.error('[CameraStreamer] Message parse error:', err);
          setLastResp({ raw: parsed });
        }
      };

      client.onRawMessage = (raw) => {
        setLastResp({ raw });
      };

      client.connect();
      wsClientRef.current = client;
    } catch (err) {
      console.error('WS connect error', err);
      setConnected(false);
    }
  }

  function disconnectWs() {
    if (wsClientRef.current) {
      try { wsClientRef.current.close(); } catch { /* ignore close errors */ }
      wsClientRef.current = null;
    }
    setConnected(false);
    lastModelSentRef.current = null;
  }

  async function startStreaming() {
    if (streaming) return;
    const requestId = ++startRequestIdRef.current;
    captureAbortRef.current = false;
    try {
      connectWs();
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); // request camera access
      if (requestId !== startRequestIdRef.current || captureAbortRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // prepare canvas
      if (!canvasRef.current) {
        const c = document.createElement('canvas');
        c.width = TARGET_W;
        c.height = TARGET_H;
        canvasRef.current = c; // offscreen canvas for processing
      }

      setStreaming(true);

      // start first cycle immediately
      runCycle();
    } catch (err) {
      console.error('startStreaming error', err);
    }
  }

  function stopStreaming() {
    startRequestIdRef.current += 1;
    setStreaming(false);
    setRecording(false);
    // stop any ongoing cycle or capture
    captureAbortRef.current = true;
    if (cycleTimerRef.current) {
      clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    disconnectWs();
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function captureFrameAsArrayBuffer(): Promise<ArrayBuffer | null> {
    return new Promise((resolve) => {
      // capture current video frame to canvas and get as ArrayBuffer
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c) return resolve(null);
      const ctx = c.getContext('2d');
      if (!ctx) return resolve(null);

      // this makes a "photo" of the current video frame at the desired resolution (TARGET_W x TARGET_H)
      const minDim = Math.min(v.videoWidth, v.videoHeight);
      const sx = (v.videoWidth - minDim) / 2;
      const sy = (v.videoHeight - minDim) / 2;
      ctx.drawImage(v, sx, sy, minDim, minDim, 0, 0, c.width, c.height);

      // get JPEG blob (compressed file) and convert to ArrayBuffer (raw binary)
      c.toBlob(async (blob) => {
        if (!blob) return resolve(null);
        try {
          const ab = await blob.arrayBuffer();
          resolve(ab);
        } catch {
          resolve(null);
        }
      }, 'image/jpeg', QUALITY);
    });
  }

  async function captureBatchAndSend() {
    for (let i = 0; i < BATCH_SIZE; i++) {
      // stop if abort requested or camera not available
      if (captureAbortRef.current) break;
      if (!videoRef.current || !videoRef.current.srcObject) break;
      try {
        const ab = await captureFrameAsArrayBuffer();
        if (ab && wsClientRef.current && wsClientRef.current.isOpen()) {
          wsClientRef.current.send(ab);
        }
      } catch (err) {
        console.warn('batch send error', err);
      }
      // wait BATCH_INTERVAL_MS before capturing next frame
      await sleep(BATCH_INTERVAL_MS);
    }
  }

  async function runCycle() {
    // don't rely on React state `streaming` here (setState is async)
    if (captureAbortRef.current) return;
    setRecording(true);
    // capture and send a batch of frames, then pause until next cycle
    await captureBatchAndSend();
    setRecording(false);

    // schedule next cycle after PAUSE_MS if not aborted and camera still active
    if (!captureAbortRef.current && videoRef.current && videoRef.current.srcObject) {
      cycleTimerRef.current = window.setTimeout(() => {
        runCycle();
      }, PAUSE_MS) as unknown as number;
    }
  }

  useEffect(() => {
    if (!connected) return;
    if (lastModelSentRef.current === modelType) return;
    sendModelSelection(modelType);
  }, [connected, modelType, sendModelSelection]);

  return (
    <div className="relative bg-slate-900 h-full rounded-lg aspect-video flex flex-col">
      <div className="p-3 flex items-start justify-between">
        <div>
          <div className="text-slate-300 font-medium">Live Camera</div>
          {/* <div className="text-slate-500 text-xs">Streaming to model via WebSocket</div> */}
          <div className="text-slate-500 text-xs mt-1">
            {isLive ? 'Session Live' : 'Session Paused'}
            {spikeFlash ? ` • Spike: ${spikeFlash}` : ''}
          </div>
          <div className="text-slate-500 text-xs">Model: {inferenceModelLabels[modelType]}</div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${recording ? 'bg-amber-400' : 'bg-slate-600'}`}></div>
            <div className="text-xs text-slate-300">{recording ? 'Recording' : 'Idle'}</div>
          </div>

          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
            <button
              onClick={() => (streaming ? stopStreaming() : startStreaming())}
              className="px-3 py-1 rounded bg-slate-800 text-slate-200"
            >
              {streaming ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
          {/* <img 
            src="src/components/user-photo.png" 
            alt="Default User"
            className="w-[320px] h-[240px] object-cover rounded-md border border-slate-700" 
          /> */}
          <video ref={videoRef} className="w-[320px] h-[240px] object-cover rounded-md" muted playsInline />
        </div>

        {/* <div className="ml-4 text-sm text-slate-300">
          <pre className="whitespace-pre-wrap max-w-xs">{JSON.stringify(lastResp, null, 2)}</pre>
        </div> */}
      </div>

      <div className="flex justify-between items-center w-full p-3">
        <div className="text-xs text-slate-400">
          Resolution sent: {TARGET_W}x{TARGET_H} • Quality {QUALITY}
        </div>

        <div className="bg-black/40 px-2 py-1 rounded text-xs text-white">
          {connected ? `Model connected (${inferenceModelLabels[modelType]})` : 'Model disconnected'}
        </div>
      </div>
    </div>
  );
};
