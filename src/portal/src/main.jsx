import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/clay.css';
import './styles/tabs.css';
import './styles/splitter.css';
import './styles/select.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
