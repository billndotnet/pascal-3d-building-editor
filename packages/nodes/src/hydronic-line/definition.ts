import type { NodeDefinition } from '@pascal-app/core'
import { createPathPointMoveAffordance } from '../shared/path-point-affordance'
import { buildHydronicLineFloorplan } from './floorplan'
import { buildHydronicLineGeometry } from './geometry'
import { hydronicLineParametrics } from './parametrics'
import { HydronicLineNode } from './schema'

/**
 * Hydronic line — an insulated coolant tube run (fluid-side sibling of the
 * refrigerant lineset). Same polyline model and draw tool as `lineset`, but
 * it snaps onto hydronic ports instead of refrigerant service ports.
 */
export const hydronicLineDefinition: NodeDefinition<typeof HydronicLineNode> = {
  kind: 'hydronic-line',
  schemaVersion: 1,
  schema: HydronicLineNode,
  category: 'utility',
  distributionRole: 'run',
  snapProfile: 'structural',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    path: [
      [0, 0, 0],
      [2, 0, 0],
    ],
    diameter: 0.5,
    insulated: true,
    role: 'transport',
  }),

  capabilities: {
    selectable: { hitVolume: 'bbox' },
    duplicable: true,
    deletable: true,
  },

  parametrics: hydronicLineParametrics,

  geometry: buildHydronicLineGeometry,
  geometryKey: (n) => JSON.stringify([n.path, n.diameter, n.insulated, n.role]),

  ports: (n) => {
    if (n.path.length < 2) return []
    const unit = (
      a: readonly [number, number, number],
      b: readonly [number, number, number],
    ): [number, number, number] => {
      const d: [number, number, number] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
      const len = Math.hypot(d[0], d[1], d[2])
      return len < 1e-9 ? [1, 0, 0] : [d[0] / len, d[1] / len, d[2] / len]
    }
    const first = n.path[0]!
    const second = n.path[1]!
    const last = n.path[n.path.length - 1]!
    const prev = n.path[n.path.length - 2]!
    return [
      { id: 'start', position: first, direction: unit(first, second), diameter: n.diameter, system: 'hydronic' },
      { id: 'end', position: last, direction: unit(last, prev), diameter: n.diameter, system: 'hydronic' },
    ]
  },

  floorplan: buildHydronicLineFloorplan,

  // 2D selection-time path-point handles — the floor-plan twin of the 3D
  // `affordanceTools.selection` handles. The builder emits an
  // `endpoint-handle` per path vertex; this drags the matching point.
  floorplanAffordances: {
    'move-path-point': createPathPointMoveAffordance('hydronic-line'),
  },

  // Selection-time path-point handles (drag to edit a committed run).
  // Editor-only UI, so it mounts via the editor's SelectionAffordanceManager
  // — not `def.system`, which the viewer package mounts for the read-only
  // route.
  affordanceTools: {
    selection: () => import('./selection'),
    // Ghost-preview duplicate / move (the hydronic sibling of lineset's
    // mover). Duplicate is pure drag-to-place: a translucent copy of the
    // run, wrapped in a footprint bounding box, follows the cursor and only
    // lands on the commit click — nothing is inserted into the scene before
    // that.
    move: () => import('./move-tool'),
  },

  tool: () => import('./tool'),
  toolHints: [
    { key: 'Click', label: 'Start hydronic line' },
    { key: 'Click again', label: 'Place it (locked to 45°)' },
    { key: 'Alt + drag', label: 'Go vertical ↕, click to place' },
    { key: 'Esc', label: 'Cancel start point' },
  ],

  presentation: {
    label: 'Hydronic line',
    description: 'Insulated coolant tube for hydronic / radiant heat, drawn as a polyline.',
    icon: { kind: 'url', src: '/icons/lineset.webp' },
    paletteSection: 'structure',
    paletteOrder: 94,
  },

  mcp: {
    description:
      'A hydronic line defined as a polyline: an insulated coolant tube (glycol/water) for radiant and radiator heat. role = transport | zone-branch | radiator-branch.',
  },
}
