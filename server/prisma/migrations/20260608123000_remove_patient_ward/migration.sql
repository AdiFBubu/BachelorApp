-- Drop foreign key linking Patient.wardId -> Ward.id
ALTER TABLE "Patient" DROP CONSTRAINT IF EXISTS "Patient_wardId_fkey";

-- Drop the redundant wardId column from Patient
ALTER TABLE "Patient" DROP COLUMN IF EXISTS "wardId";

-- Make bedId nullable so a patient can be unassigned from a bed
ALTER TABLE "Patient" ALTER COLUMN "bedId" DROP NOT NULL;
