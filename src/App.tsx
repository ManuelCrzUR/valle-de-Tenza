import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import Inicio from './pages/Inicio'
import Itinerario from './pages/Itinerario'
import Lugares from './pages/Lugares'
import LugarDetalle from './pages/LugarDetalle'
import Mapa from './pages/Mapa'
import Chat from './pages/Chat'
import Prestadores from './pages/Prestadores'
import NoEncontrado from './pages/NoEncontrado'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="itinerario" element={<Itinerario />} />
        <Route path="lugares" element={<Lugares />} />
        <Route path="lugares/:id" element={<LugarDetalle />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="chat" element={<Chat />} />
        <Route path="prestadores" element={<Prestadores />} />
        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Routes>
  )
}
