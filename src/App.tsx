import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'

const Inicio = lazy(() => import('./pages/Inicio'))
const Plan = lazy(() => import('./pages/Plan'))
const Lugares = lazy(() => import('./pages/Lugares'))
const LugarDetalle = lazy(() => import('./pages/LugarDetalle'))
const Mapa = lazy(() => import('./pages/Mapa'))
const Galeria = lazy(() => import('./pages/Galeria'))
const NoEncontrado = lazy(() => import('./pages/NoEncontrado'))

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
        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Routes>
  )
}
