BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[usuario] (
    [id] INT NOT NULL IDENTITY(1,1),
    [correo] NVARCHAR(320) NOT NULL,
    [nombre] NVARCHAR(200) NOT NULL,
    [area] NVARCHAR(120) NOT NULL CONSTRAINT [usuario_area_df] DEFAULT '',
    [es_admin] BIT NOT NULL CONSTRAINT [usuario_es_admin_df] DEFAULT 0,
    [activo] BIT NOT NULL CONSTRAINT [usuario_activo_df] DEFAULT 1,
    CONSTRAINT [usuario_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [usuario_correo_key] UNIQUE NONCLUSTERED ([correo])
);

-- CreateTable
CREATE TABLE [dbo].[enlace] (
    [id] INT NOT NULL IDENTITY(1,1),
    [nombre] NVARCHAR(150) NOT NULL,
    [descripcion] NVARCHAR(1000),
    [url] NVARCHAR(2048) NOT NULL,
    [tipo] NVARCHAR(20) NOT NULL,
    [activo] BIT NOT NULL CONSTRAINT [enlace_activo_df] DEFAULT 1,
    CONSTRAINT [enlace_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[procesador] (
    [id] INT NOT NULL IDENTITY(1,1),
    [nombre] NVARCHAR(150) NOT NULL,
    [descripcion] NVARCHAR(1000),
    [clave_procesador] NVARCHAR(100) NOT NULL,
    [formatos_aceptados] NVARCHAR(400) NOT NULL,
    [tamano_max] INT NOT NULL,
    [entradas_min] INT NOT NULL CONSTRAINT [procesador_entradas_min_df] DEFAULT 1,
    [entradas_max] INT,
    [tamano_max_total] INT,
    [salida_esperada] NVARCHAR(20) NOT NULL,
    [activo] BIT NOT NULL CONSTRAINT [procesador_activo_df] DEFAULT 1,
    CONSTRAINT [procesador_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [procesador_clave_procesador_key] UNIQUE NONCLUSTERED ([clave_procesador])
);

-- CreateTable
CREATE TABLE [dbo].[asignacion_enlace] (
    [usuario_id] INT NOT NULL,
    [enlace_id] INT NOT NULL,
    CONSTRAINT [asignacion_enlace_pkey] PRIMARY KEY CLUSTERED ([usuario_id],[enlace_id])
);

-- CreateTable
CREATE TABLE [dbo].[asignacion_procesador] (
    [usuario_id] INT NOT NULL,
    [procesador_id] INT NOT NULL,
    CONSTRAINT [asignacion_procesador_pkey] PRIMARY KEY CLUSTERED ([usuario_id],[procesador_id])
);

-- CreateTable
CREATE TABLE [dbo].[sugerencia] (
    [id] INT NOT NULL IDENTITY(1,1),
    [autor_id] INT NOT NULL,
    [titulo] NVARCHAR(200) NOT NULL,
    [descripcion] NVARCHAR(max) NOT NULL,
    [area_destino] NVARCHAR(120) NOT NULL,
    [estado] NVARCHAR(20) NOT NULL CONSTRAINT [sugerencia_estado_df] DEFAULT 'pendiente',
    [grupo_id] INT,
    [fecha_creacion] DATETIME2 NOT NULL CONSTRAINT [sugerencia_fecha_creacion_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [sugerencia_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[grupo_sugerencia] (
    [id] INT NOT NULL IDENTITY(1,1),
    [titulo] NVARCHAR(200) NOT NULL,
    [creado_por] INT NOT NULL,
    CONSTRAINT [grupo_sugerencia_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[historial_sugerencia] (
    [id] INT NOT NULL IDENTITY(1,1),
    [sugerencia_id] INT NOT NULL,
    [estado_anterior] NVARCHAR(20),
    [estado_nuevo] NVARCHAR(20) NOT NULL,
    [cambiado_por] INT NOT NULL,
    [fecha_cambio] DATETIME2 NOT NULL CONSTRAINT [historial_sugerencia_fecha_cambio_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [historial_sugerencia_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[evento_uso] (
    [id] INT NOT NULL IDENTITY(1,1),
    [usuario_id] INT NOT NULL,
    [tipo_recurso] NVARCHAR(20) NOT NULL,
    [id_recurso] INT NOT NULL,
    [tipo_evento] NVARCHAR(30) NOT NULL,
    [fecha] DATETIME2 NOT NULL CONSTRAINT [evento_uso_fecha_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [evento_uso_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [evento_uso_fecha_idx] ON [dbo].[evento_uso]([fecha]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [evento_uso_tipo_recurso_id_recurso_fecha_idx] ON [dbo].[evento_uso]([tipo_recurso], [id_recurso], [fecha]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [evento_uso_usuario_id_fecha_idx] ON [dbo].[evento_uso]([usuario_id], [fecha]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [evento_uso_tipo_evento_fecha_idx] ON [dbo].[evento_uso]([tipo_evento], [fecha]);

-- AddForeignKey
ALTER TABLE [dbo].[asignacion_enlace] ADD CONSTRAINT [asignacion_enlace_usuario_id_fkey] FOREIGN KEY ([usuario_id]) REFERENCES [dbo].[usuario]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[asignacion_enlace] ADD CONSTRAINT [asignacion_enlace_enlace_id_fkey] FOREIGN KEY ([enlace_id]) REFERENCES [dbo].[enlace]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[asignacion_procesador] ADD CONSTRAINT [asignacion_procesador_usuario_id_fkey] FOREIGN KEY ([usuario_id]) REFERENCES [dbo].[usuario]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[asignacion_procesador] ADD CONSTRAINT [asignacion_procesador_procesador_id_fkey] FOREIGN KEY ([procesador_id]) REFERENCES [dbo].[procesador]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sugerencia] ADD CONSTRAINT [sugerencia_autor_id_fkey] FOREIGN KEY ([autor_id]) REFERENCES [dbo].[usuario]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sugerencia] ADD CONSTRAINT [sugerencia_grupo_id_fkey] FOREIGN KEY ([grupo_id]) REFERENCES [dbo].[grupo_sugerencia]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[grupo_sugerencia] ADD CONSTRAINT [grupo_sugerencia_creado_por_fkey] FOREIGN KEY ([creado_por]) REFERENCES [dbo].[usuario]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[historial_sugerencia] ADD CONSTRAINT [historial_sugerencia_sugerencia_id_fkey] FOREIGN KEY ([sugerencia_id]) REFERENCES [dbo].[sugerencia]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[historial_sugerencia] ADD CONSTRAINT [historial_sugerencia_cambiado_por_fkey] FOREIGN KEY ([cambiado_por]) REFERENCES [dbo].[usuario]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[evento_uso] ADD CONSTRAINT [evento_uso_usuario_id_fkey] FOREIGN KEY ([usuario_id]) REFERENCES [dbo].[usuario]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddCheckConstraint
-- Prisma has neither native enums nor CHECK constraints on SQL Server, so the
-- five enum-shaped columns would otherwise accept any string. These are written
-- by hand and are the database's own defence: the application layer validating
-- them is not the same as the data being unable to be wrong.
-- Vocabularies are the ones documented on each field in schema.prisma.
ALTER TABLE [dbo].[enlace] ADD CONSTRAINT [enlace_tipo_check]
    CHECK ([tipo] IN ('app', 'agente'));

ALTER TABLE [dbo].[procesador] ADD CONSTRAINT [procesador_salida_esperada_check]
    CHECK ([salida_esperada] IN ('archivo', 'zip'));

ALTER TABLE [dbo].[sugerencia] ADD CONSTRAINT [sugerencia_estado_check]
    CHECK ([estado] IN ('pendiente', 'en_revision', 'aprobada', 'rechazada', 'implementada'));

ALTER TABLE [dbo].[evento_uso] ADD CONSTRAINT [evento_uso_tipo_recurso_check]
    CHECK ([tipo_recurso] IN ('enlace', 'procesador'));

ALTER TABLE [dbo].[evento_uso] ADD CONSTRAINT [evento_uso_tipo_evento_check]
    CHECK ([tipo_evento] IN ('apertura', 'ejecucion', 'error_formato', 'error_tamano', 'error_contenido'));

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
