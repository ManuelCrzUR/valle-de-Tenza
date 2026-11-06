// Límites compartidos por el navegador y las funciones. El tope de audio queda
// por debajo del cuerpo de 4,5 MB documentado para Vercel Functions
// (https://vercel.com/docs/functions/limitations), no del límite de 25 MB de OpenAI.
export const AUDIO_MAX_BYTES = 3_500_000
export const AUDIO_MAX_MS = 45_000
export const TEXTO_MAX = 500
export const NOTA_MAX = 500
export const NOMBRE_MAX = 80
export const PERSONAS_MAX = 20
export const DIAS_MAX = 3
export const PARADAS_POR_DIA = 3
export const OPENAI_TIMEOUT_MS = 20_000

export const MODELO_ITINERARIO = 'gpt-6-luna'
export const MODELO_TRANSCRIPCION = 'gpt-transcribe'
export const MODELO_VOZ = 'gpt-4o-mini-tts'
export const VOZ_DEFECTO = 'coral'

export const VOCES_DOCUMENTADAS = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar',
] as const
