// Respaldo del chat cuando se consulta a Auren y no responde (config.usarAuren). El asistente local vive en asistente.ts.
// La primera regla cuyo patrón coincida con la pregunta responde. Sin precios, cupos ni planes inventados.
export const RESPUESTAS: [patron: string, respuesta: string][] = [
  ['hospedaje|dormir|cabaña|posada', 'Puedes ver los alojamientos en el mapa y en «Lugares», y reservar con el botón «Reservar». Si el lugar aún no tiene prestador en la app, un embajador tramita la solicitud.'],
  ['ruta|mapa|lugares', 'Arma tu ruta en «Armar mi itinerario» y verás las paradas en el mapa.'],
  ['reserv|cupo|disponib', 'Puedes reservar hospedaje, restaurantes, caminatas y actividades con el botón «Reservar» en Lugares, en el Mapa o en tu itinerario. Si el lugar aún no tiene prestador en la app, un embajador tramita la solicitud.'],
  ['precio|costo|cuánto', 'No tengo precios confirmados. Un embajador te puede dar los valores.'],
  ['hola|buenas', '¡Hola! ¿En qué te ayudo con tu viaje al Valle de Tenza?'],
]
export const SIN_RESPUESTA = 'Esa pregunta es mejor para un embajador. Toca «Hablar con un embajador».'

export const responder = (q: string) =>
  RESPUESTAS.find(([p]) => new RegExp(p, 'i').test(q))?.[1] ?? SIN_RESPUESTA
