const dateOnlyFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

export function formatDateOnly(value: string): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return dateOnlyFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

export function formatTimestampDate(value: string | null | undefined): string {
  if (!value) return '—';
  return formatDateOnly(value.slice(0, 10));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMobile(value: string): string {
  if (value.length !== 10) return value;
  return `${value.slice(0, 5)} ${value.slice(5)}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function maximumDobIso(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 18);
  return date.toISOString().slice(0, 10);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function formatCityState(address: {
  city: string;
  state: string;
  pincode: string;
}): string {
  return [address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(', ');
}
