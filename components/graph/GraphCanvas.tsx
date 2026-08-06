'use client'

/**
 * The constellation itself.
 *
 * Everything about how the vault is drawn lives here; GraphPane owns the data
 * and the chrome around it. The three decisions that make this readable rather
 * than a hairball:
 *
 *   1. **Radius follows degree.** A note linked thirty times is visibly a
 *      landmark. Without this every dot is identical and the picture carries no
 *      information beyond "things are connected".
 *   2. **Labels are rationed.** 273 names drawn at once is a grey smear, so at
 *      low zoom only the highest-degree nodes are named, and everything is
 *      named once you zoom in past a threshold. Hovering always names.
 *   3. **Hover dims the unrelated.** Pointing at a node drops everything it
 *      does not touch to 10% and lights its own edges accent — which is how you
 *      read one strand out of sixteen hundred.
 *
 * `react-force-graph-2d` reaches for `window` at import time, so it is loaded
 * through `next/dynamic` with `ssr: false` and a Skeleton fallback. Nothing in
 * this module may be imported on the server.
 */

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GraphData, NodeKind, RelType } from '@/lib/types'
import { Skeleton } from '@/components/ui'
import {
  ACCENT,
  CANVAS_BG,
  FOCUS_RADIUS_BONUS,
  HUB_LABEL_COUNT,
  HUB_LABEL_ZOOM,
  KIND_COLOR,
  LABEL_PX,
  LABEL_ZOOM,
  LINK_COLOR,
  LINK_DIMMED,
  LINK_HIGHLIGHT,
  TEXT,
  TEXT_MUTED,
  nodeRadius,
} from './graphStyle'

/* ------------------------------------------------------------------- types */

/**
 * Deliberately a `type` alias, not an `interface`: force-graph's `NodeObject`
 * carries an `[others: string]: any` index signature, and only type aliases get
 * the implicit index signature that makes them assignable to it.
 */
type VaultNode = {
  id: string
  label: string
  kind: NodeKind
  degree: number
  stub: boolean
  slug?: string
  /** Precomputed radius — recomputing it per node per frame is wasted work. */
  r: number
  x?: number
  y?: number
  vx?: number
  vy?: number
}

type VaultLink = {
  source: string | VaultNode
  target: string | VaultNode
  type: RelType
}

type FGMethods = {
  zoom(): number
  zoom(scale: number, durationMs?: number): unknown
  zoomToFit(durationMs?: number, padding?: number): unknown
  centerAt(x?: number, y?: number, durationMs?: number): unknown
  d3Force(name: string): { [key: string]: unknown } | undefined
}

type FGProps = {
  ref?: React.Ref<FGMethods | undefined>
  graphData: { nodes: VaultNode[]; links: VaultLink[] }
  width?: number
  height?: number
  backgroundColor?: string
  nodeId?: string
  nodeVal?: (node: VaultNode) => number
  nodeLabel?: (node: VaultNode) => string
  nodeRelSize?: number
  nodeCanvasObject?: (
    node: VaultNode,
    ctx: CanvasRenderingContext2D,
    globalScale: number,
  ) => void
  nodePointerAreaPaint?: (
    node: VaultNode,
    color: string,
    ctx: CanvasRenderingContext2D,
    globalScale: number,
  ) => void
  linkColor?: (link: VaultLink) => string
  linkWidth?: (link: VaultLink) => number
  minZoom?: number
  maxZoom?: number
  cooldownTicks?: number
  warmupTicks?: number
  d3AlphaDecay?: number
  d3VelocityDecay?: number
  enableNodeDrag?: boolean
  onEngineStop?: () => void
  onNodeHover?: (node: VaultNode | null) => void
  onNodeClick?: (node: VaultNode) => void
  onNodeDragEnd?: (node: VaultNode) => void
  onBackgroundClick?: () => void
}

/* ----------------------------------------------------------- the component */

function CanvasSkeleton() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      role="status"
      aria-label="Drawing the graph"
    >
      <Skeleton width="82%" height="76%" rounded="md" />
    </div>
  )
}

// The one place the library is loaded. `ssr: false` is not optional: force-graph
// touches `window` on import and would crash the server render.
const ForceGraph2D = dynamic(
  () => import('react-force-graph-2d').then((m) => m.default as unknown as React.FC<FGProps>),
  { ssr: false, loading: () => <CanvasSkeleton /> },
)

/* ------------------------------------------------------------------ config */

const TAU = Math.PI * 2
const MIN_ZOOM = 0.08
const MAX_ZOOM = 9

/** System stack only — the canvas must not trigger a font download. */
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

/** Long titles are elided rather than allowed to overlap their neighbours. */
function elide(text: string, max = 30): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function endpointId(end: string | VaultNode): string {
  return typeof end === 'object' ? end.id : end
}

/** The handle GraphPane's zoom and fit buttons drive. */
export interface GraphViewport {
  fit: () => void
  zoomBy: (factor: number) => void
}

export interface GraphCanvasProps {
  data: GraphData
  /** `Note:<slug>` of the open note, highlighted with an accent ring. */
  focusId: string | null
  /** Changes whenever the graph is a different one, so it re-fits to view. */
  fitKey: string
  onOpenNote?: (slug: string) => void
  /** Filled with zoom controls once the canvas is live; nulled on unmount. */
  viewportRef: React.RefObject<GraphViewport | null>
}

export function GraphCanvas({
  data,
  focusId,
  fitKey,
  onOpenNote,
  viewportRef,
}: GraphCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const fgRef = useRef<FGMethods | undefined>(undefined)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hoverId, setHoverId] = useState<string | null>(null)

  /* ---- honour prefers-reduced-motion for the camera animations ---- */

  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduceMotion(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  const ms = useCallback((duration: number) => (reduceMotion ? 0 : duration), [reduceMotion])

  /* ---- the canvas needs pixel dimensions, so measure the pane ---- */

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const apply = (width: number, height: number) =>
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      )

    apply(el.clientWidth, el.clientHeight)
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      apply(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /* ---- data → drawable graph ---- */

  /**
   * Where each node ended up last time. Toggling a filter rebuilds the node
   * objects, and without this the layout would explode and re-settle from
   * scratch on every checkbox — which reads as the graph changing subject.
   */
  const positions = useRef(new Map<string, { x: number; y: number }>())

  const graph = useMemo(() => {
    const nodes: VaultNode[] = data.nodes.map((node) => {
      const seen = positions.current.get(node.id)
      return {
        id: node.id,
        label: node.label,
        kind: node.kind,
        degree: node.degree,
        stub: node.stub === true,
        slug: node.slug,
        r: nodeRadius(node.degree) + (node.id === focusId ? FOCUS_RADIUS_BONUS : 0),
        ...(seen ? { x: seen.x, y: seen.y } : {}),
      }
    })

    // Fresh link objects every time: force-graph rewrites source/target in
    // place from ids to node references, so reusing them across datasets would
    // point the new simulation at stale nodes.
    const links: VaultLink[] = data.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      type: edge.type,
    }))

    return { nodes, links }
  }, [data, focusId])

  /** id → ids one edge away. Built once per dataset; read on every hover frame. */
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const edge of data.edges) {
      let from = map.get(edge.source)
      if (!from) map.set(edge.source, (from = new Set()))
      from.add(edge.target)

      let to = map.get(edge.target)
      if (!to) map.set(edge.target, (to = new Set()))
      to.add(edge.source)
    }
    return map
  }, [data])

  /** The handful of nodes important enough to stay named when zoomed out. */
  const hubIds = useMemo(() => {
    const ranked = [...data.nodes].sort((a, b) => b.degree - a.degree)
    return new Set(ranked.slice(0, HUB_LABEL_COUNT).map((node) => node.id))
  }, [data])

  const neighbours = hoverId ? adjacency.get(hoverId) : undefined

  /* ---- camera ---- */

  const rememberPositions = useCallback(() => {
    for (const node of graph.nodes) {
      if (typeof node.x === 'number' && typeof node.y === 'number') {
        positions.current.set(node.id, { x: node.x, y: node.y })
      }
    }
  }, [graph])

  const attachGraph = useCallback((instance: FGMethods | null) => {
    fgRef.current = instance ?? undefined
    if (!instance) return

    // Default d3 settings pack 273 nodes into a ball. More repulsion and a
    // longer link distance is what opens the clusters up enough to see them.
    const charge = instance.d3Force('charge') as
      | { strength?: (v: number) => unknown; distanceMax?: (v: number) => unknown }
      | undefined
    charge?.strength?.(-130)
    charge?.distanceMax?.(420)

    const link = instance.d3Force('link') as
      | { distance?: (v: number) => { strength?: (v: number) => unknown } | unknown }
      | undefined
    const linked = link?.distance?.(34) as { strength?: (v: number) => unknown } | undefined
    linked?.strength?.(0.35)
  }, [])

  // Where the camera is heading, so clicking + three times quickly is three
  // steps rather than one — reading fg.zoom() mid-transition returns the
  // half-finished value and swallows the extra clicks.
  const zoomTargetRef = useRef<{ value: number; at: number } | null>(null)

  useEffect(() => {
    const handle: GraphViewport = {
      fit: () => {
        zoomTargetRef.current = null
        fgRef.current?.zoomToFit(ms(550), 48)
      },
      zoomBy: (factor) => {
        const fg = fgRef.current
        if (!fg) return
        const pending = zoomTargetRef.current
        const from = pending && Date.now() - pending.at < 400 ? pending.value : fg.zoom()
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, from * factor))
        zoomTargetRef.current = { value: next, at: Date.now() }
        fg.zoom(next, ms(220))
      },
    }
    viewportRef.current = handle
    return () => {
      if (viewportRef.current === handle) viewportRef.current = null
    }
  }, [viewportRef, ms])

  /*
   * Frame the graph once per dataset, and only once: a reader who has panned
   * somewhere interesting must not be yanked back every time the simulation
   * twitches.
   *
   * The fit is instantaneous rather than animated. `zoomToFit` normally tweens
   * the camera, but the moment the engine stops is exactly the moment the
   * render loop goes quiet, and an animated camera move made right then is
   * dropped — which left the graph sitting at the default zoom, a small island
   * in an empty pane. A belt-and-braces timer covers the case where the engine
   * never announces that it has stopped at all.
   */
  const fittedRef = useRef<string | null>(null)

  /*
   * Fitting is only meaningful once the simulation has actually placed nodes.
   * A fixed timer is not enough: on a cold start the data can arrive well after
   * it fires, and fitting an empty canvas then marking the job done leaves the
   * reader looking at a near-blank pane with the graph parked off-screen at the
   * default zoom. So the attempt is refused — and retried — until there is
   * something with coordinates to frame.
   */
  const fitOnce = useCallback(() => {
    if (fittedRef.current === fitKey) return false
    if (!fgRef.current) return false
    const placed = graph.nodes.some(
      (node) => typeof node.x === 'number' && typeof node.y === 'number',
    )
    if (!placed) return false
    fittedRef.current = fitKey
    fgRef.current.zoomToFit(0, 48)
    return true
  }, [fitKey, graph])

  useEffect(() => {
    fittedRef.current = null
    if (graph.nodes.length === 0) return

    // Poll rather than fire once, and give up after ~12s so a genuinely stuck
    // simulation does not leave an interval running behind the pane.
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (fitOnce() || Date.now() - started > 12_000) window.clearInterval(timer)
    }, 400)
    return () => window.clearInterval(timer)
  }, [fitKey, fitOnce, graph.nodes.length])

  const handleEngineStop = useCallback(() => {
    rememberPositions()
    fitOnce()
  }, [fitOnce, rememberPositions])

  useEffect(() => rememberPositions, [rememberPositions])

  /* ---- painting ---- */

  const paintNode = useCallback(
    (node: VaultNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const r = node.r
      const isFocus = node.id === focusId
      const isHovered = node.id === hoverId
      const related = !hoverId || isHovered || neighbours?.has(node.id) === true

      const colour = KIND_COLOR[node.kind]
      ctx.globalAlpha = related ? 1 : 0.1

      ctx.beginPath()
      ctx.arc(x, y, r, 0, TAU)
      if (node.stub) {
        // An unresolved link: hollow and faded, the graph's version of
        // Obsidian's dotted grey wikilink.
        ctx.globalAlpha *= 0.5
        ctx.lineWidth = 1.2 / scale
        ctx.strokeStyle = colour
        ctx.stroke()
      } else {
        ctx.fillStyle = colour
        ctx.fill()
      }

      if (isFocus) {
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(x, y, r + 3.2, 0, TAU)
        ctx.lineWidth = 2 / scale
        ctx.strokeStyle = ACCENT
        ctx.stroke()
      } else if (isHovered) {
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(x, y, r + 2.2, 0, TAU)
        ctx.lineWidth = 1.5 / scale
        ctx.strokeStyle = TEXT
        ctx.stroke()
      }

      const named =
        isHovered ||
        isFocus ||
        (related && (scale > LABEL_ZOOM || (hubIds.has(node.id) && scale > HUB_LABEL_ZOOM)))

      if (named) {
        const fontSize = LABEL_PX / scale
        const text = elide(node.label)
        ctx.font = `${fontSize}px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const top = y + r + fontSize * 0.45

        if (isHovered || isFocus) {
          // A backdrop so the name stays readable over a dense patch of edges.
          const width = ctx.measureText(text).width
          ctx.globalAlpha = 0.82
          ctx.fillStyle = CANVAS_BG
          ctx.fillRect(
            x - width / 2 - fontSize * 0.3,
            top - fontSize * 0.15,
            width + fontSize * 0.6,
            fontSize * 1.3,
          )
        }

        ctx.globalAlpha = related ? 1 : 0.15
        ctx.fillStyle = isHovered || isFocus ? TEXT : TEXT_MUTED
        ctx.fillText(text, x, top)
      }

      ctx.globalAlpha = 1
    },
    [focusId, hoverId, neighbours, hubIds],
  )

  const paintPointerArea = useCallback(
    (node: VaultNode, colour: string, ctx: CanvasRenderingContext2D) => {
      // A slightly generous target: the small nodes are 4px across and nobody
      // should have to aim at that.
      ctx.fillStyle = colour
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, node.r + 2.5, 0, TAU)
      ctx.fill()
    },
    [],
  )

  const linkColour = useCallback(
    (link: VaultLink) => {
      if (!hoverId) return LINK_COLOR[link.type]
      const touches = endpointId(link.source) === hoverId || endpointId(link.target) === hoverId
      return touches ? LINK_HIGHLIGHT : LINK_DIMMED
    },
    [hoverId],
  )

  const linkWidth = useCallback(
    (link: VaultLink) => {
      if (!hoverId) return 0.5
      const touches = endpointId(link.source) === hoverId || endpointId(link.target) === hoverId
      return touches ? 1.5 : 0.4
    },
    [hoverId],
  )

  /* ---- interaction ---- */

  const handleNodeClick = useCallback(
    (node: VaultNode) => {
      if (node.kind === 'Note' && node.slug) {
        onOpenNote?.(node.slug)
        return
      }
      // Tags, people, sources and folders are not pages, so clicking one
      // centres on it instead of doing nothing — the cluster around a tag is
      // usually what you were reaching for.
      fgRef.current?.centerAt(node.x, node.y, ms(400))
    },
    [onOpenNote, ms],
  )

  const ready = size.width > 0 && size.height > 0

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 [&_canvas]:!block"
      role="application"
      aria-label={`Vault graph: ${data.nodes.length} items connected by ${data.edges.length} links. Hover a dot to see its name, click a note to open it.`}
    >
      {ready ? (
        <ForceGraph2D
          ref={attachGraph}
          graphData={graph}
          width={size.width}
          height={size.height}
          backgroundColor={CANVAS_BG}
          nodeRelSize={1}
          nodeVal={(node) => node.r}
          /* Canvas draws every label; the library's HTML tooltip would only
             duplicate it, one frame behind the cursor. */
          nodeLabel={() => ''}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={paintPointerArea}
          linkColor={linkColour}
          linkWidth={linkWidth}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          /* The simulation settles and stops rather than spinning forever —
             1666 edges animating in perpetuity would keep a laptop fan on. */
          warmupTicks={data.nodes.length > 160 ? 40 : 12}
          cooldownTicks={data.nodes.length > 160 ? 220 : 140}
          d3VelocityDecay={0.32}
          enableNodeDrag
          onEngineStop={handleEngineStop}
          onNodeHover={(node) => setHoverId(node ? node.id : null)}
          onNodeClick={handleNodeClick}
          onNodeDragEnd={rememberPositions}
          onBackgroundClick={() => setHoverId(null)}
        />
      ) : (
        <CanvasSkeleton />
      )}
    </div>
  )
}

export default GraphCanvas
