import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="drilldraw home">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--navy)" />
        <path
          d="M7 22c4-9 9-12 18-12"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M21 6l5 4-5 4"
          fill="none"
          stroke="var(--red)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="23" r="2.4" fill="var(--red)" />
      </svg>
      <span>drilldraw</span>
    </Link>
  );
}

export function Header({ children }: { children?: ReactNode }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Logo />
        <div className="site-header-actions">{children}</div>
      </div>
    </header>
  );
}
