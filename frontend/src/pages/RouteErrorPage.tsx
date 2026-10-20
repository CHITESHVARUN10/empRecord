import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';

export default function RouteErrorPage() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;

  return (
    <main className="not-found">
      <BrandMark />
      <span className="eyebrow">{status}</span>
      <h1>Something went wrong</h1>
      <p>
        The page could not be rendered. Reload the page, or return to the
        employee form.
      </p>
      <div className="not-found__actions">
        <Link className="btn btn--primary" to="/">
          Employee form
        </Link>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    </main>
  );
}
