# Hydronic-Line Node (renderable slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bespoke `hydronic-line` run node — an insulated coolant tube drawn as a 3D polyline — that renders in the viewer and can be created programmatically/via MCP, establishing the shared fluid-tube pattern the RV hydronic and other fluid systems build on.

**Architecture:** Mirror the existing `lineset` node (a refrigerant tube run), which is the closest analog. `hydronic-line` differs by carrying a **single insulated tube** (not a suction+liquid pair) plus a **`role`** tag (`transport` / `zone-branch` / `radiator-branch`) and a **`hydronic`** port system. A node kind is a folder under `packages/nodes/src/<kind>/` plus a Zod schema in `packages/core`, registered in the `AnyNode` union and the `builtinPlugin`. This slice ships geometry + registration (renderable, programmatically creatable); the interactive draw tool + 2D floorplan (which must land together for 2D↔3D parity) and the hydronic components are deferred to follow-up plans.

**Tech Stack:** TypeScript, Zod (`@pascal-app/core/schema`), Three.js (geometry), the registry `NodeDefinition` model (`@pascal-app/core`), `bun:test`.

## Global Constraints

- Toolchain is **bun only**: `PATH="$HOME/.bun/bin:$PATH"`, tests `bun test <file>`, typecheck via `bun --bun x turbo run build --filter=<pkg>`.
- No new node types beyond `hydronic-line`. Reuse existing shared helpers.
- **Reference implementation to mirror:** `packages/nodes/src/lineset/` (definition, geometry, schema) and `packages/core/src/schema/nodes/lineset.ts`. Read these before writing.
- Layer boundaries: the Zod schema lives in `packages/core`; geometry/definition live in `packages/nodes`. `packages/core` must not import Three.js.
- Deferred (NOT in this slice): interactive `tool`/`move-tool`/`selection`, 2D `floorplan`, `parametrics`. Do not add a draw tool here — that triggers the 2D↔3D parity requirement and belongs in its own plan.

---

## File Structure

- `packages/core/src/schema/nodes/hydronic-line.ts` **(create)** — the `HydronicLineNode` Zod schema.
- `packages/core/src/schema/types.ts` **(modify)** — add `HydronicLineNode` to the `AnyNode` discriminated union.
- `packages/nodes/src/hydronic-line/schema.ts` **(create)** — re-export `HydronicLineNode` (mirrors `lineset/schema.ts`).
- `packages/nodes/src/hydronic-line/geometry.ts` **(create)** — the single insulated-tube geometry builder.
- `packages/nodes/src/hydronic-line/definition.ts` **(create)** — the registry `NodeDefinition` (geometry + ports + presentation + mcp; no interactive tool this slice).
- `packages/nodes/src/hydronic-line/index.ts` **(create)** — re-exports.
- `packages/nodes/src/index.ts` **(modify)** — import + register `hydronicLineDefinition` in `builtinPlugin.nodes`.

---

## Task 1: Core schema + AnyNode union

**Files:**
- Create: `packages/core/src/schema/nodes/hydronic-line.ts`
- Modify: `packages/core/src/schema/types.ts`
- Test: `packages/core/src/schema/nodes/hydronic-line.test.ts`

**Interfaces:**
- Produces: `HydronicLineNode` (Zod schema + inferred type), `HydronicLineNodeId`. Discriminator `type: 'hydronic-line'`, id prefix `hydronic-line_`. Fields: `path` (min 2 `[x,y,z]`), `diameter` (in, default 0.5), `insulated` (bool, default true), `role` (`'transport'|'zone-branch'|'radiator-branch'`, default `'transport'`).

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/schema/nodes/hydronic-line.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { AnyNode } from '../types'
import { HydronicLineNode } from './hydronic-line'

const base = {
  object: 'node',
  id: 'hydronic-line_1',
  type: 'hydronic-line',
  parentId: null,
  visible: true,
  metadata: {},
  path: [
    [0, 0, 0],
    [2, 0, 0],
  ],
}

describe('HydronicLineNode', () => {
  test('applies defaults', () => {
    const n = HydronicLineNode.parse(base)
    expect(n.diameter).toBe(0.5)
    expect(n.insulated).toBe(true)
    expect(n.role).toBe('transport')
  })

  test('rejects a single-point path', () => {
    expect(HydronicLineNode.safeParse({ ...base, path: [[0, 0, 0]] }).success).toBe(false)
  })

  test('rejects an unknown role', () => {
    expect(HydronicLineNode.safeParse({ ...base, role: 'bogus' }).success).toBe(false)
  })

  test('is a member of the AnyNode union', () => {
    expect(AnyNode.safeParse(HydronicLineNode.parse(base)).success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/core/src/schema/nodes/hydronic-line.test.ts`
Expected: FAIL — `Cannot find module './hydronic-line'`.

- [ ] **Step 3: Write the schema**

Create `packages/core/src/schema/nodes/hydronic-line.ts` (mirrors `pipe-segment.ts` / `lineset.ts` conventions):

```typescript
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
```

- [ ] **Step 4: Register in the AnyNode union**

In `packages/core/src/schema/types.ts`, add the import beside the other node imports (alphabetical, near `HvacEquipmentNode`):

```typescript
import { HydronicLineNode } from './nodes/hydronic-line'
```

and add `HydronicLineNode,` to the `z.discriminatedUnion('type', [ … ])` array (place it near the other MEP run nodes, e.g. after `LinesetNode`).

- [ ] **Step 5: Check the event/type registry**

Read `packages/core/src/events/bus.ts`. If it enumerates node types in a way that a new kind must join (a union, map, or switch keyed by node `type`), add `hydronic-line` following the `lineset`/`pipe-segment` precedent. If it does not (no per-type enumeration that would drop `hydronic-line`), make no change and note this in the report.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/core/src/schema/nodes/hydronic-line.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck core**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun --bun x turbo run build --filter=@pascal-app/core`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/schema/nodes/hydronic-line.ts packages/core/src/schema/nodes/hydronic-line.test.ts packages/core/src/schema/types.ts
git commit -m "feat(core): add HydronicLineNode schema"
```

---

## Task 2: Fluid-tube geometry builder

**Files:**
- Create: `packages/nodes/src/hydronic-line/schema.ts`
- Create: `packages/nodes/src/hydronic-line/geometry.ts`
- Test: `packages/nodes/src/hydronic-line/geometry.test.ts`

**Interfaces:**
- Consumes: `HydronicLineNode` (Task 1).
- Produces: `export { HydronicLineNode } from '@pascal-app/core/schema'` in the local `schema.ts`; `buildHydronicLineGeometry(node: HydronicLineNode): Group` — a Three.js `Group` of tube segments (+ foam jacket when `insulated`) + spherical joint caps, mirroring `buildLinesetGeometry` but with one tube sized by `diameter`.

- [ ] **Step 1: Write the failing test**

Create `packages/nodes/src/hydronic-line/geometry.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { Group } from 'three'
import { buildHydronicLineGeometry } from './geometry'

const node = (over: Record<string, unknown> = {}) =>
  ({
    object: 'node',
    id: 'hydronic-line_1',
    type: 'hydronic-line',
    parentId: null,
    visible: true,
    metadata: {},
    path: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
    ],
    diameter: 0.5,
    insulated: true,
    role: 'transport',
  }) as never

describe('buildHydronicLineGeometry', () => {
  test('returns a Group with tube segments and joint caps', () => {
    const g = buildHydronicLineGeometry(node())
    expect(g).toBeInstanceOf(Group)
    // 2 tube segments + 2 jacket segments + 3 tube joints + 3 jacket joints
    expect(g.children.length).toBeGreaterThanOrEqual(8)
  })

  test('omits jacket meshes when not insulated', () => {
    const bare = buildHydronicLineGeometry(node({ insulated: false }))
    const insulated = buildHydronicLineGeometry(node({ insulated: true }))
    expect(bare.children.length).toBeLessThan(insulated.children.length)
  })

  test('empty group for a degenerate single-point path', () => {
    const g = buildHydronicLineGeometry(node({ path: [[0, 0, 0]] }))
    expect(g.children.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-line/geometry.test.ts`
Expected: FAIL — `Cannot find module './geometry'`.

- [ ] **Step 3: Write the local schema re-export**

Create `packages/nodes/src/hydronic-line/schema.ts` (mirrors `packages/nodes/src/lineset/schema.ts`):

```typescript
export { HydronicLineNode } from '@pascal-app/core/schema'
```

- [ ] **Step 4: Write the geometry builder**

Create `packages/nodes/src/hydronic-line/geometry.ts`. This mirrors `packages/nodes/src/lineset/geometry.ts` (read it first) but builds ONE tube sized by `node.diameter`, in a hydronic color:

```typescript
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three'
import { INCHES_TO_METERS } from '../duct-segment/geometry'
import type { HydronicLineNode } from './schema'

const RADIAL_SEGMENTS = 16

// Warm coolant-line tone (glycol/water hydronic), distinct from lineset copper.
const TUBE_COLOR = '#b45309'
// Light foam sleeve, matching the lineset jacket read.
const INSULATION_COLOR = '#e8e8ea'
const INSULATION_THICKNESS_M = 0.01

const UP = new Vector3(0, 1, 0)

function buildRun(
  start: Vector3,
  end: Vector3,
  radius: number,
  material: MeshStandardMaterial,
  name: string,
): Mesh | null {
  const dir = new Vector3().subVectors(end, start)
  const length = dir.length()
  if (length < 1e-6) return null
  dir.normalize()
  const mesh = new Mesh(
    new CylinderGeometry(radius, radius, length, RADIAL_SEGMENTS, 1, false),
    material,
  )
  mesh.name = name
  mesh.position.copy(start).addScaledVector(dir, length / 2)
  mesh.quaternion.setFromUnitVectors(UP, dir)
  return mesh
}

/**
 * Pure geometry builder for a hydronic line: a single insulated tube that
 * follows the node path centerline. Mirrors the lineset builder but with one
 * tube sized by `diameter`. Spheres cap every path point so turns read as
 * continuous pipe. Coordinates are level-local meters.
 */
export function buildHydronicLineGeometry(node: HydronicLineNode): Group {
  const group = new Group()
  if (node.path.length < 2) return group

  const tubeR = (node.diameter * INCHES_TO_METERS) / 2
  const jacketR = node.insulated ? tubeR + INSULATION_THICKNESS_M : tubeR

  const tubeMat = new MeshStandardMaterial({ color: TUBE_COLOR, metalness: 0.3, roughness: 0.5 })
  const insulationMat = new MeshStandardMaterial({
    color: INSULATION_COLOR,
    metalness: 0.1,
    roughness: 0.9,
  })

  const points = node.path.map(([x, y, z]) => new Vector3(x, y, z))

  for (let i = 0; i < points.length - 1; i++) {
    const tube = buildRun(points[i]!, points[i + 1]!, tubeR, tubeMat, `hydronic-tube-${i}`)
    if (tube) group.add(tube)
    if (node.insulated) {
      const jacket = buildRun(points[i]!, points[i + 1]!, jacketR, insulationMat, `hydronic-jacket-${i}`)
      if (jacket) group.add(jacket)
    }
  }

  for (let i = 0; i < points.length; i++) {
    const joint = new Mesh(new SphereGeometry(tubeR, RADIAL_SEGMENTS, 10), tubeMat)
    joint.name = `hydronic-tube-joint-${i}`
    joint.position.copy(points[i] as Vector3)
    group.add(joint)
    if (node.insulated) {
      const jJoint = new Mesh(new SphereGeometry(jacketR, RADIAL_SEGMENTS, 10), insulationMat)
      jJoint.name = `hydronic-jacket-joint-${i}`
      jJoint.position.copy(points[i] as Vector3)
      group.add(jJoint)
    }
  }

  return group
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-line/geometry.test.ts`
Expected: PASS (3 tests). If `INCHES_TO_METERS` is not exported from `../duct-segment/geometry`, read that file and import the constant from wherever it is defined (mirror how `lineset/geometry.ts` imports it).

- [ ] **Step 6: Commit**

```bash
git add packages/nodes/src/hydronic-line/schema.ts packages/nodes/src/hydronic-line/geometry.ts packages/nodes/src/hydronic-line/geometry.test.ts
git commit -m "feat(nodes): add hydronic-line fluid-tube geometry"
```

---

## Task 3: Registry definition + registration

**Files:**
- Create: `packages/nodes/src/hydronic-line/definition.ts`
- Create: `packages/nodes/src/hydronic-line/index.ts`
- Modify: `packages/nodes/src/index.ts`
- Test: `packages/nodes/src/hydronic-line/definition.test.ts`

**Interfaces:**
- Consumes: `buildHydronicLineGeometry` (Task 2), `HydronicLineNode` (Task 1).
- Produces: `hydronicLineDefinition: NodeDefinition<typeof HydronicLineNode>` with `kind: 'hydronic-line'`; registered in `builtinPlugin.nodes`. Exposes `geometry`, `ports` (system `hydronic`), `presentation`, `mcp`. No interactive `tool`/`floorplan`/`parametrics` this slice.

- [ ] **Step 1: Write the failing test**

Create `packages/nodes/src/hydronic-line/definition.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { Group } from 'three'
import { hydronicLineDefinition } from './definition'

describe('hydronicLineDefinition', () => {
  test('declares the hydronic-line kind with a run role', () => {
    expect(hydronicLineDefinition.kind).toBe('hydronic-line')
    expect(hydronicLineDefinition.distributionRole).toBe('run')
  })

  test('geometry builds a Group from defaults', () => {
    const node = { ...hydronicLineDefinition.defaults(), id: 'hydronic-line_1', type: 'hydronic-line' } as never
    expect(hydronicLineDefinition.geometry?.(node)).toBeInstanceOf(Group)
  })

  test('exposes typed hydronic ports at both ends', () => {
    const node = { ...hydronicLineDefinition.defaults(), id: 'hydronic-line_1', type: 'hydronic-line' } as never
    const ports = hydronicLineDefinition.ports?.(node) ?? []
    expect(ports).toHaveLength(2)
    expect(ports.every((p) => p.system === 'hydronic')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-line/definition.test.ts`
Expected: FAIL — `Cannot find module './definition'`.

- [ ] **Step 3: Write the definition**

Create `packages/nodes/src/hydronic-line/definition.ts`, mirroring `packages/nodes/src/lineset/definition.ts` but geometry-only (no interactive tool/floorplan/affordances/parametrics this slice). Read the lineset definition first to match the `NodeDefinition` shape exactly:

```typescript
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
    paletteSection: 'structure',
    paletteOrder: 94,
  },

  mcp: {
    description:
      'A hydronic line defined as a polyline: an insulated coolant tube (glycol/water) for radiant and radiator heat. role = transport | zone-branch | radiator-branch.',
  },
}
```

If the port `system` field is a closed enum that lacks `'hydronic'`, add `'hydronic'` to that enum where it is defined (search `packages/core/src/registry/types.ts` for the port `system` type and the `refrigerant`/`waste`/`vent` values) and note the change in the report. If `presentation` requires an `icon`, use the same shape lineset uses with an existing icon or omit if optional — confirm against the `NodeDefinition` type.

- [ ] **Step 4: Write the index re-exports**

Create `packages/nodes/src/hydronic-line/index.ts` (mirrors `lineset/index.ts`):

```typescript
export { hydronicLineDefinition } from './definition'
export { buildHydronicLineGeometry } from './geometry'
export { HydronicLineNode } from './schema'
```

- [ ] **Step 5: Register in the builtin plugin**

In `packages/nodes/src/index.ts`, add the import beside the others (alphabetical, near `hvacEquipmentDefinition`):

```typescript
import { hydronicLineDefinition } from './hydronic-line'
```

and add `hydronicLineDefinition as unknown as AnyNodeDefinition,` to the `builtinPlugin.nodes` array, near the other MEP run definitions (`linesetDefinition`, `pipeSegmentDefinition`).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-line/`
Expected: PASS (definition + geometry tests).

- [ ] **Step 7: Typecheck core + nodes**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun --bun x turbo run build --filter=@pascal-app/core --filter=@pascal-app/nodes`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/nodes/src/hydronic-line/definition.ts packages/nodes/src/hydronic-line/index.ts packages/nodes/src/hydronic-line/definition.test.ts packages/nodes/src/index.ts
git commit -m "feat(nodes): register hydronic-line node definition"
```

---

## Self-Review

**1. Spec coverage (hydronic subsystem spec → `hydronic-line` run):** the `hydronic-line` node with `role` (transport / zone-branch / radiator-branch) implements the run element of the hydronic subsystem spec. Components (boiler, electric heater, zone-valve, manifold, radiator, radiant-zone) and the interactive draw tool are explicitly deferred to follow-up plans. ✓

**2. Placeholder scan:** every code step contains complete code; commands show expected output. The three "if X, then adjust" notes (event registry, port-system enum, presentation icon) are concrete conditional instructions with a named file to check, not placeholders. ✓

**3. Type consistency:** `HydronicLineNode` fields (`path`, `diameter`, `insulated`, `role`) are identical across the schema, geometry, definition, and tests. `buildHydronicLineGeometry` and `hydronicLineDefinition` names match between producer and consumer tasks. Port `system` is `'hydronic'` in both the definition and its test. ✓
