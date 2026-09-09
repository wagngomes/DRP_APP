/*
  Warnings:

  - The primary key for the `rotas` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `rotas` table. All the data in the column will be lost.
  - Made the column `codigo_rota` on table `rotas` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "rotas" DROP CONSTRAINT "rotas_pkey",
DROP COLUMN "id",
ALTER COLUMN "codigo_rota" SET NOT NULL,
ADD CONSTRAINT "rotas_pkey" PRIMARY KEY ("codigo_rota");
