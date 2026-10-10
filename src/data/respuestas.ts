// Reglas del chatbot: la primera cuyo patrón coincida con la pregunta responde.
export const RESPUESTAS: [patron: string, respuesta: string][] = [
  ['hospedaje|dormir|cabaña|posada', 'Tu itinerario incluye un hospedaje sugerido, y puedes reservarlo desde allí. Genéralo en «Armar mi itinerario».'],
  ['ruta|mapa|lugares', 'Puedes ver los lugares por categoría y tu ruta en el mapa una vez generes el itinerario.'],
  ['reserv|cupo|disponib', 'Puedes reservar hospedaje, restaurantes, caminatas y actividades con el botón «Reservar» en Lugares, en el Mapa o en tu itinerario. El negocio confirma tu solicitud; si aún no tiene prestador en la app, un embajador la tramita.'],
  ['precio|costo|cuánto', 'Aún no tengo precios. Un embajador te puede confirmar los valores.'],
  ['hola|buenas', '¡Hola! ¿En qué te ayudo con tu viaje al Valle de Tenza?'],
]
export const SIN_RESPUESTA = 'Esa pregunta es mejor para un embajador. Toca «Hablar con un embajador».'

export const responder = (q: string) =>
  RESPUESTAS.find(([p]) => new RegExp(p, 'i').test(q))?.[1] ?? SIN_RESPUESTA
