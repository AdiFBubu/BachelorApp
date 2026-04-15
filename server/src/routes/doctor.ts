import { Router } from 'express';
import {
  addEmotionReading,
  getAvailablePatients,
  getMyPatients,
  getPatientDetail,
  takePatient,
} from '../controllers/doctorController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth, requireRole('DOCTOR'));

router.get('/patients/available', getAvailablePatients);
router.get('/patients/mine', getMyPatients);
router.post('/patients/:patientId/take', takePatient);
router.get('/patients/:patientId/detail', getPatientDetail);
router.post('/patients/:patientId/readings', addEmotionReading);

export default router;
