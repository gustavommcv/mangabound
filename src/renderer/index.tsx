import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import './styles.css';

const rootElement = document.querySelector<HTMLElement>('#root');

if (rootElement === null) {
  throw new Error('Mangabound could not find its renderer root.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
