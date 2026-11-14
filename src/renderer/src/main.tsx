import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { resolveTheme, useSettings } from './store/settings';
import './styles.css';

// Set the theme before first paint so there is no flash of the wrong one.
document.documentElement.dataset.theme = resolveTheme(useSettings.getState().theme);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
