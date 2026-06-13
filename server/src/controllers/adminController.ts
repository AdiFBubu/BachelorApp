import { Request, Response } from 'express';
import {
  AdminServiceError,
  checkInPatientService,
  checkOutPatientService,
  getActivePatientsService,
  getWardStatusService,
} from '../services/adminService';

const handleServiceError = (res: Response, err: unknown, fallbackMessage: string) => {
  if (err instanceof AdminServiceError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  return res.status(500).json({ error: fallbackMessage });
};

export const getWardStatus = async (req: Request, res: Response) => {
  try {
    const wards = await getWardStatusService();
    return res.json({ wards });
  } catch (err) {
    return handleServiceError(res, err, 'Unable to load ward status');
  }
};

export const getActivePatients = async (req: Request, res: Response) => {
  try {
    const patients = await getActivePatientsService();
    return res.json({ patients });
  } catch (err) {
    return handleServiceError(res, err, 'Unable to load active patients');
  }
};

export const checkInPatient = async (req: Request, res: Response) => {
  try {
    const patient = await checkInPatientService(req.body);
    return res.status(201).json({ patient });
  } catch (err) {
    return handleServiceError(res, err, 'Unable to complete check-in');
  }
};

export const checkOutPatient = async (req: Request, res: Response) => {
  try {
    const patient = await checkOutPatientService(req.params.patientId);
    return res.json({ patient });
  } catch (err) {
    console.error(err);
    return handleServiceError(res, err, 'Unable to complete check-out');
  }
};
