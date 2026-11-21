import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Cargando } from './components/Cargando'
import { interpretarHashHeredado } from './lib/enlaceAuth'

const Inicio = lazy(() => import('./pages/Inicio'))
const Plan = lazy(() => import('./pages/Plan'))
const Lugares = lazy(() => import('./pages/Lugares'))
const LugarDetalle = lazy(() => import('./pages/LugarDetalle'))
const Mapa = lazy(() => import('./pages/Mapa'))
const Galeria = lazy(() => import('./pages/Galeria'))
const Prestadores = lazy(() => import('./pages/Prestadores'))
const PrestadorAcceso = lazy(() => import('./pages/PrestadorAcceso'))
const PrestadorPanel = lazy(() => import('./pages/PrestadorPanel'))
const AuthConfirmar = lazy(() => import('./pages/AuthConfirmar'))
const ClaveNueva = lazy(() => import('./pages/ClaveNueva'))
const NoEncontrado = lazy(() => import('./pages/NoEncontrado'))

// Mientras supabase-js lee un enlace de correo heredado (#access_token=… o #error=…), no se muestra «no encontrado»:
// src/lib/supabase.ts lleva a la persona a la pantalla correcta en cuanto termina.
function RutaDesconocida() {
  return interpretarHashHeredado(window.location.hash) ? <Cargando /> : <NoEncontrado />
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="plan" element={<Plan />} />
        <Route path="itinerario" element={<Navigate to="/plan" replace />} />
        <Route path="chat" element={<Navigate to="/plan" replace />} />
        <Route path="lugares" element={<Lugares />} />
        <Route path="lugares/:id" element={<LugarDetalle />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="galeria" element={<Galeria />} />
        <Route path="prestadores" element={<Prestadores />} />
        <Route path="prestadores/entrar" element={<PrestadorAcceso />} />
        <Route path="prestadores/panel" element={<PrestadorPanel />} />
        <Route path="prestadores/confirmar" element={<AuthConfirmar />} />
        <Route path="prestadores/clave-nueva" element={<ClaveNueva />} />
        <Route path="*" element={<RutaDesconocida />} />
      </Route>
    </Routes>
  )
}
