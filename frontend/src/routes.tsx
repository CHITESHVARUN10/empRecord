import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './RootLayout';
import { PublicFormPage } from './features/employee-form/PublicFormPage';
import { RequireAdmin } from './features/admin/RequireAdmin';
import { AdminLayout } from './features/admin/AdminLayout';
import NotFoundPage from './pages/NotFoundPage';
import RouteErrorPage from './pages/RouteErrorPage';

const LoginPage = lazy(() => import('./features/admin/LoginPage'));
const DashboardPage = lazy(() => import('./features/admin/DashboardPage'));
const EmployeeDetailPage = lazy(
  () => import('./features/admin/EmployeeDetailPage'),
);
const EmployeeEditPage = lazy(
  () => import('./features/admin/EmployeeEditPage'),
);

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/',
        element: <PublicFormPage />,
      },
      {
        path: '/admin/login',
        element: <LoginPage />,
      },
      {
        element: <RequireAdmin />,
        children: [
          {
            path: '/admin',
            element: <AdminLayout />,
            children: [
              {
                index: true,
                element: <DashboardPage />,
              },
              {
                path: 'employees/:id',
                element: <EmployeeDetailPage />,
              },
              {
                path: 'employees/:id/edit',
                element: <EmployeeEditPage />,
              },
            ],
          },
        ],
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
