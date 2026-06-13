-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DOCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "CameraStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('DISTRESS', 'PAIN');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'DOCTOR';

-- CreateTable
CREATE TABLE "Ward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "cameraStatus" "CameraStatus" NOT NULL DEFAULT 'ONLINE',
    "isOccupied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "medicalHistory" TEXT,
    "diagnosis" TEXT,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "doctorId" TEXT,
    "wardId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmotionReading" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anger" DOUBLE PRECISION NOT NULL,
    "contempt" DOUBLE PRECISION NOT NULL,
    "disgust" DOUBLE PRECISION NOT NULL,
    "fear" DOUBLE PRECISION NOT NULL,
    "happiness" DOUBLE PRECISION NOT NULL,
    "sadness" DOUBLE PRECISION NOT NULL,
    "surprise" DOUBLE PRECISION NOT NULL,
    "distressScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "painScore" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "EmotionReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAlert" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PatientAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ward_name_key" ON "Ward"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_wardId_label_key" ON "Bed"("wardId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_nationalId_key" ON "Patient"("nationalId");

-- CreateIndex
CREATE INDEX "EmotionReading_patientId_timestamp_idx" ON "EmotionReading"("patientId", "timestamp");

-- CreateIndex
CREATE INDEX "PatientAlert_patientId_active_idx" ON "PatientAlert"("patientId", "active");

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmotionReading" ADD CONSTRAINT "EmotionReading_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAlert" ADD CONSTRAINT "PatientAlert_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
