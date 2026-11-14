import { describe, expect, it } from 'vitest'
import { leerGustosLocal } from '../src/data/gustos.js'

const MUNICIPIOS = [
  { slug: 'tenza', nombre: 'Tenza' },
  { slug: 'la-capilla', nombre: 'La Capilla' },
  { slug: 'guayata', nombre: 'Guayatá' },
]

const leer = (texto: string) => leerGustosLocal(texto, MUNICIPIOS)

describe('leerGustosLocal (respaldo sin IA)', () => {
  const casos: [string, Parameters<typeof leer>[0], ReturnType<typeof leer>][] = [
    [
      'familia con niños, naturaleza tranquila',
      'voy con mis hijos y queremos naturaleza tranquila',
      { intereses: ['naturaleza', 'descanso'], ritmo: 'tranquilo', conNinos: true },
    ],
    [
      'barato para comer en un municipio',
      'algo barato para comer en Tenza',
      { intereses: ['gastronomia'], presupuesto: 'bajo', municipio: 'tenza' },
    ],
    [
      'artesanías e historia (sin tildes en la salida)',
      'me encantan las artesanías y la historia',
      { intereses: ['cultura', 'artesania'] },
    ],
    [
      'aventura con evitar iglesias (no debe contar cultura)',
      'quiero aventura, nada de iglesias',
      { intereses: ['aventura'], evitar: ['iglesias'] },
    ],
    ['perro como mascota', 'viajo con mi perro', { mascotas: true }],
    ['silla de ruedas y abuela', 'mi abuela usa silla de ruedas', { movilidadReducida: true }],
    [
      'sin prisa para fotos al atardecer (prisa no es evitar)',
      'un plan sin prisa para tomar fotos al atardecer',
      { intereses: ['fotografia'], ritmo: 'tranquilo' },
    ],
    ['frase sin gustos', 'hola, buenas tardes', {}],
    ['plan activo', 'queremos un viaje activo y full aventura', { intereses: ['aventura'], ritmo: 'activo' }],
    [
      'precio medio, museos y municipio con nombre compuesto',
      'presupuesto moderado, queremos cultura y museos en La Capilla',
      { intereses: ['cultura'], presupuesto: 'medio', municipio: 'la-capilla' },
    ],
    [
      'lujo sin importar el precio (importar no es evitar)',
      'quiero algo de lujo, sin importar el precio',
      { presupuesto: 'alto' },
    ],
    [
      'ahorrar y platos típicos en Guayatá',
      'queremos ahorrar y comer platos típicos en Guayatá',
      { intereses: ['gastronomia'], presupuesto: 'bajo', municipio: 'guayata' },
    ],
    [
      'familia y abuela',
      'vamos con mi familia, somos cuatro, hay una abuela',
      { conNinos: true, movilidadReducida: true },
    ],
    [
      'no me gusta + artículo',
      'no me gusta el frío y prefiero la gastronomía',
      { intereses: ['gastronomia'], evitar: ['frio'] },
    ],
    ['descansar y termales', 'quiero descansar y desconectar en las termales', { intereses: ['descanso'] }],
    ['senderismo y parapente', 'queremos hacer senderismo y parapente, somos un grupo extremo', { intereses: ['aventura'] }],
    ['museos sin iglesias plural', 'me gusta la cultura tradicional, visitar iglesias y el museo', { intereses: ['cultura'] }],
    ['café y probar', 'quiero tomar café y probar los dulces de la región', { intereses: ['gastronomia'] }],
    [
      'niñas y cascadas con ríos',
      'con mis niñas pequeñas queremos ver cascadas y ríos',
      { intereses: ['naturaleza'], conNinos: true },
    ],
    ['gatos y perrita', 'viajo con mi perrita y mi gato', { mascotas: true }],
    [
      'tranquilo y movilidad reducida',
      'mi papá tiene movilidad reducida, así que tranquilo',
      { intereses: ['descanso'], ritmo: 'tranquilo', movilidadReducida: true },
    ],
    [
      'artesanos, canastos y sin afán',
      'queremos ver a los artesanos y comprar canastos, sin afán',
      { intereses: ['artesania'] },
    ],
    [
      'económico y tranquilo',
      'queremos un plan económico y tranquilo',
      { intereses: ['descanso'], ritmo: 'tranquilo', presupuesto: 'bajo' },
    ],
    ['municipio más temprano gana', 'buenas, ¿qué hay para hacer en Tenza y La Capilla?', { municipio: 'tenza' }],
    [
      'premium con spa',
      'quiero un plan premium con mucho descanso y spa',
      { intereses: ['descanso'], presupuesto: 'alto' },
    ],
    [
      'evitar con varias palabras (solo la primera)',
      'evitar las subidas fuertes y el barro, queremos fotos',
      { intereses: ['fotografia'], evitar: ['subidas'] },
    ],
    ['mayúsculas y tildes', 'NATURALEZA, Río y Montañas', { intereses: ['naturaleza'] }],
    ['adultos mayores', 'vamos con adultos mayores', { movilidadReducida: true }],
    ['sin gustos ni municipio', 'cuánto cuesta el pasaje', {}],
  ]

  it.each(casos)('%s', (_nombre, texto, esperado) => {
    expect(leer(texto)).toEqual(esperado)
  })

  it('negación: «no me gustan las caminatas» no da aventura', () => {
    const r = leer('no me gustan las caminatas, prefiero la gastronomía')
    expect(r.intereses).toEqual(['gastronomia'])
    expect(r.evitar).toEqual(['caminatas'])
  })

  it('negación: «nada de iglesias» no da cultura', () => {
    const r = leer('quiero naturaleza, nada de iglesias')
    expect(r.intereses).toEqual(['naturaleza'])
    expect(r.evitar).toEqual(['iglesias'])
  })

  it('negación: «sin termales» quita descanso pero conserva lo demás', () => {
    const r = leer('queremos cascadas, sin termales')
    expect(r.intereses).toEqual(['naturaleza'])
  })

  it('solo devuelve claves detectadas', () => {
    expect(Object.keys(leer('viajo con mi perro'))).toEqual(['mascotas'])
  })

  it('limita evitar a 5 palabras y no repite', () => {
    const r = leer('evitar frio, evitar lluvia, evitar barro, evitar polvo, evitar zancudos, evitar moscas, evitar frio')
    expect(r.evitar).toEqual(['frio', 'lluvia', 'barro', 'polvo', 'zancudos'])
  })
})
