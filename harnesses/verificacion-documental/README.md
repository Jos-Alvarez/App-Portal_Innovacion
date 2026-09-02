# Harness: Verificacion documental

Detecta desalineaciones entre los documentos de producto y arquitectura de App_Portal,
y las reporta con cita exacta. **No corrige nada.**

## Que hace

Cruza 14 documentos y busca tres cosas:

| Detector | Pregunta que responde | Ejemplo real |
|---|---|---|
| **Huecos de trazabilidad** | Que prometio el PRD que no llego abajo? | El PRD dice "gestion de usuarios" y el BACKLOG no la contempla. |
| **Contradicciones directas** | Que dos documentos afirman cosas incompatibles? | El TECH-DESIGN describe una solucion que un ADR ya descarto. |
| **Huerfanos hacia arriba** | Que hay abajo que nadie pidio arriba? | Un item del BACKLOG sin ningun requisito que lo justifique. |

Perimetro: `PRD.md`, `DESIGN.md`, `TECH-DESIGN.md`, `BACKLOG.md` y los 10 `adrs/*.md`.
Fuera del perimetro (a proposito): `openspec/specs/**`, `MIGRACIONES.md`, `README.md`,
`REVISION-ADVERSARIAL.md`.

## Como se usa

    /verificacion-documental

O en lenguaje natural: "verifica la consistencia de la documentacion".

Cada corrida sobreescribe `VERIFICACION-DOCUMENTAL.md` en la raiz y devuelve en el chat solo
el conteo por detector. El archivo va versionado en git a proposito: el diff entre corridas es
lo que muestra que se arreglo y que aparecio nuevo.

## De que piezas esta hecho

### 1. La skill — `SKILL.md`

El proceso: abre la corrida, lee los 14 documentos, corre los tres detectores en orden,
escribe el reporte y cierra la corrida. Incluye una seccion **"que NO es un hallazgo"** que es
la parte que evita los falsos positivos (distinto nivel de detalle, distinto vocabulario para
lo mismo, documentos que hablan de ejes distintos).

### 2. El hook — `hooks/guard-docs.mjs`

El harness es de **solo lectura** sobre el perimetro. Eso no se deja a la buena voluntad del
agente: este hook `PreToolUse` intercepta `Edit`/`Write`/`MultiEdit`/`NotebookEdit` y bloquea
cualquier escritura sobre los 14 documentos **mientras la corrida esta abierta**.

Se hizo asi, y no como una linea en un archivo de reglas, porque una instruccion escrita se
puede leer e ignorar; un hook no.

**Como sabe si hay una corrida abierta:** por el archivo sentinela
`.claude/.verificacion-documental.lock`. La skill lo crea al empezar y lo borra al terminar.
Sin sentinela, el hook es transparente: podes editar `PRD.md` normalmente cualquier otro dia.

**Ante entrada ambigua durante una corrida** (JSON ilegible, destino no resuelto) el hook
**bloquea**. Un guard que ante la duda abre la puerta no es un guard.

### 3. No hay regla en CLAUDE.md ni sub-agente

A proposito. La unica restriccion dura ya la cubre el hook, y el proceso no necesita contexto
aislado. Agregar piezas que no hacen falta solo da mas superficie para que el harness se
desincronice consigo mismo.

## Como lo enciende un companero de equipo

En su propia maquina, sobre este mismo repo:

1. **Instalar la skill** — copiar `harnesses/verificacion-documental/SKILL.md` a
   `.claude/skills/verificacion-documental/SKILL.md`.

2. **Registrar el hook** — agregar esta entrada a `.claude/settings.json`. Si el archivo ya
   tiene `hooks`, se agrega el bloque dentro de `PreToolUse` sin pisar lo que ya este ahi:

       {
         "hooks": {
           "PreToolUse": [
             {
               "matcher": "Edit|Write|MultiEdit|NotebookEdit",
               "hooks": [
                 {
                   "type": "command",
                   "command": "node \"$CLAUDE_PROJECT_DIR/harnesses/verificacion-documental/hooks/guard-docs.mjs\""
                 }
               ]
             }
           ]
         }
       }

3. **Verificar que el guard responde** — con Node instalado (v18+):

       cd <raiz del repo>
       export CLAUDE_PROJECT_DIR="$PWD"
       mkdir -p .claude && date -Iseconds > .claude/.verificacion-documental.lock
       printf '%s' '{"tool_name":"Edit","tool_input":{"file_path":"PRD.md"}}' \
         | node harnesses/verificacion-documental/hooks/guard-docs.mjs; echo "exit $?"
       rm -f .claude/.verificacion-documental.lock

   Tiene que imprimir el mensaje de bloqueo y `exit 2`. Si imprime `exit 0`, el hook no esta
   viendo el sentinela: revisar que `CLAUDE_PROJECT_DIR` apunte a la raiz del repo.

4. **Reiniciar la sesion de Claude Code** para que tome `settings.json`.

## Si algo queda mal

**El sentinela quedo colgado** (una corrida se interrumpio a la mitad): no vas a poder editar
los documentos del perimetro. Se resuelve borrandolo:

    rm .claude/.verificacion-documental.lock

**El hook no bloquea nada:** casi siempre es que `$CLAUDE_PROJECT_DIR` no se expandio. Correr
el paso 3 de arriba para confirmar, y como alternativa poner la ruta absoluta al `.mjs` en el
`command`.
