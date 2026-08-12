# ADR 0001: Portal monolítico Next.js + servicio independiente de procesadores

## Estado

Aceptado

## Contexto

El PRD describe un portal web único con login SSO (Entra ID), un dashboard filtrado por
asignaciones, procesadores de archivos que corren *dentro* del portal (subida → proceso →
descarga, tope 25 MB), buzón de sugerencias con notificación por correo, panel de administración
y pantalla de analítica. El equipo es de una persona (proyecto final), el volumen de usuarios es
acotado (empleados de Lima Expresa) y las apps/agentes externos no se desarrollan aquí — solo se
publican como enlaces. El PRD además señala como riesgo que los procesadores deben poder crecer
de forma modular sin tocar el resto del portal.

## Decisión

El sistema se compone de **dos desplegables**:

1. **Portal (Next.js, un solo repo/proceso):** UI + API interna del portal — autenticación,
   catálogo, asignaciones, sugerencias, administración y analítica.
2. **Servicio de procesadores (FastAPI, Python):** ejecuta los procesadores de archivos (ver
   ADR 0006). El portal le delega la ejecución; el usuario sigue viviendo la experiencia "dentro
   del portal".

Ambos comparten la base de datos (SQL Server, ADR 0005) y la API de correo se consume desde el
portal.

**Política de concurrencia y memoria del servicio de procesadores.** El servicio FastAPI es
síncrono y el procesamiento es CPU-bound (pandas/openpyxl). Para que una ejecución pesada o un
archivo anómalo no degrade a todos los usuarios, el servicio corre con:

- Un **número fijo y limitado de workers** (política de concurrencia acotada), de modo que la carga
  simultánea sea predecible y no sature la máquina.
- Un **límite estricto de RAM por contenedor/instancia** en el entorno de despliegue, combinado con
  la validación temprana del tamaño descomprimido (ADR 0006). El objetivo es que un archivo anómalo,
  en el peor caso, **mate a un worker concreto** (aislado y reiniciable) y devuelva un error
  controlado, pero **no tumbe todo el servicio** ni afecte a otras ejecuciones en curso.

> Nota: la decisión original fue un monolito único con procesadores como módulos internos en
> Node; se revisó al decidir el ADR 0006, porque el ecosistema Python (pandas, openpyxl,
> python-docx) es el adecuado para la lógica de procesamiento y conviene aislar esa carga.

## Alternativas consideradas

- **Monolito único full-stack (todo en Next.js, procesadores en Node)** — máxima simplicidad de
  despliegue, pero el ecosistema Node para Excel/Word es limitado y un procesamiento pesado
  compartiría proceso con el portal. Fue la elección inicial y se revisó a favor de separar los
  procesadores.
- **Frontend (SPA) + backend API en repos/deploys separados** — separación limpia, pero duplica
  despliegues y configuración (CORS, versiones) sin resolver el problema del ecosistema de
  procesamiento.
- **Monolito + workers de procesamiento con cola** — aísla el procesamiento en background, pero
  la infraestructura de cola/worker es sobredimensionada para archivos de ≤25 MB con uso mínimo;
  el servicio FastAPI síncrono logra el aislamiento sin la cola.

## Consecuencias

- El portal mantiene la simplicidad de un monolito para todo lo que no es procesamiento, y los
  procesadores ganan el ecosistema Python y aislamiento de carga: un procesador pesado no
  degrada la UI ni la API del portal.
- Costo real: dos desplegables y dos toolchains (TypeScript y Python) para una sola persona —
  más configuración, dos pipelines de despliegue y la necesidad de asegurar la comunicación
  portal ↔ servicio (red interna y/o token de servicio, ver ADR 0006).
- La base de datos compartida acopla los dos servicios al mismo esquema; el dueño único es el
  portal (Next.js/Prisma migra; FastAPI es un espejo de solo lectura estructural, sin DDL), de modo
  que la coordinación es en una sola dirección (ver ADR 0005).
