import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorState, PageLoading } from '../../components/PageStates';
import { useAdminSession } from '../auth/useAdminSession';

export function RequireAdmin() {
  const session = useAdminSession();
  const location = useLocation();

  if (session.isLoading) {
    return (
      <div className="admin-guard">
        <PageLoading label="Checking your session" />
      </div>
    );
  }

  if (session.error) {
    return (
      <div className="admin-guard">
        <ErrorState
          title="Session check failed"
          description="The administrator session could not be verified. Check your connection and try again."
          action={
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void session.refetch()}
            >
              Try again
            </button>
          }
        />
      </div>
    );
  }

  if (!session.data) {
    return (
      <Navigate
        to="/admin/login"
        state={{ from: location }}
        replace
      />
    );
  }

  return <Outlet />;
}
