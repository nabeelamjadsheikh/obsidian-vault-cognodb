import { AppShell } from '@/components/shell'

/**
 * The vault.
 *
 * A single client-rendered workspace rather than a page per note: tabs, a
 * split view and a sidebar that keeps its scroll position are all state that
 * has to survive navigation, and a server round-trip per note click would
 * throw it away. Deep links still work — /note/[slug] boots the same shell
 * with that note already open, and the shell keeps the address bar in sync.
 */
export default function Home() {
  return <AppShell />
}
