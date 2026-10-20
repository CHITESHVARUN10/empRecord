import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';

export default function NotFoundPage() {
  return (
    <main className="not-found">
      <BrandMark />
      <span className="eyebrow">404</span>
      <h1>Page not found</h1>
      <p>
        The page you are looking for does not exist. Return to the employee
        form to start a submission.
      </p>
      <div className="not-found__actions">
        <Link className="btn btn--primary" to="/">
          <ArrowLeft size={16} aria-hidden="true" />
          Employee form
        </Link>
        <Link className="btn btn--secondary" to="/admin">
          Administrator sign in
        </Link>
      </div>
    </main>
  );
}
