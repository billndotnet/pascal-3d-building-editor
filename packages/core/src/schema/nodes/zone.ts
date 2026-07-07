import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const ZoneNode = BaseNode.extend({
  id: objectId('zone'),
  type: nodeType('zone'),
  name: z.string(),
  // Polygon boundary - array of [x, z] coordinates defining the zone
  polygon: z.array(z.tuple([z.number(), z.number()])),
  // Visual styling
  color: z.string().default('#3b82f6'), // Default blue
  // Volume: extrusion height in metres. Unset ⇒ the renderer's default wall
  // height (backward-compatible). Set it to give the zone a real 3D volume
  // (e.g. an RV bay's compartment depth).
  height: z.number().min(0).optional(),
  // Base elevation offset in metres from the level plane the volume rises from.
  elevation: z.number().default(0),
  // How the volume renders: 'walls' (upward-fading perimeter, the default look)
  // or 'prism' (a solid translucent box with a top cap).
  volumeStyle: z.enum(['walls', 'prism']).default('walls'),
  metadata: z.json().optional().default({}),
}).describe(
  dedent`
  Zone schema - a polygon zone attached to a level
  - object: "zone"
  - id: zone id
  - levelId: level this zone is attached to
  - name: zone name
  - polygon: array of [x, z] points defining the zone boundary
  - color: hex color for visual styling
  - height: extrusion height in metres (unset = default wall height)
  - elevation: base offset in metres the volume rises from
  - volumeStyle: walls (fading) | prism (solid box)
  - metadata: zone metadata (optional)
  `,
)

export type ZoneNode = z.infer<typeof ZoneNode>
