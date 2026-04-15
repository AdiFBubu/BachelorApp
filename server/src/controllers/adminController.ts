import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { ensureHospitalSeed } from '../services/hospitalSetup';

type CheckInPayload = {
  firstName?: string;
  lastName?: string;
  nationalId?: string;
  diagnosis?: string;
  medicalHistory?: string;
  wardId?: string;
  bedId?: string;
};

const formatPatient = (patient: {
  id: string;
  firstName: string;
  lastName: string;
  nationalId: string;
  diagnosis: string | null;
  medicalHistory: string | null;
  checkedInAt: Date;
  checkedOutAt: Date | null;
  ward: { id: string; name: string };
  bed: { id: string; label: string; cameraStatus: string; isOccupied: boolean };
  doctor: { id: string; email: string } | null;
}) => ({
  id: patient.id,
  firstName: patient.firstName,
  lastName: patient.lastName,
  fullName: `${patient.firstName} ${patient.lastName}`,
  nationalId: patient.nationalId,
  diagnosis: patient.diagnosis,
  medicalHistory: patient.medicalHistory,
  checkedInAt: patient.checkedInAt,
  checkedOutAt: patient.checkedOutAt,
  ward: patient.ward,
  bed: patient.bed,
  doctor: patient.doctor,
});

export const getWardStatus = async (req: Request, res: Response) => {
  await ensureHospitalSeed();

  const wards = await prisma.ward.findMany({
    include: {
      beds: {
        orderBy: { label: 'asc' },
        include: {
          patients: {
            where: { isArchived: false },
            orderBy: { checkedInAt: 'desc' },
            take: 1,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              doctorId: true,
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const payload = wards.map((ward) => ({
    id: ward.id,
    name: ward.name,
    beds: ward.beds.map((bed) => ({
      id: bed.id,
      label: bed.label,
      isOccupied: bed.isOccupied,
      cameraStatus: bed.cameraStatus,
      patient: bed.patients[0]
        ? {
            id: bed.patients[0].id,
            fullName: `${bed.patients[0].firstName} ${bed.patients[0].lastName}`,
            doctorAssigned: Boolean(bed.patients[0].doctorId),
          }
        : null,
    })),
  }));

  return res.json({ wards: payload });
};

export const getActivePatients = async (req: Request, res: Response) => {
  const patients = await prisma.patient.findMany({
    where: { isArchived: false },
    include: {
      ward: { select: { id: true, name: true } },
      bed: { select: { id: true, label: true, cameraStatus: true, isOccupied: true } },
      doctor: { select: { id: true, email: true } },
    },
    orderBy: { checkedInAt: 'desc' },
  });

  return res.json({ patients: patients.map((patient) => formatPatient(patient)) });
};

export const checkInPatient = async (req: Request, res: Response) => {
  await ensureHospitalSeed();

  const {
    firstName,
    lastName,
    nationalId,
    diagnosis,
    medicalHistory,
    wardId,
    bedId,
  } = req.body as CheckInPayload;

  if (!firstName || !lastName || !nationalId || !bedId) {
    return res.status(400).json({
      error: 'Missing required check-in fields: firstName, lastName, nationalId, bedId',
    });
  }

  try {
    const patient = await prisma.$transaction(async (tx) => {
      const bed = await tx.bed.findUnique({
        where: { id: bedId },
        include: { ward: { select: { id: true, name: true } } },
      });

      if (!bed) {
        throw new Error('BED_NOT_FOUND');
      }

      if (wardId && bed.wardId !== wardId) {
        throw new Error('BED_WARD_MISMATCH');
      }

      if (bed.isOccupied) {
        throw new Error('BED_OCCUPIED');
      }

      const existingPatient = await tx.patient.findUnique({
        where: { nationalId },
      });

      let nextPatient;
      if (existingPatient && !existingPatient.isArchived) {
        throw new Error('PATIENT_ALREADY_CHECKED_IN');
      }

      if (existingPatient && existingPatient.isArchived) {
        nextPatient = await tx.patient.update({
          where: { id: existingPatient.id },
          data: {
            firstName,
            lastName,
            diagnosis,
            medicalHistory,
            checkedInAt: new Date(),
            checkedOutAt: null,
            isArchived: false,
            doctorId: null,
            wardId: bed.wardId,
            bedId: bed.id,
          },
          include: {
            ward: { select: { id: true, name: true } },
            bed: { select: { id: true, label: true, cameraStatus: true, isOccupied: true } },
            doctor: { select: { id: true, email: true } },
          },
        });
      } else {
        nextPatient = await tx.patient.create({
          data: {
            firstName,
            lastName,
            nationalId,
            diagnosis,
            medicalHistory,
            wardId: bed.wardId,
            bedId: bed.id,
          },
          include: {
            ward: { select: { id: true, name: true } },
            bed: { select: { id: true, label: true, cameraStatus: true, isOccupied: true } },
            doctor: { select: { id: true, email: true } },
          },
        });
      }

      await tx.bed.update({
        where: { id: bed.id },
        data: { isOccupied: true },
      });

      return nextPatient;
    });

    return res.status(201).json({ patient: formatPatient(patient) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CHECKIN_FAILED';

    if (message === 'BED_NOT_FOUND') {
      return res.status(404).json({ error: 'Selected bed was not found' });
    }

    if (message === 'BED_OCCUPIED') {
      return res.status(409).json({ error: 'Selected bed is currently occupied' });
    }

    if (message === 'BED_WARD_MISMATCH') {
      return res.status(400).json({ error: 'Selected bed does not belong to the chosen ward' });
    }

    if (message === 'PATIENT_ALREADY_CHECKED_IN') {
      return res.status(409).json({ error: 'Patient is already checked in' });
    }

    return res.status(500).json({ error: 'Unable to complete check-in' });
  }
};

export const checkOutPatient = async (req: Request, res: Response) => {
  const patientId = req.params.patientId;
  if (!patientId) {
    return res.status(400).json({ error: 'Missing patientId' });
  }

  try {
    const checkedOutPatient = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findUnique({
        where: { id: patientId },
        include: {
          ward: { select: { id: true, name: true } },
          bed: { select: { id: true, label: true, cameraStatus: true, isOccupied: true } },
          doctor: { select: { id: true, email: true } },
        },
      });

      if (!patient || patient.isArchived) {
        throw new Error('PATIENT_NOT_FOUND');
      }

      await tx.patientAlert.updateMany({
        where: {
          patientId,
          active: true,
        },
        data: {
          active: false,
          resolvedAt: new Date(),
        },
      });

      const updatedPatient = await tx.patient.update({
        where: { id: patientId },
        data: {
          checkedOutAt: new Date(),
          isArchived: true,
          doctorId: null,
        },
        include: {
          ward: { select: { id: true, name: true } },
          bed: { select: { id: true, label: true, cameraStatus: true, isOccupied: true } },
          doctor: { select: { id: true, email: true } },
        },
      });

      await tx.bed.update({
        where: { id: patient.bedId },
        data: { isOccupied: false },
      });

      return updatedPatient;
    });

    return res.json({ patient: formatPatient(checkedOutPatient) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CHECKOUT_FAILED';
    if (message === 'PATIENT_NOT_FOUND') {
      return res.status(404).json({ error: 'Patient not found or already checked out' });
    }

    return res.status(500).json({ error: 'Unable to complete check-out' });
  }
};
