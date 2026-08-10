"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Simple line icons, sized to sit on the text baseline. */
const ICONS = {
  measure: (
    <path d="M2 7h16v8H2z M5 7v3 M8 7v4 M11 7v3 M14 7v4" />
  ),
  trophy: (
    <path d="M6 3h8v4a4 4 0 0 1-8 0z M6 4H3v2a3 3 0 0 0 3 3 M14 4h3v2a3 3 0 0 1-3 3 M8 11h4v3H8z M6 17h8" />
  ),
  leaf: (
    <path d="M4 16C4 9 9 4 17 4c0 8-5 12-11 12H4z M4 16c3-3 6-5 9-6" />
  ),
} as const;

const NAV = [
  { href: "/", label: "Measure", icon: "measure" as const },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" as const },
  { href: "/diagnose", label: "Plant help", icon: "leaf" as const },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    // Wraps rather than overflowing: the three pills come to 359px, so on a
    // 320px phone they used to drag the whole page sideways. Found while
    // measuring the diagnose page, not caused by it.
    <nav className="mt-4 flex flex-wrap gap-1.5">
      {NAV.map((item) => {
        const on = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`tap inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-tiny font-medium transition-colors ${
              on
                ? "border-vine-soft bg-vine-soft text-cream"
                : "border-vine-soft text-cream/65 hover:border-gold/60 hover:text-cream"
            }`}
          >
            <svg
              viewBox="0 0 20 20"
              className="h-4 w-4 flex-none"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {ICONS[item.icon]}
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
