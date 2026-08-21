-- Ensancha evento_uso.tipo_evento a los cinco errores tipificados del servicio.
--
-- El vocabulario nacio con tres errores -- los que ADR 0006 nombra al describir
-- el mapeo del portal -- mientras que el servicio de procesadores define CINCO
-- (ADR 0014 del repo procesadores: formato, tamano, contenido, cantidad,
-- clave_inexistente). El portal recibia dos errores que no tenia donde poner.
--
-- POR QUE NO ALCANZABA CON DEJARLOS SIN REGISTRAR. Las dos salidas eran malas:
--
--   * Archivarlos bajo el miembro mas parecido reporta un problema que nunca
--     paso, y nada rio abajo puede detectarlo: no hay constraint que violar ni
--     join que vuelva vacio. El item #19 se lo mostraria a un administrador
--     como un hecho.
--   * No registrar nada deja un procesador ROTO indistinguible de uno que nadie
--     usa. Si clave_procesador no existe en el registry del servicio, la gente
--     lo intenta, falla y deja de intentarlo: cero eventos. El administrador lo
--     ve sin uso y lo da de baja justo cuando estaba roto.
--
-- Con el mapeo completo la eleccion desaparece: cada error tipificado del
-- servicio tiene exactamente un miembro aca, y el nombre lo dice.
--
-- ES UN ENSANCHAMIENTO, NO UN CAMBIO. El vocabulario nuevo es un superconjunto
-- estricto del anterior, asi que ninguna fila existente puede dejar de cumplir
-- el CHECK. Por eso el ADD va con validacion (el modo por defecto, WITH CHECK)
-- y no WITH NOCHECK: si alguna fila no pasara, esta migracion debe fallar y
-- revertir, no dejar la tabla con datos que el constraint no cubre.
--
-- El DROP es sin IF EXISTS a proposito. El constraint lo creo la migracion
-- inicial y tiene que estar; si no esta, la base no esta en el estado que esta
-- migracion asume y lo correcto es fallar fuerte, no seguir en silencio.

BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[evento_uso] DROP CONSTRAINT [evento_uso_tipo_evento_check];

ALTER TABLE [dbo].[evento_uso] ADD CONSTRAINT [evento_uso_tipo_evento_check]
    CHECK ([tipo_evento] IN ('apertura', 'ejecucion', 'error_formato', 'error_tamano', 'error_contenido', 'error_cantidad', 'error_clave_inexistente'));

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
