import { AppShell } from '@/components/shell'

/**
 * One client-rendered workspace rather than a page per note, because tabs, the
 * split view and sidebar scroll all have to survive navigation. Deep links
 * still work: /note/[slug] boots the same shell with that note open.
 */
export default function Home() {
  return <AppShell />
}
