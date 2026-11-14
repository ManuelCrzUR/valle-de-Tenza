import { ExternalLink, FileText, MessageCircle, Phone } from 'lucide-react'
import { DIAS_SEMANA, abiertoAhora, enlaceTel, enlaceWhatsapp, mensajeWhatsappLugar, numeroWhatsapp } from '../../shared/contacto'
import type { DiaHorario } from '../../shared/contacto'
import type { NegocioPublico } from '../state/negocios'
import { Chip } from './ui'

const PESOS = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' })

function textoDia(d: DiaHorario | undefined): string {
  if (!d) return 'Por confirmar'
  if (d.cerrado) return 'Cerrado'
  if (d.abre && d.cierra) return `${d.abre} – ${d.cierra}`
  return 'Por confirmar'
}

function enlaces(n: NegocioPublico) {
  const numero = numeroWhatsapp(n.whatsapp)
  return {
    wa: numero ? enlaceWhatsapp(numero, mensajeWhatsappLugar(n.name)) : null,
    tel: enlaceTel(n.phone),
    menu: n.menuUrl,
  }
}

export function BotonesContacto({ negocio, compacto = false }: { negocio: NegocioPublico; compacto?: boolean }) {
  const { wa, tel, menu } = enlaces(negocio)
  if (!wa && !tel && !menu) return null
  return (
    <div className={`contacto-botones${compacto ? ' contacto-compacto' : ''}`}>
      {wa && <a className="vd-btn vd-btn-cta" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden /> Escribir por WhatsApp</a>}
      {tel && <a className="vd-btn vd-btn-secondary" href={tel}><Phone size={18} aria-hidden /> Llamar</a>}
      {menu && <a className="vd-btn vd-btn-secondary" href={menu} target="_blank" rel="noopener noreferrer"><FileText size={18} aria-hidden /> Ver menú (PDF)</a>}
    </div>
  )
}

export function FichaNegocio({ negocio: n }: { negocio: NegocioPublico }) {
  const { wa, tel, menu } = enlaces(n)
  const hayRedes = Boolean(n.website || n.instagram || n.facebook)
  const hayContacto = Boolean(wa || tel || menu || hayRedes || n.contact)
  const estado = n.hours ? abiertoAhora(n.hours, new Date()) : 'sin_dato'
  const hayPrecios = n.priceFromCop != null || n.prices.length > 0
  return (
    <div className="ficha-negocio">
      <section aria-labelledby="fn-contacto">
        <h2 id="fn-contacto" className="t-h3">Contacto</h2>
        <BotonesContacto negocio={n} />
        {hayRedes && (
          <ul className="fn-redes">
            {n.website && <li><a href={n.website} target="_blank" rel="noopener noreferrer">Sitio web <ExternalLink size={14} aria-hidden /></a></li>}
            {n.instagram && <li><a href={`https://instagram.com/${n.instagram}`} target="_blank" rel="noopener noreferrer">Instagram @{n.instagram} <ExternalLink size={14} aria-hidden /></a></li>}
            {n.facebook && <li><a href={n.facebook} target="_blank" rel="noopener noreferrer">Facebook <ExternalLink size={14} aria-hidden /></a></li>}
          </ul>
        )}
        {!hayContacto && <p>Contacto por confirmar</p>}
      </section>

      <section aria-labelledby="fn-horario">
        <h2 id="fn-horario" className="t-h3">Horario</h2>
        {estado !== 'sin_dato' && (
          <p><Chip tone={estado === 'abierto' ? 'success' : 'danger'}>{estado === 'abierto' ? 'Abierto ahora' : 'Cerrado ahora'}</Chip></p>
        )}
        <ul className="fn-horario">
          {DIAS_SEMANA.map((d) => (
            <li key={d.id}><span>{d.nombre}</span><span>{textoDia(n.hours?.[d.id])}</span></li>
          ))}
        </ul>
        {n.hoursNote && <p className="fn-nota">{n.hoursNote}</p>}
      </section>

      <section aria-labelledby="fn-precios">
        <h2 id="fn-precios" className="t-h3">Precios</h2>
        {!hayPrecios && <p>Precios por confirmar</p>}
        {n.priceFromCop != null && <p className="fn-desde">Desde {PESOS.format(n.priceFromCop)}</p>}
        {n.priceNote && <p className="fn-nota">{n.priceNote}</p>}
        {n.prices.length > 0 && (
          <ul className="fn-precios">
            {n.prices.map((p, i) => (
              <li key={`${p.item}-${i}`}>
                <span>{p.item}{p.note ? <small> · {p.note}</small> : null}</span>
                <span>{p.priceCop != null ? PESOS.format(p.priceCop) : 'Por confirmar'}</span>
              </li>
            ))}
          </ul>
        )}
        {hayPrecios && (
          <p className="fn-nota">
            Precios publicados por el negocio{n.infoUpdatedAt ? `, actualizados el ${FECHA.format(new Date(n.infoUpdatedAt))}` : ''}.
          </p>
        )}
      </section>

      {n.services.length > 0 && (
        <section aria-labelledby="fn-servicios">
          <h2 id="fn-servicios" className="t-h3">Servicios</h2>
          <ul className="fn-chips">
            {n.services.map((s) => <li key={s}><Chip tone="soft">{s}</Chip></li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
