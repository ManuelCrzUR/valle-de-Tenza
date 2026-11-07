import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { PlanProvider } from './state/plan'
import { SesionProvider } from './state/sesion'
import './styles/tokens.css'
import './styles/components.css'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <SesionProvider><PlanProvider><App /></PlanProvider></SesionProvider>
    </HashRouter>
  </StrictMode>,
)
