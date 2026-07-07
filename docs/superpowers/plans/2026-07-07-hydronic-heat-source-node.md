# Hydronic Heat-Source Node (boiler + electric heater) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a bespoke `hydronic-heat-source` node — the two richer hydronic heat producers, `kind: 'boiler'` (Primus LP boiler) and `kind: 'electric-heater'` (inline tankless electric) — each a placed box with hydronic **supply + return** ports plus a **fuel/power feed** port (propane for the boiler, AC for the heater) and a rating (BTU / kW).

**Architecture:** A dedicated bespoke node type (not the generic `hydronic-component`), because these carry **multi-system ports** (hydronic + propane/ac) and a rating field. It mirrors the just-built `hydronic-component` node package almost exactly; the only structural difference is a per-port `system` in the kind config and a `rating` field. One package, two kinds.

**Tech Stack:** TypeScript, Zod, Three.js, the registry `NodeDefinition` model, React (placement tool), `bun:test`.

## Global Constraints

- Toolchain **bun only**: `PATH="$HOME/.bun/bin:$PATH"`, tests `bun test <file>`, typecheck `bun --bun x turbo run build --filter=<pkg>`.
- **Primary reference to mirror:** the freshly-built `packages/nodes/src/hydronic-component/` package and `packages/core/src/schema/nodes/hydronic-component.ts`. This node is structurally the same; read those first.
- Ports carry a per-port `system`: `'hydronic'` for supply/return, `'propane'` (boiler feed) or `'ac'` (heater feed). `NodePort.system` is an open string — no enum change needed. Nothing snaps to the propane/ac ports yet (those run nodes come later); the ports are there for future connection.
- Placed-node conventions identical to `hydronic-component`: `position` (level-local m, y at base), `rotation` (yaw), capabilities `movable {axes:['x','z'],gridSnap:true}` / `rotatable {axes:['y'],snapAngles:[Math.PI/4]}` / `floorPlaced`.
- 2D↔3D parity: geometry + floorplan + placement tool land together.

---

## File Structure

- `packages/core/src/schema/nodes/hydronic-heat-source.ts` **(create)** — schema + `HEAT_SOURCE_KINDS`.
- `packages/core/src/schema/{types.ts,index.ts}`, `packages/core/src/events/bus.ts` **(modify)** — register (mirror `hydronic-component`).
- `packages/nodes/src/hydronic-heat-source/{schema,ports,geometry,floorplan,parametrics,tool,definition,index}.ts(x)` **(create)**.
- `packages/nodes/src/index.ts` **(modify)** — register.
- `packages/editor/src/components/ui/action-menu/structure-tools.tsx`, `packages/editor/src/store/use-editor.tsx` (StructureTool union), `apps/editor/components/build-tab.tsx` **(modify)** — palettes.

---

## Task 1: Core schema + kind config + registration

**Files:**
- Create: `packages/core/src/schema/nodes/hydronic-heat-source.ts`
- Modify: `packages/core/src/schema/types.ts`, `packages/core/src/events/bus.ts`, `packages/core/src/schema/index.ts`
- Test: `packages/core/src/schema/nodes/hydronic-heat-source.test.ts`

**Interfaces:** Produces `HydronicHeatSourceNode`, `HydronicHeatSourceNodeId`, `HydronicHeatSourceKind` (`'boiler'|'electric-heater'`), and `HEAT_SOURCE_KINDS`. Discriminator `type:'hydronic-heat-source'`, id prefix `hydronic-heat-source_`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/schema/nodes/hydronic-heat-source.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { AnyNode } from '../types'
import { HEAT_SOURCE_KINDS, HydronicHeatSourceNode } from './hydronic-heat-source'

const base = {
  object: 'node', id: 'hydronic-heat-source_1', type: 'hydronic-heat-source',
  parentId: null, visible: true, metadata: {},
  position: [0, 0, 0], rotation: 0, kind: 'boiler',
}

describe('HydronicHeatSourceNode', () => {
  test('applies defaults', () => {
    const n = HydronicHeatSourceNode.parse(base)
    expect(n.kind).toBe('boiler')
    expect(typeof n.rating).toBe('number')
    expect(n.diameter).toBe(0.5)
  })
  test('rejects unknown kind', () => {
    expect(HydronicHeatSourceNode.safeParse({ ...base, kind: 'x' }).success).toBe(false)
  })
  test('is a member of AnyNode', () => {
    expect(AnyNode.safeParse(HydronicHeatSourceNode.parse(base)).success).toBe(true)
  })
  test('boiler has a propane feed port, heater an ac feed port; both have hydronic supply/return', () => {
    const sys = (k: 'boiler' | 'electric-heater') =>
      HEAT_SOURCE_KINDS[k].ports.map((p) => p.system).sort()
    expect(sys('boiler')).toEqual(['hydronic', 'hydronic', 'propane'])
    expect(sys('electric-heater')).toEqual(['ac', 'hydronic', 'hydronic'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/core/src/schema/nodes/hydronic-heat-source.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema + kind config**

Create `packages/core/src/schema/nodes/hydronic-heat-source.ts`:

```typescript
import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

/** A typed port in the component's LOCAL frame (origin at base center). */
export type HeatSourcePortSpec = {
  id: string
  position: [number, number, number]
  direction: [number, number, number]
  system: 'hydronic' | 'propane' | 'ac'
}

export type HydronicHeatSourceKind = 'boiler' | 'electric-heater'

type KindConfig = {
  label: string
  size: [number, number, number] // [w, h, d] metres
  color: string
  ratingUnit: 'BTU' | 'kW'
  ratingDefault: number
  ports: HeatSourcePortSpec[]
}

// Hydronic supply (+X) / return (−X) at mid-height; a fuel/power feed on the
// −Z face. Boiler burns LP (propane feed); the inline heater runs on AC.
export const HEAT_SOURCE_KINDS: Record<HydronicHeatSourceKind, KindConfig> = {
  boiler: {
    label: 'LP boiler',
    size: [0.42, 0.42, 0.32],
    color: '#8a5a3b',
    ratingUnit: 'BTU',
    ratingDefault: 50000,
    ports: [
      { id: 'supply', position: [0.21, 0.21, 0], direction: [1, 0, 0], system: 'hydronic' },
      { id: 'return', position: [-0.21, 0.21, 0], direction: [-1, 0, 0], system: 'hydronic' },
      { id: 'fuel', position: [0, 0.1, -0.16], direction: [0, 0, -1], system: 'propane' },
    ],
  },
  'electric-heater': {
    label: 'Inline electric heater',
    size: [0.26, 0.16, 0.12],
    color: '#5b6b7a',
    ratingUnit: 'kW',
    ratingDefault: 6,
    ports: [
      { id: 'in', position: [-0.13, 0.08, 0], direction: [-1, 0, 0], system: 'hydronic' },
      { id: 'out', position: [0.13, 0.08, 0], direction: [1, 0, 0], system: 'hydronic' },
      { id: 'power', position: [0, 0.08, -0.06], direction: [0, 0, -1], system: 'ac' },
    ],
  },
}

export const HydronicHeatSourceNode = BaseNode.extend({
  id: objectId('hydronic-heat-source'),
  type: nodeType('hydronic-heat-source'),
  position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  rotation: z.number().default(0),
  kind: z.enum(['boiler', 'electric-heater']).default('boiler'),
  // Heat output. Interpreted as BTU (boiler) or kW (electric heater) per kind.
  rating: z.number().min(0).default(50000),
  // Hydronic connection tube diameter in inches (advertised by supply/return).
  diameter: z.number().min(0.25).max(2).default(0.5),
  label: z.string().optional(),
}).describe(
  dedent`
  Hydronic heat source - a boiler or inline electric heater that adds heat to
  the loop.
  - position: [x,y,z] level-local metres, y at base
  - rotation: yaw radians
  - kind: boiler (LP) | electric-heater (AC)
  - rating: heat output (BTU for boiler, kW for electric heater)
  - diameter: hydronic connection size in inches
  `,
)
export type HydronicHeatSourceNode = z.infer<typeof HydronicHeatSourceNode>
export type HydronicHeatSourceNodeId = HydronicHeatSourceNode['id']
```

- [ ] **Step 4: Register across the core enumerations**

Mirror `hydronic-component` exactly: add `HydronicHeatSourceNode` to the `AnyNode` union (`types.ts`); add `hydronic-heat-source` at every per-type site in `events/bus.ts` (import, `XEvent` alias, `EditorEvents` intersection); add the barrel exports (`HydronicHeatSourceNode`, `HEAT_SOURCE_KINDS`, `HydronicHeatSourceKind`, `HeatSourcePortSpec`) to `schema/index.ts` — value-export block like `HYDRONIC_KINDS`.

- [ ] **Step 5: Run tests + typecheck**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/core/src/schema/nodes/hydronic-heat-source.test.ts && bun --bun x turbo run build --filter=@pascal-app/core`
Expected: PASS (4 tests), core typechecks.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schema/nodes/hydronic-heat-source.ts packages/core/src/schema/nodes/hydronic-heat-source.test.ts packages/core/src/schema/types.ts packages/core/src/events/bus.ts packages/core/src/schema/index.ts
git commit -m "feat(core): add HydronicHeatSourceNode schema (boiler + electric heater)"
```

---

## Task 2: Geometry + ports

**Files:** Create `packages/nodes/src/hydronic-heat-source/{schema,ports,geometry}.ts`; Test `.../geometry.test.ts`.

**Interfaces:** `getHydronicHeatSourcePorts(node): NodePort[]` — the kind's ports transformed by yaw+position, each carrying its own `system` and `diameter: node.diameter`; `buildHydronicHeatSourceGeometry(node): Group` — a box sized/colored per kind, base at y=0, positioned + yaw-rotated.

- [ ] **Step 1: Write the failing test**

Create `packages/nodes/src/hydronic-heat-source/geometry.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { Group } from 'three'
import { buildHydronicHeatSourceGeometry } from './geometry'
import { getHydronicHeatSourcePorts } from './ports'

const node = (over: Record<string, unknown> = {}) =>
  ({
    object: 'node', id: 'hydronic-heat-source_1', type: 'hydronic-heat-source',
    parentId: null, visible: true, metadata: {},
    position: [1, 0, 2], rotation: 0, kind: 'boiler', rating: 50000, diameter: 0.5,
    ...over,
  }) as never

describe('hydronic-heat-source geometry + ports', () => {
  test('geometry is a Group with a body', () => {
    const g = buildHydronicHeatSourceGeometry(node())
    expect(g).toBeInstanceOf(Group)
    expect(g.children.length).toBeGreaterThanOrEqual(1)
  })
  test('boiler ports: hydronic supply/return + a propane fuel port, at world position', () => {
    const ports = getHydronicHeatSourcePorts(node())
    expect(ports.map((p) => p.id).sort()).toEqual(['fuel', 'return', 'supply'])
    expect(ports.find((p) => p.id === 'fuel')!.system).toBe('propane')
    expect(ports.find((p) => p.id === 'supply')!.position[0]).toBeGreaterThan(1)
  })
  test('electric-heater fuel feed is ac', () => {
    const ports = getHydronicHeatSourcePorts(node({ kind: 'electric-heater' }))
    expect(ports.find((p) => p.id === 'power')!.system).toBe('ac')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-heat-source/geometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3–5: schema re-export, ports, geometry**

Mirror `packages/nodes/src/hydronic-component/{schema,ports,geometry}.ts` exactly, with these deltas:
- `schema.ts`: `export { HEAT_SOURCE_KINDS, HydronicHeatSourceNode } from '@pascal-app/core/schema'`.
- `ports.ts`: same yaw+position transform (`applyAxisAngle`/or the cos/sin form used by hydronic-component), but read `system: p.system` from each port spec (NOT a hardcoded `'hydronic'`), and `diameter: node.diameter`. Use `HEAT_SOURCE_KINDS[node.kind].ports`.
- `geometry.ts`: box from `HEAT_SOURCE_KINDS[node.kind].size`/`.color`, base lifted to y=0, positioned + yaw-rotated — identical to `buildHydronicComponentGeometry` with the kind table swapped.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-heat-source/geometry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/nodes/src/hydronic-heat-source/schema.ts packages/nodes/src/hydronic-heat-source/ports.ts packages/nodes/src/hydronic-heat-source/geometry.ts packages/nodes/src/hydronic-heat-source/geometry.test.ts
git commit -m "feat(nodes): hydronic-heat-source geometry + multi-system ports"
```

---

## Task 3: Floorplan + parametrics

**Files:** Create `packages/nodes/src/hydronic-heat-source/{floorplan,parametrics}.ts`; Test `.../floorplan.test.ts`.

**Interfaces:** `buildHydronicHeatSourceFloorplan(node, ctx)` — rotated footprint rect (from `HEAT_SOURCE_KINDS[kind].size`) + a dot per port + label (`node.label ?? HEAT_SOURCE_KINDS[kind].label`) + a `move-handle` when selected; `hydronicHeatSourceParametrics` — kind enum (segmented) + `rating` number + `diameter` number.

- [ ] **Step 1: Write the failing test**

Create `packages/nodes/src/hydronic-heat-source/floorplan.test.ts` (mirror the hydronic-component floorplan test, swapping type/kind to `hydronic-heat-source`/`boiler`; assert `?.kind === 'group'` for unselected and that a selected node's JSON contains `"move-handle"`).

- [ ] **Step 2: Run to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-heat-source/floorplan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: floorplan + parametrics**

Mirror `packages/nodes/src/hydronic-component/{floorplan,parametrics}.ts` with the kind table swapped to `HEAT_SOURCE_KINDS` and ports from `getHydronicHeatSourcePorts`. Parametrics:

```typescript
import type { ParametricDescriptor } from '@pascal-app/core'
import type { HydronicHeatSourceNode } from './schema'

export const hydronicHeatSourceParametrics: ParametricDescriptor<HydronicHeatSourceNode> = {
  groups: [
    {
      label: 'Heat source',
      fields: [
        { key: 'kind', kind: 'enum', display: 'segmented', options: ['boiler', 'electric-heater'] },
        { key: 'rating', kind: 'number', min: 0, max: 200000, step: 1000 },
        { key: 'diameter', kind: 'number', unit: 'in', min: 0.25, max: 2, step: 0.125 },
      ],
    },
  ],
}
```

Confirm the `enum`/`number` field shapes against `ParametricDescriptor` (same as `hydronic-component`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-heat-source/floorplan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/nodes/src/hydronic-heat-source/floorplan.ts packages/nodes/src/hydronic-heat-source/parametrics.ts packages/nodes/src/hydronic-heat-source/floorplan.test.ts
git commit -m "feat(nodes): hydronic-heat-source floorplan + parametrics"
```

---

## Task 4: Placement tool + definition + palettes

**Files:** Create `packages/nodes/src/hydronic-heat-source/{tool.tsx,definition.ts,index.ts}`; Modify `packages/nodes/src/index.ts`, `packages/editor/src/components/ui/action-menu/structure-tools.tsx`, `packages/editor/src/store/use-editor.tsx`, `apps/editor/components/build-tab.tsx`; Test `.../definition.test.ts`.

**Interfaces:** `hydronicHeatSourceDefinition: NodeDefinition<typeof HydronicHeatSourceNode>` registered in `builtinPlugin`; reachable from both editor palettes.

- [ ] **Step 1–4:** Mirror `packages/nodes/src/hydronic-component/{tool.tsx,definition.ts,index.ts}` and its Task-4 wiring exactly, swapping identifiers to `hydronic-heat-source` / `HydronicHeatSourceNode` / `hydronicHeatSourceDefinition` / `buildHydronicHeatSourceGeometry` / `getHydronicHeatSourcePorts` / `hydronicHeatSourceParametrics` / `HEAT_SOURCE_KINDS`. Definition `floorPlaced.footprint` from `HEAT_SOURCE_KINDS[node.kind].size`; `geometryKey` over `[kind, rating, diameter, position, rotation]`; presentation label 'Hydronic heat source', a free `paletteOrder`.

Write `definition.test.ts` mirroring hydronic-component's (kind `'hydronic-heat-source'`, `floorPlaced` defined, geometry returns a Group, ports include a non-hydronic feed, floorplan + tool wired).

- [ ] **Step 5: Register + palettes**

- `packages/nodes/src/index.ts`: import + add to `builtinPlugin.nodes`.
- `packages/editor/src/store/use-editor.tsx`: add `'hydronic-heat-source'` to the `StructureTool` union.
- `packages/editor/src/components/ui/action-menu/structure-tools.tsx`: add `{ id: 'hydronic-heat-source', iconSrc: '/icons/HVAC.webp', label: 'Heat Source' }`.
- `apps/editor/components/build-tab.tsx`: add `'hydronic-heat-source'` to `MepToolKind` and a `MEP_ITEMS` entry `{ id: 'hydronic-heat-source', label: 'Heat Source', iconSrc: '/icons/HVAC.webp', kind: 'hydronic-heat-source' }`. Confirm nothing else special-cases the kind (generic fallbacks pick it up, like hydronic-component).

- [ ] **Step 6: Run tests + typecheck**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-heat-source/ && bun --bun x turbo run build --filter=@pascal-app/core --filter=@pascal-app/nodes --filter=editor && bun --bun x turbo run check-types --filter=@pascal-app/editor --filter=editor`
Expected: hydronic-heat-source tests PASS; core + nodes + editor build/typecheck PASS. (Next's build skips type errors, so the explicit `check-types` matters.)

- [ ] **Step 7: Commit**

```bash
git add packages/nodes/src/hydronic-heat-source/tool.tsx packages/nodes/src/hydronic-heat-source/definition.ts packages/nodes/src/hydronic-heat-source/index.ts packages/nodes/src/hydronic-heat-source/definition.test.ts packages/nodes/src/index.ts packages/editor/src/components/ui/action-menu/structure-tools.tsx packages/editor/src/store/use-editor.tsx apps/editor/components/build-tab.tsx
git commit -m "feat(nodes): register hydronic-heat-source placement tool + palettes"
```

---

## Self-Review

**1. Spec coverage:** delivers the two bespoke hydronic heat producers (LP boiler, inline electric heater) with hydronic supply/return + a propane/ac feed port + a rating — the hybrid plan's bespoke half. Only `radiant-zone` remains for the hydronic subsystem. ✓

**2. Placeholder scan:** full code for the novel core parts (schema, HEAT_SOURCE_KINDS, tests); view/tool/definition files mirror the just-built `hydronic-component` with an explicit, small delta list (per-port `system`, `rating`, 2 kinds). ✓

**3. Type consistency:** `HydronicHeatSourceNode` fields, `HEAT_SOURCE_KINDS`, and the `getHydronicHeatSourcePorts` / `buildHydronicHeatSourceGeometry` / `buildHydronicHeatSourceFloorplan` / `hydronicHeatSourceParametrics` / `hydronicHeatSourceDefinition` names are consistent across tasks. Ports carry per-spec `system` (hydronic/propane/ac). ✓
