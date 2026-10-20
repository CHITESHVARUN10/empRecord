import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  FilePlus2,
  LayoutDashboard,
  LogOut,
} from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';
import { apiFetch } from '../../lib/api';
import { initials } from '../../lib/format';
import { useAdminSession } from '../auth/useAdminSession';

export function AdminLayout() {
  const session = useAdminSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: () =>
      apiFetch<void>('/api/auth/logout', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(['auth', 'me'], null);
      navigate('/admin/login', { replace: true });
    },
  });

  const admin = session.data;

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-content">
        Skip to content
      </a>

      <aside className="admin-sidebar">
        <NavLink
          to="/admin"
          end
          className="admin-sidebar__brand brand-plate"
          aria-label="Blaupunkt employee records"
        >
          <BrandMark />
        </NavLink>

        <nav className="admin-nav" aria-label="Administrator navigation">
          <span className="admin-nav__label">Workspace</span>
          <NavLink
            to="/admin"
            aria-label="Records"
            className={({ isActive }) =>
              `admin-nav__link ${isActive ? 'admin-nav__link--active' : ''}`.trim()
            }
          >
            <LayoutDashboard size={17} aria-hidden="true" />
            <span>Records</span>
          </NavLink>
          <a
            className="admin-nav__link"
            href="/"
            target="_blank"
            rel="noreferrer"
            aria-label="Open employee form"
          >
            <FilePlus2 size={17} aria-hidden="true" />
            <span>Employee form</span>
            <ExternalLink
              className="admin-nav__external"
              size={13}
              aria-hidden="true"
            />
          </a>
        </nav>

        <div className="admin-sidebar__foot">
          <div className="admin-identity">
            <span className="avatar" aria-hidden="true">
              {initials(admin?.displayName ?? 'HR')}
            </span>
            <div>
              <strong>{admin?.displayName ?? 'Administrator'}</strong>
              <span>Administrator</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--ghost admin-signout"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            aria-label="Sign out"
          >
            <LogOut size={16} aria-hidden="true" />
            <span>{logout.isPending ? 'Signing out' : 'Sign out'}</span>
          </button>
        </div>
      </aside>

      <main className="admin-main" id="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
