import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'

// Cada pantalla se descarga cuando se visita (Layout muestra <Cargando/> mientras tanto).
const Inicio = lazy(() => import('./pages/Inicio'))
const Itinerario = lazy(() => import('./pages/Itinerario'))
const ItinerarioCompartido = lazy(() => import('./pages/ItinerarioCompartido'))
const Lugares = lazy(() => import('./pages/Lugares'))
const LugarDetalle = lazy(() => import('./pages/LugarDetalle'))
const Mapa = lazy(() => import('./pages/Mapa'))
const Chat = lazy(() => import('./pages/Chat'))
const Prestadores = lazy(() => import('./pages/Prestadores'))
const Reservar = lazy(() => import('./pages/Reservar'))
const MisReservas = lazy(() => import('./pages/MisReservas'))
const PrestadorAcceso = lazy(() => import('./pages/PrestadorAcceso'))
const PrestadorPanel = lazy(() => import('./pages/PrestadorPanel'))
const Municipio = lazy(() => import('./pages/Municipio'))
const ComoLlegar = lazy(() => import('./pages/ComoLlegar'))
const Coordinador = lazy(() => import('./pages/Coordinador'))
const Galeria = lazy(() => import('./pages/Galeria'))
const Privacidad = lazy(() => import('./pages/Privacidad'))
const Resena = lazy(() => import('./pages/Resena'))
const NoEncontrado = lazy(() => import('./pages/NoEncontrado'))

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="itinerario" element={<Itinerario />} />
        <Route path="i/:id" element={<ItinerarioCompartido />} />
        <Route path="lugares" element={<Lugares />} />
        <Route path="lugares/:id" element={<LugarDetalle />} />
        <Route path="municipios/:slug" element={<Municipio />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="como-llegar" element={<ComoLlegar />} />
        <Route path="coordinador" element={<Coordinador />} />
        <Route path="galeria" element={<Galeria />} />
        <Route path="chat" element={<Chat />} />
        <Route path="prestadores" element={<Prestadores />} />
        <Route path="prestadores/entrar" element={<PrestadorAcceso />} />
        <Route path="prestadores/panel" element={<PrestadorPanel />} />
        <Route path="reservar/:id" element={<Reservar />} />
        <Route path="reservas" element={<MisReservas />} />
        <Route path="resena/:codigo" element={<Resena />} />
        <Route path="privacidad" element={<Privacidad />} />
        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Routes>
  )
}
