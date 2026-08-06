'use client'

/**
 * A crash barrier around each pane's contents.
 *
 * The shell renders three panes it does not own. If one of them throws during
 * render, React unmounts the entire tree — the sidebar, the tabs, everything —
 * and the user gets a white page. Catching it here means a broken pane is a
 * panel with a "Try again" button inside an app that still works, and the
 * thrown error itself never reaches the screen.
 */

import { Component, type ReactNode } from 'react'
import { ErrorState } from '@/components/ui'

interface Props {
  /** Changing this resets the boundary — switching tabs clears a stale crash. */
  resetKey: string
  children: ReactNode
}

interface State {
  crashed: boolean
  resetKey: string
}

export class PaneBoundary extends Component<Props, State> {
  state: State = { crashed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<State> {
    return { crashed: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { crashed: false, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error: unknown) {
    // Developers get the detail in the console; the user gets plain language.
    console.error('[vault] a pane failed to render', error)
  }

  render() {
    if (this.state.crashed) {
      return (
        <ErrorState
          code="INTERNAL"
          message="This panel stopped working. The rest of the vault is still fine."
          onRetry={() => this.setState({ crashed: false })}
        />
      )
    }
    return this.props.children
  }
}

export default PaneBoundary
