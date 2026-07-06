# RV Hydronic Subsystem — Design

**Date:** 2026-07-06
**Status:** Draft for review
**Parent spec:** `2026-07-06-rv-layout-adaptation-design.md` (this is the priority slice of the fluids/climate work — it is rebuilt and spec'd before the general fluids phase, and it gates the raised radiant floor).

## Purpose

Model and document the coach's hydronic heating so the owner can rebuild it: capture the **as-is** system spatially, then design the **planned** electric-augmented, floor-zoned rebuild, so runs, heat sources, and zone control are all traceable before any plumbing is cut.

## As-Is System

- **Heat source:** original **Primus LP-gas boiler(s)** (factory Primus 2490).
- **Transport:** **two hydronic loops, one per side (port / starboard)**, carrying heated coolant fore-and-aft.
- **Emitters:** **passive radiators** on the loops. No zoning, no forced selection — the whole coach heats together.

## Planned Rebuild

Keep the two side loops as the **primary coolant-transport backbone**; add an electric heat source and selective floor zoning:

- **Add an inline tankless ELECTRIC heater** in the loop — same function as the LP boiler (adds heat to circulating coolant), a **parallel heat source**, not a storage tank. Lets the coach heat on shore/inverter power without burning propane.
- **Add electric zone valves** feeding **three radiant floor zones**:
  1. **Bedroom**
  2. **Bathroom**
  3. **Living room + galley** (a single combined zone)
- Each floor zone is a **valved branch** tapped off the transport loops; the zone valve engages/isolates that floor loop selectively.
- **Passive radiators remain** on the loops.
- Enables (later, gated) the **raised radiant floor**: the floor-zone loops run under an engineered-vinyl surface on a slightly raised slab.

## Node Model (bespoke, per parent spec approach B)

All hydronic runs use the shared **slope-aware fluid-tube geometry helper** (insulated jacket). All components are placed nodes with typed `hydronic` ports.

**Runs (`hydronic-line`):**
- Two **transport loops** (port / starboard) — the backbone.
- **Zone branches** — one valved run per radiant floor zone, from a manifold/valve to the zone loop and back.
- **Radiator branches** — runs to each passive radiator.
- Each run: `path` polyline (level-local m), diameter, insulated flag, and a `loop` / `role` tag (`transport` | `zone-branch` | `radiator-branch`).

**Components (placed, typed `hydronic` ports):**
- `hydronic-boiler` — the Primus LP boiler(s) (as-is heat source).
- `hydronic-heater-electric` — the new inline tankless electric heater (planned heat source).
- `hydronic-pump` — circulator(s).
- `zone-valve` — one electric valve per floor zone (planned).
- `hydronic-manifold` — the branch point where zone valves tap the transport loops (planned).
- `hydronic-radiator` — the passive radiators (as-is).
- `radiant-zone` — the three floor zones (bedroom / bathroom / living+galley), each an area associated with its zone-branch run and zone valve.

**Connections:** heat sources (LP boiler + electric heater) and pump sit in-line on the transport loops; each `radiant-zone` references the `zone-valve` and `hydronic-line` branch that serves it, so "which valve/heat-source feeds this floor zone" is traceable.

## Fidelity

Spatially-accurate 3D runs (paths through chassis/floor), **representational** — no thermal or flow simulation. The value is knowing where coolant runs, which heat source and valve serve each zone, and what's behind each removable panel (per the parent spec's no-demo access principle).

## As-Is vs Planned

The model carries both: the as-is layer (LP boiler → 2 loops → passive radiators) and the planned layer (+ inline electric heater, + manifold/zone-valves, + 3 radiant floor zones). This lets the rebuild be designed and validated against the existing runs before work starts.

## Open Questions

- **Heat-source plumbing:** are the LP boiler and the inline electric heater in **series** on a shared loop, or does each side loop get its own? (Owner to confirm during rebuild.)
- **Pump/circulator** count and location (per loop vs shared).
- Whether the two side loops feed a **single shared manifold** for the three zone valves, or one manifold per side.
- Radiant-floor tubing representation: a serpentine `hydronic-line` path per zone vs. a filled `radiant-zone` area with a single feed/return (default: `radiant-zone` area + feed/return run, serpentine deferred).
