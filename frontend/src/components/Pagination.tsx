import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
};

export function Pagination({
  page,
  pages,
  total,
  limit,
  onPageChange,
}: PaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="pagination">
      <span className="numeric">
        Showing {start}–{end} of {total}
      </span>
      <div className="pagination__buttons">
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft size={15} aria-hidden="true" />
          Previous
        </button>
        <span className="pagination__page">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
        >
          Next
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
