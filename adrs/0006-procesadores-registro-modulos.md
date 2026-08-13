# ADR 0006: Procesadores como módulos con interfaz común y registro por clave

## Estado

Aceptado — **contrato de entrada/salida y superficie de rutas revisados** (ver "Revisión del
contrato"). La decisión de fondo (módulos con interfaz común indexados por clave, en un único
servicio) se mantiene sin cambios.

### Revisión del contrato

La versión original de este ADR definía **una sola ruta genérica** en el servicio
(`POST /interno/procesadores/{id}/ejecutar`) y una interfaz de **un archivo entra / un archivo
sale**. Ambas cosas cambian:

1. El servicio expone **una ruta por procesador**, implementada como **cáscara fina** sobre el
   pipeline común y el registry — no como un endpoint autónomo que reimplemente validaciones.
2. Un procesador puede recibir **múltiples archivos** y devolver **múltiples archivos**, que el
   pipeline entrega **empaquetados en ZIP** cuando la salida tiene más de un elemento.

Lo que **no** cambia: el pipeline común sigue siendo el único lugar donde viven las validaciones,
los errores tipificados y la limpieza de temporales. La modularidad del PRD sigue garantizada por el
registry, no por la separación de rutas.

3. El **registro de `evento_uso` pasa al portal**: el servicio devuelve el resultado o un error
   tipificado y no escribe en la base de datos.

## Contexto

El PRD exige que la arquitectura permita "agregar nuevos procesadores de forma modular sin tocar
el resto del portal" y que el Área de Innovación pueda "dar de alta nuevos procesadores a futuro
sin rehacer el portal". Cada procesador declara formatos aceptados y tamaño máximo (tabla
`procesador`, ADR 0002) y debe devolver errores tipificados (formato / tamaño / contenido) que la
UI muestra según DESIGN.md.

Al despiezar el backlog apareció un requisito que ni el PRD ni la versión original de este ADR
contemplaban: **no todos los procesadores son un archivo entra / un archivo sale**. De los
procesadores previstos, algunos reciben **varios archivos** en una misma ejecución y otros producen
**varios archivos de salida** (por ejemplo, varios Excel derivados de un mismo insumo), que deben
llegar al navegador como una sola descarga. El contrato del servicio tiene que admitir ambas formas
sin que cada procesador resuelva por su cuenta el empaquetado ni la validación de un conjunto de
archivos.

## Decisión

La lógica de los procesadores vive en un **servicio independiente de FastAPI (Python)**. Cada
procesador es un **módulo Python que implementa una interfaz común** y se inscribe en un
**registro (registry) indexado por clave**:

```python
from abc import ABC, abstractmethod

class Procesador(ABC):
    clave: str

    @abstractmethod
    def validar(self, archivos: list[ArchivoEntrada]) -> ErrorTipificado | None:
        """Valida el conjunto (cantidad, formato, tamaño, contenido); None si es válido."""

    @abstractmethod
    def procesar(self, archivos: list[ArchivoEntrada]) -> list[ArchivoSalida]:
        """Ejecuta la transformación y devuelve uno o más archivos resultantes."""

REGISTRY: dict[str, Procesador] = {
    "maestro-excel": MaestroExcel(),
    "limpieza-word": LimpiezaWord(),
}
```

**Entrada y salida como colecciones.** La interfaz trabaja siempre con listas, incluso cuando el
procesador maneja un solo archivo (lista de un elemento): un único camino de código, sin ramas
especiales. `validar` recibe el conjunto completo porque hay validaciones que solo existen a nivel
de conjunto — la coherencia entre dos insumos que deben corresponderse, por ejemplo. La
**cardinalidad no es un atributo del módulo**: se declara en la fila `procesador`
(`entradas_min`, `entradas_max`, ADR 0002) y el pipeline la valida antes de instanciarlo, para que
el portal pueda armar la interfaz de carga leyendo la misma fuente y no exista una segunda verdad
que se desincronice.

**Empaquetado de la salida, en el pipeline y una sola vez.** Si `procesar` devuelve **un** archivo,
el pipeline lo entrega tal cual, con su tipo MIME y su nombre. Si devuelve **más de uno**, el
pipeline los comprime en un **ZIP** y entrega ese ZIP. La decisión es del pipeline, no del módulo:
ningún procesador construye su propio ZIP ni decide cómo se transporta su resultado. El ZIP es un
temporal más y muere con los demás en el `try/finally`.

**Enrutamiento proxy (navegador → portal → FastAPI).** La ruta que consume el navegador,
`POST /api/procesadores/{id}/ejecutar`, **pertenece al backend de Next.js, no a FastAPI** (ver
ADR 0003). Next.js actúa como proxy: (1) resuelve al usuario desde la sesión y **verifica en SQL
Server que tenga la asignación** al procesador — sin fila de asignación devuelve 403 (ADR 0007),
sin procesar; (2) solo si la autorización es exitosa, reenvía el archivo al **servicio
independiente de FastAPI por red interna**, autenticando la llamada con el token de servicio
(ADR 0004/0007).

El servicio FastAPI expone **una ruta interna por procesador** (p. ej.
`POST /interno/procesadores/maestro-excel/ejecutar`), alcanzable únicamente desde el portal por red
interna y con token de servicio válido — **nunca directamente desde el navegador**. La ruta del
portal **sigue siendo genérica**: el navegador llama a `POST /api/procesadores/{id}/ejecutar` y es
Next.js quien, tras autorizar, resuelve la ruta destino a partir de `clave_procesador` y reenvía
ahí. Esto es deliberado: mantiene **un solo punto de autorización** en el portal (ADR 0007) y evita
que la UI conozca la topología del servicio.

**Las rutas por procesador son cáscaras finas.** Cada una declara su forma de entrada (uno o varios
archivos, con los nombres de campo que espera) y delega de inmediato en el **pipeline común**, que
es quien resuelve la fila en BD, busca el módulo en el registry por `clave_procesador`, aplica las
validaciones comunes (cantidad, formato y tamaño desde la configuración en BD; contenido delegado
al módulo), ejecuta, empaqueta la salida si hay más de un archivo y devuelve el resultado — o un
**error tipificado** (formato / tamaño / contenido / cantidad / clave inexistente) — que el portal
retransmite al navegador. Una ruta que reimplemente cualquiera de esos pasos está mal escrita: la
separación de rutas existe para dar contratos de entrada distintos, **no** para duplicar el
pipeline. FastAPI **no** lee la sesión del usuario ni consulta permisos: confía en que el portal ya
autorizó (ADR 0007).

**El `evento_uso` lo registra el portal, no el servicio.** FastAPI no conoce al usuario — no ve la
cookie de sesión ni recibe su identidad — y `evento_uso.usuario_id` es una clave foránea a
`usuario`. Antes que agregar la identidad al contrato interno solo para poder escribir el evento, se
decide que **el portal escriba la fila**: ya sabe quién es el usuario, ya autorizó, y ahora mapea la
respuesta del servicio al tipo de evento (`ejecucion` en éxito; `error_formato`, `error_tamano` o
`error_contenido` según el error tipificado que reciba). El servicio queda íntegramente fuera del
dominio de identidad y su acceso a la BD pasa a ser de **solo lectura, también en datos**
(ADR 0005). Costo aceptado: si la respuesta del servicio se pierde en el camino de vuelta, ese
evento no se registra; es analítica, no un dato transaccional, y el archivo del usuario no depende
de ello.

Dar de alta un procesador = escribir el módulo que implementa la interfaz + registrarlo + declarar
su ruta cáscara + crear su fila desde el panel admin.

**Manejo de archivos: síncrono y sin estado (stateless).** El procesamiento es estrictamente
síncrono: la request de ejecución no retorna hasta que el archivo resultante está listo (o falla).
El servicio **no almacena archivos para descargas posteriores** ni mantiene estado entre requests.
Los archivos de entrada y de salida se escriben en un **volumen temporal de disco** únicamente para
**aliviar la RAM** durante el procesamiento (evita tener el archivo completo en memoria a la vez que
las estructuras de pandas/openpyxl). Es **obligatorio** envolver el ciclo en un bloque
`try/finally` que **elimine de inmediato** los temporales una vez enviada la respuesta HTTP al
cliente — tanto en éxito como en error. Con entradas y salidas múltiples eso significa **todos** los
temporales: cada archivo de entrada, cada archivo de salida y el ZIP intermedio si se generó. La
limpieza recorre el conjunto completo, no un par fijo de rutas; un procesador que produce diez
Excel deja diez temporales más el ZIP, y ninguno puede sobrevivir a la request. La **persistencia
del archivo resultante es responsabilidad exclusiva del navegador local del usuario** (la
descarga); el servidor no guarda copia. Esto mantiene al servicio sin estado, apto para reinicios y para el límite de RAM por
instancia (ADR 0001).

**Validación temprana del tamaño descomprimido (obligatoria).** El límite de 25 MB es del archivo
*comprimido*; un `.xlsx`/`.docx` es un ZIP que puede descomprimirse a varios GB (zip bomb o Excel
legítimo enorme), y cargarlo directo en `pandas`/`openpyxl` puede agotar la RAM del worker. Por eso,
**antes de pasar el archivo a cualquier librería de procesamiento**, la validación común debe
inspeccionar los **metadatos del ZIP** (los `.xlsx`/`.docx` se tratan como los archivos ZIP que
son, p. ej. con `zipfile`) y sumar el **tamaño descomprimido declarado** de sus entradas. Si ese
tamaño real excede un **límite seguro en RAM** (configurable, holgadamente por debajo de la memoria
del worker), el proceso se **aborta de inmediato** y devuelve al portal un **error controlado** de
tipo tamaño/contenido — nunca un OOM. Esta comprobación corre en el pipeline común (una sola vez
para todos los procesadores basados en ZIP), antes de instanciar el módulo. Formatos no-ZIP (p. ej.
CSV plano) se acotan por el tope de 25 MB comprimido, que ya limita su tamaño en memoria.

**Los límites se aplican por archivo y al conjunto.** Con entradas múltiples, el tope de 25 MB del
PRD es **por archivo**, pero eso no alcanza: diez archivos de 24 MB son 240 MB en una sola request.
El pipeline valida entonces tres cosas antes de procesar — el tamaño comprimido de **cada** archivo
contra el `tamano_max` del procesador, la **suma** de los tamaños comprimidos contra el
`tamano_max_total` de su fila (ADR 0002), y la **suma** de los tamaños descomprimidos declarados
contra el límite seguro en RAM del worker. El presupuesto de memoria es del worker, no de cada archivo por separado.

## Alternativas consideradas

- **Pipeline configurable sin código** (pasos declarativos armados por el admin desde la UI) —
  daría autonomía total sin deploys, pero construir el motor de pipeline es un proyecto en sí
  mismo y limitaría las transformaciones posibles; desproporcionado para el alcance.
- **Un endpoint ad-hoc por procesador** (autónomo, con su propia lógica de punta a punta) — lo más
  rápido para los primeros 1-2, pero duplica validaciones, registro de eventos y manejo de errores
  en cada uno, contradiciendo el requisito de modularidad del PRD. **Rechazado, y la revisión de
  este ADR no lo revive:** lo que se adoptó es una ruta *por procesador* que solo declara su forma
  de entrada y delega en el pipeline común. Se separa la superficie HTTP, no la lógica. Si una ruta
  empieza a validar formatos o a resolver errores por su cuenta, cayó en esta alternativa
  rechazada.
- **Una sola ruta genérica con contrato de entrada uniforme** (la decisión original de este ADR) —
  la superficie más chica posible, pero obliga a que procesadores con formas de entrada distintas
  (uno contra varios archivos, con roles distintos por archivo) compartan un contrato difuso de
  "lista de archivos sin nombre", empujando al cliente a adivinar el orden y al módulo a validar
  posiciones. Rutas explícitas hacen visible el contrato de cada procesador en la propia firma HTTP.
- **Un microservicio independiente por procesador** — deploy y dependencias aisladas por procesador,
  pero multiplica por N todo lo transversal (validaciones, ZIP bomb, errores tipificados, token de
  servicio, limpieza de temporales) y exige provisionar infraestructura por
  cada alta, empeorando el "alta sin soporte técnico" del PRD. La interfaz `Procesador` es la
  costura que permite extraer un procesador a su propio servicio el día que aparezca un driver
  concreto (dependencias incompatibles, RAM desproporcionada, otro equipo dueño); hacerlo hoy sería
  pagar la factura operativa antes de tener el problema.

## Consecuencias

- Validación de cantidad/formato/tamaño, empaquetado ZIP y tipificación de errores se implementan
  una sola vez en el pipeline común; un procesador nuevo aporta su lógica de negocio y una ruta
  cáscara que declara su forma de entrada.
- El servicio no toca el dominio de identidad ni escribe en la BD: no conoce usuarios, no consulta
  permisos y no registra eventos. Su superficie de seguridad se reduce a recibir archivos de un
  llamador autenticado por token y devolver archivos o errores.
- El contrato de entrada de cada procesador queda **explícito en su propia ruta** (cuántos archivos
  y con qué rol), en lugar de esconderse en el orden de una lista genérica.
- La salida múltiple es transparente para el módulo: devuelve una lista de archivos y el pipeline
  decide si viaja como archivo suelto o como ZIP. Cambiar esa política más adelante (p. ej. otro
  formato de empaquetado) se hace en un solo lugar.
- Costo real: la superficie del servicio crece con el catálogo — cada procesador nuevo agrega una
  ruta, no solo una entrada en el registry. Es el precio de tener contratos de entrada explícitos, y
  se mantiene acotado mientras las rutas sigan siendo cáscaras finas. Un test que verifique que toda
  ruta delega en el pipeline evita la degradación.
- La fila `procesador` del ADR 0002 necesita campos nuevos para declarar el contrato (cantidad de
  archivos de entrada y si la salida es simple o empaquetada), de modo que el portal arme la
  interfaz de carga correcta sin conocer el código del módulo. **Pendiente: actualizar ADR 0002.**
- Los procesadores acceden al ecosistema Python (pandas, openpyxl, python-docx), el más fuerte
  para manipular Excel/Word, y su carga de trabajo queda aislada del portal.
- Costo real: agregar un procesador requiere un despliegue del servicio FastAPI (es código
  nuevo); el "alta sin soporte técnico" del PRD se cumple para la parte administrable (fila en
  BD, asignaciones), pero el módulo lo escribe el Área de Innovación como desarrollo incremental.
- Si `clave_procesador` en BD no existe en el registry (desincronización fila↔código), la ruta
  debe fallar con un error claro; es un modo de fallo nuevo que introduce esta separación.
