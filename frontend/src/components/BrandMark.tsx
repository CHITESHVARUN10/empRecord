type BrandMarkProps = {
  className?: string;
  alt?: string;
};

export function BrandMark({ className = '', alt = 'Blaupunkt' }: BrandMarkProps) {
  return (
    <img
      className={`brand-mark ${className}`.trim()}
      src="/brand/blaupunkt-logo.png"
      alt={alt}
      width={1600}
      height={186}
      decoding="async"
    />
  );
}
