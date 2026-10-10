// Fotos del Valle (public/fotos). Cada una lleva su pie y su fuente: se muestran como crédito junto a la imagen.
// Nunca van en el mapa; solo reemplazan las ilustraciones de marcador en las pantallas.
import type { Lugar } from './lugares'

export interface FotoInfo { archivo: string; pie: string; fuente: string; url?: string }
const SITUR = 'Sistema de Información Turística de Boyacá'
const f = (n: number, pie: string, fuente: string, url?: string): FotoInfo => ({ archivo: `fotos/${n}.jpg`, pie, fuente, url })

export const FOTOS = {
  1: f(1, 'Santuario del Santo Cristo, Somondoco', SITUR, 'https://situr.boyaca.gov.co/oriente/municipio-de-somondoco/'),
  2: f(2, 'Parque principal y templo de San Sebastián, Somondoco', SITUR, 'https://situr.boyaca.gov.co/oriente/municipio-de-somondoco/'),
  3: f(3, 'Embalse de Chivor', 'Wikipedia (CC BY-SA 4.0)'),
  4: f(4, 'Parque principal de Guayatá', 'Gobernación de Boyacá', 'https://www.boyaca.gov.co/guayata-destino-turistico-imperdible/'),
  5: f(5, 'Iglesia de Guayatá', SITUR, 'https://situr.boyaca.gov.co/oriente/municipio-de-guayata/'),
  6: f(6, 'Parque de Guayatá, vista aérea', SITUR, 'https://situr.boyaca.gov.co/oriente/municipio-de-guayata/'),
  7: f(7, 'Puente Real Calicanto, Guayatá', SITUR, 'https://situr.boyaca.gov.co/atractivo-turistico/puente-real-calicanto/'),
  8: f(8, 'Sendero Esplendor Guayatuno, Guayatá', 'Gobernación de Boyacá', 'https://www.boyaca.gov.co/se-respira-vida-en-el-sendero-esplendor-guayatuno/'),
  9: f(9, 'Laguna de la Paja Brava, Guayatá', 'GoBoy', 'https://goboy.com.co/listing/laguna-de-la-pajabrava/'),
  10: f(10, 'Quebrada de Guayatá', 'Wikiloc', 'https://es.wikiloc.com/rutas-senderismo/canoning-quebrada-la'),
  11: f(11, 'Centro histórico de Tenza', 'Facebook'),
  12: f(12, 'Iglesia de San Miguel Arcángel, Tenza', SITUR, 'https://situr.boyaca.gov.co/oriente/municipio-de-tenza/'),
  13: f(13, 'Alto de la Virgen, Tenza', SITUR, 'https://situr.boyaca.gov.co/oriente/municipio-de-tenza/'),
  14: f(14, 'Artesanías de Tenza', SITUR, 'https://situr.boyaca.gov.co/oriente/municipio-de-tenza/'),
  15: f(15, 'Casa Museo Radio Sutatenza', 'Alcaldía de Sutatenza', 'https://www.sutatenza-boyaca.gov.co/turismo/primera-casa-de-las-escuelas-radiofonicas'),
  16: f(16, 'Parque principal de Sutatenza', 'GoBoy', 'https://goboy.com.co/listing/sutatenza/'),
  17: f(17, 'Monumento al Desarrollo, Sutatenza', SITUR, 'https://situr.boyaca.gov.co/oriente/municipio-de-sutatenza/'),
  18: f(18, 'Iglesia de San Bartolomé, Sutatenza', SITUR, 'https://situr.boyaca.gov.co/oriente/municipio-de-sutatenza/'),
  19: f(19, 'Laguna de Ubaneca, La Capilla', 'Fuente por confirmar'),
} satisfies Record<number, FotoInfo>
export type FotoId = keyof typeof FOTOS

// Foto de un municipio (Almeida aún no tiene).
export const FOTO_MUNICIPIO: Record<string, FotoId> = { somondoco: 2, guayata: 4, tenza: 11, sutatenza: 16, chivor: 3, 'la-capilla': 19 }
// Foto de un tipo de plan en Lugares (gastro no tiene foto de comida todavía: conserva la ilustración).
export const FOTO_FILTRO: Partial<Record<string, FotoId>> = { aventura: 9, cultura: 12, dormir: 16 }

// Lugares que sí son lo que muestra la foto.
const FOTO_LUGAR: Record<string, FotoId> = {
  'guayata-monumento-iglesia-guayata-7189d': 5,
  'sutatenza-monumento-iglesia-san-bartolome-5a45f': 18,
  'sutatenza-monumento-monumento-al-desarrollo-a8de9': 17,
  'tenza-monumento-iglesia-san-miguel-arcangel-87e9b': 12,
  'somondoco-naturaleza-parque-principal-a966b': 2,
  'tenza-naturaleza-parque-principal-27cdb': 11,
}
// Foto del lugar si la hay; si no, la del municipio (el pie dice qué se ve, así no se confunde).
export const fotoDeLugar = (l: Pick<Lugar, 'id' | 'municipio'>): FotoId | undefined => FOTO_LUGAR[l.id] ?? FOTO_MUNICIPIO[l.municipio]
