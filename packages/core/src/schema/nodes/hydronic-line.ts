import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

/**
 * Hydronic line — an insulated coolant tube run, the fluid-side sibling of
 * `lineset`. Carries a single tube (not a suction+liquid pair) of glycol/water
 * for radiant and radiator heat. Path coordinates are level-local meters.
 *
 * `role` places the run on the hydronic network: `transport` (the fore/aft
 * loop backbone), `zone-branch` (a valved feed to a radiant floor zone), or
 * `radiator-branch` (a feed to a passive radiator).
 */
export const HydronicLineNode = BaseNode.extend({
  id: objectId('hydronic-line'),
  type: nodeType('hydronic-line'),
  // Polyline path in level-local meters. Minimum two points.
  path: z.array(z.tuple([z.number(), z.number(), z.number()])).min(2),
  // Nominal tube inside diameter in inches (PEX / hydronic hose). Residential
  // 1/2"–1"; transport loops up to 1-1/4".
  diameter: z.number().min(0.25).max(2).default(0.5),
  // Whether the line wears a foam insulation jacket.
  insulated: z.boolean().default(true),
  // Role on the hydronic network.
  role: z.enum(['transport', 'zone-branch', 'radiator-branch']).default('transport'),
}).describe(
  dedent`
  Hydronic line - insulated coolant tube as a polyline of 3D points.
  - path: list of [x, y, z] points in level-local meters (min 2)
  - diameter: nominal tube ID in inches (1/2"-1-1/4" typical)
  - insulated: whether the line wears a foam jacket
  - role: transport (loop backbone) | zone-branch (radiant floor feed) | radiator-branch
  `,
)
export type HydronicLineNode = z.infer<typeof HydronicLineNode>
export type HydronicLineNodeId = HydronicLineNode['id']
