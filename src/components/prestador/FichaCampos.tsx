import { DIAS_SEMANA } from '../../../shared/contacto'
import type { DiaSemana, Horario } from '../../../shared/contacto'
import { TextField } from '../ui'

export const SERVICIOS = [
  'Parqueadero',
  'Wifi',
  'Se admiten mascotas',
  'Pago con tarjeta',
  'Pago con transferencia',
  'Apto para niños',
  'Acceso para silla de ruedas',
  'Baño',
  'Zona verde',
  'Desayuno incluido',
]

export interface FilaDia { cerrado: boolean; abre: string; cierra: string }

export interface Ficha {
  phone: string
  whatsapp: string
  show_phone: boolean
  show_whatsapp: boolean
  notify_email: string
  hours: Record<DiaSemana, FilaDia>
  hours_note: string
  price_from_cop: string
  price_note: string
  website: string
  instagram: string
  facebook: string
  services: string[]
  menu_path: string | null
}

export function horarioVacio(): Record<DiaSemana, FilaDia> {
  return Object.fromEntries(DIAS_SEMANA.map((d) => [d.id, { cerrado: false, abre: '', cierra: '' }])) as Record<DiaSemana, FilaDia>
}

export function horarioDesdeJson(h: Horario | null | undefined): Record<DiaSemana, FilaDia> {
  const filas = horarioVacio()
  if (!h) return filas
  for (const d of DIAS_SEMANA) {
    const e = h[d.id]
    if (e) filas[d.id] = { cerrado: !!e.cerrado, abre: e.abre ?? '', cierra: e.cierra ?? '' }
  }
  return filas
}

/** Solo los días con dato. Devuelve null si no hay ninguno; error si falta una de las dos horas. */
export function horarioAJson(filas: Record<DiaSemana, FilaDia>): { hours: Horario | null; error?: string } {
  const hours: Horario = {}
  for (const d of DIAS_SEMANA) {
    const f = filas[d.id]
    if (f.cerrado) hours[d.id] = { cerrado: true }
    else if (f.abre && f.cierra) hours[d.id] = { abre: f.abre, cierra: f.cierra }
    else if (f.abre || f.cierra) return { hours: null, error: `${d.nombre}: indica la hora de apertura y la de cierre, o marca «Cerrado».` }
  }
  return { hours: Object.keys(hours).length ? hours : null }
}

interface Props {
  ficha: Ficha
  onChange: (cambios: Partial<Ficha>) => void
}

export function FichaCampos({ ficha, onChange }: Props) {
  function cambiaDia(id: DiaSemana, cambios: Partial<FilaDia>) {
    onChange({ hours: { ...ficha.hours, [id]: { ...ficha.hours[id], ...cambios } } })
  }
  function alternaServicio(s: string, on: boolean) {
    onChange({ services: on ? [...ficha.services, s] : ficha.services.filter((x) => x !== s) })
  }

  return (
    <>
      <fieldset className="prestador-seccion">
        <legend className="t-h3">Contacto</legend>
        <TextField label="Teléfono" type="tel" inputMode="tel" autoComplete="tel" value={ficha.phone} maxLength={20} onChange={(e) => onChange({ phone: e.target.value })} />
        <label className="prestador-check">
          <input type="checkbox" checked={ficha.show_phone} onChange={(e) => onChange({ show_phone: e.target.checked })} />
          <span>Mostrar en la ficha pública</span>
        </label>
        <TextField label="WhatsApp" type="tel" inputMode="tel" value={ficha.whatsapp} maxLength={20} hint="Celular colombiano de 10 dígitos o con +código de país." onChange={(e) => onChange({ whatsapp: e.target.value })} />
        <label className="prestador-check">
          <input type="checkbox" checked={ficha.show_whatsapp} onChange={(e) => onChange({ show_whatsapp: e.target.checked })} />
          <span>Mostrar en la ficha pública</span>
        </label>
        <TextField label="Correo para avisos de solicitudes (privado)" type="email" autoComplete="email" value={ficha.notify_email} maxLength={160} hint="No se publica. Si lo dejas vacío usamos el correo de tu cuenta." onChange={(e) => onChange({ notify_email: e.target.value })} />
      </fieldset>

      <fieldset className="prestador-seccion">
        <legend className="t-h3">Horario</legend>
        {DIAS_SEMANA.map((d) => {
          const f = ficha.hours[d.id]
          return (
            <div key={d.id} className="prestador-dia">
              <span className="prestador-dia-nombre">{d.nombre}</span>
              <label className="prestador-check">
                <input type="checkbox" checked={f.cerrado} onChange={(e) => cambiaDia(d.id, { cerrado: e.target.checked })} />
                <span>Cerrado<span className="sr-only">, {d.nombre}</span></span>
              </label>
              <label className="prestador-hora">
                <span className="sr-only">{d.nombre}, abre</span>
                <input className="vd-input" type="time" value={f.abre} disabled={f.cerrado} onChange={(e) => cambiaDia(d.id, { abre: e.target.value })} />
              </label>
              <label className="prestador-hora">
                <span className="sr-only">{d.nombre}, cierra</span>
                <input className="vd-input" type="time" value={f.cierra} disabled={f.cerrado} onChange={(e) => cambiaDia(d.id, { cierra: e.target.value })} />
              </label>
            </div>
          )
        })}
        <TextField label="Nota de horario (opcional)" value={ficha.hours_note} maxLength={200} onChange={(e) => onChange({ hours_note: e.target.value })} />
      </fieldset>

      <fieldset className="prestador-seccion">
        <legend className="t-h3">Precios</legend>
        <TextField label="Precio desde (COP)" type="number" inputMode="numeric" min={0} max={50000000} step={1} value={ficha.price_from_cop} onChange={(e) => onChange({ price_from_cop: e.target.value })} />
        <TextField label="Nota de precios (opcional)" value={ficha.price_note} maxLength={200} onChange={(e) => onChange({ price_note: e.target.value })} />
      </fieldset>

      <fieldset className="prestador-seccion">
        <legend className="t-h3">Redes y web</legend>
        <TextField label="Sitio web" type="url" inputMode="url" value={ficha.website} maxLength={200} hint="Debe empezar por https://" onChange={(e) => onChange({ website: e.target.value })} />
        <TextField label="Instagram (usuario, sin @)" value={ficha.instagram} maxLength={60} autoCapitalize="none" onChange={(e) => onChange({ instagram: e.target.value })} />
        <TextField label="Facebook (enlace o nombre de página)" value={ficha.facebook} maxLength={200} autoCapitalize="none" onChange={(e) => onChange({ facebook: e.target.value })} />
      </fieldset>

      <fieldset className="prestador-seccion">
        <legend className="t-h3">Servicios</legend>
        <div className="prestador-servicios">
          {SERVICIOS.map((s) => (
            <label key={s} className="prestador-check">
              <input type="checkbox" checked={ficha.services.includes(s)} onChange={(e) => alternaServicio(s, e.target.checked)} />
              <span>{s}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  )
}
