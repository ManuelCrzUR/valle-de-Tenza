// «Demanda y operación»: demanda por municipio y semana, planes más pedidos, brecha de hospedaje y prestadores inactivos.
// Todo sale de las vistas de 0005_metricas.sql (solo agregados, sin datos personales). Barras con HTML/SVG propio.
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Button, Chip } from '../components/ui'
import { NOMBRE_MUNICIPIO } from '../data/lugares'
import { aCsv, descargarCsv, useBrechaHospedaje, useDemandaSemanal, usePrestadoresInactivos } from '../state/metricas'
import type { ColumnaCsv, Consulta } from '../state/metricas'
import { digitosWhatsapp, enlaceWhatsapp } from '../state/reservas'

const NOMBRE_PLAN: Record<string, string> = { aventura: 'Aventura', gastro: 'Gastronomía', cultura: 'Cultura' }
const plan = (p: string) => NOMBRE_PLAN[p] ?? p
const muni = (m: string | null) => (m ? NOMBRE_MUNICIPIO[m] ?? m : 'Sin municipio')
const fechaDia = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
const semanaDe = (f: string) => `Semana del ${new Date(`${f}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`
const hoyIso = () => new Date().toLocaleDateString('en-CA')

/** Barra horizontal en SVG: el ancho es la proporción del máximo. El número va al lado, así que no depende del color. */
function Barra({ valor, max }: { valor: number; max: number }) {
  const p = max > 0 ? Math.max(valor > 0 ? 0.04 : 0, valor / max) : 0
  return (
    <svg className="co-barra" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="100" height="10" rx="3" className="co-barra-pista" />
      <rect x="0" y="0" width={100 * p} height="10" rx="3" className="co-barra-valor" />
    </svg>
  )
}

function Estado<T>({ c, vacio, hijos }: { c: Consulta<T[]>; vacio: string; hijos: ReactNode }) {
  return (
    <div aria-live="polite">
      {c.cargando ? <p className="pr-nota" role="status">Cargando…</p>
        : c.error ? <p className="pr-error" role="alert">{c.error} <Button variant="ghost" onClick={c.recargar}>Reintentar</Button></p>
        : c.datos.length === 0 ? <div className="pr-vacio"><p>{vacio}</p></div>
        : hijos}
    </div>
  )
}

function Exportar<T>({ nombre, filas, columnas, deshabilitado }: { nombre: string; filas: T[]; columnas: ColumnaCsv<T>[]; deshabilitado?: boolean }) {
  return (
    <Button variant="secondary" disabled={deshabilitado || filas.length === 0} onClick={() => descargarCsv(`${nombre}-${hoyIso()}`, aCsv(filas, columnas))}>
      Exportar CSV
    </Button>
  )
}

export default function CoordinadorMetricas() {
  const demanda = useDemandaSemanal()
  const brecha = useBrechaHospedaje()
  const inactivos = usePrestadoresInactivos()

  // Itinerarios y personas por semana + municipio (suma de los planes).
  const porMunicipio = useMemo(() => {
    const m = new Map<string, { semana: string; municipio: string | null; itinerarios: number; personas: number }>()
    for (const d of demanda.datos) {
      const k = `${d.semana}|${d.municipio ?? ''}`
      const x = m.get(k) ?? { semana: d.semana, municipio: d.municipio, itinerarios: 0, personas: 0 }
      x.itinerarios += d.itinerarios; x.personas += d.personas
      m.set(k, x)
    }
    return [...m.values()].sort((a, b) => b.semana.localeCompare(a.semana) || b.itinerarios - a.itinerarios)
  }, [demanda.datos])
  const porPlan = useMemo(() => {
    const m = new Map<string, { plan: string; itinerarios: number; personas: number }>()
    for (const d of demanda.datos) {
      const x = m.get(d.plan) ?? { plan: d.plan, itinerarios: 0, personas: 0 }
      x.itinerarios += d.itinerarios; x.personas += d.personas
      m.set(d.plan, x)
    }
    return [...m.values()].sort((a, b) => b.itinerarios - a.itinerarios)
  }, [demanda.datos])
  const maxMuni = Math.max(0, ...porMunicipio.map((f) => f.itinerarios))
  const maxPlan = Math.max(0, ...porPlan.map((f) => f.itinerarios))
  const sinCupo = brecha.datos.filter((b) => b.personasDemandadas > b.cupoDisponible).length

  return (
    <section className="pr-seccion" aria-labelledby="h-metricas-co">
      <h2 id="h-metricas-co" className="t-h2">Demanda y operación</h2>
      <p className="sub">Lo que piden los viajeros al generar itinerarios y qué tan listo está el cupo. Son cifras agrupadas, sin datos personales.</p>

      <div className="pr-item co-bloque">
        <div className="co-bloque-cab">
          <h3 className="t-h3">Demanda por municipio y semana</h3>
          <Exportar nombre="demanda-municipio-semana" filas={porMunicipio} columnas={[
            { titulo: 'Semana (lunes)', valor: (f) => f.semana }, { titulo: 'Municipio', valor: (f) => muni(f.municipio) },
            { titulo: 'Itinerarios', valor: (f) => f.itinerarios }, { titulo: 'Personas', valor: (f) => f.personas },
          ]} />
        </div>
        <Estado c={demanda} vacio="Aún no hay itinerarios generados" hijos={
          <div className="co-tabla-scroll">
            <table className="co-tabla">
              <caption className="sr-only">Itinerarios y personas por municipio y semana</caption>
              <thead><tr><th scope="col">Semana</th><th scope="col">Municipio</th><th scope="col">Itinerarios</th><th scope="col">Personas</th></tr></thead>
              <tbody>
                {porMunicipio.map((f) => (
                  <tr key={`${f.semana}|${f.municipio}`}>
                    <td>{semanaDe(f.semana)}</td><td>{muni(f.municipio)}</td>
                    <td><span className="co-celda-barra"><b>{f.itinerarios}</b><Barra valor={f.itinerarios} max={maxMuni} /></span></td>
                    <td>{f.personas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        } />
      </div>

      <div className="pr-item co-bloque">
        <div className="co-bloque-cab">
          <h3 className="t-h3">Planes más pedidos</h3>
          <Exportar nombre="planes-mas-pedidos" filas={porPlan} columnas={[
            { titulo: 'Plan', valor: (f) => plan(f.plan) }, { titulo: 'Itinerarios', valor: (f) => f.itinerarios }, { titulo: 'Personas', valor: (f) => f.personas },
          ]} />
        </div>
        <Estado c={demanda} vacio="Aún no hay itinerarios generados" hijos={
          <div className="co-tabla-scroll">
            <table className="co-tabla">
              <caption className="sr-only">Itinerarios y personas por plan, del más al menos pedido</caption>
              <thead><tr><th scope="col">Plan</th><th scope="col">Itinerarios</th><th scope="col">Personas</th></tr></thead>
              <tbody>
                {porPlan.map((f) => (
                  <tr key={f.plan}>
                    <td>{plan(f.plan)}</td>
                    <td><span className="co-celda-barra"><b>{f.itinerarios}</b><Barra valor={f.itinerarios} max={maxPlan} /></span></td>
                    <td>{f.personas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        } />
      </div>

      <div className="pr-item co-bloque">
        <div className="co-bloque-cab">
          <h3 className="t-h3">Brecha de hospedaje · próximos 30 días</h3>
          <Exportar nombre="brecha-hospedaje" filas={brecha.datos} columnas={[
            { titulo: 'Fecha', valor: (f) => f.fecha }, { titulo: 'Municipio', valor: (f) => muni(f.municipio) },
            { titulo: 'Personas que quieren viajar', valor: (f) => f.personasDemandadas }, { titulo: 'Cupo en hoteles', valor: (f) => f.cupoDisponible },
            { titulo: 'Estado', valor: (f) => (f.personasDemandadas > f.cupoDisponible ? `Faltan ${f.personasDemandadas - f.cupoDisponible}` : 'Cubierto') },
          ]} />
        </div>
        <p className="pr-nota">Fechas en que hay más personas queriendo viajar a un municipio que cupo libre en sus hoteles.</p>
        <Estado c={brecha} vacio="Aún no hay fechas de viaje en los itinerarios generados." hijos={
          <>
            <p className="pr-nota" role="status"><strong>{sinCupo}</strong> {sinCupo === 1 ? 'fecha' : 'fechas'} con falta de cupo.</p>
            <div className="co-tabla-scroll">
              <table className="co-tabla">
                <caption className="sr-only">Personas que quieren viajar frente al cupo de hoteles, por fecha y municipio</caption>
                <thead><tr><th scope="col">Fecha y municipio</th><th scope="col">Quieren ir</th><th scope="col">Cupo</th><th scope="col">Estado</th></tr></thead>
                <tbody>
                  {brecha.datos.map((f) => {
                    const falta = f.personasDemandadas - f.cupoDisponible
                    return (
                      <tr key={`${f.fecha}|${f.municipio}`} className={falta > 0 ? 'co-fila-alerta' : undefined}>
                        <td>{fechaDia(f.fecha)}<br />{muni(f.municipio)}</td><td>{f.personasDemandadas}</td><td>{f.cupoDisponible}</td>
                        <td>{falta > 0 ? <Chip tone="danger">Faltan {falta}</Chip> : <Chip tone="success">Cubierto</Chip>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        } />
      </div>

      <div className="pr-item co-bloque">
        <div className="co-bloque-cab">
          <h3 className="t-h3">Prestadores sin actualizar su cupo</h3>
          <Exportar nombre="prestadores-inactivos" filas={inactivos.datos} columnas={[
            { titulo: 'Negocio', valor: (f) => f.nombre }, { titulo: 'Municipio', valor: (f) => muni(f.municipio) },
            { titulo: 'Último cupo actualizado', valor: (f) => f.cupoActualizado.slice(0, 10) },
          ]} />
        </div>
        <p className="pr-nota">Negocios activos que no tocan su cupo hace más de 7 días.</p>
        <Estado c={inactivos} vacio="Todos los prestadores actualizaron su cupo en los últimos 7 días." hijos={
          <ul className="pr-lista">
            {inactivos.datos.map((p) => {
              const num = p.whatsapp ? digitosWhatsapp(p.whatsapp) : null
              const dias = Math.floor((Date.now() - Date.parse(p.cupoActualizado)) / 86_400_000)
              const mensaje = `Hola, te escribimos de Valle Directo. Notamos que hace ${dias} días no actualizas el cupo de ${p.nombre}. ¿Nos ayudas a revisarlo cuando puedas? Así los viajeros ven información al día. ¡Gracias!`
              return (
                <li key={p.negocioId} className="co-inactivo">
                  <div>
                    <strong>{p.nombre}</strong>
                    <div className="pr-meta"><span>{muni(p.municipio)}</span><span>Sin actualizar hace {dias} {dias === 1 ? 'día' : 'días'}</span></div>
                  </div>
                  {num
                    ? <a className="vd-btn vd-btn-secondary" href={enlaceWhatsapp(num, mensaje)} target="_blank" rel="noopener noreferrer" aria-label={`Escribir por WhatsApp a ${p.nombre}`}>Escribir por WhatsApp</a>
                    : <span className="pr-nota">Sin WhatsApp registrado</span>}
                </li>
              )
            })}
          </ul>
        } />
      </div>
    </section>
  )
}
