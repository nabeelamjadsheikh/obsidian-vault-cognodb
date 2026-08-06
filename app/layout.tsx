import type { Metadata, Viewport } from 'next'
import './globals.css'

/*
 * No next/font, no <link> to a CDN: the font stacks live in globals.css as
 * pure system stacks (`--font-sans` for chrome, `--font-serif` for note
 * bodies). That keeps the app self-contained and removes a render-blocking
 * network fetch — the vault paints instantly on first load.
 */

export const metadata: Metadata = {
  title: 'Vault',
  description: 'A personal knowledge vault — notes, links and the graph between them.',
}

/*
 * `themeColor` matches --color-bg so mobile browser chrome and the pre-hydration
 * canvas are the same dark as the app; `colorScheme` stops the browser flashing
 * a white background before CSS applies.
 */
export const viewport: Viewport = {
  themeColor: '#1e1e1e',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      {/*
       * Password managers and similar extensions inject attributes into <body>
       * (data-cjcrx, cz-shortcut-listen) before React hydrates, which React
       * reports as a hydration mismatch. Nothing here renders differently on
       * the server than on the client, so suppressing the warning on this one
       * element hides third-party noise rather than a real bug of ours.
       */}
      <body suppressHydrationWarning className="h-full bg-bg font-sans text-text antialiased">
        {children}
      </body>
    </html>
  )
}
