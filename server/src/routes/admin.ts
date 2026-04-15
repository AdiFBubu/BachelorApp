import { Router } from 'express';
import {
  checkInPatient,
  checkOutPatient,
  getActivePatients,
  getWardStatus,
} from '../controllers/adminController';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/wards', getWardStatus);
router.get('/patients/active', getActivePatients);
router.post('/check-in', checkInPatient);
router.post('/check-out/:patientId', checkOutPatient);

export default router;
