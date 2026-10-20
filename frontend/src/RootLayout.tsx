import { Suspense } from 'react';
import { Outlet, ScrollRestoration } from 'react-router-dom';
import { PageLoading } from './components/PageStates';

export function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Suspense fallback={<PageLoading label="Loading" />}>
        <Outlet />
      </Suspense>
    </>
  );
}
