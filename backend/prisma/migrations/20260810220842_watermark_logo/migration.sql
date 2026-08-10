-- AlterTable
ALTER TABLE "User" ADD COLUMN     "watermarkImage" TEXT,
ADD COLUMN     "watermarkOpacity" INTEGER NOT NULL DEFAULT 75,
ADD COLUMN     "watermarkPosition" TEXT NOT NULL DEFAULT 'south',
ADD COLUMN     "watermarkScale" INTEGER NOT NULL DEFAULT 22;
