import { useState } from 'react'
import { Bus, Car, Clock, ShieldCheck, ShieldOff } from 'lucide-react'
import { Chip } from '../components/ui'
import { Atribucion } from '../components/Atribucion'
import { AlertaIcono } from '../components/mapa/iconosAlerta'
import { useCatalogo } from '../data/lugares'
import { NOMBRE_MODO, NOMBRE_TIPO_ALERTA, dinero, duracionLarga, etiquetaDias, fechaVerificada, minutos, useLogistica } from '../state/logistica'
import type { RutaTransporte } from '../state/logistica'
import { usePagina } from '../usePagina'
import '../styles/como-llegar.css'

const POR_CONFIRMAR = <em className="cl-pc">por confirmar</em>

export function TarjetaRuta({ ruta, nombre }: { ruta: RutaTransporte; nombre: (slug: string) => string }) {
  const verificada = !!ruta.verificadoEn
  return (
    <li className="cl-ruta">
      <div className="cl-ruta-cab">
        <h4 className="t-h3"><Bus size={20} aria-hidden /> {ruta.empresa}</h4>
        <Chip tone={verificada ? 'success' : 'soft'}>
          {verificada ? <ShieldCheck size={16} aria-hidden /> : <ShieldOff size={16} aria-hidden />}
          {fechaVerificada(ruta.verificadoEn)}
        </Chip>
      </div>
      <dl className="cl-datos">
        <div><dt>Trayecto</dt><dd>{nombre(ruta.origen)} → {nombre(ruta.destino)} · {NOMBRE_MODO[ruta.modo]}</dd></div>
        <div><dt>Terminal</dt><dd>{ruta.terminal ?? POR_CONFIRMAR}</dd></div>
        <div><dt>Duración</dt><dd>{ruta.duracionMin ? `${duracionLarga(ruta.duracionMin)} aprox.` : POR_CONFIRMAR}</dd></div>
        <div><dt>Precio desde</dt><dd>{ruta.precioDesdeCop !== null ? dinero(ruta.precioDesdeCop) : POR_CONFIRMAR}</dd></div>
        <div>
          <dt>Salidas</dt>
          <dd>
            {ruta.salidas.length ? (
              <ul className="cl-salidas">
                {ruta.salidas.map((s) => <li key={s.id}><Clock size={16} aria-hidden /> <strong>{s.hora}</strong> · {etiquetaDias(s.dias)}</li>)}
              </ul>
            ) : POR_CONFIRMAR}
          </dd>
        </div>
      </dl>
      {ruta.notas && <p className="cl-notas">{ruta.notas}</p>}
    </li>
  )
}

export default function ComoLlegar() {
  usePagina('Cómo llegar')
  const { municipios } = useCatalogo()
  const { rutas, alertas, cargando, sinConexion, tramoEntre } = useLogistica()
  const [origen, setOrigen] = useState('guateque')

  const nombre = (slug: string) => (slug === 'bogota' ? 'Bogotá' : municipios.find((m) => m.slug === slug)?.nombre ?? slug)
  const desdeBogota = rutas.filter((r) => r.origen === 'bogota')
  const enElValle = rutas.filter((r) => r.origen !== 'bogota')
  const carro = tramoEntre('bogota', 'mun:guateque')

  const destinos = municipios
    .filter((m) => m.slug !== origen)
    .map((m) => ({ m, t: tramoEntre(`mun:${origen}`, `mun:${m.slug}`) }))
    .sort((a, b) => (a.t?.duracion_s ?? Infinity) - (b.t?.duracion_s ?? Infinity))

  return (
    <div className="wrap pagina cl">
      <h1 id="titulo" tabIndex={-1} className="t-h1">Cómo llegar al Valle de Tenza</h1>
      <p className="sub">Desde Bogotá en transporte público o en carro propio, y cuánto toma moverse entre municipios.</p>
      <div aria-live="polite">
        {cargando && <p className="pr-nota">Cargando rutas…</p>}
        {sinConexion && !cargando && <p className="it-aviso">No pudimos consultar rutas y tiempos en este momento. Los datos aparecen como «por confirmar».</p>}
      </div>

      {alertas.length > 0 && (
        <section className="cl-seccion" aria-labelledby="h-cl-avisos">
          <h2 id="h-cl-avisos" className="t-h2">Avisos de la vía</h2>
          <ul className="cl-avisos">
            {alertas.map((a) => (
              <li key={a.id} className="it-aviso cl-aviso">
                <AlertaIcono tipo={a.tipo} />
                <span><strong>{NOMBRE_TIPO_ALERTA[a.tipo]}{a.municipio ? ` · ${nombre(a.municipio)}` : ''}.</strong> {a.mensaje}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cl-seccion" aria-labelledby="h-cl-bogota">
        <h2 id="h-cl-bogota" className="t-h2">Desde Bogotá en transporte público</h2>
        {desdeBogota.length ? (
          <ul className="cl-lista">{desdeBogota.map((r) => <TarjetaRuta key={r.id} ruta={r} nombre={nombre} />)}</ul>
        ) : (
          <p className="it-aviso">Todavía no tenemos rutas publicadas desde Bogotá: {POR_CONFIRMAR}.</p>
        )}
        <p className="cl-nota">Precios y horarios los fijan las empresas y cambian. Confírmalos con la empresa antes de viajar.</p>
      </section>

      <section className="cl-seccion" aria-labelledby="h-cl-carro">
        <h2 id="h-cl-carro" className="t-h2"><Car size={24} aria-hidden /> En carro propio</h2>
        <p className="cl-carro">
          Bogotá → Guateque: {carro ? <><strong>unos {duracionLarga(minutos(carro.duracion_s))}</strong> por carretera ({Math.round(carro.distancia_m / 1000)} km)</> : POR_CONFIRMAR}.
        </p>
        <p className="cl-nota">Es el tiempo estimado sin tráfico, sin paradas ni derrumbes. Revisa los avisos de la vía antes de salir.</p>
      </section>

      <section className="cl-seccion" aria-labelledby="h-cl-entre">
        <h2 id="h-cl-entre" className="t-h2">Entre municipios</h2>
        <div className="vd-field">
          <label htmlFor="cl-origen" className="vd-field-label">Salgo de</label>
          <select id="cl-origen" className="vd-input" value={origen} onChange={(e) => setOrigen(e.target.value)}>
            {municipios.map((m) => <option key={m.slug} value={m.slug}>{m.nombre}</option>)}
          </select>
        </div>
        <ul className="cl-destinos" aria-label={`Tiempos desde ${nombre(origen)}`}>
          {destinos.map(({ m, t }) => (
            <li key={m.slug}>
              <span>{m.nombre}</span>
              <strong>{t ? `${duracionLarga(minutos(t.duracion_s))} · ${Math.round(t.distancia_m / 100) / 10} km`.replace('.', ',') : POR_CONFIRMAR}</strong>
            </li>
          ))}
        </ul>
        <p className="cl-nota">Tiempos en carro por carretera, de centro a centro del municipio.</p>
      </section>

      {enElValle.length > 0 && (
        <section className="cl-seccion" aria-labelledby="h-cl-valle">
          <h2 id="h-cl-valle" className="t-h2">Transporte dentro del Valle</h2>
          <ul className="cl-lista">{enElValle.map((r) => <TarjetaRuta key={r.id} ruta={r} nombre={nombre} />)}</ul>
        </section>
      )}

      <Atribucion />
    </div>
  )
}
