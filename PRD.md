---
title: "Portal de Innovación - Lima Expresa"
---

# PRD: Portal de Innovación - Lima Expresa

## Problema

El Área de Innovación de Lima Expresa crea múltiples aplicaciones web, agentes de IA y
automatizaciones (por ejemplo, procesadores de archivos Excel que reciben un archivo, lo procesan
y devuelven un archivo procesado), pero estas soluciones están dispersas: no existe un punto único
donde los colaboradores puedan acceder a ellas, y no hay un mecanismo centralizado para controlar
quién puede ver o usar cada aplicativo. Además, las ideas de mejora o automatización que surgen en
las distintas áreas no tienen un canal formal para llegar al Área de Innovación.

## Usuario objetivo

Dos perfiles:

- **Colaborador**: cualquier empleado de Lima Expresa que inicia sesión con su correo corporativo
  y necesita acceder únicamente a las aplicaciones y automatizaciones que le fueron asignadas,
  desde un solo portal.
- **Administrador** (Área de Innovación): gestiona el catálogo completo de aplicaciones y
  automatizaciones, asigna qué usuarios ven qué recursos, y revisa las sugerencias de innovación
  enviadas por los colaboradores.

## Objetivo / resultado esperado

Los colaboradores dejan de buscar herramientas dispersas y acceden a un portal único donde ven
solo lo que les corresponde: procesan archivos directamente en el portal y abren las apps/agentes
enlazados en una nueva ventana. El Área de Innovación gana control centralizado sobre accesos y
visibilidad, recibe un flujo continuo y formal de ideas de innovación con un sistema de aprobación,
y puede medir qué se usa más y por quién mediante una pantalla de analítica.

## Alcance (qué sí incluye esta versión)

- Login con correo corporativo (autenticación institucional).
- **Identidad visual corporativa**: el logo de Lima Expresa (incluido como archivo dentro del
  propio proyecto) está visible tanto en la **pantalla de login** como **dentro del portal**,
  presente de forma consistente en las pantallas del colaborador y del administrador. Su ubicación
  y forma de presentación deben resultar naturales y estéticas dentro de la interfaz (integrado al
  diseño, no forzado). Además, el portal en su conjunto debe **respetar los lineamientos gráficos
  de marca de Lima Expresa** (colores, tipografía, uso correcto del logo), no solo mostrar el logo.
  No existe un manual/guía de marca formal a seguir, por lo que **los lineamientos gráficos se
  derivan del propio logo de la empresa**: se toma su paleta de colores como base para la interfaz
  y se elige una tipografía coherente con esa identidad.
- **Modo claro y modo oscuro**: el portal ofrece ambos temas (light/dark), que el usuario puede
  alternar. La preferencia elegida se mantiene entre sesiones y ambos temas respetan la identidad
  visual de la empresa (colores derivados del logo, con contraste legible en los dos modos).
- **El logo se adapta al tema activo**: en modo oscuro el logo cambia (color/variante) para verse
  bien, natural y estético sobre fondo oscuro, y no queda ilegible ni recortado. En modo claro se
  muestra su versión normal.
- Portal/dashboard donde el colaborador ve únicamente las apps, agentes y procesadores de archivos
  que le fueron asignados.
- **Procesadores de archivos dentro del portal**: el usuario sube un archivo, el portal lo procesa
  y devuelve el archivo resultante. Qué procesadores existen (Excel, Word, u otros formatos) depende
  de la necesidad del usuario; no hay un formato "por defecto" fijo y la arquitectura permite agregar
  nuevos procesadores más adelante.
- Cada procesador declara explícitamente qué tipo(s) de archivo acepta; si el usuario sube un
  formato no permitido, el portal muestra un mensaje indicando que el formato no es válido y no
  intenta procesarlo.
- **Enlaces a apps y agentes de IA**: el portal no desarrolla ni aloja estas aplicaciones (son
  desarrollos aparte); únicamente muestra el enlace asignado, que se abre en una nueva ventana/pestaña.
- **Alta de enlaces desde el propio portal**: el registro de un nuevo enlace de app o agente
  (nombre, URL de destino, descripción, etc.) se realiza dentro del Portal de Innovación. Esta
  acción es exclusiva del **administrador** (Área de Innovación); ningún colaborador puede crear ni
  editar enlaces.
- Buzón de sugerencias: cualquier colaborador puede enviar una idea o sugerencia de innovación
  (para sí mismo, su área u otra área).
- **Sistema de aprobación de sugerencias**: el Área de Innovación puede revisar cada sugerencia y
  cambiar su estado (pendiente → en revisión → aprobada/rechazada/implementada), con trazabilidad
  visible para todos.
- **Agrupación de sugerencias similares/duplicadas**: el Área de Innovación puede agrupar varias
  sugerencias que tratan del mismo tema para no gestionarlas por separado.
- Envío automático por correo al Área de Innovación cuando se registra una sugerencia.
- Panel de administrador: ve todas las apps/agentes/procesadores y todas las sugerencias recibidas
  con su estado de aprobación.
- Gestión de usuarios por parte del administrador: asignar o revocar qué apps/agentes/procesadores
  puede ver cada colaborador.
- **Gestión de administradores** (exclusiva del administrador): una pantalla propia donde un
  administrador puede **promover a más administradores y también revocar ese rol**. Las personas se
  buscan dentro del directorio de la empresa (Entra ID) y se les otorga o retira el rol de
  administrador. **Debe existir siempre al menos 1 administrador**: el sistema no permite revocar al
  último, de modo que nunca se llegue a cero administradores. El acceso a esta pantalla se ofrece
  desde un botón ubicado **junto al de cerrar sesión**, visible solo para administradores; ningún
  colaborador ve ni puede acceder a esta opción.
- **Pantalla de analítica** para el administrador con, como mínimo:
  - **Uso por app/procesador**: número de aperturas (apps enlazadas) y de ejecuciones/archivos
    procesados (procesadores), con ranking de los más usados.
  - **Uso por usuario y por área**: quién usa qué y con qué frecuencia; usuarios más activos.
  - **Adopción**: usuarios activos vs. usuarios con acceso asignado (cuántos realmente lo usan).
  - **Sugerencias**: cantidad recibida y distribución por estado (pendiente/en revisión/
    aprobada/rechazada/implementada), y por área de origen.
  - **Errores de procesamiento**: intentos con formato no permitido o archivo inválido, por procesador.
  - **Periodos de reporte**: vista de hoy, últimos 7 días, últimos 30 días y rango de fechas
    personalizable; con posibilidad de comparar contra el periodo anterior.
- Administración del catálogo de procesadores: el Área de Innovación puede dar de alta nuevos
  procesadores de archivos a futuro sin rehacer el portal.

## No alcance (qué explícitamente no incluye esta versión)

- No incluye el desarrollo de las apps ni de los agentes de IA en sí: son proyectos aparte. El
  portal únicamente publica el enlace para abrirlos en una nueva ventana. (Los procesadores de
  archivos sí se desarrollan y viven dentro del portal.)
- No se permite que los colaboradores comenten ni voten las sugerencias de innovación. (Sí se
  permite, del lado del Área de Innovación, agrupar sugerencias iguales o similares.)
- No incluye roles intermedios (por ejemplo, "administrador de área"); solo se contemplan
  colaborador y administrador. Ninguna área requiere un rol intermedio con permisos parciales.
- No se comprometen procesadores para todos los formatos posibles en esta versión: los procesadores
  disponibles se definen según la necesidad real del usuario y se agregan de forma incremental.
- No incluye edición del contenido de los archivos en línea; el portal recibe, procesa y devuelve,
  no es un editor de documentos.

## Criterios de éxito

- Un colaborador puede iniciar sesión con su correo corporativo y ver únicamente las
  apps/agentes/procesadores que el administrador le asignó (verificado con al menos 2 usuarios
  de prueba con distintos accesos).
- Un procesador de archivos completa el ciclo subida → procesamiento → descarga del archivo
  resultante sin intervención manual.
- Al subir un archivo con un formato distinto al que el procesador declara aceptar, el portal lo
  rechaza mostrando un mensaje claro de "formato no permitido" y no genera un archivo de salida.
- Un enlace a una app/agente asignada abre la aplicación externa en una nueva ventana/pestaña.
- Una sugerencia enviada desde el buzón llega como correo al Área de Innovación en menos de 1 minuto
  desde el envío.
- El Área de Innovación puede cambiar el estado de una sugerencia (pendiente → en revisión →
  aprobada/rechazada/implementada) y ese estado queda visible para todos (administrador y
  colaboradores).
- El administrador puede registrar un nuevo enlace de app/agente desde el portal (sin soporte
  técnico ni despliegue), y ese enlace queda disponible para asignarlo a los usuarios. Un
  colaborador no ve ni puede acceder a esta función de alta de enlaces.
- El administrador puede asignar o revocar el acceso de un usuario a una app/agente/procesador sin
  soporte técnico externo (autoservicio desde el panel admin).
- Un administrador puede, desde la pantalla de gestión de administradores (accesible por el botón
  junto a cerrar sesión), buscar a una persona en el directorio de la empresa y otorgarle el rol de
  administrador; esa persona pasa a tener las capacidades de administrador en su siguiente ingreso.
  Un colaborador no ve el botón ni puede acceder a esa pantalla.
- Un administrador puede revocar el rol de administrador a otro usuario, salvo cuando eso dejaría
  al portal sin administradores: si solo queda 1, el sistema impide la revocación y muestra un
  mensaje claro (siempre queda como mínimo 1 administrador).
- El administrador puede ver el listado completo de sugerencias recibidas en el panel, no solo por
  correo.
- La pantalla de analítica muestra, para un periodo dado, cuáles son las apps/procesadores más
  usados y por qué usuarios/áreas.
- El logo de Lima Expresa es visible en la pantalla de login y dentro del portal, tanto para el
  colaborador como para el administrador, integrado de forma natural y estética a la interfaz.
- La interfaz del portal es coherente con la identidad visual de Lima Expresa, usando como
  referencia la paleta de colores del logo de la empresa (no existe manual de marca formal).
- El usuario puede alternar entre modo claro y modo oscuro, ambos temas se ven correctamente
  (contraste legible, logo visible) y la preferencia elegida se conserva al volver a entrar.
- Al cambiar a modo oscuro, el logo se muestra en su variante para fondo oscuro (se ve legible y
  estético, sin bordes blancos ni pérdida de contraste), y vuelve a su versión clara en modo claro.

## Casos borde a contemplar

- El colaborador sube un archivo con un formato que el procesador no acepta: el portal debe indicar
  claramente que el formato no es permitido antes de procesar.
- El colaborador sube un archivo del formato correcto pero con contenido incorrecto (columnas
  faltantes, corrupto): el sistema debe informar el error sin caerse ni devolver un archivo inválido.
- El colaborador no tiene ninguna app/agente/procesador asignado: el portal debe mostrar un
  estado vacío claro, no una pantalla en blanco o error.
- Un enlace externo a una app/agente está caído o cambió de URL: **se omite la verificación de
  estado**. El portal no valida en background el estado de los enlaces (el portal no puede controlar
  una app de terceros y esta versión no incorpora chequeo periódico); el enlace se abre siempre y es
  el Área de Innovación quien corrige la URL en el catálogo si alguien reporta que falla.
- El portal es un contenedor de enlaces: cuando el usuario abre una app vía enlace, el portal no
  tiene poder sobre esa app y no puede bloquear su acceso. Si a un usuario le pasan directamente el
  enlace de una app para la que en el portal no tiene permiso, el portal no puede hacer nada al
  respecto; cada app gestiona de forma independiente su propio ingreso y sus permisos, y el portal
  solo controla quién ve el enlace dentro del portal.
- Un usuario intenta acceder por URL directa a un recurso interno del portal (un procesador) que no
  le fue asignado: el portal sí debe bloquearlo con un mensaje claro, no solo ocultarlo del menú.
  (Esto aplica a los recursos internos; sobre las apps externas el portal no tiene control.)
- El administrador registra un enlace con una URL mal formada o vacía: el portal debe validar el
  formato de la URL y no permitir guardar un enlace inválido.
- El correo corporativo no está en el dominio esperado de Lima Expresa: el login debe rechazarlo.
- El envío de correo de una sugerencia falla: **el error se ignora silenciosamente. La sugerencia
  no se pierde porque ya está garantizada en la base de datos y el administrador la verá en el panel
  del portal.** El correo es solo una notificación de conveniencia; no hay reintento ni cola
  pendiente.
- Archivos muy grandes: cada procesador define el tamaño máximo permitido; si el archivo lo excede,
  el portal muestra un mensaje indicando ese motivo y no lo procesa. El tope general es **25 MB por
  archivo**; el límite de número de filas no es fijo, se define por procesador durante el
  levantamiento del requerimiento según lo que necesite el usuario.
- Un administrador revoca el acceso de un usuario mientras este tiene una sesión activa: el cambio
  debe aplicarse de forma inmediata (el usuario pierde el acceso al recurso en esa misma sesión, sin
  esperar a un nuevo login).
- Al promover a un administrador se busca a la persona en el directorio de la empresa: si la
  búsqueda no devuelve resultados o la persona ya es administrador, la pantalla debe indicarlo con
  un mensaje claro y no crear roles duplicados.
- Un administrador intenta promover a alguien sin permisos suficientes / un colaborador intenta
  acceder por URL directa a la pantalla de gestión de administradores: el portal debe bloquear el
  acceso, no solo ocultar el botón.
- Un administrador intenta revocarse el rol a sí mismo (o a otro) cuando es el único administrador
  que queda: el sistema debe rechazar la acción con un mensaje claro y mantener siempre al menos 1
  administrador activo.

## Supuestos y riesgos abiertos

- La autenticación se realiza con **Microsoft Entra ID** como proveedor de identidad corporativo,
  validando el correo institucional para el login (SSO/OAuth sobre Entra ID).
- El envío de correos se hará mediante una **API de correo** (no SMTP directo).
- Los **permisos son por usuario individual**, no por área, y aplican **solo a apps/agentes/
  procesadores**. El **buzón de ideas de innovación es de acceso general**: todo colaborador con
  correo corporativo válido puede iniciar sesión, entrar al portal y ver/enviar sugerencias sin
  necesidad de asignación. La asignación individual del administrador se limita a decidir quién
  accede a cada app/agente/procesador.
- Riesgo: el portal maneja dos naturalezas distintas de recurso — procesadores de archivos que
  corren dentro del portal (y crecerán con nuevos formatos) y enlaces a apps/agentes externos. La
  arquitectura debe permitir agregar nuevos procesadores de forma modular sin tocar el resto del
  portal, y tratar los enlaces externos como simples referencias.
- Sobre los permisos por usuario individual: el volumen esperado de apps/agentes/procesadores es
  **mínimo y manejable**, y solo unas pocas personas requieren acceso a cada uno, por lo que la
  administración manual una por una es sencilla y no se considera un riesgo operativo. **No se
  contempla asignación masiva ni plantillas**: dado el volumen mínimo de asignaciones, no es
  necesario y queda fuera del alcance de esta versión.
- Se asume que el Área de Innovación es la única responsable de dar de alta nuevas
  aplicaciones/automatizaciones en el portal.
