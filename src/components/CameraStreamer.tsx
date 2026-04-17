import { useEffect, useRef, useState } from 'react';
import { BACKEND_WS_URL } from '../config/backend';
import { EmotionType } from '../hooks/useEmotionData';
import WebSocketClient from '../lib/websocketClient';

interface CameraStreamerProps {
  isLive: boolean;
  spikeFlash: EmotionType | null;
  onProbabilities?: (probs: Record<string, number>) => void;
}

export const CameraStreamer = ({ isLive, spikeFlash, onProbabilities }: CameraStreamerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsClientRef = useRef<WebSocketClient | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [connected, setConnected] = useState(false);
  const [lastResp, setLastResp] = useState<unknown>(null);
  const cycleTimerRef = useRef<number | null>(null);
  const captureAbortRef = useRef<boolean>(false);

  const TARGET_W = 48; // model input width
  const TARGET_H = 48; // model input height
  const QUALITY = 0.75; // JPEG quality
  const BATCH_SIZE = 10;
  const BATCH_INTERVAL_MS = 300; // 10 frames in ~3s
  const PAUSE_MS = 10000; // 10s pause
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

  function connectWs() {
    if (wsClientRef.current && wsClientRef.current.isOpen()) return;
    try {
      const client = new WebSocketClient(WS_URL, { binaryType: 'arraybuffer', autoReconnect: true, reconnectIntervalMs: 3000 });

      client.onOpen = () => {
        setConnected(true);
      };

      client.onClose = () => {
        setConnected(false);
      };

      client.onError = () => {
        setConnected(false);
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
  }

  async function startStreaming() {
    if (streaming) return;
    try {
      connectWs();
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); // request camera access
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

      // reset abort flag and start periodic recording cycle
      captureAbortRef.current = false;

      // start first cycle immediately
      runCycle();
    } catch (err) {
      console.error('startStreaming error', err);
    }
  }

  function stopStreaming() {
    setStreaming(false);
    setRecording(false);
    // stop any ongoing cycle or capture
    captureAbortRef.current = true;
    if (cycleTimerRef.current) {
      clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
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
      ctx.drawImage(v, 0, 0, c.width, c.height);

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

  return (
    <div className="relative bg-slate-900 rounded-lg aspect-video flex flex-col">
      <div className="p-3 flex items-start justify-between">
        <div>
          <div className="text-slate-300 font-medium">Live Camera</div>
          <div className="text-slate-500 text-xs">Streaming to model via WebSocket</div>
          <div className="text-slate-500 text-xs mt-1">
            {isLive ? 'Session Live' : 'Session Paused'}
            {spikeFlash ? ` • Spike: ${spikeFlash}` : ''}
          </div>
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
          <video ref={videoRef} className="w-[320px] h-[240px] object-cover rounded-md" muted playsInline />
          <div className="absolute bottom-2 left-2 bg-black/40 px-2 py-1 rounded text-xs text-white">
            {connected ? 'Model connected' : 'Model disconnected'}
          </div>
        </div>

        <div className="ml-4 text-sm text-slate-300">
          <pre className="whitespace-pre-wrap max-w-xs">{JSON.stringify(lastResp, null, 2)}</pre>
        </div>
      </div>

      <div className="p-3 text-xs text-slate-400">Resolution sent: {TARGET_W}x{TARGET_H} • Quality {QUALITY}</div>
    </div>
  );
};
