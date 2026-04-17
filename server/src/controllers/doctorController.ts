import { Request, Response } from 'express';
import {
  addEmotionReadingService,
  DoctorServiceError,
  getAvailablePatientsService,
  getMyPatientsService,
  getPatientDetailService,
  takePatientService,
} from '../services/doctorService';

const handleServiceError = (res: Response, err: unknown, fallbackMessage: string) => {
  if (err instanceof DoctorServiceError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  return res.status(500).json({ error: fallbackMessage });
};

// get all unassigned patients that are not archived
export const getAvailablePatients = async (req: Request, res: Response) => {
  try {
    const patients = await getAvailablePatientsService();
    return res.json({ patients });
  } catch (err) {
    return handleServiceError(res, err, 'Unable to load available patients');
  }
};

// get all patients for a doctor
export const getMyPatients = async (req: Request, res: Response) => {
  try {
    const patients = await getMyPatientsService(req.userId);
    return res.json({ patients });
  } catch (err) {
    return handleServiceError(res, err, 'Unable to load your patients');
  }
};

// when a doctor takes a patient
export const takePatient = async (req: Request, res: Response) => {
  try {
    const patient = await takePatientService(req.userId, req.params.patientId);
    return res.json({ patient });
  } catch (err) {
    return handleServiceError(res, err, 'Unable to assign patient');
  }
};

export const getPatientDetail = async (req: Request, res: Response) => {
  try {
    const detail = await getPatientDetailService(req.userId, req.params.patientId, req.query.window);
    return res.json(detail);
  } catch (err) {
    return handleServiceError(res, err, 'Unable to load patient detail');
  }
};

export const addEmotionReading = async (req: Request, res: Response) => {
  try {
    const created = await addEmotionReadingService(req.userId, req.params.patientId, req.body);
    return res.status(201).json(created);
  } catch (err) {
    return handleServiceError(res, err, 'Unable to store emotion reading');
  }
};
