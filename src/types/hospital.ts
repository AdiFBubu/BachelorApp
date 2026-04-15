export type CameraStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';

export interface WardRef {
  id: string;
  name: string;
}

export interface BedRef {
  id: string;
  label: string;
  cameraStatus: CameraStatus;
  isOccupied: boolean;
}

export interface DoctorPatientSummary {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  nationalId: string;
  diagnosis: string | null;
  medicalHistory: string | null;
  checkedInAt: string;
  ward: WardRef;
  bed: BedRef;
  doctorId: string | null;
}

export type AlertType = 'DISTRESS' | 'PAIN';
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface MonitoringPoint {
  timestamp: string;
  anger: number;
  contempt: number;
  disgust: number;
  fear: number;
  happiness: number;
  sadness: number;
  surprise: number;
  distressScore: number;
  painScore: number;
  source: 'influx' | 'postgres' | 'synthetic';
}

export interface MonitoringAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  createdAt: string;
  source: 'db' | 'snn';
}

export interface DoctorPatientDetailPayload {
  patient: DoctorPatientSummary;
  monitoring: {
    window: '24h' | '7d';
    availableWindows: Array<'24h' | '7d'>;
    timeline: MonitoringPoint[];
    alerts: MonitoringAlert[];
    source: 'influx' | 'postgres' | 'synthetic';
    influxConfigured: boolean;
  };
}

export interface AdminPatient extends DoctorPatientSummary {
  checkedOutAt: string | null;
  doctor: { id: string; email: string } | null;
}

export interface WardBedStatus {
  id: string;
  label: string;
  isOccupied: boolean;
  cameraStatus: CameraStatus;
  patient: {
    id: string;
    fullName: string;
    doctorAssigned: boolean;
  } | null;
}

export interface WardStatus {
  id: string;
  name: string;
  beds: WardBedStatus[];
}
