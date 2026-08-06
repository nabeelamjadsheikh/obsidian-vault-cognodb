import Link from 'next/link'

/**
 * The default Next.js 404 is an unstyled white page, which is jarring against a
 * dark-only app and reads as a crash rather than a wrong address.
 */
export default function NotFound() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      <div>
        <p className="text-ui font-medium tracking-wide text-text-faint">404</p>
        <h1 className="mt-2 text-xl font-medium text-text">There is no note here</h1>
        <p className="mx-auto mt-2 max-w-sm text-ui text-text-muted">
          This address does not match anything in the vault. It may have been renamed, or the
          link that brought you here may never have been written.
        </p>
      </div>

      <Link
        href="/"
        className="rounded-panel border border-border bg-surface px-4 py-2 text-ui text-text transition-colors hover:border-accent-dim hover:bg-surface-alt"
      >
        Back to the vault
      </Link>
    </main>
  )
}
