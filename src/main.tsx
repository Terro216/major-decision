import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

if (new URLSearchParams(location.search).get('review') === '1') {
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex';
  document.head.appendChild(robots);
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
