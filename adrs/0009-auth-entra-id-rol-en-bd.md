# ADR 0009: Autenticación con Entra ID; rol de administrador en la BD del portal

## Estado

Aceptado

## Contexto

El PRD fija Microsoft Entra ID como proveedor de identidad (SSO/OAuth con correo institucional;
login rechazado fuera del dominio de Lima Expresa). Exige además una pantalla de gestión de
administradores donde se busca a personas en el directorio de la empresa para otorgar o revocar el
rol, con la regla dura de que siempre debe quedar al menos 1 administrador, y que el acceso a esa
pantalla se bloquee (no solo se oculte) a los colaboradores.

## Decisión

**Entra ID solo autentica; el rol vive en el portal.** El login usa OAuth/OIDC contra Entra ID
(Auth.js/MSAL en Next.js) validando que el correo pertenezca al dominio corporativo. El campo
`usuario.es_admin` en la base de datos del portal es la única fuente de verdad del rol, verificada
en cada request (ADR 0007).

La búsqueda de personas para promover usa **Microsoft Graph API** con el permiso de lectura de
directorio (`User.Read.All`, consentido por TI): al promover, se hace upsert del usuario en la
tabla `usuario` con `es_admin = 1`. La revocación se ejecuta en una transacción que cuenta los
administradores activos y rechaza la operación si dejaría cero (regla "mínimo 1 admin"),
incluyendo el caso de auto-revocación.

## Alternativas consideradas

- **App Roles de Entra ID** — el rol viajaría en el token y se gestionaría en el tenant, pero
  promover/revocar desde el portal exigiría el permiso Graph de alto privilegio
  `AppRoleAssignment.ReadWrite.All` (difícil de que TI lo conceda), el cambio recién aplicaría al
  refrescar el token (contradice la inmediatez del ADR 0007) y la regla "mínimo 1 admin" no puede
  garantizarse de forma atómica.
- **Grupo de seguridad de Entra ("Portal-Admins")** — reutiliza la gestión corporativa de grupos,
  pero igualmente requiere Graph de escritura (`GroupMember.ReadWrite.All`) y deja la regla de
  mínimo 1 fuera del control transaccional del portal.

## Consecuencias

- Promover y revocar son operaciones locales del portal: inmediatas (coherentes con ADR 0007),
  transaccionales (la regla "mínimo 1 admin" se garantiza con un `COUNT` dentro de la misma
  transacción) y sin permisos Graph de escritura — solo lectura de directorio.
- La pantalla de gestión valida en servidor el rol del solicitante en cada operación; un
  colaborador que llegue por URL directa recibe 403 (mismo mecanismo del ADR 0007).
- Costo real: el rol no es visible ni auditable desde el centro de administración de Entra —
  vive solo en la BD del portal; si TI exige a futuro gobernar los roles centralmente, habrá que
  migrar a App Roles/grupos. Además el portal depende de que TI consienta el permiso
  `User.Read.All` de Graph; sin él, la búsqueda en directorio no funciona (mitigación: buscar
  solo entre usuarios que ya iniciaron sesión alguna vez en el portal).
