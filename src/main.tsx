import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ItinerarioProvider } from './state/itinerario'
import './styles/tokens.css'
import './styles/components.css'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ItinerarioProvider><App /></ItinerarioProvider>
    </HashRouter>
  </StrictMode>,
)
