import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import App from '../App'
import { BarraDemo } from './BarraDemo'

/**
 * Punto de entrada de la demo.
 *
 * La app de abajo es exactamente la de producción: lo único que cambia es de
 * dónde saca los datos (ver `vite.config.demo.ts`).
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Espacio abajo para que la barra no tape el último botón de cada pantalla. */}
    <div className="pb-20">
      <App />
    </div>
    <BarraDemo />
  </StrictMode>,
)
