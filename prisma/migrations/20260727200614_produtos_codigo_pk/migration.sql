/*
  Warnings:

  - The primary key for the `produtos` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `produtos` table. All the data in the column will be lost.
  - Made the column `codigo` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `descricao` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tipo` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `unidade` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `cod_barras` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `cod_fabrica` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `cod_marca` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `marca` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `grp_marca` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `d_grp_marca` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `grupo` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tag_medic` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tipo_medicamento` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `principio_ativo` on table `produtos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `usa_refrig` on table `produtos` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "produtos_codigo_key";

-- AlterTable
ALTER TABLE "produtos" DROP CONSTRAINT "produtos_pkey",
DROP COLUMN "id",
ALTER COLUMN "codigo" SET NOT NULL,
ALTER COLUMN "descricao" SET NOT NULL,
ALTER COLUMN "tipo" SET NOT NULL,
ALTER COLUMN "unidade" SET NOT NULL,
ALTER COLUMN "cod_barras" SET NOT NULL,
ALTER COLUMN "cod_fabrica" SET NOT NULL,
ALTER COLUMN "cod_marca" SET NOT NULL,
ALTER COLUMN "marca" SET NOT NULL,
ALTER COLUMN "grp_marca" SET NOT NULL,
ALTER COLUMN "d_grp_marca" SET NOT NULL,
ALTER COLUMN "grupo" SET NOT NULL,
ALTER COLUMN "tag_medic" SET NOT NULL,
ALTER COLUMN "tipo_medicamento" SET NOT NULL,
ALTER COLUMN "principio_ativo" SET NOT NULL,
ALTER COLUMN "usa_refrig" SET NOT NULL,
ADD CONSTRAINT "produtos_pkey" PRIMARY KEY ("codigo");
