import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';

const DEFAULT_WARDS = [
  { name: 'Ward A', beds: ['A-01', 'A-02', 'A-03', 'A-04'] },
  { name: 'Ward B', beds: ['B-01', 'B-02', 'B-03', 'B-04'] },
  { name: 'Ward C', beds: ['C-01', 'C-02', 'C-03'] },
];

export async function ensureHospitalSeed() {
  const wardCount = await prisma.ward.count();
  if (wardCount > 0) {
    return;
  }

  try {
    for (const ward of DEFAULT_WARDS) {
      await prisma.ward.create({
        data: {
          name: ward.name,
          beds: {
            create: ward.beds.map((label) => ({
              label,
            })),
          },
        },
      });
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return;
    }
    throw err;
  }
}
