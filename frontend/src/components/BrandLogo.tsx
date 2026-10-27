import React from 'react';

interface BrandLogoProps {
  onClick?: () => void;
  compact?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ onClick, compact = false }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-2.5 text-left focus:outline-none"
      aria-label="MARKET / SIGNAL Home"
    >
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-[5px] bg-[#111111] text-white transition-transform duration-150 group-hover:scale-[1.03]">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path
            d="M3.5 16.5L8 12L11.5 14.5L17 7.5L20.5 9"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="17" cy="7.5" r="1.6" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className="text-[13px] font-semibold tracking-[0.14em] text-[#111111]">
          MARKET <span className="font-light text-ink-400">/</span> SIGNAL
        </span>
      )}
    </button>
  );
};
