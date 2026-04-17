import { useCallback, useEffect, useMemo, useState } from 'react';
import { backendPaths } from '../config/backend';
import { useAuth } from '../hooks/useAuth';
import { AdminPatient, WardBedStatus, WardStatus } from '../types/hospital';

type WardResponse = { wards: WardStatus[] };
type PatientsResponse = { patients: AdminPatient[] };

type CheckInForm = {
  firstName: string;
  lastName: string;
  nationalId: string;
  diagnosis: string;
  medicalHistory: string;
  wardId: string;
  bedId: string;
};

const initialForm: CheckInForm = {
  firstName: '',
  lastName: '',
  nationalId: '',
  diagnosis: '',
  medicalHistory: '',
  wardId: '',
  bedId: '',
};

const cameraStyles: Record<WardBedStatus['cameraStatus'], string> = {
  ONLINE: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30',
  OFFLINE: 'text-red-300 bg-red-500/10 border-red-400/30',
  MAINTENANCE: 'text-amber-300 bg-amber-500/10 border-amber-400/30',
};

const formatDate = (value: string) => new Date(value).toLocaleString();

export const AdminDashboard = () => {
  const { user, api, logout } = useAuth();
  const [wards, setWards] = useState<WardStatus[]>([]);
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [form, setForm] = useState<CheckInForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

  const requestJson = useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    const response = await api(path, options);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data as T;
  }, [api]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wardData, patientData] = await Promise.all([
        requestJson<WardResponse>(backendPaths.admin.wards),
        requestJson<PatientsResponse>(backendPaths.admin.activePatients),
      ]);

      setWards(wardData.wards);
      setPatients(patientData.patients);

      setForm((prev) => {
        const wardId =
          prev.wardId && wardData.wards.some((ward) => ward.id === prev.wardId)
            ? prev.wardId
            : wardData.wards[0]?.id || '';

        const freeBeds = wardData.wards
          .find((ward) => ward.id === wardId)
          ?.beds.filter((bed) => !bed.isOccupied) || [];

        const bedId =
          prev.bedId && freeBeds.some((bed) => bed.id === prev.bedId)
            ? prev.bedId
            : freeBeds[0]?.id || '';

        return {
          ...prev,
          wardId,
          bedId,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load admin dashboard';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [requestJson]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const selectedWard = useMemo(() => {
    return wards.find((ward) => ward.id === form.wardId) || null;
  }, [wards, form.wardId]);

  const availableBeds = useMemo(() => {
    return selectedWard?.beds.filter((bed) => !bed.isOccupied) || [];
  }, [selectedWard]);

  const onWardChange = (wardId: string) => {
    const freeBeds = wards.find((ward) => ward.id === wardId)?.beds.filter((bed) => !bed.isOccupied) || [];
    setForm((prev) => ({
      ...prev,
      wardId,
      bedId: freeBeds[0]?.id || '',
    }));
  };

  const submitCheckIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await requestJson<{ patient: AdminPatient }>(backendPaths.admin.checkIn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          nationalId: form.nationalId,
          diagnosis: form.diagnosis || undefined,
          medicalHistory: form.medicalHistory || undefined,
          wardId: form.wardId || undefined,
          bedId: form.bedId,
        }),
      });

      setForm((prev) => ({
        ...prev,
        firstName: '',
        lastName: '',
        nationalId: '',
        diagnosis: '',
        medicalHistory: '',
      }));

      await refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to complete check-in';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const checkOutPatient = async (patientId: string) => {
    setCheckingOutId(patientId);
    setError(null);
    try {
      await requestJson<{ patient: AdminPatient }>(backendPaths.admin.checkOut(patientId), {
        method: 'POST',
      });
      await refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to complete check-out';
      setError(message);
    } finally {
      setCheckingOutId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Administrative Dashboard</h1>
            <p className="text-sm text-slate-400">Signed in as {user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refreshData()}
              className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
            >
              Refresh
            </button>
            <button
              onClick={logout}
              className="rounded bg-red-600 px-3 py-2 text-sm hover:bg-red-500"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {error && (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-lg font-semibold mb-4">Patient Check-in</h2>
            <form onSubmit={submitCheckIn} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={form.firstName}
                  onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
                  placeholder="First name"
                  className="rounded bg-slate-800 px-3 py-2 text-sm"
                  required
                />
                <input
                  value={form.lastName}
                  onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
                  placeholder="Last name"
                  className="rounded bg-slate-800 px-3 py-2 text-sm"
                  required
                />
              </div>

              <input
                value={form.nationalId}
                onChange={(event) => setForm((prev) => ({ ...prev, nationalId: event.target.value }))}
                placeholder="National ID / CNP"
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm"
                required
              />

              <input
                value={form.diagnosis}
                onChange={(event) => setForm((prev) => ({ ...prev, diagnosis: event.target.value }))}
                placeholder="Diagnosis (optional)"
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm"
              />

              <textarea
                value={form.medicalHistory}
                onChange={(event) => setForm((prev) => ({ ...prev, medicalHistory: event.target.value }))}
                placeholder="Medical history"
                className="w-full rounded bg-slate-800 px-3 py-2 text-sm min-h-24"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={form.wardId}
                  onChange={(event) => onWardChange(event.target.value)}
                  className="rounded bg-slate-800 px-3 py-2 text-sm"
                  required
                >
                  {wards.map((ward) => (
                    <option key={ward.id} value={ward.id}>
                      {ward.name}
                    </option>
                  ))}
                </select>

                <select
                  value={form.bedId}
                  onChange={(event) => setForm((prev) => ({ ...prev, bedId: event.target.value }))}
                  className="rounded bg-slate-800 px-3 py-2 text-sm"
                  required
                >
                  {availableBeds.map((bed) => (
                    <option key={bed.id} value={bed.id}>
                      Bed {bed.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={submitting || availableBeds.length === 0 || loading}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {submitting ? 'Checking in...' : 'Check in patient'}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-lg font-semibold mb-4">Active Patients</h2>
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {loading && patients.length === 0 && (
                <div className="text-sm text-slate-500">Loading patients...</div>
              )}
              {!loading && patients.length === 0 && (
                <div className="text-sm text-slate-500">No active patients right now.</div>
              )}
              {patients.map((patient) => (
                <div key={patient.id} className="rounded border border-slate-800 bg-slate-900/40 p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-white">{patient.fullName}</div>
                      <div className="text-xs text-slate-400">{patient.nationalId}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {patient.ward.name} • Bed {patient.bed.label}
                      </div>
                      <div className="text-xs text-slate-500">Checked in: {formatDate(patient.checkedInAt)}</div>
                    </div>
                    <button
                      onClick={() => void checkOutPatient(patient.id)}
                      disabled={checkingOutId === patient.id}
                      className="rounded bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-500 disabled:opacity-60"
                    >
                      {checkingOutId === patient.id ? 'Checking out...' : 'Check-out'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="text-lg font-semibold mb-4">Ward Management</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {wards.map((ward) => {
              const freeBeds = ward.beds.filter((bed) => !bed.isOccupied).length;
              return (
                <div key={ward.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">{ward.name}</div>
                    <div className="text-xs text-slate-400">Free beds: {freeBeds}/{ward.beds.length}</div>
                  </div>

                  <div className="space-y-2">
                    {ward.beds.map((bed) => (
                      <div key={bed.id} className="rounded border border-slate-800 bg-slate-950/50 px-3 py-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Bed {bed.label}</span>
                          <span className={bed.isOccupied ? 'text-red-300' : 'text-emerald-300'}>
                            {bed.isOccupied ? 'Occupied' : 'Free'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs">
                          <span className={`rounded border px-2 py-0.5 ${cameraStyles[bed.cameraStatus]}`}>
                            Camera: {bed.cameraStatus}
                          </span>
                          <span className="text-slate-500">
                            {bed.patient ? bed.patient.fullName : 'No patient'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminDashboard;
