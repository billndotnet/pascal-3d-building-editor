import type { NodeDefinition } from '@pascal-app/core'
import { buildHydronicLineGeometry } from './geometry'
import { HydronicLineNode } from './schema'

/**
 * Hydronic line — an insulated coolant tube run (fluid-side sibling of the
 * refrigerant lineset). Geometry-only for now: the interactive draw tool and
 * 2D floorplan land together in a later slice (2D↔3D parity).
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
