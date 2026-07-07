import type { NodeDefinition } from '@pascal-app/core'
import { buildHydronicComponentFloorplan } from './floorplan'
import { buildHydronicComponentGeometry } from './geometry'
import { hydronicComponentParametrics } from './parametrics'
import { getHydronicComponentPorts } from './ports'
import { HYDRONIC_KINDS, HydronicComponentNode } from './schema'

/**
 * Hydronic component — the generic placed unit for the four simple
 * hydronic parts (pump / zone valve / manifold / radiator). A single box
 * body sized and colored by `kind`; its in/out (or manifold branch) ports
 * are where hydronic line runs land, the fluid-side sibling of
 * `hvac-equipment`'s supply/return collars.
 *
 * Composition: `def.geometry` only. Yaw-only rotation, so the editor's
 * default R-rotate works on a selected unit without custom actions.
 */
export const hydronicComponentDefinition: NodeDefinition<typeof HydronicComponentNode> = {
  kind: 'hydronic-component',
  schemaVersion: 1,
  schema: HydronicComponentNode,
  category: 'utility',
  distributionRole: 'equipment',
  snapProfile: 'item',

  defaults: () => ({
    object: 'node',
    parentId: null,
    visible: true,
    metadata: {},
    position: [0, 0, 0],
    rotation: 0,
    kind: 'pump',
    diameter: 0.5,
  }),

  capabilities: {
    selectable: { hitVolume: 'bbox' },
    movable: { axes: ['x', 'z'], gridSnap: true },
    rotatable: { axes: ['y'], snapAngles: [Math.PI / 4] },
    duplicable: true,
    deletable: true,
    floorPlaced: {
      footprint: (node) => {
        const n = node as HydronicComponentNode
        const size = HYDRONIC_KINDS[n.kind].size
        return {
          dimensions: size,
          rotation: [0, n.rotation, 0],
        }
      },
    },
  },

  parametrics: hydronicComponentParametrics,

  geometry: buildHydronicComponentGeometry,
  geometryKey: (n) => JSON.stringify([n.kind, n.diameter, n.position, n.rotation]),

  ports: getHydronicComponentPorts,

  floorplan: buildHydronicComponentFloorplan,

  tool: () => import('./tool'),
  toolHints: [
    { key: 'Click', label: 'Place component' },
    { key: 'R / T', label: 'Rotate ±45°' },
    { key: 'Esc', label: 'Exit' },
  ],

  presentation: {
    label: 'Hydronic component',
    description:
      'Pump, zone valve, manifold, or radiator — hydronic line runs connect to its ports.',
    icon: { kind: 'url', src: '/icons/HVAC.webp' },
    paletteSection: 'structure',
    paletteOrder: 97,
  },

  mcp: {
    description:
      'A hydronic component: pump | zone-valve | manifold | radiator. Each kind has a fixed size, color, and set of in/out (or manifold branch) hydronic ports that a hydronic-line run connects to. Position is level-local meters; rotation is yaw radians; diameter is the nominal connection tube size in inches.',
  },
}
