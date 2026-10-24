import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { TextField, Button, Chip } from '../components/ui'
import { LinkButton } from '../components/LinkButton'
import { Icon } from '../components/Icon'
import { Cargando } from '../components/Cargando'
import { getLugar, tipoReserva, TIPOS_RESERVA, NOMBRE_MUNICIPIO } from '../data/lugares'
import type { TipoReserva } from '../data/lugares'
import { useOperacion, crearReserva, cupoLibre, enlaceWhatsapp, negocioDeLugar, whatsappDeNegocio, LUGAR_NEGOCIO, hoy } from '../state/reservas'
import type { EstadoReserva } from '../state/reservas'
import { usePagina } from '../usePagina'
import { evento } from '../analitica'
import { useOnline } from '../state/offline'
import NoEncontrado from './NoEncontrado'
import '../styles/reservas.css'
import '../styles/offline.css'

export const fechaLarga = (f: string) =>
  new Date(`${f}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

type Campos = Record<'fecha' | 'hora' | 'noches' | 'personas' | 'nombre' | 'contacto' | 'nota', string>
const VACIOS: Campos = { fecha: '', hora: '', noches: '1', personas: '2', nombre: '', contacto: '', nota: '' }

export default function Reservar() {
  const { id } = useParams()
  const demo = useOperacion()
  const enLinea = useOnline()
  const lugar = id?.startsWith(LUGAR_NEGOCIO) ? undefined : getLugar(id)
  const negocioPropio = id?.startsWith(LUGAR_NEGOCIO) ? demo.negocios.find((n) => n.lugarId === id) : undefined
  const info = lugar
    ? { nombre: lugar.nombre, tipo: tipoReserva(lugar), municipio: NOMBRE_MUNICIPIO[lugar.municipio] ?? lugar.municipio }
    : negocioPropio ? { nombre: negocioPropio.nombre, tipo: negocioPropio.tipo as TipoReserva | null, municipio: NOMBRE_MUNICIPIO[negocioPropio.municipio] ?? negocioPropio.municipio } : undefined
  const [params] = useSearchParams()
  const [v, setV] = useState<Campos>(() => {
    const f = params.get('fecha') ?? ''
    const p = Number(params.get('personas'))
    return { ...VACIOS, ...(/^\d{4}-\d{2}-\d{2}$/.test(f) && f >= hoy() ? { fecha: f } : {}), ...(Number.isInteger(p) && p >= 1 && p <= 50 ? { personas: String(p) } : {}) }
  })
  const [errores, setErrores] = useState<Partial<Record<keyof Campos, string>>>({})
  const [errorGeneral, setErrorGeneral] = useState('')
  type Hecha = { codigo: string; estado: EstadoReserva; fecha: string; hora?: string; noches?: number; personas: number; nombre: string; contacto: string; conNegocio: boolean; negocioId?: string }
  const [hecha, setHecha] = useState<Hecha | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [wa, setWa] = useState<string | null>(null)
  const negocioHecha = hecha?.negocioId
  useEffect(() => {
    let vivo = true
    setWa(null)
    if (negocioHecha) whatsappDeNegocio(negocioHecha).then((n) => { if (vivo) setWa(n) })
    return () => { vivo = false }
  }, [negocioHecha])
  usePagina(hecha ? 'Solicitud enviada' : info ? `Reservar ${info.nombre}` : 'Reservar')
  const tipoAbierto = info?.tipo
  useEffect(() => { if (tipoAbierto) evento('reservar_abierto', { tipo: tipoAbierto }) }, [tipoAbierto])

  if (id?.startsWith(LUGAR_NEGOCIO) && !info && demo.cargando) return <Cargando />
  if (id?.startsWith(LUGAR_NEGOCIO) && !info && demo.sinConexion) {
    return <div className="wrap pagina res-pagina"><h1 id="titulo" tabIndex={-1} className="t-h1">Reservar</h1><p className="res-aviso" role="status"><Icon name="alerta" size={20} />Sin conexión: por ahora no se pueden hacer reservas.</p></div>
  }
  if (!id || !info || !info.tipo) return <NoEncontrado />
  const tipo = info.tipo
  const negocio = negocioDeLugar(demo.negocios, id)
  const etiquetaTipo = TIPOS_RESERVA.find((t) => t.id === tipo)?.etiqueta ?? ''
  const set = (k: keyof Campos) => (e: { target: { value: string } }) => { setV((x) => ({ ...x, [k]: e.target.value })); setErrores((x) => ({ ...x, [k]: undefined })); setErrorGeneral('') }
  const pers = Number(v.personas)
  const libre = negocio && v.fecha >= hoy() ? cupoLibre(demo, negocio, v.fecha) : null
  const etPers = tipo === 'hotel' ? 'Huéspedes' : 'Personas'

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const er: Partial<Record<keyof Campos, string>> = {}
    if (!v.fecha) er.fecha = tipo === 'hotel' ? 'Elige la fecha de llegada.' : 'Elige la fecha.'
    else if (v.fecha < hoy()) er.fecha = 'La fecha no puede ser anterior a hoy.'
    if (tipo === 'restaurante' && !v.hora) er.hora = 'Elige la hora.'
    if (tipo === 'hotel' && !(Number.isInteger(Number(v.noches)) && Number(v.noches) >= 1)) er.noches = 'Indica al menos 1 noche.'
    if (!Number.isInteger(pers) || pers < 1 || pers > 50) er.personas = 'Indica entre 1 y 50 personas.'
    else if (libre !== null && pers > libre) er.personas = `Solo quedan ${libre} cupos para esa fecha.`
    if (!v.nombre.trim()) er.nombre = 'Escribe tu nombre.'
    if (!v.contacto.trim()) er.contacto = 'Escribe un teléfono o WhatsApp para contactarte.'
    else if (v.contacto.replace(/\D/g, '').length < 7) er.contacto = 'Escribe un teléfono válido, con al menos 7 dígitos.'
    setErrores(er)
    if (Object.keys(er).length) {
      setErrorGeneral('Revisa los campos marcados.')
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    const datos = {
      lugarId: id, tipo, nombre: v.nombre.trim(), contacto: v.contacto.trim(), fecha: v.fecha, personas: pers, nota: v.nota.trim(),
      ...(tipo === 'restaurante' ? { hora: v.hora } : {}), ...(tipo === 'hotel' ? { noches: Number(v.noches) } : {}),
    }
    setEnviando(true)
    const r = await crearReserva(datos)
    setEnviando(false)
    if (!r.ok || !r.reserva) { setErrorGeneral(r.ok ? 'No se pudo enviar la solicitud.' : r.error); return }
    setHecha({ ...datos, ...r.reserva, conNegocio: !!negocio, negocioId: negocio?.id })
    evento('reserva_enviada', { tipo, personas: pers })
  }

  const volver = id.startsWith(LUGAR_NEGOCIO) ? null : `/lugares/${id}`

  if (hecha) {
    return (
      <div className="wrap pagina res-pagina">
        <p className="overline">Solicitud enviada</p>
        <h1 id="titulo" tabIndex={-1} className="t-h1">Recibimos tu solicitud</h1>
        <Chip tone="soft">Pendiente</Chip>
        <p className="sub">
          {hecha.conNegocio
            ? 'Tu solicitud queda pendiente hasta que el negocio la confirme. Todavía no es una reserva confirmada.'
            : 'Este lugar aún no tiene prestador en la app: un embajador tramitará tu solicitud. Todavía no es una reserva confirmada.'}
        </p>
        <dl className="res-resumen">
          <dt>Lugar</dt><dd>{info.nombre}</dd>
          <dt>{tipo === 'hotel' ? 'Llegada' : 'Fecha'}</dt><dd>{fechaLarga(hecha.fecha)}</dd>
          {hecha.hora && <><dt>Hora</dt><dd>{hecha.hora}</dd></>}
          {hecha.noches && <><dt>Noches</dt><dd>{hecha.noches}</dd></>}
          <dt>{etPers}</dt><dd>{hecha.personas}</dd>
          <dt>A nombre de</dt><dd>{hecha.nombre}</dd>
          <dt>Contacto</dt><dd>{hecha.contacto}</dd>
          <dt>Código</dt><dd>{hecha.codigo}</dd>
          <dt>Estado</dt><dd>Pendiente</dd>
        </dl>
        <p className="res-nota">Guarda tu código: con él y tu teléfono puedes consultar o cancelar la solicitud.</p>
        <div className="res-acciones">
          {wa && (
            <a className="vd-btn vd-btn-cta" target="_blank" rel="noopener noreferrer"
              href={enlaceWhatsapp(wa, `Hola, soy ${hecha.nombre}. Hice una solicitud de reserva en ${info.nombre} para el ${fechaLarga(hecha.fecha)}, ${hecha.personas} ${hecha.personas === 1 ? 'persona' : 'personas'}${hecha.noches ? `, ${hecha.noches} ${hecha.noches === 1 ? 'noche' : 'noches'}` : ''}${hecha.hora ? `, a las ${hecha.hora}` : ''}. Código: ${hecha.codigo}.`)}>
              Avisar al negocio por WhatsApp
            </a>
          )}
          <LinkButton to="/reservas" variant="primary">Ver mis reservas</LinkButton>
          {!hecha.conNegocio && <LinkButton to="/chat" variant="secondary" icon="chat">Hablar con un embajador</LinkButton>}
          {volver && <LinkButton to={volver} variant="ghost">Volver al lugar</LinkButton>}
        </div>
      </div>
    )
  }

  return (
    <div className="wrap pagina res-pagina">
      <p className="overline">{etiquetaTipo} · {info.municipio}</p>
      <h1 id="titulo" tabIndex={-1} className="t-h1">Reservar en {info.nombre}</h1>
      <p className="sub">Envía tu solicitud. No se confirma al instante: queda pendiente hasta que se gestione.</p>
      <div aria-live="polite">{demo.sinConexion && <p className="res-aviso"><Icon name="alerta" size={20} />Sin conexión: por ahora no se pueden hacer reservas.</p>}</div>
      <div aria-live="polite">{!enLinea && <p className="res-offline">Sin conexión: no se puede enviar la solicitud ahora. El botón se activa cuando vuelva la señal.</p>}</div>
      <form className="res-form" onSubmit={enviar} noValidate>
        <div className="res-fila">
          <TextField label={tipo === 'hotel' ? 'Fecha de llegada' : 'Fecha'} type="date" min={hoy()} value={v.fecha} onChange={set('fecha')} error={errores.fecha} required />
          {tipo === 'restaurante' && <TextField label="Hora" type="time" value={v.hora} onChange={set('hora')} error={errores.hora} required />}
          {tipo === 'hotel' && <TextField label="Noches" type="number" inputMode="numeric" min={1} value={v.noches} onChange={set('noches')} error={errores.noches} required />}
        </div>
        <TextField label={etPers} type="number" inputMode="numeric" min={1} max={50} value={v.personas} onChange={set('personas')} error={errores.personas} required />
        {libre !== null && <p className={`res-cupo${libre === 0 ? ' res-cupo-bajo' : ''}`} aria-live="polite">Cupo disponible para esa fecha: {libre}</p>}
        <TextField label="Tu nombre" autoComplete="name" value={v.nombre} onChange={set('nombre')} error={errores.nombre} required />
        <TextField label="Teléfono o WhatsApp" type="tel" autoComplete="tel" value={v.contacto} onChange={set('contacto')} error={errores.contacto} required />
        <div className="vd-field">
          <label htmlFor="res-nota" className="vd-field-label">Nota (opcional)</label>
          <textarea id="res-nota" className="vd-input res-area" rows={3} maxLength={500} value={v.nota} onChange={set('nota')} />
        </div>
        <p className="res-privacidad">Guardamos tu nombre, teléfono y los datos de la solicitud solo para gestionar tu reserva. Solo los ve el negocio y el equipo de Valle Directo, y se borran a los 12 meses. <Link to="/privacidad" target="_blank" rel="noopener">Aviso de privacidad</Link></p>
        <div aria-live="assertive">{errorGeneral && <p className="res-error"><Icon name="alerta" size={18} />{errorGeneral}</p>}</div>
        <div className="res-acciones">
          <Button type="submit" variant="cta" disabled={enviando || demo.sinConexion || !enLinea}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</Button>
          {volver && <LinkButton to={volver} variant="ghost">Cancelar</LinkButton>}
        </div>
      </form>
    </div>
  )
}
