import { LinkButton } from '../components/LinkButton'
import { usePagina } from '../usePagina'

export default function NoEncontrado() {
  usePagina('Página no encontrada')
  return (
    <div className="wrap pagina">
      <p className="overline">Error 404</p>
      <h1 id="titulo" tabIndex={-1} className="t-h1">Esta página no existe</h1>
      <p className="sub">Puede que el enlace esté mal escrito. Vuelve al inicio y retoma tu plan desde ahí.</p>
      <LinkButton to="/" variant="primary">Volver al inicio</LinkButton>
    </div>
  )
}
