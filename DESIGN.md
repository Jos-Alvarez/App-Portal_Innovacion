# Portal de Innovación Lima Expresa — Sistema de Diseño

## North Star: "Autopista corporativa"
Interfaz institucional, clara y confiable para usuarios no técnicos. La identidad se deriva del logo de Lima Expresa: azul marino como autoridad, cian como movimiento. Sobria por defecto; el color aparece solo donde hay acción o estado.

## Colores
Definidos como variables CSS con par claro/oscuro (`body[data-lx-dark="1"]`).

- **Navy — primario (`--navy`, `#1A4293` / dark `#3E6BC9`):** relleno de acciones primarias, con texto `--on-primary` (`#FFFFFF`) encima. Hover: `--navy-deep` (`#0E2C6B` / `#5B85DB`).
- **Navy de primer plano (`--navy-fg`, `#1A4293` / dark `#6D95DD`):** navy usado como *color de texto* — texto de marca, navegación activa, hover del botón secundario. En claro coincide con `--navy`; en oscuro **no puede coincidir**: el valor de relleno `#3E6BC9` solo alcanza 3.25:1 como texto sobre `--surface` y reprueba AA. Ningún valor único sirve para los dos roles a la vez (pasar 4.5:1 como texto exige luminancia ≥ 0.2373; mantener el blanco legible encima exige ≤ 0.1833), por eso el token está partido.
- **Cian — acento (`#2AA7CE` / dark `#4CC3E4`):** enlaces, acciones secundarias, foco, selección. Nunca para texto largo.
- **Cian suave (`--cyan-soft`, `#E3F4FA` / `#12314A`):** fondos de chips, tabs activos, hover de selección.
- **Rojo (`#D2372C` / `#F07C72`):** SOLO errores y acciones destructivas (herencia VINCI). Nunca decorativo.
- **Semánticos:** ok verde (`#1E7B4F` / dark `#35B87C`), advertencia ámbar (`#8A6116` / dark `#CF9330`), cada uno con su fondo suave (`--ok-bg`, `--warn-bg`, `--danger-bg`).
- **Neutrales fríos:** fondo `#F2F5FA`, superficie `#FFFFFF`, borde `#D8E0EC`, texto `#0F2244`, secundario `#5D6B84`. En oscuro: `#0B1424` / `#121F37` / `#26375A` / `#E8EEF9` / `#93A2BE`.
- Agente IA usa violeta `--agent` (`#7A4FB0` / dark `#AB8BD8`) solo como etiqueta de tipo.

### Criterio de contraste
Todo color que se use como texto cumple **WCAG AA (4.5:1)** contra la superficie sobre la que aparece. La superficie oscura `--surface` (`#121F37`) es el caso más exigente de los dos fondos, así que es la que se verifica. Los pares oscuros de `--ok`, `--warn`, `--agent` y `--navy-fg` se calcularon para restaurar AA conservando el tono original de cada token, ubicándolos en la misma banda de contraste que ya ocupaba `--danger` (6.13:1), de modo que la familia semántica se lea como un solo sistema.

| Token | Oscuro | vs `--surface` | vs `--bg` |
|---|---|---|---|
| `--ok` | `#35B87C` | 6.50 | 7.28 |
| `--warn` | `#CF9330` | 6.16 | 6.90 |
| `--agent` | `#AB8BD8` | 5.81 | 6.51 |
| `--navy-fg` | `#6D95DD` | 5.48 | 6.14 |
| `--navy-deep` (hover de texto) | `#5B85DB` | 4.56 | 5.11 |

`--navy` (`#3E6BC9`) queda deliberadamente fuera de esta tabla: es un color de **relleno**, no de texto. Se valida por el contraste de `--on-primary` encima de él (5.06:1 en oscuro, 9.33:1 en claro).

### Tokens derivados
Estos tokens se nombran arriba pero no tienen valor literal propio: se derivan de los anteriores, de modo que resuelven solos en ambos temas y no hay una segunda lista de hexadecimales que mantener sincronizada.

- `--ok-bg`, `--warn-bg`, `--danger-bg`: `color-mix(in srgb, <token> 12%, var(--surface))`.
- `--surface2` (hover de fila de tabla): `color-mix(in srgb, var(--bg) 60%, var(--surface))`.
- `--shadow`: la sombra doble suave, más profunda en oscuro.
- `--on-primary` (`#FFFFFF`): texto sobre relleno navy, un único valor para ambos temas.

## Tipografía
- **Única familia: Archivo** (Google Fonts), 400–800. Geométrica y corporativa, coherente con el wordmark del logo.
- Títulos de pantalla: 24px / 800 / letter-spacing −0.01em.
- Cuerpo: 13.5–14px / 400–600. Metadatos: 11.5–12.5px en `--muted`.
- Etiquetas de tipo/estado: 10.5–11px / 700 / uppercase / letter-spacing .04–.07em.
- Texto de UI nunca por debajo de 11px.

## Logo
- Imagen del logo con `mix-blend-mode: multiply` en claro (elimina el fondo blanco del PNG).
- En oscuro: `mix-blend-mode: screen` + `filter: invert(1) hue-rotate(185deg) saturate(1.15) brightness(1.1)` como variante adaptada. **En producción reemplazar por SVG transparente + variante oficial dark.**
- Presencia: login (132px, centrado) y topbar (58px + separador vertical + "Portal de Innovación").

## Superficies y elevación
- Tarjetas y paneles: `--surface` + borde 1px `--border` + radio 12–16px + `--shadow` (sombra doble suave, más profunda en dark).
- Fondo de página `--bg`; login con degradado sutil `--bg → --cyan-soft` (160deg).
- Modales: overlay `rgba(8,16,32,.45)`, tarjeta 16px radio, animación `lx-pop` (fade + 8px up, ~.25s).
- Hover de tarjetas interactivas: borde cian + `translateY(-2px)`.

## Componentes
- **Botón primario:** navy, texto blanco, radio 8–10px, 600–700. Hover → navy-deep. Deshabilitado: opacity .5 + cursor not-allowed (nunca ocultarlo).
- **Botón secundario:** borde `--border`, fondo transparente; hover borde/texto navy.
- **Chips de filtro:** pill, activo = navy relleno, inactivo = borde + `--muted`.
- **Chips de tipo/estado:** pill con fondo suave semántico + texto del mismo tono. Estados de sugerencia: pendiente gris, en revisión ámbar, aprobada verde, rechazada rojo, implementada navy.
- **Estado con punto:** punto 7px + texto 600 del color semántico (catálogo).
- **Inputs:** fondo `--bg`, borde `--border`, radio 9px, foco cian (`outline-color`), error = borde rojo + mensaje en `--danger-bg`.
- **Switch:** 44×24px, verde asignado / borde gris sin acceso, knob animado.
- **Toggles de tema:** pill con icono ☾/☀; preferencia en `localStorage`.
- **Toast:** inferior centrado, fondo `--text` sobre `--bg` invertido, ~2.8s. Confirma toda acción sin navegación (guardar, asignar, enviar, agrupar).
- **Tablas:** encabezado 11px uppercase `--muted`, filas con borde inferior, hover `--surface2`.
- Todos los botones y chips: `white-space: nowrap`.

## Estados obligatorios
Toda vista de datos define sus 4 estados:
- **Carga:** skeleton shimmer (`lx-shimmer`) con la geometría del contenido real; nunca pantalla en blanco.
- **Vacío:** icono suave + título + explicación de quién asigna + salida útil (contactar Innovación). El buzón es solo para ideas nuevas.
- **Error:** círculo rojo "!", lenguaje claro sin códigos, botón Reintentar.
- **Sin permiso (403):** candado + explicación + "Volver al portal" / "Solicitar acceso". Aplica de inmediato al revocar.
- Errores de procesador: banner rojo con título 700 + motivo específico (formato / tamaño / contenido) + Reintentar.

## Reglas
- Una acción primaria (navy) por vista; el resto secundarias o de texto.
- El rojo jamás se usa fuera de error/destrucción.
- Densidad cómoda: padding 20–28px en tarjetas, grids con gap 14–24px.
- Todo cambio administrativo se confirma con toast y aplica de inmediato (sin "guardar cambios" globales).
- Copys en español, directos, sin jerga técnica; siempre dicen quién resuelve (Área de Innovación).
- Emojis/iconos unicode solo como iconografía funcional discreta (⇄, 🔒, ⚠); no decorativos.