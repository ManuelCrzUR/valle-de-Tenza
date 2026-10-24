// Respaldo de contacto, horario y redes. Los valores reales viven en la tabla `ajustes` (Supabase) y se leen con
// `useAjustes()` (src/state/ajustes.ts). Un valor que empiece con '[' es un marcador: nunca se muestra.
export const config = {
  horario: '[HORARIO]',
  contacto: '[CONTACTO]',
  redes: '[REDES SOCIALES]',
  ciudadEmbajadores: 'Bogotá',
  usarAuren: false,   // true: el chat consulta primero a Auren (/api/chat); false: solo el asistente local con los lugares reales
}
