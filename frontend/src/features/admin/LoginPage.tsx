import { useState } from 'react';
import {
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';
import { PageLoading } from '../../components/PageStates';
import { apiFetch, ApiError } from '../../lib/api';
import { useAdminSession, type AdminUser } from '../auth/useAdminSession';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const session = useAdminSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState<string>();

  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname ?? '/admin';

  const login = useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      apiFetch<{ admin: AdminUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data.admin);
      navigate(from, { replace: true });
    },
  });

  if (session.isLoading) {
    return <PageLoading label="Checking your session" />;
  }

  if (session.data) {
    return <Navigate to={from} replace />;
  }

  const errorMessage =
    login.error instanceof ApiError
      ? login.error.message
      : login.error
        ? 'Sign in failed. Check your connection and try again.'
        : undefined;

  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="brand-plate login-brand__plate">
          <BrandMark />
        </div>
        <div className="login-brand__copy">
          <span className="eyebrow">Blaupunkt · HR</span>
          <h1>Every employee record, in one place.</h1>
          <p>
            Review submissions, open identity documents, and export the master
            record. Administrator access is restricted.
          </p>
        </div>
        <div className="login-brand__foot">
          <span className="status-dot" aria-hidden="true" />
          Internal system · Administrator access
        </div>
      </section>

      <main className="login-main">
        <div className="login-main__inner">
          <form
            className="login-form"
            onSubmit={(event) => {
              event.preventDefault();
              setValidationError(undefined);
              login.reset();
              if (!username.trim() || !password) {
                setValidationError('Enter your username and password.');
                return;
              }
              login.mutate({ username, password });
            }}
            noValidate
          >
            <div className="login-form__head">
              <span className="eyebrow">Administrator</span>
              <h2>Sign in</h2>
              <p>Use the credentials issued by the HR administrator.</p>
            </div>

            {validationError || errorMessage ? (
              <div className="login-error" role="alert">
                {validationError ?? errorMessage}
              </div>
            ) : null}

            <div className="field">
              <label className="field__label" htmlFor="admin-username">
                Username
              </label>
              <input
                id="admin-username"
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="admin-password">
                Password
              </label>
              <div className="password-field">
                <input
                  id="admin-password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--icon password-field__toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff size={17} aria-hidden="true" />
                  ) : (
                    <Eye size={17} aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn--primary btn--lg btn--full"
              disabled={login.isPending}
            >
              {login.isPending ? (
                <>
                  <span className="btn__spinner" aria-hidden="true" />
                  Signing in
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={17} aria-hidden="true" />
                </>
              )}
            </button>

            <p className="login-form__note">
              Sessions end after 8 hours of inactivity.
            </p>
          </form>

          <a className="login-back" href="/">
            Back to employee form
          </a>
        </div>
      </main>
    </div>
  );
}
