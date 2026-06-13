import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { backendPaths } from '../config/backend';
import { useAuth } from '../hooks/useAuth';
import { useEmotionData, EmotionSnapshot } from '../hooks/useEmotionData';
import { DashboardHeader } from '../components/DashboardHeader';
import { PatientSidebar } from '../components/PatientSidebar';
import { CameraStreamer } from '../components/CameraStreamer';
import { LiveSpikeMonitor } from '../components/LiveSpikeMonitor';
import { SentimentDistribution } from '../components/SentimentDistribution';
import { ClinicalInsights } from '../components/ClinicalInsights';
import {
  DoctorPatientDetailPayload,
  DoctorPatientSummary,
} from '../types/hospital';
import { InferenceModel } from '../types/inference';

type PatientsResponse = {
  patients: DoctorPatientSummary[];
};

type DetailLoadMode = 'initial' | 'background';

type RiskLevel = 'Low' | 'Medium' | 'High';

type RiskNotification = {
  id: string;
  from: RiskLevel;
  to: RiskLevel;
  direction: 'up' | 'down';
  patientName: string;
};

const riskLevelOrder: Record<RiskLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
};

const formatDate = (value: string) => {
  return new Date(value).toLocaleString();
};

export const DoctorDashboard = () => {
  const { user, api, logout } = useAuth();
  const {
    currentEmotions,
    emotionHistory,
    clinicalEvents,
    spikeFlash,
    resetEmotionSession,
    setExternalEmotions,
  } = useEmotionData();

  const [availablePatients, setAvailablePatients] = useState<DoctorPatientSummary[]>([]);
  const [myPatients, setMyPatients] = useState<DoctorPatientSummary[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientDetail, setPatientDetail] = useState<DoctorPatientDetailPayload | null>(null);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busyPatientId, setBusyPatientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLiveMonitor, setShowLiveMonitor] = useState(false);
  const [showClinicalInsights, setShowClinicalInsights] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [inferenceModel, setInferenceModel] = useState<InferenceModel>('ann');
  const [riskNotification, setRiskNotification] = useState<RiskNotification | null>(null);
  const lastReadingPushAtRef = useRef(0);
  const previousRiskLevelRef = useRef<RiskLevel | null>(null);

  const requestJson = useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    const response = await api(path, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data as T;
  }, [api]);

  const refreshPatientLists = useCallback(async () => {
    setLoadingLists(true);
    setError(null);
    try {
      const [availableData, myData] = await Promise.all([
        requestJson<PatientsResponse>(backendPaths.doctor.availablePatients),
        requestJson<PatientsResponse>(backendPaths.doctor.myPatients),
      ]);

      setAvailablePatients(availableData.patients);
      setMyPatients(myData.patients);
      setSelectedPatientId((prev) => {
        if (prev && myData.patients.some((patient) => patient.id === prev)) {
          return prev;
        }
        if (myData.patients.length > 0) {
          return myData.patients[0].id;
        }
        return null;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load patients';
      setError(message);
    } finally {
      setLoadingLists(false);
    }
  }, [requestJson]);

  useEffect(() => {
    void refreshPatientLists();
  }, [refreshPatientLists]);

  const loadPatientDetail = useCallback(async (patientId: string, mode: DetailLoadMode = 'initial') => {
    if (mode === 'initial') {
      setLoadingDetail(true);
      setError(null);
    }

    try {
      const detail = await requestJson<DoctorPatientDetailPayload>(
        backendPaths.doctor.patientDetail(patientId, '7d'),
      );
      setPatientDetail(detail);
    } catch (err) {
      if (mode === 'initial') {
        const message = err instanceof Error ? err.message : 'Unable to load patient detail';
        setError(message);
      }
    } finally {
      if (mode === 'initial') {
        setLoadingDetail(false);
      }
    }
  }, [requestJson]);

  useEffect(() => {
    if (!selectedPatientId) {
      setPatientDetail(null);
      return;
    }

    void loadPatientDetail(selectedPatientId, 'initial');
  }, [selectedPatientId, loadPatientDetail]);

  useEffect(() => {
    // Prevent dead-end state: when no patient is selected, keep panel open so
    // user can refresh lists, take patients, or logout.
    if (!selectedPatientId && !panelOpen) {
      setPanelOpen(true);
    }
  }, [selectedPatientId, panelOpen]);

  // useEffect(() => {
  //   if (!selectedPatientId) {
  //     return;
  //   }

  //   const interval = window.setInterval(() => {
  //     void loadPatientDetail(selectedPatientId, 'background');
  //   }, 15000);

  //   return () => window.clearInterval(interval);
  // }, [selectedPatientId, loadPatientDetail]);

  useEffect(() => {
    resetEmotionSession();
    lastReadingPushAtRef.current = 0;
    previousRiskLevelRef.current = null;
    setRiskNotification(null);
  }, [selectedPatientId, resetEmotionSession]);

  const takePatient = async (patientId: string) => {
    setBusyPatientId(patientId);
    setError(null);
    try {
      await requestJson<{ patient: DoctorPatientSummary }>(backendPaths.doctor.takePatient(patientId), {
        method: 'POST',
      });
      await refreshPatientLists();
      setSelectedPatientId(patientId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to take patient';
      setError(message);
    } finally {
      setBusyPatientId(null);
    }
  };

  // probs: the probabilities inferred by the AI model (they come from CameraStreamer via WebSocket)
  const handleProbabilities = useCallback(async (probs: Record<string, number>) => {
    setExternalEmotions(probs);

    if (!selectedPatientId) {
      return;
    }

    const now = Date.now();
    if (now - lastReadingPushAtRef.current < 5000) {
      return;
    }

    lastReadingPushAtRef.current = now;

    try {
      await api(backendPaths.doctor.readings(selectedPatientId), {
        method: 'POST',
        body: JSON.stringify({
          probabilities: probs,
          timestamp: new Date(now).toISOString(),
        }),
      });

      // Keep persisted and derived alert sections in sync with latest backend processing.
      // may be improved in the future in terms of efficiency by pushing only new alerts or using WebSocket for real-time updates instead of polling. / getting only the strictly necessary infos
      // since the emotionHistory already keeps the current timeline of emotions
      void loadPatientDetail(selectedPatientId, 'background');
    } catch {
      // Keep UI responsive even when persistence temporarily fails.
    }
  }, [api, selectedPatientId, setExternalEmotions, loadPatientDetail]);

  const selectedPatient = useMemo(() => {
    return myPatients.find((patient) => patient.id === selectedPatientId) || null;
  }, [myPatients, selectedPatientId]);

  const timelineHistory = useMemo<EmotionSnapshot[]>(() => {
    return (patientDetail?.monitoring.timeline || []).map((point) => ({
      timestamp: new Date(point.timestamp).getTime(),
      Anger: point.anger,
      Contempt: point.contempt,
      Disgust: point.disgust,
      Fear: point.fear,
      Happiness: point.happiness,
      Sadness: point.sadness,
      Surprise: point.surprise,
    }));
  }, [patientDetail]);

  const currentMonitoringAlerts = useMemo(() => {
    const monitoring = patientDetail?.monitoring;
    if (!monitoring) return [];

    return monitoring.currentAlerts || [];
  }, [patientDetail]);

  const prolongedMonitoringAlerts = useMemo(() => {
    const monitoring = patientDetail?.monitoring;
    if (!monitoring) return [];

    return monitoring.prolongedAlerts || [];
  }, [patientDetail]);

  const clinicalInsightEvents = useMemo(() => { // update only when clinicalEvents change, not on every update
    return [...clinicalEvents]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
  }, [clinicalEvents]);

  const clinicalStatus = useMemo(() => {
    const allAlerts = [...currentMonitoringAlerts, ...prolongedMonitoringAlerts];

    const hasCriticalAlert = allAlerts.some((alert) => alert.severity === 'HIGH');

    if (hasCriticalAlert || (currentEmotions.Anger > 60 || currentEmotions.Fear > 60)) {
      return 'high-risk';
    }
    if (currentEmotions.Happiness > 50 || currentEmotions.Surprise > 30) {
      return 'positive';
    }
    return 'normal';
  }, [currentEmotions, currentMonitoringAlerts, prolongedMonitoringAlerts]);

  const riskLevel = useMemo<RiskLevel>(() => {
    const avgNegative = (currentEmotions.Anger + currentEmotions.Fear + currentEmotions.Sadness) / 3;
    if (avgNegative > 50) return 'High';
    if (avgNegative > 25) return 'Medium';
    return 'Low';
  }, [currentEmotions]);

  useEffect(() => {
    if (!selectedPatientId || !selectedPatient) {
      previousRiskLevelRef.current = null;
      return;
    }

    const previousRisk = previousRiskLevelRef.current;
    if (!previousRisk) {
      previousRiskLevelRef.current = riskLevel;
      return;
    }

    if (previousRisk !== riskLevel) {
      const direction = riskLevelOrder[riskLevel] > riskLevelOrder[previousRisk] ? 'up' : 'down';
      setRiskNotification({
        id: `${Date.now()}`,
        from: previousRisk,
        to: riskLevel,
        direction,
        patientName: selectedPatient.fullName,
      });
    }

    previousRiskLevelRef.current = riskLevel;
  }, [riskLevel, selectedPatientId, selectedPatient]);

  useEffect(() => {
    if (!riskNotification) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRiskNotification((current) => {
        if (!current || current.id !== riskNotification.id) {
          return current;
        }
        return null;
      });
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [riskNotification]);

  const mergedMonitorHistory = useMemo<EmotionSnapshot[]>(() => {
    const merged = [...timelineHistory, ...emotionHistory]
      .filter((point) => Number.isFinite(point.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp);

    return merged.filter((point) => point.timestamp >= Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days filter
  }, [emotionHistory, timelineHistory]);

  const borderGlow =
    clinicalStatus === 'high-risk'
      ? 'shadow-2xl shadow-red-500/20 border-red-500/30'
      : clinicalStatus === 'positive'
      ? 'shadow-2xl shadow-emerald-500/20 border-emerald-500/30'
      : 'border-slate-800';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex">
      {panelOpen && (
        <aside className="w-96 bg-slate-900/60 border-r border-slate-800 flex flex-col transition-all duration-300">
          <div className="p-5 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/></svg>
                </div>
                <div className="text-lg font-semibold text-white">Doctor Panel</div>
              </div>
            </div>
            <div className="mt-3 space-y-3">
              <div className="text-xs text-slate-400">{user?.email}</div>
              <button
                onClick={() => void refreshPatientLists()}
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
              >
                Refresh patients
              </button>
              {!selectedPatient && (
                <button
                  onClick={logout}
                  className="w-full rounded bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-500"
                >
                  Logout
                </button>
              )}
              {error && <div className="text-xs text-red-400">{error}</div>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <section>
              <div className="text-sm font-semibold text-slate-200 mb-3">
                Available Patients ({availablePatients.length})
              </div>
              <div className="space-y-3">
                {availablePatients.length === 0 && (
                  <div className="rounded border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-500">
                    No unassigned patients right now.
                  </div>
                )}
                {availablePatients.map((patient) => (
                  <div key={patient.id} className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-white font-medium">{patient.fullName}</div>
                        <div className="text-xs text-slate-400">{patient.ward.name} • Bed {patient.bed.label}</div>
                      </div>
                      <button
                        onClick={() => void takePatient(patient.id)}
                        disabled={busyPatientId === patient.id}
                        className="rounded bg-teal-500 px-2 py-1 text-xs text-white disabled:opacity-60"
                      >
                        {busyPatientId === patient.id ? 'Taking...' : 'Take patient'}
                      </button>
                    </div>
                    <div className="text-xs text-slate-500">Checked in: {formatDate(patient.checkedInAt)}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="text-sm font-semibold text-slate-200 mb-3">My Patients ({myPatients.length})</div>
              <div className="space-y-2">
                {myPatients.length === 0 && (
                  <div className="rounded border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-500">
                    Pick a patient from the available list to start monitoring.
                  </div>
                )}
                {myPatients.map((patient) => {
                  const active = selectedPatientId === patient.id;
                  return (
                    <button
                      key={patient.id}
                      onClick={() => setSelectedPatientId(patient.id)}
                      className={`w-full text-left rounded border px-3 py-2 transition ${
                        active
                          ? 'border-teal-400 bg-teal-500/10 text-teal-200'
                          : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-sm font-medium">{patient.fullName}</div>
                      <div className="text-xs opacity-80">{patient.ward.name} • Bed {patient.bed.label}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </aside>
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        {!selectedPatient ? (
          <div className="flex items-center justify-center text-slate-500 h-64">
            {loadingLists ? 'Loading doctor workspace...' : 'Select a patient to open the monitoring dashboard.'}
          </div>
        ) : (
          <div className="flex flex-col min-h-0 flex-1">
            <DashboardHeader
              clinicalStatus={clinicalStatus}
              showLiveMonitor={showLiveMonitor}
              onToggleLiveMonitor={() => setShowLiveMonitor(!showLiveMonitor)}
              showClinicalInsights={showClinicalInsights}
              onToggleClinicalInsights={() => setShowClinicalInsights(!showClinicalInsights)}
              modelType={inferenceModel}
              onModelChange={setInferenceModel}
              panelOpen={panelOpen}
              onTogglePanel={() => setPanelOpen(!panelOpen)}
              onLogout={logout}
            />

            <div className="flex flex-1 overflow-hidden">
              <div className="w-80 shrink-0 overflow-y-auto">

                <PatientSidebar riskLevel={riskLevel} patient={selectedPatient} />
              </div>

              <div className={`flex-1 p-6 transition-all duration-500 border-l ${borderGlow} overflow-y-auto`}>
                {loadingDetail ? (
                  <div className="flex items-center justify-center text-slate-500 h-64">Loading patient detail...</div>
                ) : (
                  <div className="grid grid-cols-3 gap-6 auto-rows-max">
                    <div className="col-span-2 flex flex-col space-y-6 h-full min-h-0">
                      <CameraStreamer
                        isLive={true}
                        spikeFlash={spikeFlash}
                        modelType={inferenceModel}
                        onProbabilities={handleProbabilities}
                      />
                    </div>

                    <div className="flex flex-col space-y-6 h-full min-h-0">
                      <SentimentDistribution emotions={currentEmotions} spikeFlash={spikeFlash} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {showLiveMonitor && (
              <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/50" onClick={() => setShowLiveMonitor(false)} />

                <div className="relative w-[96%] md:w-[94%] lg:w-[88%] xl:w-[84%] max-w-[1800px] h-[86%] p-4">
                  <div className="absolute top-2 right-2 z-20">
                    <button
                      onClick={() => setShowLiveMonitor(false)}
                      className="px-3 py-1 rounded bg-slate-800 text-slate-200"
                    >
                      Close
                    </button>
                  </div>

                  <div className="h-full bg-slate-900/80 rounded-lg p-4 border border-slate-800 overflow-auto">
                    <LiveSpikeMonitor emotionHistory={mergedMonitorHistory} />
                  </div>
                </div>
              </div>
            )}

            {riskNotification && (
              <div className="fixed right-6 top-24 z-[60] max-w-sm">
                <div
                  className={`rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-sm ${
                    riskNotification.direction === 'up'
                      ? 'border-red-400/40 bg-red-500/15 text-red-100'
                      : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
                  }`}
                >
                  <div className="text-sm font-semibold">
                    {riskNotification.direction === 'up' ? 'Risk Increased' : 'Risk Decreased'}
                  </div>
                  <div className="text-xs mt-1 opacity-90">
                    {riskNotification.patientName}: {riskNotification.from} → {riskNotification.to}
                  </div>
                </div>
              </div>
            )}

            {showClinicalInsights && (
              <div className="fixed inset-0 z-50 flex items-center justify-end">
                <div className="absolute inset-0 bg-black/40" onClick={() => setShowClinicalInsights(false)} />

                <div className="relative w-full md:w-96 h-[80%] p-4">
                  <div className="absolute top-2 right-2 z-20">
                    <button
                      onClick={() => setShowClinicalInsights(false)}
                      className="px-3 py-1 rounded bg-slate-800 text-slate-200"
                    >
                      Close
                    </button>
                  </div>

                  <div className="h-full bg-slate-900/80 rounded-lg p-4 border border-slate-800 overflow-auto">
                    <ClinicalInsights
                      currentAlerts={currentMonitoringAlerts}
                      prolongedAlerts={prolongedMonitoringAlerts}
                      events={clinicalInsightEvents}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default DoctorDashboard;
