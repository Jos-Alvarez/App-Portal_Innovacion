-- Hace unico enlace.nombre.
--
-- El nombre es la identidad del enlace para el colaborador: el tablero muestra
-- el nombre, asi que dos filas llamadas igual son indistinguibles ahi. url NO
-- se vuelve unica: registrar el mismo sistema dos veces, con dos nombres y para
-- dos audiencias, es legitimo.
--
-- ANTES DE APLICAR: si la tabla ya tiene nombres repetidos, esta migracion
-- falla y revierte (Prisma lo advierte al generarla). Comprobarlo con:
--   SELECT nombre, COUNT(*) FROM [dbo].[enlace] GROUP BY nombre HAVING COUNT(*) > 1;

BEGIN TRY

BEGIN TRAN;

-- CreateIndex
ALTER TABLE [dbo].[enlace] ADD CONSTRAINT [enlace_nombre_key] UNIQUE NONCLUSTERED ([nombre]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

