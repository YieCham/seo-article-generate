import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const isEmbedded = new URLSearchParams(window.location.search).get('embed') === '1'
if (isEmbedded) {
  document.documentElement.classList.add('embed')
  document.body.classList.add('embed')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
