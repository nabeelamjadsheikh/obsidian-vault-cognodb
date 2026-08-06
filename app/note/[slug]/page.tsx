import { AppShell } from '@/components/shell'

/**
 * A shareable link to one note.
 *
 * It renders the same workspace as `/`, opened on this note. The slug is not
 * validated here on purpose: the note pane already handles a missing note with
 * a proper NOT_FOUND panel, and doing it twice would mean a 404 page that
 * loses the sidebar and the user's way back.
 */
export default async function NotePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <AppShell initialSlug={decodeURIComponent(slug)} />
}
