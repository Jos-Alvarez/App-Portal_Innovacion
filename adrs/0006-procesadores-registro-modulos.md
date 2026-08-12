# ADR 0006: Procesadores como módulos con interfaz común y registro por clave

## Estado

Aceptado

## Contexto

El PRD exige que la arquitectura permita "agregar nuevos procesadores de forma modular sin tocar
el resto del portal" y que el Área de Innovación pueda "dar de alta nuevos procesadores a futuro
sin rehacer el portal". Cada procesador declara formatos aceptados y tamaño máximo (tabla
`procesador`, ADR 0002) y debe devolver errores tipificados (formato / tamaño / contenido) que la
UI muestra según DESIGN.md.

## Decisión

La lógica de los procesadores vive en un **servicio independiente de FastAPI (Python)**. Cada
procesador es un **módulo Python que implementa una interfaz común** y se inscribe en un
**registro (registry) indexado por clave**:

```python
from abc import ABC, abstractmethod

class Procesador(ABC):
    clave: str

    @abstractmethod
    def validar(self, archivo: ArchivoEntrada) -> ErrorTipificado | None:
        """Valida formato/tamaño/contenido; None si el archivo es válido."""

    @abstractmethod
    def procesar(self, archivo: ArchivoEntrada) -> ArchivoSalida:
        """Ejecuta la transformación y devuelve el archivo resultante."""

REGISTRY: dict[str, Procesador] = {
    "maestro-excel": MaestroExcel(),
    "limpieza-word": LimpiezaWord(),
}
```

**Enrutamiento proxy (navegador → portal → FastAPI).** La ruta que consume el navegador,
`POST /api/procesadores/{id}/ejecutar`, **pertenece al backend de Next.js, no a FastAPI** (ver
ADR 0003). Next.js actúa como proxy: (1) resuelve al usuario desde la sesión y **verifica en SQL
Server que tenga la asignación** al procesador — sin fila de asignación devuelve 403 (ADR 0007),
sin procesar; (2) solo si la autorización es exitosa, reenvía el archivo al **servicio
independiente de FastAPI por red interna**, autenticando la llamada con el token de servicio
(ADR 0004/0007).

El servicio FastAPI expone un **endpoint interno** (p. ej. `POST /interno/procesadores/{id}/ejecutar`),
alcanzable únicamente desde el portal por red interna y con token de servicio válido — **nunca
directamente desde el navegador**. Ese endpoint resuelve la fila en BD, busca el módulo en el
registry por `clave_procesador`, aplica las validaciones comunes (formato y tamaño desde la
configuración en BD, contenido delegado al módulo), ejecuta, registra el `evento_uso`
correspondiente (ejecución o error) y devuelve el archivo resultante, que el portal retransmite al
navegador. FastAPI **no** lee la sesión del usuario ni consulta permisos: confía en que el portal
ya autorizó (ADR 0007).

Dar de alta un procesador = escribir el módulo que implementa la interfaz + registrarlo + crear su
fila desde el panel admin.

**Manejo de archivos: síncrono y sin estado (stateless).** El procesamiento es estrictamente
síncrono: la request de ejecución no retorna hasta que el archivo resultante está listo (o falla).
El servicio **no almacena archivos para descargas posteriores** ni mantiene estado entre requests.
Los archivos de entrada y de salida se escriben en un **volumen temporal de disco** únicamente para
**aliviar la RAM** durante el procesamiento (evita tener el archivo completo en memoria a la vez que
las estructuras de pandas/openpyxl). Es **obligatorio** envolver el ciclo en un bloque
`try/finally` que **elimine de inmediato** los temporales (entrada y salida) una vez enviada la
respuesta HTTP al cliente — tanto en éxito como en error. La **persistencia del archivo resultante
es responsabilidad exclusiva del navegador local del usuario** (la descarga); el servidor no guarda
copia. Esto mantiene al servicio sin estado, apto para reinicios y para el límite de RAM por
instancia (ADR 0001).

**Validación temprana del tamaño descomprimido (obligatoria).** El límite de 25 MB es del archivo
*comprimido*; un `.xlsx`/`.docx` es un ZIP que puede descomprimirse a varios GB (zip bomb o Excel
legítimo enorme), y cargarlo directo en `pandas`/`openpyxl` puede agotar la RAM del worker. Por eso,
**antes de pasar el archivo a cualquier librería de procesamiento**, la validación común de la ruta
debe inspeccionar los **metadatos del ZIP** (los `.xlsx`/`.docx` se tratan como los archivos ZIP que
son, p. ej. con `zipfile`) y sumar el **tamaño descomprimido declarado** de sus entradas. Si ese
tamaño real excede un **límite seguro en RAM** (configurable, holgadamente por debajo de la memoria
del worker), el proceso se **aborta de inmediato** y devuelve al portal un **error controlado** de
tipo tamaño/contenido — nunca un OOM. Esta comprobación corre en la ruta genérica (una sola vez para
todos los procesadores basados en ZIP), antes de instanciar el módulo. Formatos no-ZIP (p. ej. CSV
plano) se acotan por el tope de 25 MB comprimido, que ya limita su tamaño en memoria.

## Alternativas consideradas

- **Pipeline configurable sin código** (pasos declarativos armados por el admin desde la UI) —
  daría autonomía total sin deploys, pero construir el motor de pipeline es un proyecto en sí
  mismo y limitaría las transformaciones posibles; desproporcionado para el alcance.
- **Un endpoint ad-hoc por procesador** — lo más rápido para los primeros 1-2, pero duplica
  validaciones, registro de eventos y manejo de errores en cada uno, contradiciendo el requisito
  de modularidad del PRD.

## Consecuencias

- Validación de formato/tamaño, registro de analítica y manejo de errores se implementan una sola
  vez en la ruta genérica; un procesador nuevo solo aporta su lógica de negocio.
- Los procesadores acceden al ecosistema Python (pandas, openpyxl, python-docx), el más fuerte
  para manipular Excel/Word, y su carga de trabajo queda aislada del portal.
- Costo real: agregar un procesador requiere un despliegue del servicio FastAPI (es código
  nuevo); el "alta sin soporte técnico" del PRD se cumple para la parte administrable (fila en
  BD, asignaciones), pero el módulo lo escribe el Área de Innovación como desarrollo incremental.
- Si `clave_procesador` en BD no existe en el registry (desincronización fila↔código), la ruta
  debe fallar con un error claro; es un modo de fallo nuevo que introduce esta separación.
