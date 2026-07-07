# Hydronic Component Node (generic box components) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a generic `hydronic-component` node — a placed, labeled box with typed `hydronic` ports whose size/ports/appearance are driven by a `kind` field — covering the four simple hydronic components (circulator **pump**, **zone-valve**, **manifold**, **radiator**), placeable and connectable to `hydronic-line` runs.

**Architecture:** One node package mirroring the placed-component pattern of `packages/nodes/src/hvac-equipment/` (schema + geometry + floorplan + ports + parametrics + placement tool + definition + index), but simpler: a plain box sized/colored per `kind`, with a per-kind port list. A single click-place tool and a single definition serve all four kinds (that's the point of the generic approach). The bespoke `hydronic-boiler` / `hydronic-heater-electric` and the `radiant-zone` area node are separate follow-up plans.

**Tech Stack:** TypeScript, Zod, Three.js, the registry `NodeDefinition` model, React (placement tool), `bun:test`.

## Global Constraints

- Toolchain **bun only**: `PATH="$HOME/.bun/bin:$PATH"`, tests `bun test <file>`, typecheck `bun --bun x turbo run build --filter=<pkg>`.
- **Reference to mirror:** `packages/nodes/src/hvac-equipment/` (all files) and `packages/core/src/schema/nodes/hvac-equipment.ts`. Read them before writing the view/tool files.
- Ports use `system: 'hydronic'` (matches the `hydronic-line` ports + `HYDRONIC_PORT_SYSTEMS`). Port `diameter` is inches (0.5 default).
- Placed-node conventions: `position` is level-local metres with y at the base; `rotation` is yaw radians. Capabilities include `movable {axes:['x','z'], gridSnap:true}`, `rotatable {axes:['y'], snapAngles:[Math.PI/4]}`, `floorPlaced {footprint}`.
- 2D↔3D parity: the geometry (3D), floorplan (2D), and placement tool land together in this plan.
- Reuse the shared move-handle for 2D body-move (emit `{ kind: 'move-handle', point }` when selected — as zones/items do).

---

## File Structure

- `packages/core/src/schema/nodes/hydronic-component.ts` **(create)** — `HydronicComponentNode` schema + the `HYDRONIC_KINDS` config table.
- `packages/core/src/schema/types.ts` **(modify)** — add to `AnyNode` union.
- `packages/core/src/events/bus.ts` **(modify)** — add the kind to the per-type enumeration (follow the `hydronic-line` precedent).
- `packages/core/src/schema/index.ts` **(modify)** — barrel export.
- `packages/nodes/src/hydronic-component/{schema,ports,geometry,floorplan,parametrics,tool,definition,index}.ts(x)` **(create)**.
- `packages/nodes/src/index.ts` **(modify)** — register `hydronicComponentDefinition`.
- `packages/editor/src/components/ui/action-menu/structure-tools.tsx` **(modify)** — palette entry.
- `apps/editor/components/build-tab.tsx` **(modify)** — MEP palette entry (`MepToolKind` union + `MEP_ITEMS`).

---

## Task 1: Core schema + kind config + registration

**Files:**
- Create: `packages/core/src/schema/nodes/hydronic-component.ts`
- Modify: `packages/core/src/schema/types.ts`, `packages/core/src/events/bus.ts`, `packages/core/src/schema/index.ts`
- Test: `packages/core/src/schema/nodes/hydronic-component.test.ts`

**Interfaces:**
- Produces: `HydronicComponentNode` (Zod + type), `HydronicComponentNodeId`, `HydronicComponentKind`, and `HYDRONIC_KINDS` (a `Record<kind, { label; size:[w,h,d]; color; ports: LocalPortSpec[] }>`). Discriminator `type:'hydronic-component'`, id prefix `hydronic-component_`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/schema/nodes/hydronic-component.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { AnyNode } from '../types'
import { HYDRONIC_KINDS, HydronicComponentNode } from './hydronic-component'

const base = {
  object: 'node', id: 'hydronic-component_1', type: 'hydronic-component',
  parentId: null, visible: true, metadata: {},
  position: [0, 0, 0], rotation: 0, kind: 'pump',
}

describe('HydronicComponentNode', () => {
  test('applies defaults', () => {
    const n = HydronicComponentNode.parse(base)
    expect(n.kind).toBe('pump')
    expect(n.diameter).toBe(0.5)
  })
  test('rejects an unknown kind', () => {
    expect(HydronicComponentNode.safeParse({ ...base, kind: 'bogus' }).success).toBe(false)
  })
  test('is a member of AnyNode', () => {
    expect(AnyNode.safeParse(HydronicComponentNode.parse(base)).success).toBe(true)
  })
  test('every kind has a config with a positive size and >=1 port', () => {
    for (const cfg of Object.values(HYDRONIC_KINDS)) {
      expect(cfg.size.every((d) => d > 0)).toBe(true)
      expect(cfg.ports.length).toBeGreaterThanOrEqual(1)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/core/src/schema/nodes/hydronic-component.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema + kind config**

Create `packages/core/src/schema/nodes/hydronic-component.ts`:

```typescript
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
```

- [ ] **Step 4: Register across the core enumerations**

Mirror exactly what was done for `hydronic-line` (verify against that precedent):
- `packages/core/src/schema/types.ts`: import `HydronicComponentNode` and add it to the `AnyNode` discriminated union.
- `packages/core/src/events/bus.ts`: add `hydronic-component` at all the per-type enumeration sites where `hydronic-line` appears (import, the `XEvent` alias, the `EditorEvents` intersection).
- `packages/core/src/schema/index.ts`: add the barrel export (alphabetical).

- [ ] **Step 5: Run tests + typecheck**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/core/src/schema/nodes/hydronic-component.test.ts && bun --bun x turbo run build --filter=@pascal-app/core`
Expected: PASS (4 tests), core typechecks.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schema/nodes/hydronic-component.ts packages/core/src/schema/nodes/hydronic-component.test.ts packages/core/src/schema/types.ts packages/core/src/events/bus.ts packages/core/src/schema/index.ts
git commit -m "feat(core): add HydronicComponentNode schema + kind config"
```

---

## Task 2: Geometry + ports

**Files:**
- Create: `packages/nodes/src/hydronic-component/schema.ts`, `packages/nodes/src/hydronic-component/ports.ts`, `packages/nodes/src/hydronic-component/geometry.ts`
- Test: `packages/nodes/src/hydronic-component/geometry.test.ts`

**Interfaces:**
- Consumes: `HydronicComponentNode`, `HYDRONIC_KINDS`, `LocalPortSpec` (Task 1).
- Produces: local `schema.ts` re-export; `getHydronicComponentPorts(node): NodePort[]` — the kind's local ports transformed by yaw + position, each `system:'hydronic'`, `diameter: node.diameter`; `buildHydronicComponentGeometry(node): Group` — a box sized `HYDRONIC_KINDS[kind].size`, colored `.color`, translated so y=0 is the base, rotated by yaw, positioned at `node.position`.

- [ ] **Step 1: Write the failing test**

Create `packages/nodes/src/hydronic-component/geometry.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { Group } from 'three'
import { buildHydronicComponentGeometry } from './geometry'
import { getHydronicComponentPorts } from './ports'

const node = (over: Record<string, unknown> = {}) =>
  ({
    object: 'node', id: 'hydronic-component_1', type: 'hydronic-component',
    parentId: null, visible: true, metadata: {},
    position: [1, 0, 2], rotation: 0, kind: 'pump', diameter: 0.5,
    ...over,
  }) as never

describe('hydronic-component geometry + ports', () => {
  test('geometry is a Group with a body mesh', () => {
    const g = buildHydronicComponentGeometry(node())
    expect(g).toBeInstanceOf(Group)
    expect(g.children.length).toBeGreaterThanOrEqual(1)
  })
  test('pump exposes in + out hydronic ports at world position', () => {
    const ports = getHydronicComponentPorts(node())
    expect(ports.map((p) => p.id).sort()).toEqual(['in', 'out'])
    expect(ports.every((p) => p.system === 'hydronic')).toBe(true)
    // ports are offset from the node position along X (rotation 0)
    expect(ports.find((p) => p.id === 'out')!.position[0]).toBeGreaterThan(1)
  })
  test('manifold exposes 4 ports', () => {
    expect(getHydronicComponentPorts(node({ kind: 'manifold' }))).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-component/geometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Local schema re-export**

Create `packages/nodes/src/hydronic-component/schema.ts`:

```typescript
export { HYDRONIC_KINDS, HydronicComponentNode } from '@pascal-app/core/schema'
```

If `HYDRONIC_KINDS` is not re-exported from `@pascal-app/core/schema`, import it from wherever `@pascal-app/core` surfaces schema values (check how `hvac-equipment/schema.ts` re-exports), and adjust.

- [ ] **Step 4: Ports**

Create `packages/nodes/src/hydronic-component/ports.ts` — transform the kind's local ports by yaw + position (mirror the transform in `hvac-equipment/ports.ts`, but simpler — no collar shapes):

```typescript
import type { NodePort } from '@pascal-app/core'
import { Vector3 } from 'three'
import { HYDRONIC_KINDS } from './schema'
import type { HydronicComponentNode } from './schema'

export function getHydronicComponentPorts(node: HydronicComponentNode): NodePort[] {
  const cfg = HYDRONIC_KINDS[node.kind]
  const [px, py, pz] = node.position
  const cos = Math.cos(node.rotation)
  const sin = Math.sin(node.rotation)
  // +yaw about world Y maps local (x,z) → (x cos + z sin, −x sin + z cos).
  const toWorld = (v: [number, number, number]): [number, number, number] => [
    px + v[0] * cos + v[2] * sin,
    py + v[1],
    pz - v[0] * sin + v[2] * cos,
  ]
  const dir = (v: [number, number, number]): [number, number, number] => {
    const w = new Vector3(v[0] * cos + v[2] * sin, v[1], -v[0] * sin + v[2] * cos)
    const len = w.length()
    return len < 1e-9 ? [1, 0, 0] : [w.x / len, w.y / len, w.z / len]
  }
  return cfg.ports.map((p) => ({
    id: p.id,
    position: toWorld(p.position),
    direction: dir(p.direction),
    diameter: node.diameter,
    system: 'hydronic',
  }))
}
```

If `NodePort` requires additional fields, match the shape used in `hvac-equipment/ports.ts` (it returns `NodePort`s via `getHvacEquipmentPorts`).

- [ ] **Step 5: Geometry**

Create `packages/nodes/src/hydronic-component/geometry.ts` — a box per kind (mirror the simpler parts of `hvac-equipment/geometry.ts`):

```typescript
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { HYDRONIC_KINDS } from './schema'
import type { HydronicComponentNode } from './schema'

/**
 * Box body for a hydronic component, sized and colored by `kind`. Origin at the
 * base center; y=0 is the base. Positioned + yaw-rotated to the node's frame.
 */
export function buildHydronicComponentGeometry(node: HydronicComponentNode): Group {
  const group = new Group()
  const cfg = HYDRONIC_KINDS[node.kind]
  const [w, h, d] = cfg.size
  const body = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshStandardMaterial({ color: cfg.color, metalness: 0.3, roughness: 0.6 }),
  )
  body.name = `hydronic-${node.kind}-body`
  body.position.set(0, h / 2, 0) // lift so y=0 is the base
  group.add(body)
  group.position.set(node.position[0], node.position[1], node.position[2])
  group.rotation.y = node.rotation
  return group
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-component/geometry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/nodes/src/hydronic-component/schema.ts packages/nodes/src/hydronic-component/ports.ts packages/nodes/src/hydronic-component/geometry.ts packages/nodes/src/hydronic-component/geometry.test.ts
git commit -m "feat(nodes): hydronic-component geometry + hydronic ports"
```

---

## Task 3: Floorplan + parametrics

**Files:**
- Create: `packages/nodes/src/hydronic-component/floorplan.ts`, `packages/nodes/src/hydronic-component/parametrics.ts`
- Test: `packages/nodes/src/hydronic-component/floorplan.test.ts`

**Interfaces:**
- Consumes: Task 1–2.
- Produces: `buildHydronicComponentFloorplan(node, ctx): FloorplanGeometry | null` — the yaw-rotated footprint rectangle (from `HYDRONIC_KINDS[kind].size` w×d) + a dot per port + the kind label + a `move-handle` when selected; `hydronicComponentParametrics` (kind enum via `{ kind:'enum', display:'segmented' }`, diameter number, label text).

- [ ] **Step 1: Write the failing test**

Create `packages/nodes/src/hydronic-component/floorplan.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { buildHydronicComponentFloorplan } from './floorplan'

const node = (over: Record<string, unknown> = {}) =>
  ({
    object: 'node', id: 'hydronic-component_1', type: 'hydronic-component',
    parentId: null, visible: true, metadata: {},
    position: [0, 0, 0], rotation: 0, kind: 'pump', diameter: 0.5, ...over,
  }) as never

describe('buildHydronicComponentFloorplan', () => {
  test('returns a group', () => {
    expect(buildHydronicComponentFloorplan(node(), { viewState: undefined } as never)?.kind).toBe('group')
  })
  test('emits a move-handle when selected', () => {
    const g = buildHydronicComponentFloorplan(node(), { viewState: { selected: true } } as never)
    expect(JSON.stringify(g)).toContain('"move-handle"')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-component/floorplan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write floorplan + parametrics**

Create `floorplan.ts` mirroring `hvac-equipment/floorplan.ts` (read it): a rotated rectangle from `HYDRONIC_KINDS[kind].size` (`width` = size[0], `depth` = size[2]) using the same `corner(lx,lz)` yaw transform, a small circle at each port's plan position (from `getHydronicComponentPorts`), a `text` label (`node.label ?? HYDRONIC_KINDS[kind].label`) at the center, and — when `ctx.viewState?.selected` — a `{ kind: 'move-handle', point: [cx, cz] }`. Return `{ kind: 'group', children }`, or `null` if the kind config is missing.

Create `parametrics.ts` mirroring `hvac-equipment/parametrics.ts`:

```typescript
import type { ParametricDescriptor } from '@pascal-app/core'
import type { HydronicComponentNode } from './schema'

export const hydronicComponentParametrics: ParametricDescriptor<HydronicComponentNode> = {
  groups: [
    {
      label: 'Component',
      fields: [
        {
          key: 'kind',
          kind: 'enum',
          display: 'segmented',
          options: ['pump', 'zone-valve', 'manifold', 'radiator'],
        },
        { key: 'diameter', kind: 'number', unit: 'in', min: 0.25, max: 2, step: 0.125 },
      ],
    },
  ],
}
```

Confirm the `enum` field shape against the `ParametricDescriptor` type (same as the hydronic-line `role` field used) and adjust if needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-component/floorplan.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/nodes/src/hydronic-component/floorplan.ts packages/nodes/src/hydronic-component/parametrics.ts packages/nodes/src/hydronic-component/floorplan.test.ts
git commit -m "feat(nodes): hydronic-component floorplan + parametrics"
```

---

## Task 4: Placement tool + definition + palette

**Files:**
- Create: `packages/nodes/src/hydronic-component/tool.tsx`, `packages/nodes/src/hydronic-component/definition.ts`, `packages/nodes/src/hydronic-component/index.ts`
- Modify: `packages/nodes/src/index.ts`, `packages/editor/src/components/ui/action-menu/structure-tools.tsx`, `apps/editor/components/build-tab.tsx`
- Test: `packages/nodes/src/hydronic-component/definition.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `hydronicComponentDefinition: NodeDefinition<typeof HydronicComponentNode>` registered in `builtinPlugin`; reachable from both editor palettes.

- [ ] **Step 1: Write the failing test**

Create `packages/nodes/src/hydronic-component/definition.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { Group } from 'three'
import { hydronicComponentDefinition } from './definition'

describe('hydronicComponentDefinition', () => {
  test('kind + placed capabilities', () => {
    expect(hydronicComponentDefinition.kind).toBe('hydronic-component')
    expect(hydronicComponentDefinition.capabilities.floorPlaced).toBeDefined()
  })
  test('geometry, ports, floorplan, tool all wired', () => {
    const n = { ...hydronicComponentDefinition.defaults(), id: 'hydronic-component_1', type: 'hydronic-component' } as never
    expect(hydronicComponentDefinition.geometry?.(n)).toBeInstanceOf(Group)
    expect((hydronicComponentDefinition.ports?.(n) ?? []).every((p) => p.system === 'hydronic')).toBe(true)
    expect(typeof hydronicComponentDefinition.floorplan).toBe('function')
    expect(hydronicComponentDefinition.tool).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-component/definition.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Placement tool**

Create `tool.tsx` mirroring `packages/nodes/src/hvac-equipment/tool.tsx` (read it) with substitutions: `HvacEquipmentNode`→`HydronicComponentNode`, `hvacEquipmentDefinition`→`hydronicComponentDefinition`, `buildHvacEquipmentGeometry`→`buildHydronicComponentGeometry`, preview name = the kind label. The ghost-follows-cursor + R/T rotate + click-to-place behavior is identical; keep it verbatim aside from the substitutions.

- [ ] **Step 4: Definition + index**

Create `definition.ts` mirroring `hvac-equipment/definition.ts`: `kind:'hydronic-component'`, `category:'utility'`, `distributionRole:'equipment'`, `snapProfile:'item'`, `defaults` (position [0,0,0], rotation 0, kind 'pump', diameter 0.5), `capabilities` (selectable bbox, movable {axes:['x','z'],gridSnap:true}, rotatable {axes:['y'],snapAngles:[Math.PI/4]}, duplicable, deletable, floorPlaced with a footprint from `HYDRONIC_KINDS[node.kind].size`), `geometry: buildHydronicComponentGeometry`, `geometryKey: (n)=>JSON.stringify([n.kind,n.diameter,n.position,n.rotation])`, `ports: getHydronicComponentPorts`, `floorplan: buildHydronicComponentFloorplan`, `parametrics`, `tool: ()=>import('./tool')`, `presentation` (label 'Hydronic component', paletteSection 'structure', an existing icon), `mcp` description. Read the hvac-equipment definition to match the `NodeDefinition` shape exactly.

Create `index.ts`:

```typescript
export { hydronicComponentDefinition } from './definition'
export { buildHydronicComponentGeometry } from './geometry'
export { HydronicComponentNode } from './schema'
```

- [ ] **Step 5: Register + palettes**

- `packages/nodes/src/index.ts`: import `hydronicComponentDefinition` and add `hydronicComponentDefinition as unknown as AnyNodeDefinition,` to `builtinPlugin.nodes`.
- `packages/editor/src/components/ui/action-menu/structure-tools.tsx`: add `{ id: 'hydronic-component', iconSrc: '/icons/HVAC.webp', label: 'Hydronic Part' }` (reuse an existing icon).
- `apps/editor/components/build-tab.tsx`: add `'hydronic-component'` to the `MepToolKind` union and a `MEP_ITEMS` entry `{ id: 'hydronic-component', label: 'Hydronic Part', iconSrc: '/icons/HVAC.webp', kind: 'hydronic-component' }` — mirror the `hydronic-line` entries added earlier.

- [ ] **Step 6: Run tests + typecheck**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-component/ && bun --bun x turbo run build --filter=@pascal-app/core --filter=@pascal-app/nodes --filter=editor`
Expected: hydronic-component tests PASS; core + nodes + editor app typecheck/build PASS.

- [ ] **Step 7: Manual/live check (controller)**

The controller drives the app: open a scene, MEP palette → "Hydronic Part", place one, switch `kind` in the inspector, and confirm hydronic-line runs snap onto its ports. Record the outcome or note that a human/live check is required.

- [ ] **Step 8: Commit**

```bash
git add packages/nodes/src/hydronic-component/tool.tsx packages/nodes/src/hydronic-component/definition.ts packages/nodes/src/hydronic-component/index.ts packages/nodes/src/hydronic-component/definition.test.ts packages/nodes/src/index.ts packages/editor/src/components/ui/action-menu/structure-tools.tsx apps/editor/components/build-tab.tsx
git commit -m "feat(nodes): register hydronic-component placement tool + palettes"
```

---

## Self-Review

**1. Spec coverage:** delivers the four simple hydronic components (pump, zone-valve, manifold, radiator) as a placeable, connectable generic node — the hybrid plan's generic half. Bespoke `hydronic-boiler` / `hydronic-heater-electric` and `radiant-zone` remain follow-up plans (per the hydronic subsystem spec). ✓

**2. Placeholder scan:** full code for the novel parts (schema, kind config, ports, geometry, parametrics, tests); geometry/floorplan/tool/definition mirror named `hvac-equipment` files with explicit deltas (a codebase-sanctioned pattern). Conditional checks (enum field shape, NodePort shape, HYDRONIC_KINDS re-export) name the file to verify. ✓

**3. Type consistency:** `HydronicComponentNode` fields (`position`/`rotation`/`kind`/`diameter`/`label`), `HYDRONIC_KINDS`, `getHydronicComponentPorts`, `buildHydronicComponentGeometry`, `buildHydronicComponentFloorplan`, `hydronicComponentParametrics`, `hydronicComponentDefinition` names are consistent across producing and consuming tasks. Ports emit `system:'hydronic'` everywhere. ✓
