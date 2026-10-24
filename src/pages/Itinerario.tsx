import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Car, Bus, CalendarDays, CloudRain, Copy, Share2, MessageCircle, Download } from 'lucide-react'
import { Option, PlaceCard, Button, TextField } from '../components/ui'
import { LinkButton } from '../components/LinkButton'
import { Foto } from '../components/Foto'
import { PLANES } from '../data/planes'
import { CATEGORIA_POR_ID, NOMBRE_MUNICIPIO, tipoReserva, useCatalogo } from '../data/lugares'
import type { Lugar } from '../data/lugares'
import { PERSONAS_MAX, useItinerario } from '../state/itinerario'
import { Atribucion } from '../components/Atribucion'
import { AlertaIcono } from '../components/mapa/iconosAlerta'
import { NOMBRE_TIPO_ALERTA, alertaEnFecha, dinero, duracionLarga, fechaDelDia, fechaVerificada, minutos, cargarTramos, useLogistica } from '../state/logistica'
import type { Alerta, DiaClima, Tramo } from '../state/logistica'
import { MAX_SALTO_M, DIAS_MAX, distanciasRuta, km, ordenRuta } from '../data/generarPlan'
import type { Dia, PasoRuta } from '../data/generarPlan'
import { cupoLibre, cupoVerificadoHoy, fechaCorta, hoy, negocioDeLugar, useOperacion } from '../state/reservas'
import { eventosEntre, useEventos } from '../state/contenido'
import type { Evento } from '../state/contenido'
import { compartirItinerario, registrarDemanda } from '../state/compartir'
import { config } from '../config'
import { claveEleccion as claveRuta, guardarParaSinSenal, planGuardado, useOnline, useRutaGuardada } from '../state/offline'
import type { Progreso } from '../state/offline'
import { MAX_TESELAS } from '../lib/teselas'
import { Icon } from '../components/Icon'
import { usePagina } from '../usePagina'
import '../styles/itinerario.css'
import '../styles/como-llegar.css'
import '../styles/offline.css'

const sitio = (l: Lugar) => `${CATEGORIA_POR_ID[l.categoria]?.singular ?? l.categoria} · ${NOMBRE_MUNICIPIO[l.municipio] ?? l.municipio}`

// Con tramo precalculado: minutos por carretera. Sin tramo: la línea recta, marcada como aproximada.
function Distancia({ m, tramo }: { m?: number; tramo?: Tramo }) {
  if (tramo) {
    const lejos = tramo.distancia_m > MAX_SALTO_M
    return <p className={`it-dist${lejos ? ' it-dist-lejos' : ''}`}>{lejos ? <>{minutos(tramo.duracion_s)} min por carretera desde la anterior ({km(tramo.distancia_m)})</> : <>a {minutos(tramo.duracion_s)} min por carretera de la parada anterior ({km(tramo.distancia_m)})</>}</p>
  }
  if (m === undefined) return null
  const lejos = m > MAX_SALTO_M
  return <p className={`it-dist${lejos ? ' it-dist-lejos' : ''}`}>{lejos ? <>~{km(m)} (aprox.) desde la anterior</> : <>a ~{km(m)} (aprox.) de la parada anterior</>}</p>
}

const esMirador = (l: Lugar) => l.categoria === 'naturaleza' || (l.categoria === 'atraccion' && /mirador|viewpoint|cerro|peak|cima/i.test(l.subtipo))

// Avisos del día: alertas de vía vigentes en sus municipios y lluvia probable en días con caminatas o miradores.
function avisosDelDia(d: Dia, pasos: PasoRuta[], base: string, fecha: string, alertas: Alerta[], clima: DiaClima[], nombre: (s: string) => string, eventos: Evento[] = []): { clave: string; texto: string; alerta?: Alerta; evento?: boolean }[] {
  const delDia = pasos.filter((p) => p.dia === d.n)
  const muns = new Set([base, ...delDia.map((p) => p.lugar.municipio)])
  const out: { clave: string; texto: string; alerta?: Alerta; evento?: boolean }[] = alertas
    .filter((a) => a.municipio && muns.has(a.municipio) && alertaEnFecha(a, fecha))
    .map((a) => ({ clave: a.id, alerta: a, texto: `${NOMBRE_TIPO_ALERTA[a.tipo]} en ${nombre(a.municipio!)}: ${a.mensaje}` }))
  const aire = new Set(delDia.filter((p) => p.rol === 'parada' && esMirador(p.lugar)).map((p) => p.lugar.municipio))
  const lluviosos = [...aire].flatMap((m) => {
    const c = clima.find((x) => x.municipio === m && x.fecha === fecha)
    return c && (c.prob_lluvia_max ?? 0) >= 70 ? [{ m, p: c.prob_lluvia_max as number }] : []
  })
  for (const e of eventosEntre(fecha, fecha, undefined, eventos).filter((x) => muns.has(x.municipio))) {
    out.push({ clave: `evento-${e.id}`, evento: true, texto: `Ese día hay ${e.nombre} en ${nombre(e.municipio)}.` })
  }
  if (lluviosos.length) out.push({ clave: 'lluvia', texto: `Probabilidad alta de lluvia ese día (${lluviosos.map((x) => `${nombre(x.m)} ${x.p} %`).join(', ')}): las caminatas y los miradores pueden complicarse. Lleva impermeable o cambia el orden.` })
  return out
}

function Acciones({ l, cta, query }: { l: Lugar; cta?: boolean; query: string }) {
  return (
    <div className="it-acciones">
      {tipoReserva(l) && <LinkButton to={`/reservar/${l.id}${query}`} variant={cta ? 'cta' : 'secondary'}>Reservar</LinkButton>}
      <Link className="it-enlace" to={`/lugares/${l.id}`}>Ver detalle</Link>
    </div>
  )
}

function PasoCero({ movilidad, base, rutas, nombre, carro }: { movilidad?: 'carro' | 'publico'; base: string; rutas: ReturnType<typeof useLogistica>['rutas']; nombre: (s: string) => string; carro?: Tramo }) {
  const aBase = rutas.filter((r) => r.origen === 'bogota' && r.destino === base)
  const lista = aBase.length ? aBase : rutas.filter((r) => r.origen === 'bogota' && r.destino === 'guateque')
  return (
    <section className="it-paso0" aria-label="Paso 0: cómo llegar">
      <h4 className="it-rol">Paso 0 · Cómo llegar desde Bogotá</h4>
      {!movilidad && <p>Responde «¿Cómo te mueves?» y te mostramos cómo llegar.</p>}
      {movilidad === 'carro' && (
        <p><Car size={20} aria-hidden /> En carro propio, Bogotá → {nombre(base)}: {carro
          ? <strong>unos {duracionLarga(minutos(carro.duracion_s))} por carretera ({Math.round(carro.distancia_m / 1000)} km)</strong>
          : <em className="cl-pc">por confirmar</em>}.</p>
      )}
      {movilidad === 'publico' && (
        lista.length ? (
          <>
            {!aBase.length && <p>No tenemos una ruta directa a {nombre(base)}; estas llegan a Guateque.</p>}
            <ul className="it-rutas">
              {lista.map((r) => (
                <li key={r.id}>
                  <Bus size={20} aria-hidden />
                  <span><strong>{r.empresa}</strong> · {r.terminal ?? 'terminal por confirmar'} · {r.duracionMin ? `${duracionLarga(r.duracionMin)} aprox.` : 'duración por confirmar'} · {r.precioDesdeCop !== null ? `desde ${dinero(r.precioDesdeCop)}` : 'precio por confirmar'} · {r.salidas.length ? `${r.salidas.length} ${r.salidas.length === 1 ? 'salida' : 'salidas'}` : 'horarios por confirmar'} ({fechaVerificada(r.verificadoEn)})</span>
                </li>
              ))}
            </ul>
          </>
        ) : <p>Todavía no tenemos rutas publicadas desde Bogotá: <em className="cl-pc">por confirmar</em>.</p>
      )}
      <Link className="it-enlace" to="/como-llegar">Ver todas las opciones para llegar</Link>
    </section>
  )
}

export default function Itinerario() {
  usePagina('Tu itinerario')
  const { municipios: MUNICIPIOS } = useCatalogo()
  const { itinerario, eleccion, elegir, setMunicipio, setDias, setFecha, setPersonas, setMovilidad, otro } = useItinerario()
  const { rutas, alertas, clima, tramoEntre } = useLogistica()
  const eventos = useEventos()
  const nombreMun = (slug: string) => MUNICIPIOS.find((m) => m.slug === slug)?.nombre ?? NOMBRE_MUNICIPIO[slug] ?? slug
  const op = useOperacion()
  const plan = itinerario?.plan
  const hosp = itinerario?.hospedaje

  const fecha = eleccion?.fecha ?? ''
  const personas = eleccion?.personas ?? 2
  const query = eleccion ? `?fecha=${fecha}&personas=${personas}` : ''
  let chip = 'Cupo por confirmar'
  let tone: 'strong' | 'soft' = 'soft'
  let etiquetaCupo = ''
  if (hosp) {
    const n = negocioDeLugar(op.negocios, hosp.id)
    if (n) {
      etiquetaCupo = cupoVerificadoHoy(n) ? 'Cupo verificado hoy' : 'Cupo por confirmar'
      if (fecha) {
        const libre = cupoLibre(op, n, fecha)
        if (libre > 0) { chip = `Quedan ${libre} ${libre === 1 ? 'cupo' : 'cupos'} el ${fechaCorta(fecha)}`; tone = 'strong' } else chip = 'Sin cupo ese día'
      }
    }
  }

  const pasos = itinerario ? ordenRuta(itinerario) : []
  const dist = distanciasRuta(pasos)
  const diasSel = eleccion?.dias ?? 2
  const resultadoRef = useRef<HTMLDivElement>(null)
  const irAlResultado = useRef(false)
  const elegirPlan = (id: Parameters<typeof elegir>[0]) => { irAlResultado.current = window.matchMedia('(max-width: 767px)').matches; elegir(id) }
  useEffect(() => {
    if (!irAlResultado.current || !itinerario) return
    irAlResultado.current = false
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    resultadoRef.current?.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' })
  }, [itinerario])

  // Demanda anónima: solo si el resultado se queda 3 s sin cambiar; una vez por combinación y sesión.
  const munResuelto = itinerario?.municipio ?? ''
  useEffect(() => {
    if (!eleccion || !itinerario) return
    const t = setTimeout(() => { void registrarDemanda(eleccion, munResuelto) }, 3000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eleccion?.planId, munResuelto, eleccion?.dias, eleccion?.personas, eleccion?.fecha, eleccion?.movilidad, !!itinerario])

  // Compartir: el enlace se crea al pulsar y se reutiliza mientras la elección no cambie.
  const claveEleccion = JSON.stringify(eleccion)
  const [enlace, setEnlace] = useState<{ clave: string; url: string } | null>(null)
  const [aviso, setAviso] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { setAviso(''); setError('') }, [claveEleccion])
  const obtenerEnlace = async (): Promise<string | null> => {
    if (enlace && enlace.clave === claveEleccion) return enlace.url
    if (!eleccion) return null
    setOcupado(true); setError(''); setAviso('')
    try {
      const url = await compartirItinerario(eleccion)
      setEnlace({ clave: claveEleccion, url })
      return url
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos crear el enlace.'); return null } finally { setOcupado(false) }
  }
  const compartirNativo = async () => {
    const url = await obtenerEnlace()
    if (!url) return
    try { await navigator.share({ title: plan?.titulo ?? 'Mi itinerario', text: 'Mira este itinerario por el Valle de Tenza', url }) } catch { /* canceló o no pudo: quedan los otros botones */ }
  }
  const compartirWhatsApp = async () => {
    const w = enlace && enlace.clave === claveEleccion ? null : window.open('', '_blank')   // se abre ya, dentro del toque, y se redirige al tener el enlace
    const url = await obtenerEnlace()
    if (!url) { w?.close(); return }
    const destino = `https://wa.me/?text=${encodeURIComponent(`Mi itinerario por el Valle de Tenza: ${url}`)}`
    if (w) w.location.href = destino; else window.open(destino, '_blank', 'noopener')
  }
  const copiarEnlace = async () => {
    const url = await obtenerEnlace()
    if (!url) return
    try { await navigator.clipboard.writeText(url); setAviso('Enlace copiado') } catch { setAviso('No pudimos copiarlo solo: selecciona el enlace de abajo y cópialo.') }
  }
  const etiquetaCarretera = itinerario && itinerario.segundosCarretera > 0 ? `${itinerario.aprox ? '~' : ''}${duracionLarga(Math.max(1, Math.round(itinerario.segundosCarretera / 60)))}${itinerario.aprox ? ' (aprox.)' : ''}` : 'Sin recorridos largos'
  const estadoHospedaje = itinerario?.avisoHospedaje ?? (hosp && tone === 'strong' ? 'Hospedaje con cupo' : 'Cupo por confirmar')
  // Guardar para ver sin señal: itinerario + teselas OSM de la caja de la ruta (z12–15, máximo MAX_TESELAS).
  const enLinea = useOnline()
  const guardada = useRutaGuardada()
  const [guardando, setGuardando] = useState<Progreso | null>(null)
  const [estadoGuardado, setEstadoGuardado] = useState('')
  const cuantas = itinerario && eleccion ? planGuardado(itinerario).total : 0
  const guardadaAqui = !!(guardada && eleccion && guardada.clave === claveRuta(eleccion))
  const guardar = async () => {
    if (!itinerario || !eleccion) return
    setEstadoGuardado(''); setGuardando({ hechas: 0, total: cuantas })
    const r = await guardarParaSinSenal(itinerario, eleccion, setGuardando)
    setGuardando(null)
    setEstadoGuardado(r.ok
      ? `Listo: guardamos tu ruta y ${r.teselas} teselas del mapa${r.fallidas ? ` (${r.fallidas} no se pudieron bajar)` : ''}. Ya la puedes ver sin señal.`
      : r.motivo === 'grande' ? 'La zona es muy grande para guardarla sin señal.'
        : r.motivo === 'sinUbicacion' ? 'Esta ruta no tiene lugares con ubicación para guardar el mapa.'
          : r.motivo === 'sinCache' ? 'Tu navegador no permite guardar datos sin señal.'
            : 'No pudimos guardar la ruta. Revisa tu conexión e inténtalo de nuevo.')
  }
  const idsRuta = pasos.map((p) => p.lugar.id).join(',')
  useEffect(() => { if (idsRuta) cargarTramos(idsRuta.split(',')) }, [idsRuta])

  return (
    <div className="wrap pagina pagina-split">
      <div className="split-lado">
        <h1 id="titulo" tabIndex={-1} className="t-h1">Tu itinerario a la medida</h1>
        <p className="sub">Elige tu plan y generamos el itinerario, sin buscar en catálogos.</p>
        <div className="opts opts-col" role="group" aria-label="Plan">
          {PLANES.map((p) => (
            <Option key={p.id} icon={p.icono} selected={plan?.id === p.id} onClick={() => elegirPlan(p.id)}>{p.opcion}</Option>
          ))}
        </div>
        {eleccion && (
          <div className="it-controles">
            <div role="group" aria-label="Días" className="it-dias">
              {Array.from({ length: DIAS_MAX }, (_, i) => i + 1).map((n) => (
                <Option key={n} selected={diasSel === n} onClick={() => setDias(n)}>{n} {n === 1 ? 'día' : 'días'}</Option>
              ))}
            </div>
            <label htmlFor="it-municipio">Municipio base</label>
            <select id="it-municipio" className="vd-input" value={eleccion.municipio} onChange={(e) => setMunicipio(e.target.value)}>
              <option value="">El mejor para este plan</option>
              {MUNICIPIOS.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
            </select>
            <div role="group" aria-labelledby="it-mov" className="it-mov">
              <span id="it-mov" className="it-etiqueta">¿Cómo te mueves?</span>
              <div className="it-dias">
                <Option icon="ruta" selected={eleccion.movilidad === 'carro'} onClick={() => setMovilidad('carro')}>Carro propio</Option>
                <Option icon="ruta" selected={eleccion.movilidad === 'publico'} onClick={() => setMovilidad('publico')}>Transporte público</Option>
              </div>
            </div>
            <TextField label="¿Cuándo vas?" type="date" min={hoy()} value={fecha} onChange={(e) => e.target.value && e.target.value >= hoy() && setFecha(e.target.value)} hint="Fecha de llegada." />
            <TextField label="¿Cuántos van?" type="number" inputMode="numeric" min={1} max={PERSONAS_MAX} value={personas} onChange={(e) => e.target.value && setPersonas(Number(e.target.value))} hint={`De 1 a ${PERSONAS_MAX} personas.`} />
            <Button variant="secondary" onClick={otro}>Probar otra ruta</Button>
          </div>
        )}
      </div>

      <div className="split-main" aria-live="polite" ref={resultadoRef}>
        {itinerario && plan ? (
          <section key={`${plan.id}-${eleccion?.semilla}-${eleccion?.municipio}-${eleccion?.dias}`} className="panel resultado" aria-label={plan.titulo}>
            <h2 className="t-h2">{plan.titulo}</h2>
            <dl className="it-resumen" aria-label="Resumen del itinerario">
              <div><dt>Municipio base</dt><dd>{nombreMun(itinerario.municipio)}</dd></div>
              <div><dt>Días</dt><dd>{itinerario.dias.length}</dd></div>
              {fecha && <div><dt>Llegada</dt><dd>{fechaCorta(fecha)}</dd></div>}
              <div><dt>Personas</dt><dd>{personas}</dd></div>
              <div><dt>En carretera</dt><dd>{etiquetaCarretera}</dd></div>
              <div><dt>Hospedaje</dt><dd>{estadoHospedaje}</dd></div>
            </dl>
            {eleccion?.ruta && <p className="it-aviso" role="status">Esta ruta la armó el asistente del chat. Si cambias el plan, el municipio o los días, la reemplazamos por una nueva.</p>}
            {!pasos.length && <p className="it-aviso">No encontramos lugares con ubicación para este plan. Prueba con otro municipio o plan.</p>}
            {itinerario.dias.map((d) => (
              <div key={d.n} className="it-dia">
                <h3 className="t-h3">Día {d.n}{fecha && <span className="it-fecha"> · {fechaCorta(fechaDelDia(fecha, d.n))}</span>}</h3>
                {d.n === 1 && <PasoCero movilidad={eleccion?.movilidad} base={itinerario.municipio} rutas={rutas} nombre={nombreMun} carro={tramoEntre('bogota', `mun:${itinerario.municipio}`)} />}
                {fecha && avisosDelDia(d, pasos, itinerario.municipio, fechaDelDia(fecha, d.n), alertas, clima, nombreMun, eventos).map((a) => (
                  <p key={a.clave} className="it-aviso it-dia-aviso" role="status">
                    {a.alerta ? <AlertaIcono tipo={a.alerta.tipo} /> : a.evento ? <CalendarDays size={20} aria-hidden /> : <CloudRain size={20} aria-hidden />}<span>{a.texto}</span>
                  </p>
                ))}
                <ol className="it-ruta-lista ruta" style={{ listStyle: 'none' }}>
                  {pasos.map((p, i) => p.dia === d.n && (
                    <li key={`${p.rol}-${p.lugar.id}`} className="it-paso">
                      {p.rol === 'parada' && (
                        <>
                          <span>{p.lugar.nombre}</span><small>{sitio(p.lugar)}</small>
                          <Distancia m={dist[i]} tramo={i > 0 ? tramoEntre(pasos[i - 1].lugar.id, p.lugar.id) : undefined} />
                          <Acciones l={p.lugar} query={query} />
                        </>
                      )}
                      {p.rol === 'comida' && (
                        <>
                          <h4 className="it-rol">Dónde comer</h4>
                          <Distancia m={dist[i]} tramo={i > 0 ? tramoEntre(pasos[i - 1].lugar.id, p.lugar.id) : undefined} />
                          <PlaceCard title={p.lugar.nombre} description={p.lugar.extra?.descripcion} meta={sitio(p.lugar)}>
                            <Acciones l={p.lugar} query={query} />
                          </PlaceCard>
                        </>
                      )}
                      {p.rol === 'hospedaje' && (
                        <>
                          <h4 className="it-rol">Dónde dormir</h4>
                          <Distancia m={dist[i]} tramo={i > 0 ? tramoEntre(pasos[i - 1].lugar.id, p.lugar.id) : undefined} />
                          <PlaceCard chip={chip} chipTone={tone} title={p.lugar.nombre}
                            description={p.lugar.extra?.descripcion} meta={sitio(p.lugar)}>
                            {etiquetaCupo && <p className="it-cupo-et">{etiquetaCupo}</p>}
                            <Acciones l={p.lugar} cta query={query} />
                          </PlaceCard>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
                {d.opcional.length > 0 && (
                  <section className="it-opcional" aria-label={`Día ${d.n}: si te sobra tiempo`}>
                    <h4 className="it-rol">Si te sobra tiempo (opcional)</h4>
                    <ul>
                      {d.opcional.map((l) => <li key={l.id}><span>{l.nombre}</span> <small>{sitio(l)}</small> <Link className="it-enlace" to={`/lugares/${l.id}`}>Ver detalle</Link></li>)}
                    </ul>
                  </section>
                )}
                {!d.paradas.length && !d.comida && <p className="it-aviso">No hay paradas disponibles para este día.</p>}
              </div>
            ))}
            {!hosp && pasos.length > 0 && <p className="it-aviso">No encontramos alojamiento registrado cerca de esta ruta.</p>}
            <Atribucion />
            <p className="embajador"><Icon name="embajador" size={24} />
              <span><strong>Tu embajador.</strong> Red de confianza del Valle de Tenza en {config.ciudadEmbajadores}.</span></p>
            <div className="it-compartir" role="group" aria-label="Compartir este itinerario">
              {typeof navigator.share === 'function' && <Button variant="secondary" disabled={ocupado} onClick={() => void compartirNativo()}><Share2 size={20} aria-hidden /> Compartir</Button>}
              <Button variant="secondary" disabled={ocupado} onClick={() => void compartirWhatsApp()}><MessageCircle size={20} aria-hidden /> Compartir por WhatsApp</Button>
              <Button variant="secondary" disabled={ocupado} onClick={() => void copiarEnlace()}><Copy size={20} aria-hidden /> Copiar enlace</Button>
              <div aria-live="polite" className="it-compartir-estado">
                {ocupado && <p>Creando el enlace…</p>}
                {aviso && <p>{aviso}</p>}
                {error && <p className="it-error" role="alert">{error}</p>}
              </div>
              {enlace && enlace.clave === claveEleccion && (
                <div className="it-enlace-campo"><TextField label="Enlace para compartir" readOnly value={enlace.url} onFocus={(e) => e.currentTarget.select()} /></div>
              )}
            </div>
            <section className="it-offline" aria-label="Ver sin señal">
              <Button variant="secondary" disabled={!enLinea || !!guardando || !pasos.length || cuantas > MAX_TESELAS} onClick={() => void guardar()}>
                <Download size={20} aria-hidden /> {guardadaAqui ? 'Actualizar lo guardado sin señal' : 'Guardar para ver sin señal'}
              </Button>
              {guardando && <><progress max={guardando.total} value={guardando.hechas} aria-label="Guardando el mapa" /><p>Guardando el mapa de la ruta: {guardando.hechas} de {guardando.total}…</p></>}
              <div aria-live="polite">
                {estadoGuardado && <p>{estadoGuardado}</p>}
                {!estadoGuardado && cuantas > MAX_TESELAS && <p>La zona es muy grande para guardarla sin señal.</p>}
                {!estadoGuardado && cuantas <= MAX_TESELAS && !guardando && !enLinea && <p>Necesitas conexión para guardar la ruta.</p>}
                {!estadoGuardado && !guardando && guardadaAqui && guardada && <p>Guardada el {new Date(guardada.guardadaEn).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}. Los cupos y avisos se actualizan cuando vuelva la señal.</p>}
              </div>
            </section>
            <div className="it-pie">
              <LinkButton to="/mapa?vista=ruta" variant="cta" icon="mapa">Ver mi ruta en el mapa</LinkButton>
              <LinkButton to="/reservas" variant="secondary">Mis reservas</LinkButton>
            </div>
          </section>
        ) : (
          <div className="panel vacio-panel">
            <Foto n={13} className="vacio-arte" />
            <p>Toca una opción y aquí aparece tu hospedaje y tu ruta.</p>
          </div>
        )}
      </div>
    </div>
  )
}
