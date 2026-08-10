import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Oswald, Work_Sans } from "next/font/google";
import Link from "next/link";
import Nav from "@/components/Nav";
import "./globals.css";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Giant Pumpkin Calculator",
  description:
    "Measure your giant pumpkin with a tape and get its estimated weight, then watch it grow through the season.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f3d2b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${oswald.variable} ${workSans.variable} ${plexMono.variable}`}
    >
      <body>
        <div className="mx-auto flex min-h-screen max-w-[640px] flex-col px-4 pb-8">
          <header className="pt-6 pb-5">
            <Link href="/" className="tap block text-center">
              <span className="display-face block text-[1.9rem] leading-[0.95] text-cream">
                Giant Pumpkin
              </span>
              <span className="mt-1 flex items-center justify-center gap-2">
                <svg viewBox="0 0 34 12" className="h-3 w-8 text-[#3F7350]" fill="currentColor" aria-hidden>
                  <path d="M34 6C26 1 16 0 8 3c3 4 9 6 15 5-5 2-11 2-15 0 5 4 16 4 26-2z" />
                </svg>
                <span className="display-face text-[1.9rem] leading-[0.95] text-gold">
                  Calculator
                </span>
                <svg viewBox="0 0 34 12" className="h-3 w-8 scale-x-[-1] text-[#3F7350]" fill="currentColor" aria-hidden>
                  <path d="M34 6C26 1 16 0 8 3c3 4 9 6 15 5-5 2-11 2-15 0 5 4 16 4 26-2z" />
                </svg>
              </span>
            </Link>

            <Nav />
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-8 border-t border-vine-soft pt-5">
            <p className="text-tiny leading-relaxed text-cream/55">
              Weights come from the 2025 GPC Atlantic Giant chart. Estimates run
              about ±5% and assume Atlantic Giant genetics. Wall thickness is
              what makes a pumpkin heavy or light to the chart, and you cannot
              see it from outside. Your measurements stay in this browser.
            </p>
            <p className="mt-3 text-micro tracking-wide text-cream/40 uppercase">
              Built by AgOptics · Tulare, California
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
