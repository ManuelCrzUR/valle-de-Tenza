# Plan de ejecución — Valle Directo con Supabase ($0)

Este directorio es el plan que ejecuta Claude Code, una fase a la vez. Cada archivo de fase trae: objetivo,
checklist de tareas, archivos a tocar, pruebas de cierre y un **prompt listo para pegar**. El contexto
permanente (stack, convenciones, reglas de seguridad) está en `/CLAUDE.md`.

## Cómo usarlo

1. Abre Claude Code en la raíz del repo (`claude`).
2. Escribe `/fase 0` (comando en `.claude/commands/fase.md`) o pega el prompt del archivo de la fase.
3. Claude propone el plan en modo plan → lo apruebas → implementa en la rama `fase-N-<tema>`.
4. Revisas la prueba de cierre tú mismo antes de hacer merge. No empieces la fase siguiente sin cerrar la anterior.

Requisitos en tu máquina: Node 22, Docker (para `supabase start`), cuenta gratuita de Supabase, el proyecto ya
enlazado en Vercel y la CLI de GitHub si quieres que Claude abra los PR.

## Fases

| Fase | Archivo | Resultado | Prueba de cierre |
| --- | --- | --- | --- |
| 0 | [fase-0-base.md](fase-0-base.md) | Supabase + catálogo en la base, un solo despliegue, backups | La app lee lugares de Supabase y cae al JSON si falla; backup nocturno corre |
| 1 | [fase-1-reservas.md](fase-1-reservas.md) | Prestadores, cupo y reservas reales; itinerario con fecha y personas | Reserva hecha en un celular llega en vivo al panel en otro equipo; el cupo nunca baja de 0 |
| 2 | [fase-2-logistica.md](fase-2-logistica.md) | Cómo llegar, tiempos por carretera, avisos de vía y lluvia | El itinerario muestra minutos por carretera, cómo llegar y avisos por día |
| 3 | [fase-3-itinerarios-panel.md](fase-3-itinerarios-panel.md) | Itinerarios que respetan cupo y distancias, enlace para compartir, paneles | Comida y hospedaje en el mismo municipio o el vecino más cercano; el coordinador ve la demanda |
| 4 | [fase-4-cobertura-contenido.md](fase-4-cobertura-contenido.md) | 14 municipios, acceso a lugares, ajustes editables, chat con datos reales | Guateque y Garagoa en el mapa; ningún `[PLACEHOLDER]` en producción |
| 5 | [fase-5-ux-alcance.md](fase-5-ux-alcance.md) | Offline, SEO, inglés, analítica, reseñas, presupuesto | La ruta del viaje abre sin señal; cada lugar tiene URL indexable |

Dependencias: 0 → 1 → (2 y 4 pueden ir en paralelo) → 3 → 5. La Fase 3 necesita `tramos` (Fase 2) y cupo real (Fase 1).

## Reglas globales para todas las fases

- **Costo cero.** Supabase Free: 500 MB de base, 50.000 MAU, 5 GB de egress, 200 conexiones Realtime, pausa tras
  1 semana sin actividad, sin backups. Vercel Hobby: uso no comercial. OSRM demo y Open-Meteo: nunca desde el navegador.
- **Respaldo siempre.** Si Supabase no responde, el catálogo y el generador de itinerarios siguen funcionando con
  `lugares.json`. Las reservas muestran un mensaje claro de «sin conexión» en lugar de fallar en silencio.
- **Cada tabla con RLS y prueba.** Ninguna migración se considera terminada sin su archivo en `supabase/tests/`.
- **Móvil primero.** Toda pantalla nueva se revisa a 375 px antes de cerrar.
- **Nada de datos inventados.** Horarios de bus, precios y avisos los carga una persona (rol `coordinador`) con
  fecha de verificación. Si falta un dato, se muestra «por confirmar», no un valor supuesto.

## Decisiones abiertas (responder antes de la fase indicada)

- [ ] (Fase 1) ¿Reserva sin cuenta para el viajero? Recomendado: sí, con código + teléfono.
- [ ] (Fase 2) ¿Quién es el coordinador del Valle y quién carga transporte y avisos?
- [ ] (Fase 4) ¿Los 14 municipios ya, o primero Guateque y Garagoa?
- [ ] (Fase 4) Datos reales de contacto, horario y redes.
- [ ] (Fase 5) ¿Inglés en esta ronda o después?
