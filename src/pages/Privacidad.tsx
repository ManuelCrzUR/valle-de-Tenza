import { Link } from 'react-router-dom'
import { useAjustes } from '../state/ajustes'
import '../styles/privacidad.css'
import { usePagina } from '../usePagina'

export default function Privacidad() {
  usePagina('Aviso de privacidad')
  const { contacto } = useAjustes()
  return (
    <div className="wrap pagina privacidad">
      <p className="overline">Ley 1581 de 2012</p>
      <h1 id="titulo" tabIndex={-1} className="t-h1">Aviso de privacidad</h1>
      <p className="sub">
        Valle Directo te ayuda a planear viajes al Valle de Tenza y a reservar con los negocios locales.
        Aquí explicamos qué datos personales guardamos cuando reservas, para qué, quién los ve y cómo ejercer tus derechos.
      </p>

      <section className="privacidad-bloque">
        <h2 className="t-h3">Qué datos guardamos</h2>
        <p>Al reservar pedimos tu nombre, tu teléfono o WhatsApp, la fecha de la visita, el número de personas y una nota opcional.</p>
      </section>

      <section className="privacidad-bloque">
        <h2 className="t-h3">Para qué</h2>
        <p>Para que el negocio que recibe la reserva pueda confirmarla contigo. No usamos tus datos para publicidad ni los vendemos.</p>
      </section>

      <section className="privacidad-bloque">
        <h2 className="t-h3">Quién los puede ver</h2>
        <p>Solo el negocio que recibe la reserva y el coordinador del Valle que administra la plataforma. Estos datos nunca aparecen en vistas públicas, listados ni analítica.</p>
      </section>

      <section className="privacidad-bloque">
        <h2 className="t-h3">Cuánto tiempo</h2>
        <p>Borramos los datos de una reserva a los 12 meses de creada.</p>
      </section>

      <section className="privacidad-bloque">
        <h2 className="t-h3">Tus derechos</h2>
        <ul className="privacidad-lista">
          <li>Conocer los datos que tenemos sobre ti.</li>
          <li>Actualizarlos.</li>
          <li>Rectificarlos si son inexactos.</li>
          <li>Pedir su supresión (borrarlos) cuando ya no sean necesarios.</li>
        </ul>
      </section>

      <section className="privacidad-bloque">
        <h2 className="t-h3">Cómo ejercerlos</h2>
        <p>
          Escribe al negocio con el que reservaste o al contacto de Valle Directo, indicando tu nombre y el código de tu reserva.
          Responderemos en los plazos que fija la ley.
        </p>
        {contacto && <p>Contacto: <strong>{contacto}</strong></p>}
        <p>Si no obtienes respuesta, puedes presentar una queja ante la Superintendencia de Industria y Comercio.</p>
      </section>

      <p className="privacidad-fecha">Última actualización: octubre de 2026. <Link to="/">Volver al inicio</Link></p>
    </div>
  )
}
