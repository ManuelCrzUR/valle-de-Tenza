---
description: Ejecuta una fase del plan de Valle Directo (docs/plan/fase-N-*.md)
argument-hint: <número de fase, 0 a 5>
---

Vas a ejecutar la Fase $ARGUMENTS del plan de Valle Directo.

1. Lee `CLAUDE.md`, `docs/plan/README.md` y el archivo `docs/plan/fase-$ARGUMENTS-*.md`.
2. Verifica que la fase anterior esté cerrada: su checklist marcado y su prueba de cierre descrita como cumplida.
   Si no lo está, detente y dime qué falta.
3. Revisa las decisiones abiertas del README que apliquen a esta fase; si alguna sigue sin respuesta, pregúntamela
   antes de seguir.
4. Entra en modo plan y presenta: migraciones SQL (completas si la fase toca el esquema), archivos que vas a crear,
   cambiar o borrar, el orden de los commits y cómo vas a verificar la prueba de cierre. Espera mi aprobación.
5. Trabaja en la rama indicada en el archivo de la fase. Un commit por tarea del checklist, mensajes en español.
6. Al terminar: `npm run build`, `npm run test`, `npx supabase test db` y las pruebas e2e que la fase pida.
   Marca el checklist en el archivo de la fase.
7. Entrégame un resumen corto: qué cambió, cómo lo pruebo yo, qué debo configurar en Supabase, Vercel o GitHub,
   y qué quedó pendiente. Si tienes `gh` autenticado, abre el PR con ese resumen.
