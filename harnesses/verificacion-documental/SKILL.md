---
name: verificacion-documental
description: Verifica la consistencia entre PRD.md, DESIGN.md, TECH-DESIGN.md, BACKLOG.md y adrs/*.md, detectando huecos de trazabilidad, contradicciones directas y huerfanos hacia arriba, y escribe el resultado en VERIFICACION-DOCUMENTAL.md sin modificar ningun documento del perimetro. Use when the user asks to check documentation consistency, verify that the PRD, design, backlog and ADRs agree with each other, find contradictions or traceability gaps between project documents, or run a documentation audit.
---

# Verificacion documental

## Goal

Detectar desalineaciones entre los documentos de producto y arquitectura de App_Portal,
y dejarlas escritas con cita exacta para que una persona decida como resolverlas.

Esta skill NO resuelve inconsistencias. Las reporta. La distincion es deliberada: un hueco
entre el PRD y el BACKLOG se puede cerrar de dos formas opuestas — agregando el item al
backlog, o borrando la promesa del PRD — y esa es una decision de producto.

## Perimetro (fijo, 14 documentos)

| Documento | Rol en la verificacion |
|---|---|
| `PRD.md` | Fuente de promesas. `## Alcance` y `## Casos borde` son lo prometido; `## No alcance` es lo negado explicitamente. |
| `DESIGN.md` | Sistema de diseno visual: colores, tipografia, componentes, estados obligatorios. |
| `TECH-DESIGN.md` | Bajada tecnica. `## Criterios de aceptacion por flujo` es el mapa de que llego abajo. |
| `BACKLOG.md` | Trabajo planificado. `## Decisiones tomadas despues del Technical Design` es zona caliente. |
| `adrs/*.md` | 10 decisiones de arquitectura. `## Decision` afirma; `## Alternativas consideradas` descarta. |

El perimetro no se amplia sobre la marcha. Si el usuario quiere incluir `openspec/specs/**`,
`MIGRACIONES.md` o `README.md`, eso es otra pasada del harness, no una excepcion de esta.

## Contrato de solo lectura (no negociable)

Durante la corrida no se modifica NINGUN documento del perimetro. El unico archivo que esta
skill escribe es `VERIFICACION-DOCUMENTAL.md` en la raiz.

Esto no depende de la buena voluntad del agente: el hook `guard-docs.mjs` bloquea a nivel de
herramienta cualquier `Edit`/`Write`/`MultiEdit` sobre el perimetro mientras la corrida esta
abierta. Si el hook rechaza una escritura, esa es la respuesta correcta — no buscar una via
alternativa (Bash, `sed`, heredoc) para escribir igual. Rodear el hook es una violacion del
contrato, no un workaround.

## Workflow

### 0. Abrir la corrida

Crear el archivo sentinela que activa el guard:

    .claude/.verificacion-documental.lock

Contenido: la fecha/hora ISO de inicio. Mientras exista, el perimetro esta protegido.

### 1. Leer el perimetro completo

Leer los 14 documentos enteros antes de emitir un solo hallazgo. Un detector que opina sobre
`BACKLOG.md` sin haber leido `PRD.md` entero produce falsos positivos.

Registrar, mientras se lee, un inventario de afirmaciones con su ubicacion `archivo:linea`.
Toda cita del reporte sale de este inventario, nunca de la memoria.

### 2. Detector A — Huecos de trazabilidad

Recorrer `PRD.md` requisito por requisito sobre **dos** secciones:

- `## Alcance` — lo que el portal promete hacer.
- `## Casos borde` — lo que promete hacer cuando algo sale mal: un limite, un rechazo, un mensaje.

Ambas contienen promesas verificables del mismo peso. Una promesa que solo vive en `## Casos borde`
se pierde camino abajo con la misma facilidad que una del alcance, y con menos ruido: nadie la
extrana porque nunca fue una feature.

Para cada promesa, buscar su bajada en `TECH-DESIGN.md` (principalmente `## Criterios de aceptacion
por flujo`) y su trabajo correspondiente en `BACKLOG.md` seccion `## Backlog`.

Es hueco cuando la promesa existe arriba y no tiene correspondencia abajo. Registrar en que
documentos si aparece y en cuales no: un requisito que llego al TECH-DESIGN pero no al BACKLOG
es un hallazgo distinto de uno que no llego a ninguno.

### 3. Detector B — Contradicciones directas

Comparar afirmaciones sobre el MISMO tema entre documentos distintos. Los cruces de mayor
rendimiento, en este orden:

1. `PRD.md ## No alcance` contra `BACKLOG.md ## Backlog` y contra `TECH-DESIGN.md`. Algo
   declarado fuera de alcance que igual esta planificado o disenado es contradiccion dura.
2. `adrs/*.md ## Alternativas consideradas` contra `TECH-DESIGN.md`. Una alternativa
   explicitamente descartada en un ADR que reaparece como la solucion descrita en el tech
   design es contradiccion dura.
3. `BACKLOG.md ## Decisiones tomadas despues del Technical Design` contra `TECH-DESIGN.md` y
   contra los ADRs. Estas decisiones son posteriores por definicion: verificar si invalidan
   algo aguas arriba que quedo sin actualizar.
4. `adrs/*.md ## Decision` entre si. Dos ADRs que resuelven el mismo problema de forma
   incompatible, o uno cuyo `## Estado` sigue vigente pero fue superado por otro posterior.
5. `DESIGN.md` contra `TECH-DESIGN.md` y `PRD.md` en lo que se toquen: estados obligatorios,
   componentes, criterios de contraste referidos desde criterios de aceptacion.

Una contradiccion requiere DOS citas literales incompatibles. Si solo se puede citar un lado,
no es contradiccion: es una sospecha, y no entra al reporte.

### 4. Detector C — Huerfanos hacia arriba

Recorrer `BACKLOG.md ## Backlog` y `adrs/*.md ## Decision` buscando items o decisiones que
ningun requisito del `PRD.md` justifica.

Un huerfano no es necesariamente un error: hay trabajo tecnico legitimo sin origen en el PRD
(infraestructura, deuda, tooling). Reportarlo igual, pero como senal de que el alcance crecio
sin que el PRD se entere, no como defecto.

### 5. Escribir VERIFICACION-DOCUMENTAL.md

Sobreescribir el archivo en la raiz con el formato de la seccion "Formato del reporte".
Se sobreescribe, no se acumula: el historial vive en git, y el diff entre corridas es
exactamente lo que muestra que se arreglo y que aparecio nuevo.

### 6. Cerrar la corrida

Borrar `.claude/.verificacion-documental.lock` y devolver en el chat SOLO el resumen:

    N huecos, N contradicciones, N huerfanos -> VERIFICACION-DOCUMENTAL.md

Nada mas en el chat. El detalle esta en el archivo. Si el usuario pide profundizar en un
hallazgo puntual, ahi si se desarrolla.

## Criterio: que NO es un hallazgo

Este filtro es la diferencia entre un harness que se usa y uno que se apaga a la semana.
Descartar antes de escribir:

- **Distinto nivel de detalle.** El PRD dice "notificacion por correo" y el TECH-DESIGN dedica
  tres parrafos al mecanismo de outbox. Eso es bajada correcta, no divergencia.
- **Distinto vocabulario para lo mismo.** "Colaborador" en el PRD y "usuario no admin" en un ADR
  son el mismo sujeto. Verificar identidad semantica antes de reportar.
- **Documentos que hablan de ejes distintos.** `DESIGN.md` define tokens de color y el PRD no los
  menciona. No es hueco: el PRD no es la fuente de decisiones visuales.
- **Ausencia en un documento que no corresponde.** Un requisito de producto que no aparece en un
  ADR no es hueco. Los ADRs cubren decisiones de arquitectura, no cobertura de requisitos.
- **`## No alcance` cumplido.** Que algo este en `## No alcance` y NO aparezca en el backlog es
  el sistema funcionando bien. Solo es hallazgo el caso inverso.
- **Sospechas sin dos citas.** Ver Detector B.

## Formato del reporte

    # Verificacion documental

    Corrida: YYYY-MM-DD | Perimetro: 14 documentos (PRD, DESIGN, TECH-DESIGN, BACKLOG, adrs/*)

    ## Resumen

    | Detector        | Hallazgos |
    |-----------------|-----------|
    | Huecos          | N         |
    | Contradicciones | N         |
    | Huerfanos       | N         |

    ## Huecos de trazabilidad

    ### H-01 - <titulo corto del requisito>
    - **Origen:** `PRD.md:47` - "<cita literal>"
    - **Presente en:** `TECH-DESIGN.md:169` (parcial: <que cubre>)
    - **Ausente en:** `BACKLOG.md`

    ## Contradicciones

    ### C-01 - <tema en disputa>
    - **A:** `PRD.md:110` - "<cita literal>"
    - **B:** `BACKLOG.md:52` - "<cita literal incompatible>"
    - **Por que chocan:** <una linea>

    ## Huerfanos hacia arriba

    ### O-01 - <item o decision>
    - **Ubicacion:** `BACKLOG.md:88` - "<cita literal>"
    - **Sin origen en:** `PRD.md`

Si un detector no encuentra nada, su seccion se escribe igual con el texto `Sin hallazgos.`
Un reporte que omite secciones no se puede diferenciar de uno truncado.

## Quality gate

Antes de escribir el reporte, verificar en silencio:

- Toda cita tiene `archivo:linea` y es literal, no parafraseada.
- Toda contradiccion tiene dos citas incompatibles.
- Ningun hallazgo cae en alguna categoria de "que NO es un hallazgo".
- Los tres detectores tienen seccion en el reporte, aunque este vacia.
- No se modifico ningun documento del perimetro.
- El sentinela quedo borrado.
