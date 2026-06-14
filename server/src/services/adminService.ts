import prisma from '../lib/prisma';
import { ensureHospitalSeed } from './hospitalSetup';

type CheckInPayload = {
  firstName?: string;
  lastName?: string;
  nationalId?: string;
  diagnosis?: string;
  medicalHistory?: string;
  bedId?: string;
};

type PatientWithRelations = {
  id: string;
  firstName: string;
  lastName: string;
  nationalId: string;
  diagnosis: string | null;
  medicalHistory: string | null;
  checkedInAt: Date;
  checkedOutAt: Date | null;
  bed: { id: string; label: string; cameraStatus: string; isOccupied: boolean; ward?: { id: string; name: string } } | null;
  doctor: { id: string; email: string } | null;
};

type CheckInFailureCode =
  | 'BED_NOT_FOUND'
  | 'BED_WARD_MISMATCH'
  | 'BED_OCCUPIED'
  | 'PATIENT_ALREADY_CHECKED_IN'
  | 'CHECKIN_FAILED';

type CheckOutFailureCode = 'PATIENT_NOT_FOUND' | 'CHECKOUT_FAILED';

export class AdminServiceError extends Error {
  statusCode: number;
  code: CheckInFailureCode | CheckOutFailureCode;

  constructor(
    statusCode: number,
    message: string,
    code: CheckInFailureCode | CheckOutFailureCode,
  ) {
    super(message);
    this.name = 'AdminServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as Record<string, unknown>;
};

const requirePatientId = (patientId: string | undefined): string => {
  if (!patientId) {
    throw new AdminServiceError(400, 'Missing patientId', 'CHECKOUT_FAILED');
  }

  return patientId;
};

const formatPatient = (patient: PatientWithRelations) => ({
  id: patient.id,
  firstName: patient.firstName,
  lastName: patient.lastName,
  fullName: `${patient.firstName} ${patient.lastName}`,
  nationalId: patient.nationalId,
  diagnosis: patient.diagnosis,
  medicalHistory: patient.medicalHistory,
  checkedInAt: patient.checkedInAt,
  checkedOutAt: patient.checkedOutAt,
  ward: patient.bed ? patient.bed.ward : null,
  bed: patient.bed,
  doctor: patient.doctor,
});

export async function getWardStatusService() {
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

  return wards.map((ward) => ({
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
}

export async function getActivePatientsService() {
  const patients = await prisma.patient.findMany({
    where: { isArchived: false },
    include: {
      bed: { select: { id: true, label: true, cameraStatus: true, isOccupied: true, ward: { select: { id: true, name: true } } } },
      doctor: { select: { id: true, email: true } },
    },
    orderBy: { checkedInAt: 'desc' },
  });

  return patients.map((patient) => formatPatient(patient));
}

export async function checkInPatientService(rawBody: unknown) {
  await ensureHospitalSeed();

  const body = asRecord(rawBody) as CheckInPayload;
  const {
    firstName,
    lastName,
    nationalId,
    diagnosis,
    medicalHistory,
    bedId,
  } = body;

  if (!firstName || !lastName || !nationalId) {
    throw new AdminServiceError(
      400,
      'Missing required check-in fields: firstName, lastName, nationalId',
      'CHECKIN_FAILED',
    );
  }

  try {
    const patient = await prisma.$transaction(async (tx) => {
      let bed = null;
      if (bedId) {
        bed = await tx.bed.findUnique({
          where: { id: bedId },
          include: { ward: { select: { id: true, name: true } } },
        });

        if (!bed) {
          throw new AdminServiceError(404, 'Selected bed was not found', 'BED_NOT_FOUND');
        }

        if (bed.isOccupied) {
          throw new AdminServiceError(409, 'Selected bed is currently occupied', 'BED_OCCUPIED');
        }
      }

      const existingPatient = await tx.patient.findUnique({
        where: { nationalId },
      });

      let nextPatient;
      if (existingPatient && !existingPatient.isArchived) {
        throw new AdminServiceError(409, 'Patient is already checked in', 'PATIENT_ALREADY_CHECKED_IN');
      }

      if (existingPatient && existingPatient.isArchived) {
        nextPatient = await tx.patient.update({
          where: { id: existingPatient.id },
          data: ({
            firstName,
            lastName,
            diagnosis,
            medicalHistory,
            checkedInAt: new Date(),
            checkedOutAt: null,
            isArchived: false,
            doctor: { disconnect: true },
            bed: bed ? { connect: { id: bed.id } } : undefined,
          } as any),
          include: {
            bed: { include: { ward: { select: { id: true, name: true } } } },
            doctor: { select: { id: true, email: true } },
          },
        });
      } else {
        nextPatient = await tx.patient.create({
          data: ({
            firstName,
            lastName,
            nationalId,
            diagnosis,
            medicalHistory,
            bed: bed ? { connect: { id: bed.id } } : undefined,
          } as any),
          include: {
            bed: { include: { ward: { select: { id: true, name: true } } } },
            doctor: { select: { id: true, email: true } },
          },
        });
      }

      if (bed) {
        await tx.bed.update({
          where: { id: bed.id },
          data: { isOccupied: true },
        });
      }

      return nextPatient;
    });

    return formatPatient(patient);
  } catch (err) {
    if (err instanceof AdminServiceError) {
      throw err;
    }
  
    throw new AdminServiceError(500, 'Unable to complete check-in', 'CHECKIN_FAILED');
  }
}

export async function checkOutPatientService(patientIdInput: string | undefined) {
  const patientId = requirePatientId(patientIdInput);

  try {
    const checkedOutPatient = await prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findUnique({
        where: { id: patientId },
        include: {
          bed: { include: { ward: { select: { id: true, name: true } } } },
          doctor: { select: { id: true, email: true } },
        },
      });

      if (!patient || patient.isArchived) {
        throw new AdminServiceError(404, 'Patient not found or already checked out', 'PATIENT_NOT_FOUND');
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
          bed: {
            select: {
              id: true,
              label: true,
              cameraStatus: true,
              isOccupied: true,
              ward: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          doctor: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      if (patient.bedId) {
        await tx.bed.update({
          where: { id: patient.bedId },
          data: { isOccupied: false },
        });
      }

      return updatedPatient;
    });

    return formatPatient(checkedOutPatient);
  } catch (err) {
    if (err instanceof AdminServiceError) {
      throw err;
    }

    throw new AdminServiceError(500, 'Unable to complete check-out', 'CHECKOUT_FAILED');
  }
}