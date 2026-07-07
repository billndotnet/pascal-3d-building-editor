# Floorplan Drag-to-Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a user drag the body of an already-selected, movable node in the 2D floorplan to reposition it (drag-and-drop), instead of only via the action-menu "Move" button — so bays/zones/slabs/ceilings move the way people expect.

**Architecture:** The exact gesture already exists as a **Cmd/Ctrl-gated** variant, `startDirectMoveDrag` (`packages/editor/src/components/editor-2d/renderers/floorplan-registry-layer.tsx:461-529`): pointerdown → 4px drag threshold → `engageMoveDrag(node)` → the existing `FloorplanRegistryMoveOverlay` runs the move and commits on pointerup, with a mandatory rAF synthetic-pointermove that primes the just-mounted overlay. This plan adds a sibling `startPlainMoveDrag` that is byte-identical except it (a) fires on a **plain** left-drag (no modifier keys) and (b) on a non-drag release does a **plain select** rather than a toggle. It is wired into the dispatch fork `handleEntryPointerDown` after the Cmd/Ctrl move/rotate paths and before `handleSelect`. No new move machinery, no changes to selection, marquee, or the overlay.

**Tech Stack:** TypeScript, React pointer events, the editor floorplan registry layer.

## Global Constraints

- Toolchain **bun only**: `PATH="$HOME/.bun/bin:$PATH"`, typecheck `bun --bun x turbo run build --filter=@pascal-app/editor`.
- **Reuse, do not reinvent:** mirror `startDirectMoveDrag` exactly, including the `requestAnimationFrame` synthetic-pointermove re-dispatch (mandatory — without it the overlay's commit silently no-ops, because its window listeners attach in a `useEffect` after the pointerdown and would miss the in-flight drag).
- **Do not** clear selection on engage (the node is already selected; the overlay re-selects it at commit — a no-op). Do not touch the screen-selection `closest('[data-node-id]')` bail in `floorplan-panel.tsx`, the marquee gating, or `setInputDragging`-based collision guards.
- Gate strictly on **already-selected + movable + plain left button**, matching the `startDirectMoveDrag` contract (which also requires the node be pre-selected). First click selects; a subsequent body-drag moves.

---

## File Structure

- `packages/editor/src/components/editor-2d/renderers/floorplan-registry-layer.tsx` **(modify)** — add `startPlainMoveDrag`; wire it into `handleEntryPointerDown`.

---

## Task 1: Add plain-drag-to-move for selected movable nodes

**Files:**
- Modify: `packages/editor/src/components/editor-2d/renderers/floorplan-registry-layer.tsx`

**Interfaces:**
- Consumes (already in this component): `applyEntrySelection`, `isRegistryMovable`, `createEditorApi().engageMoveDrag`, `useScene`, `useViewer`, `swallowNextClick`, `DIRECT_DRAG_THRESHOLD_PX`, `ReactPointerEvent`.
- Produces: `startPlainMoveDrag(id, event): boolean` (returns true when it claims the pointerdown), invoked in `handleEntryPointerDown`.

- [ ] **Step 1: Add `startPlainMoveDrag` immediately after `startDirectRotateDrag`**

Insert this `useCallback` right after `startDirectRotateDrag` ends (just before `handleEntryPointerDown` at line ~628). It is `startDirectMoveDrag` with two deltas, marked in comments:

```tsx
  // Plain left-drag on an already-selected, movable entry body → move it.
  // Sibling of `startDirectMoveDrag` (the Cmd/Ctrl variant); the only
  // differences are the no-modifier gate and a plain-select (not toggle) on a
  // quiet release. Everything else — the 4px threshold, engage, and the rAF
  // synthetic-pointermove that primes the move overlay — is identical and load
  // bearing.
  const startPlainMoveDrag = useCallback(
    (id: AnyNodeId, event: ReactPointerEvent<SVGGElement>): boolean => {
      // DELTA 1: plain left button only — no modifier keys (those belong to the
      // Cmd/Ctrl move/rotate and multi-select paths).
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return false
      }

      const node = useScene.getState().nodes[id]
      if (!node || !isRegistryMovable(node.type)) return false
      if (!useViewer.getState().selection.selectedIds.includes(id)) return false

      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startY = event.clientY
      const pointerId = event.pointerId
      let engaged = false

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onEnd)
        window.removeEventListener('pointercancel', onEnd)
        if (engaged) {
          useViewer.getState().setInputDragging(false)
        }
      }

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        if (engaged) return
        const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY)
        if (distance < DIRECT_DRAG_THRESHOLD_PX) return

        engaged = true
        useViewer.getState().setInputDragging(true)
        swallowNextClick(300)
        createEditorApi().engageMoveDrag(node)

        requestAnimationFrame(() => {
          window.dispatchEvent(
            new PointerEvent('pointermove', {
              altKey: moveEvent.altKey,
              bubbles: true,
              buttons: moveEvent.buttons,
              clientX: moveEvent.clientX,
              clientY: moveEvent.clientY,
              ctrlKey: moveEvent.ctrlKey,
              metaKey: moveEvent.metaKey,
              pointerId,
              pointerType: moveEvent.pointerType,
              shiftKey: moveEvent.shiftKey,
            }),
          )
        })
      }

      const onEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return
        cleanup()
        if (!engaged) {
          // DELTA 2: a quiet (non-drag) release is a plain click on an
          // already-selected node — keep it as a plain select, not the toggle
          // the Cmd/Ctrl path uses.
          applyEntrySelection(id, false)
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onEnd)
      window.addEventListener('pointercancel', onEnd)
      return true
    },
    [applyEntrySelection],
  )
```

- [ ] **Step 2: Wire it into `handleEntryPointerDown`**

Change the dispatch fork (currently lines 628-635) to try the plain-drag after the Cmd/Ctrl paths and before `handleSelect`, and add it to the dependency array:

```tsx
  const handleEntryPointerDown = useCallback(
    (id: AnyNodeId, event: ReactPointerEvent<SVGGElement>) => {
      if (startDirectMoveDrag(id, event)) return
      if (startDirectRotateDrag(id, event)) return
      if (startPlainMoveDrag(id, event)) return
      handleSelect(id, event)
    },
    [handleSelect, startDirectMoveDrag, startDirectRotateDrag, startPlainMoveDrag],
  )
```

- [ ] **Step 3: Typecheck**

Run: `cd /data/opt/repo/pascal-3d-building-editor && PATH="$HOME/.bun/bin:$PATH" bun --bun x turbo run build --filter=@pascal-app/editor`
Expected: PASS. (No new imports are needed — every symbol used already exists in this file; confirm by building.)

- [ ] **Step 4: Commit**

```bash
git add packages/editor/src/components/editor-2d/renderers/floorplan-registry-layer.tsx
git commit -m "feat(editor): drag a selected node body to move it in the floorplan"
```

- [ ] **Step 5: Live verification (controller-run, not in this task)**

This is an interaction component with no unit test; the controller drives the app to confirm behavior. Leave a note in the report that manual/Playwright verification is required: (a) select a bay in 2D, drag its body → it moves and drops on pointerup; (b) a plain click (no drag) still just selects; (c) an empty-grid drag still marquee-selects; (d) resize handles (edge/vertex) still work; (e) Cmd/Ctrl-drag still works unchanged.

---

## Self-Review

**1. Spec coverage:** the plain-drag path delivers drag-to-move for any `isRegistryMovable` node (zones/bays, slabs, ceilings, items…), reusing the existing overlay/commit machinery. ✓

**2. Placeholder scan:** the full `startPlainMoveDrag` body and the exact `handleEntryPointerDown` replacement are given verbatim; the two deltas from `startDirectMoveDrag` are commented. No TODOs. The one non-code step (live verification) is explicitly a controller task with concrete checks. ✓

**3. Type consistency:** `startPlainMoveDrag(id: AnyNodeId, event: ReactPointerEvent<SVGGElement>): boolean` matches the sibling signatures and the fork's call sites; it's added to the `handleEntryPointerDown` dependency array. All referenced symbols (`applyEntrySelection`, `isRegistryMovable`, `createEditorApi`, `swallowNextClick`, `DIRECT_DRAG_THRESHOLD_PX`, `useScene`, `useViewer`) are already in scope in this file. ✓
