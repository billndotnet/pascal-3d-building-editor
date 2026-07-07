import type { FloorplanGeometry, FloorplanPoint, GeometryContext } from '@pascal-app/core'
import { INCHES_TO_METERS } from '../duct-segment/geometry'
import { getHydronicComponentPorts } from './ports'
import { HYDRONIC_KINDS } from './schema'
import type { HydronicComponentNode } from './schema'

const BODY_STROKE = '#6b7280'
const PORT_COLOR = '#5a8ad4'

/**
 * Floor-plan footprint for a hydronic component: the body rectangle
 * (rotated by yaw) sized from `HYDRONIC_KINDS[kind].size`, a dot per
 * hydronic port, and the kind label at center. Selected → move handle.
 */
export function buildHydronicComponentFloorplan(
  node: HydronicComponentNode,
  ctx: GeometryContext,
): FloorplanGeometry | null {
  const cfg = HYDRONIC_KINDS[node.kind]
  if (!cfg) return null

  const [cx, , cz] = node.position
  const cos = Math.cos(node.rotation)
  const sin = Math.sin(node.rotation)
  const hw = cfg.size[0] / 2
  const hd = cfg.size[2] / 2
  // Local corner → plan, applying yaw. Plan x = world x, plan y = world z;
  // a +yaw about world Y maps local (x, z) to (x cos + z sin, -x sin + z cos).
  const corner = (lx: number, lz: number): FloorplanPoint => [
    cx + lx * cos + lz * sin,
    cz - lx * sin + lz * cos,
  ]
  const points: FloorplanPoint[] = [
    corner(-hw, -hd),
    corner(hw, -hd),
    corner(hw, hd),
    corner(-hw, hd),
  ]

  const view = ctx.viewState
  const palette = view?.palette
  const showSelectedChrome = (view?.selected || view?.highlighted) ?? false
  const stroke = showSelectedChrome && palette ? palette.selectedStroke : BODY_STROKE

  const children: FloorplanGeometry[] = [
    {
      kind: 'polygon',
      points,
      fill: cfg.color,
      stroke,
      strokeWidth: showSelectedChrome ? 0.03 : 0.02,
      opacity: 0.92,
    },
  ]

  for (const port of getHydronicComponentPorts(node)) {
    children.push({
      kind: 'circle',
      cx: port.position[0],
      cy: port.position[2],
      r: (port.diameter * INCHES_TO_METERS) / 2,
      fill: PORT_COLOR,
      opacity: 0.85,
    })
  }

  children.push({
    kind: 'text',
    x: cx,
    y: cz,
    text: node.label ?? cfg.label,
    fontSize: 0.1,
    textAnchor: 'middle',
    dominantBaseline: 'middle',
    upright: true,
  })

  if (showSelectedChrome) {
    children.push({ kind: 'move-handle', point: [cx, cz] })
  }

  return { kind: 'group', children }
}
