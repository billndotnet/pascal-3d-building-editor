import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

/** A port on a hydronic component, in the component's LOCAL frame (origin at
 *  base center, before yaw/position). direction points outward. */
export type LocalPortSpec = {
  id: string
  position: [number, number, number]
  direction: [number, number, number]
}

export type HydronicComponentKind = 'pump' | 'zone-valve' | 'manifold' | 'radiator'

type KindConfig = {
  label: string
  /** [width, height, depth] in metres. */
  size: [number, number, number]
  color: string
  ports: LocalPortSpec[]
}

// In/out ports on the ±X faces at mid-height; manifold adds branch outs on +Z.
const inOut = (w: number, h: number): LocalPortSpec[] => [
  { id: 'in', position: [-w / 2, h / 2, 0], direction: [-1, 0, 0] },
  { id: 'out', position: [w / 2, h / 2, 0], direction: [1, 0, 0] },
]

export const HYDRONIC_KINDS: Record<HydronicComponentKind, KindConfig> = {
  pump: { label: 'Circulator pump', size: [0.14, 0.13, 0.12], color: '#b08d57', ports: inOut(0.14, 0.13) },
  'zone-valve': { label: 'Zone valve', size: [0.1, 0.11, 0.08], color: '#c9a227', ports: inOut(0.1, 0.11) },
  manifold: {
    label: 'Manifold',
    size: [0.42, 0.1, 0.08],
    color: '#9aa0a6',
    ports: [
      { id: 'in', position: [-0.21, 0.05, 0], direction: [-1, 0, 0] },
      { id: 'out-1', position: [-0.12, 0.05, 0.04], direction: [0, 0, 1] },
      { id: 'out-2', position: [0, 0.05, 0.04], direction: [0, 0, 1] },
      { id: 'out-3', position: [0.12, 0.05, 0.04], direction: [0, 0, 1] },
    ],
  },
  radiator: { label: 'Radiator', size: [0.6, 0.32, 0.06], color: '#e8e8ea', ports: inOut(0.6, 0.1) },
}

export const HydronicComponentNode = BaseNode.extend({
  id: objectId('hydronic-component'),
  type: nodeType('hydronic-component'),
  // Level-local metres, y at the base.
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  // Yaw in radians.
  rotation: z.number().default(0),
  kind: z.enum(['pump', 'zone-valve', 'manifold', 'radiator']).default('pump'),
  // Nominal connection tube diameter in inches (advertised by the ports).
  diameter: z.number().min(0.25).max(2).default(0.5),
  // Optional free label shown on the component.
  label: z.string().optional(),
}).describe(
  dedent`
  Hydronic component - a placed box with typed hydronic ports.
  - position: [x, y, z] level-local metres, y at the base
  - rotation: yaw radians
  - kind: pump | zone-valve | manifold | radiator (drives size / color / ports)
  - diameter: connection tube size in inches
  `,
)
export type HydronicComponentNode = z.infer<typeof HydronicComponentNode>
export type HydronicComponentNodeId = HydronicComponentNode['id']
