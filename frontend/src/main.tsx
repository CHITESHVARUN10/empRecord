import '@fontsource-variable/public-sans';
import '@fontsource-variable/newsreader';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/form.css';
import './styles/admin.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './lib/queryClient';
import { router } from './routes';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
