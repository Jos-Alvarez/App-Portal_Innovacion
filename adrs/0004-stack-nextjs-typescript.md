# ADR 0004: Stack por componente — Next.js + TypeScript para el portal, FastAPI + Python para procesadores

## Estado

Aceptado

## Contexto

La arquitectura tiene dos componentes (ADR 0001): el portal (UI rica según DESIGN.md — modales,
toasts, skeletons, tablas, tema claro/oscuro con variables CSS — más la API REST interna, ADR
0003, y la autenticación contra Microsoft Entra ID) y el servicio de procesadores de archivos
(ADR 0006). Equipo de una persona con plazo de proyecto final.

## Decisión

- **Portal: Next.js (App Router) + TypeScript.** UI en React con las variables CSS del sistema de
  diseño, rutas API como route handlers bajo `/api/*`, autenticación Entra ID vía Auth.js/MSAL.
- **Servicio de procesadores: FastAPI + Python.** La lógica de cada procesador usa el ecosistema
  Python de manipulación de archivos (pandas, openpyxl, python-docx), detrás de la interfaz común
  del ADR 0006.

## Alternativas consideradas

- **Todo en Next.js/TypeScript (procesadores en Node con exceljs/docx)** — un solo lenguaje y
  toolchain, pero el ecosistema Node para Excel/Word es notablemente más limitado que pandas/
  openpyxl; los procesadores son el corazón funcional del portal y no conviene construirlos sobre
  el ecosistema débil.
- **Todo en Python (FastAPI sirviendo una SPA React compilada)** — unifica en Python el lado
  servidor, pero pierde el framework integrado para la UI rica del DESIGN.md y obliga a cablear a
  mano el build de la SPA; más fricción para el desarrollo de la interfaz.
- **.NET 8 + Blazor** — integración nativa con Entra ID y coherencia con el entorno Microsoft,
  pero Blazor es menos ágil para la UI custom del DESIGN.md y la curva de C# no se justifica.

## Consecuencias

- Cada componente usa el ecosistema más fuerte para su trabajo: React/Next.js para la interfaz y
  la API del portal, Python para la manipulación de archivos.
- Costo real: dos lenguajes y dos toolchains para una sola persona — dependencias, tests y
  despliegues por duplicado, y los tipos no se comparten entre portal y servicio de procesadores
  (el contrato entre ambos debe validarse con esquemas, p. ej. Pydantic en FastAPI y Zod en el
  portal).
- La autenticación de usuarios vive en el portal; el servicio FastAPI debe confiar en el portal o
  validar por sí mismo las llamadas (token de servicio), lo que añade una pieza de seguridad a
  diseñar.
