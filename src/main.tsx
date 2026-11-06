import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeMobile } from './lib/mobile';

void initializeMobile().then(()=>createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)).catch(()=>{
 document.getElementById('root')!.textContent='Impossible de lire la configuration de cette caisse. Fermez puis relancez l’application.';
});
