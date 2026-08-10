import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Giant Pumpkin Weight Calculator · AgOptics",
  description:
    "Estimate giant pumpkin weight with the over-the-top (OTT) method using the 2025 GPC Atlantic Giant chart, then track growth week over week.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const NAV = [
  { href: "/", label: "Calculator" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/diagnose", label: "Diagnose" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-[620px] px-4 pt-4 pb-10">
          <header className="mb-[18px] rounded-[14px] bg-navy px-[22px] py-5 text-white">
            <h1 className="text-[21px] leading-[1.25] font-normal tracking-[-0.01em]">
              Giant Pumpkin Weight Calculator
            </h1>
            <p className="mt-1.5 text-[13px] text-[#b9c4d6]">
              Over-the-top (OTT) method · 2025 GPC chart
            </p>
            <nav className="mt-3.5 flex gap-2">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-white/20 px-3 py-1.5 text-[13px] font-semibold text-[#b9c4d6] transition-colors hover:border-white/40 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>

          {children}

          <div className="mt-5 border-t border-line pt-[22px] text-center">
            <div className="text-sm font-bold text-navy">
              AgOptics · Tulare, California
            </div>
            <div className="mt-1 text-xs font-bold tracking-[0.07em] text-green">
              DATA. INSIGHT. BETTER DECISIONS.
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
