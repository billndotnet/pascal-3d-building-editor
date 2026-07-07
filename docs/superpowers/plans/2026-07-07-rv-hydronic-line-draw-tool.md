# Hydronic-Line Draw Tool (2D + 3D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `hydronic-line` interactively drawable and editable in both the 3D viewport and the 2D floorplan — click-to-route a polyline, snap onto hydronic ports, edit committed runs via path-point handles — completing the parity requirement the renderable slice deferred.

**Architecture:** Mirror the `lineset` node's interactive files. One `tool.tsx` serves both views (it consumes view-agnostic `grid:move`/`grid:click` events; the 2D floorplan overlay feeds it in plan view, and it renders its own 3D preview). `floorplan.ts` supplies the 2D shape. `parametrics.ts` drives the properties panel. `move-tool.tsx` + `selection.tsx` edit committed runs. Snapping uses a new `HYDRONIC_PORT_SYSTEMS` filter so hydronic runs mate only onto hydronic ports. The `definition.ts` is extended to expose all of these, and the editor palette gets an entry.

**Tech Stack:** TypeScript, React (`@react-three/fiber`/`drei`), Three.js, the registry `NodeDefinition` model, `bun:test`.

## Global Constraints

- Toolchain is **bun only**: `PATH="$HOME/.bun/bin:$PATH"`, tests `bun test <file>`, typecheck `bun --bun x turbo run build --filter=<pkg>`.
- **2D↔3D parity is mandatory** (repo rule): this slice lands the 3D tool AND the 2D floorplan together. Do not ship one without the other.
- **Reference implementation to mirror (read before writing):** `packages/nodes/src/lineset/{tool.tsx,move-tool.tsx,floorplan.ts,parametrics.ts,selection.tsx,definition.ts}`.
- Substitutions applied to every mirrored file: `LinesetNode` → `HydronicLineNode`; `linesetDefinition` → `hydronicLineDefinition`; kind string `'lineset'` → `'hydronic-line'`; `REFRIGERANT_PORT_SYSTEMS` → `HYDRONIC_PORT_SYSTEMS`; the suction/liquid diameter pair → the single `diameter`; copper color `#b06b3f` → hydronic `#b45309`.
- The node has no `suctionDiameter`/`liquidDiameter` — it has `diameter`. Any mirrored code referencing the pair must collapse to `diameter`.
- Do not add new behaviors beyond what `lineset` has (plus the `role` parametric field). YAGNI.

---

## File Structure

- `packages/nodes/src/shared/ports.ts` **(modify)** — add `HYDRONIC_PORT_SYSTEMS`.
- `packages/nodes/src/hydronic-line/floorplan.ts` **(create)** — 2D plan geometry (single-tube).
- `packages/nodes/src/hydronic-line/parametrics.ts` **(create)** — panel fields (diameter, insulated, role).
- `packages/nodes/src/hydronic-line/selection.tsx` **(create)** — selection affordance (factory reuse).
- `packages/nodes/src/hydronic-line/tool.tsx` **(create)** — the draw tool (mirror lineset).
- `packages/nodes/src/hydronic-line/move-tool.tsx` **(create)** — ghost move/duplicate (mirror lineset).
- `packages/nodes/src/hydronic-line/definition.ts` **(modify)** — wire parametrics/floorplan/affordances/tool/toolHints.
- `packages/editor/src/components/ui/action-menu/structure-tools.tsx` **(modify)** — palette entry.

---

## Task 1: 2D floorplan, parametrics, selection, and the hydronic port filter

**Files:**
- Modify: `packages/nodes/src/shared/ports.ts`
- Create: `packages/nodes/src/hydronic-line/floorplan.ts`
- Create: `packages/nodes/src/hydronic-line/parametrics.ts`
- Create: `packages/nodes/src/hydronic-line/selection.tsx`
- Test: `packages/nodes/src/hydronic-line/floorplan.test.ts`

**Interfaces:**
- Produces: `HYDRONIC_PORT_SYSTEMS: readonly ['hydronic']`; `buildHydronicLineFloorplan(node, ctx): FloorplanGeometry | null`; `hydronicLineParametrics: ParametricDescriptor<HydronicLineNode>`; a default-exported selection affordance.

- [ ] **Step 1: Add the hydronic port filter**

In `packages/nodes/src/shared/ports.ts`, beside `REFRIGERANT_PORT_SYSTEMS`:

```typescript
/** Hydronic-loop port system — what hydronic lines snap to. */
export const HYDRONIC_PORT_SYSTEMS = ['hydronic'] as const
```

- [ ] **Step 2: Write the failing floorplan test**

Create `packages/nodes/src/hydronic-line/floorplan.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { buildHydronicLineFloorplan } from './floorplan'

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
    ...over,
  }) as never

const ctx = { viewState: undefined } as never

describe('buildHydronicLineFloorplan', () => {
  test('returns a group with the run polylines for a multi-point path', () => {
    const g = buildHydronicLineFloorplan(node(), ctx)
    expect(g?.kind).toBe('group')
  })

  test('returns null for a degenerate single-point path', () => {
    expect(buildHydronicLineFloorplan(node({ path: [[0, 0, 0]] }), ctx)).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-line/floorplan.test.ts`
Expected: FAIL — `Cannot find module './floorplan'`.

- [ ] **Step 4: Write the floorplan (mirror `lineset/floorplan.ts`)**

Create `packages/nodes/src/hydronic-line/floorplan.ts`. Read `packages/nodes/src/lineset/floorplan.ts` and reproduce it with the single-`diameter` collapse:

```typescript
import type { FloorplanGeometry, FloorplanPoint, GeometryContext } from '@pascal-app/core'
import { INCHES_TO_METERS } from '../duct-segment/geometry'
import type { HydronicLineNode } from './schema'

const TUBE_LINE = '#b45309'
const BODY_COLOR = '#9ca3af'

/**
 * Floor-plan representation of a hydronic line: the path drawn at the tube's
 * real width with a dashed centerline. Vertical risers collapse to a point in
 * plan; consecutive duplicate plan points are dropped.
 */
export function buildHydronicLineFloorplan(
  node: HydronicLineNode,
  ctx: GeometryContext,
): FloorplanGeometry | null {
  if (node.path.length < 2) return null

  const points: FloorplanPoint[] = []
  const indexMap: number[] = []
  for (let i = 0; i < node.path.length; i++) {
    const [x, , z] = node.path[i]!
    const prev = points[points.length - 1]
    if (prev && Math.abs(prev[0] - x) < 1e-6 && Math.abs(prev[1] - z) < 1e-6) continue
    points.push([x, z])
    indexMap.push(i)
  }

  const widthM = node.diameter * INCHES_TO_METERS
  const view = ctx.viewState
  const palette = view?.palette
  const showSelectedChrome = (view?.selected || view?.highlighted) ?? false

  if (points.length < 2) {
    const p = points[0] ?? [node.path[0]![0], node.path[0]![2]]
    return {
      kind: 'circle',
      cx: p[0],
      cy: p[1],
      r: widthM,
      fill: BODY_COLOR,
      stroke: showSelectedChrome && palette ? palette.selectedStroke : TUBE_LINE,
      strokeWidth: 0.02,
      opacity: 0.9,
    }
  }

  const children: FloorplanGeometry[] = [
    {
      kind: 'polyline',
      points,
      stroke: showSelectedChrome && palette ? palette.selectedStroke : BODY_COLOR,
      strokeWidth: widthM * 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      opacity: showSelectedChrome ? 0.95 : 0.8,
    },
    {
      kind: 'polyline',
      points,
      stroke: TUBE_LINE,
      strokeWidth: 1.5,
      vectorEffect: 'non-scaling-stroke',
      strokeDasharray: '4 3',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      opacity: 0.9,
    },
  ]

  if (view?.selected) {
    for (let k = 0; k < points.length; k++) {
      children.push({
        kind: 'endpoint-handle',
        point: points[k]!,
        state: 'idle',
        affordance: 'move-path-point',
        payload: { pointIndex: indexMap[k]! },
      })
    }
  }

  return { kind: 'group', children }
}
```

- [ ] **Step 5: Write the parametrics**

Create `packages/nodes/src/hydronic-line/parametrics.ts`. Mirror `lineset/parametrics.ts`, with a `role` field. First **confirm the field kind for an enum** — read the `ParametricDescriptor` type (in `packages/core`) and how other nodes expose an enum field; if the field kind is not `'select'`, use the actual supported kind (e.g. `'enum'`/`'segmented'`) with the same options. If no enum field kind exists, omit the `role` group and note it in the report.

```typescript
import type { ParametricDescriptor } from '@pascal-app/core'
import type { HydronicLineNode } from './schema'

export const hydronicLineParametrics: ParametricDescriptor<HydronicLineNode> = {
  groups: [
    {
      label: 'Tube',
      fields: [{ key: 'diameter', kind: 'number', unit: 'in', min: 0.25, max: 2, step: 0.125 }],
    },
    {
      label: 'Insulation',
      fields: [{ key: 'insulated', kind: 'boolean' }],
    },
    {
      label: 'Role',
      fields: [
        {
          key: 'role',
          kind: 'select',
          options: [
            { value: 'transport', label: 'Transport loop' },
            { value: 'zone-branch', label: 'Zone branch' },
            { value: 'radiator-branch', label: 'Radiator branch' },
          ],
        },
      ],
    },
  ],
}
```

- [ ] **Step 6: Write the selection affordance**

Read `packages/nodes/src/lineset/selection.tsx` — it is a one-line factory reuse. Create `packages/nodes/src/hydronic-line/selection.tsx` the same way, for the `hydronic-line` kind:

```typescript
'use client'

import { createRefrigerantLineSelectionAffordance } from '../shared/refrigerant-line-selection'

export default createRefrigerantLineSelectionAffordance('hydronic-line')
```

If `createRefrigerantLineSelectionAffordance` references lineset-only fields (`suctionDiameter`/`liquidDiameter`) internally rather than being kind-generic, stop and report it — do not fork the factory without guidance.

- [ ] **Step 7: Run tests + typecheck**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-line/floorplan.test.ts && bun --bun x turbo run build --filter=@pascal-app/nodes`
Expected: floorplan tests PASS; nodes typecheck PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/nodes/src/shared/ports.ts packages/nodes/src/hydronic-line/floorplan.ts packages/nodes/src/hydronic-line/floorplan.test.ts packages/nodes/src/hydronic-line/parametrics.ts packages/nodes/src/hydronic-line/selection.tsx
git commit -m "feat(nodes): hydronic-line 2D floorplan, parametrics, selection, port filter"
```

---

## Task 2: The draw tool and move tool (3D + shared)

**Files:**
- Create: `packages/nodes/src/hydronic-line/tool.tsx`
- Create: `packages/nodes/src/hydronic-line/move-tool.tsx`

**Interfaces:**
- Consumes: `hydronicLineDefinition` (defaults), `HydronicLineNode`, `HYDRONIC_PORT_SYSTEMS` (Task 1).
- Produces: default-exported React tool components (`tool.tsx`, `move-tool.tsx`), imported lazily by the definition (Task 3).

- [ ] **Step 1: Write the draw tool (mirror `lineset/tool.tsx`)**

Read `packages/nodes/src/lineset/tool.tsx` in full, then create `packages/nodes/src/hydronic-line/tool.tsx` applying the global-constraints substitution list. Concretely:
- Import `HydronicLineNode`, `hydronicLineDefinition`, `HYDRONIC_PORT_SYSTEMS`.
- `findNearbyPort` collects ports with `{ systems: HYDRONIC_PORT_SYSTEMS }`.
- `commitSegment` parses a `HydronicLineNode` from `hydronicLineDefinition.defaults()` with `name: 'Hydronic line'` and `path: [start, end]`.
- `PREVIEW_COLOR = '#b45309'`.
- The `PreviewSegment` ghost radius uses the default `diameter` (0.5″): `const radius = (0.5 * 0.0254) / 2`.
- Everything else (snapping modes, Alt-vertical riser, dimension pill, cursor sphere, draft points) is reproduced unchanged.

- [ ] **Step 2: Write the move tool (mirror `lineset/move-tool.tsx`)**

Read `packages/nodes/src/lineset/move-tool.tsx` in full, then create `packages/nodes/src/hydronic-line/move-tool.tsx` applying the substitution list (`LinesetNode` → `HydronicLineNode`, kind `'lineset'` → `'hydronic-line'`, and any suction/liquid diameter reference → `diameter`). Keep the ghost/alignment behavior identical.

- [ ] **Step 3: Typecheck**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun --bun x turbo run build --filter=@pascal-app/nodes`
Expected: PASS. (These are interaction components with no unit test; correctness comes from faithfully mirroring the proven lineset tool + a clean typecheck. End-to-end drawing is verified in Task 3's manual check.)

- [ ] **Step 4: Commit**

```bash
git add packages/nodes/src/hydronic-line/tool.tsx packages/nodes/src/hydronic-line/move-tool.tsx
git commit -m "feat(nodes): hydronic-line draw + move tools"
```

---

## Task 3: Wire the definition and the editor palette

**Files:**
- Modify: `packages/nodes/src/hydronic-line/definition.ts`
- Modify: `packages/editor/src/components/ui/action-menu/structure-tools.tsx`
- Test: `packages/nodes/src/hydronic-line/definition.test.ts` (extend)

**Interfaces:**
- Consumes: everything from Tasks 1–2.
- Produces: a `hydronicLineDefinition` that exposes `parametrics`, `floorplan`, `floorplanAffordances`, `affordanceTools` (selection + move), `tool`, `toolHints`; a palette entry so the tool is reachable in the editor.

- [ ] **Step 1: Write the failing definition test (extend existing)**

Append to `packages/nodes/src/hydronic-line/definition.test.ts`:

```typescript
describe('hydronicLineDefinition interactive wiring', () => {
  test('exposes a 2D floorplan builder', () => {
    expect(typeof hydronicLineDefinition.floorplan).toBe('function')
  })
  test('exposes parametrics', () => {
    expect(hydronicLineDefinition.parametrics).toBeDefined()
  })
  test('registers the move-path-point floorplan affordance', () => {
    expect(hydronicLineDefinition.floorplanAffordances?.['move-path-point']).toBeDefined()
  })
  test('provides a draw tool and selection/move affordance tools', () => {
    expect(hydronicLineDefinition.tool).toBeDefined()
    expect(hydronicLineDefinition.affordanceTools?.selection).toBeDefined()
    expect(hydronicLineDefinition.affordanceTools?.move).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-line/definition.test.ts`
Expected: FAIL — the four new assertions fail (fields undefined).

- [ ] **Step 3: Extend the definition (mirror `lineset/definition.ts`)**

In `packages/nodes/src/hydronic-line/definition.ts`, add the imports and fields, mirroring `lineset/definition.ts`:

```typescript
import { createPathPointMoveAffordance } from '../shared/path-point-affordance'
import { buildHydronicLineFloorplan } from './floorplan'
import { hydronicLineParametrics } from './parametrics'
```

Add these fields to the `hydronicLineDefinition` object (place them the same way lineset does):

```typescript
  parametrics: hydronicLineParametrics,

  floorplan: buildHydronicLineFloorplan,
  floorplanAffordances: {
    'move-path-point': createPathPointMoveAffordance('hydronic-line'),
  },

  affordanceTools: {
    selection: () => import('./selection'),
    move: () => import('./move-tool'),
  },

  tool: () => import('./tool'),
  toolHints: [
    { key: 'Click', label: 'Start hydronic line' },
    { key: 'Click again', label: 'Place it (locked to 45°)' },
    { key: 'Alt + drag', label: 'Go vertical ↕, click to place' },
    { key: 'Esc', label: 'Cancel start point' },
  ],
```

- [ ] **Step 4: Add the editor palette entry**

In `packages/editor/src/components/ui/action-menu/structure-tools.tsx`, add to the tool array (after the `liquid-line` entry):

```typescript
  { id: 'hydronic-line', iconSrc: '/icons/lineset.webp', label: 'Hydronic Line' },
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun test packages/nodes/src/hydronic-line/ && bun --bun x turbo run build --filter=@pascal-app/nodes --filter=@pascal-app/editor`
Expected: hydronic-line tests PASS (geometry + floorplan + definition); nodes + editor typecheck PASS.

- [ ] **Step 6: Manual end-to-end check (parity)**

The interactive tool has no unit test; confirm parity by driving the app. Start it (`~/pascal-editor.sh start` or the project run skill), select the **Hydronic Line** tool from the structure palette, and verify: (a) in the 3D view, click-click draws an insulated tube run; (b) switch to 2D floorplan and confirm the same tool draws the run and shows the dashed centerline; (c) selecting a committed run shows draggable path-point handles in both views. Record what you observed in the report. If you cannot launch the app in this environment, say so and note that a human parity check is required before merge.

- [ ] **Step 7: Commit**

```bash
git add packages/nodes/src/hydronic-line/definition.ts packages/nodes/src/hydronic-line/definition.test.ts packages/editor/src/components/ui/action-menu/structure-tools.tsx
git commit -m "feat(nodes): wire hydronic-line draw tool + floorplan into definition and palette"
```

---

## Self-Review

**1. Spec coverage:** the hydronic subsystem spec calls for spatially-drawn hydronic runs; this makes them hand-drawable and editable in both views. `role` is exposed for panel editing. Components remain a separate deferred plan. ✓

**2. Placeholder scan:** full code is given for the novel files (ports constant, floorplan, parametrics, selection, palette entry, definition fields, all tests). `tool.tsx`/`move-tool.tsx` are specified as faithful mirrors of named existing files plus an explicit substitution list — a codebase-sanctioned extension pattern, not a "similar to Task N" placeholder. The two conditional checks (parametrics enum field kind; selection factory genericity) name the exact file to inspect and the fallback. ✓

**3. Type consistency:** `HydronicLineNode` fields (`path`/`diameter`/`insulated`/`role`), `buildHydronicLineFloorplan`, `hydronicLineParametrics`, `HYDRONIC_PORT_SYSTEMS`, and `hydronicLineDefinition` names are consistent between producing and consuming tasks. The affordance kind string `'hydronic-line'` matches the schema discriminator throughout. ✓
