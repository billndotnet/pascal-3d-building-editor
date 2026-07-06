# RV Layout Adaptation — Design

**Date:** 2026-07-06
**Status:** Draft for review
**Author:** Bill Nash

## Purpose

Adapt the Pascal 3D building editor to model, document, and remodel a specific
recreational vehicle: an existing **40′ Class A motorhome**. Three coupled goals:

1. **Document** the coach as-built, including the spatial location of all utility
   systems (power, water, propane, hydronic, climate, data, lighting), so the
   owner can see exactly where a line runs before cutting into it during remodel.
2. **Remodel** the interior — move walls, redo the galley and bath, rearrange
   furniture.
3. **Plan** the new systems layout (notably a full re-lighting to 12V LED ribbon).

The distinctive requirement versus the house editor is the **systems layer**:
multiple utility domains represented as **spatially-accurate 3D runs**, not
schematics.

## Non-Goals

- No photometric lighting simulation and no CFD airflow simulation. Lighting and
  airflow are **representational** (emissive strips, fan symbols with CFM labels).
- No slide-outs and no split-level interior (this coach has neither).
- No multi-vehicle / fleet modeling. One coach.
- No structural/chassis engineering — bays are modeled as spatial regions for
  systems integration, not as load-bearing analysis.

## Existing Foundation (what we build on)

The editor already provides most of the primitives:

- **Scene graph & node schemas** (`packages/core/src/schema/nodes`) with a
  registry-driven composition model (`def.geometry` / `def.renderer` /
  `def.system`).
- **A routing model** already used by `pipe-segment`, `duct-segment`, and
  `lineset`: each is a node carrying `path: [[x,y,z], …]` in level-local meters
  plus domain attributes, with a geometry builder extruding tube(s) along the
  path. `pipe-segment` encodes drain **slope** implicitly in the path's Y values.
- **"Typed port machinery"** referenced by `pipe-segment` for connecting runs to
  endpoints — reused here for component ports.
- **`site → building → level`** hierarchy, `wall`, `zone`, `slab`, `ceiling`,
  `item`, `hvac-equipment`, `solar-panel`, and `duct-segment` — reused directly.
- **2D floorplan + 3D views** with the mandated behavioral parity between them,
  and existing draw-tool patterns for routed runs.

The RV work is **additive**: new bespoke node types that follow these patterns,
plus an RV template and per-domain visibility layers. No changes to the layer
boundaries in `wiki/architecture/`.

## Architecture Decision

**Bespoke node type per system** (approach B), consistent with the codebase's own
house style (`pipe-segment` / `duct-segment` / `lineset` are distinct types, not a
generic run). To keep "bespoke" from meaning "30 copy-pasted renderers," all runs
sit on **two shared geometry helpers**:

- **Conductor-bundle builder** — for cable-like runs (extrudes one or more
  conductors along the path; supports an emissive variant for LED ribbon).
- **Slope-aware tube builder** — for fluid/gas runs (single tube; honors Y-slope
  for drains; optional insulation jacket).

Air distribution reuses the existing `duct-segment` geometry. Each new node type
supplies its own schema, defaults, color/appearance, and validation, but delegates
mesh generation to one of these helpers.

## Section 1 — Envelope & Coordinate Model

Reuse `site → building → level`. An **RV template** instantiates one site/building
with **two levels**:

- **`chassis`** — the pass-through / basement band at floor level. Holds the named
  bays. Systems originate and cross here.
- **`main`** — the living floor above.
- A **roof reference plane** above `main` for roof-mounted equipment (A/C units,
  solar, vents, antennas).

The exterior footprint is locked to the coach (~40′ × 102″) via a locked boundary
wall. **Named bays** are `zone` nodes on the `chassis` level tagged with a `bay`
role (generator-front, engine-rear, battery, propane, fresh-tank, grey-tank,
black-tank). No new node type — bays are labeled regions that runs pass through and
components sit in. A run whose `path` descends from `main` through the floor into a
`chassis` bay is what makes cross-bay integration legible.

## Section 2 — Systems Taxonomy (bespoke node types)

Grouped by the shared geometry helper they use.

### Cable runs (conductor-bundle builder)
- **`ac-circuit`** — 120V AC run. Attrs: conductor gauge, breaker/circuit id,
  source (shore/generator/inverter), path.
- **`dc-circuit`** — 12V DC run. Attrs: gauge, fuse/circuit id, path.
- **`led-ribbon`** — 12V LED strip run, rendered as an **emissive linear strip**.
  Attrs: color temperature, dimmable, per-run circuit, path. (Lighting domain.)
- **`data-cable`** — low-voltage data run. Attrs: subtype (`ethernet` | `coax` |
  `antenna`), path.

### Fluid / gas runs (slope-aware tube builder)
- **`fresh-water-line`** — pressurized fresh water.
- **`drain-line`** — grey/black drain (role attr; sloped via path Y).
- **`propane-line`** — LP gas.
- **`hydronic-line`** — insulated coolant loop for in-floor / radiant heat.

### Air (existing `duct-segment`)
- Reused as-is for the three roof A/C systems' ducting and passive-cooling paths.

### Components / endpoints (placed nodes with typed ports)
- **Power:** `shore-inlet`, `generator`, `inverter-charger`, `transfer-switch`,
  `ac-panel` (breaker panel), `dc-panel` (fuse block), `battery-bank`,
  `solar-controller`, `outlet`. Roof `solar-panel` reused.
- **Lighting:** `light-fixture` (pot/puck point sources kept from the old system).
- **Water:** `fresh-tank`, `grey-tank`, `black-tank`, `water-pump`,
  `water-heater`, `city-inlet`. Fixtures via `item`.
- **Propane:** `lp-tank`, `lp-regulator`. Appliances (furnace/stove/fridge) via
  `item`.
- **Climate / air:** `hydronic-heater` (boiler / Aqua-Hot-style), `heat-manifold`,
  `radiant-zone`, `electric-heater`, roof `ac-unit` (×3), `inline-fan` (duct
  booster; direction + CFM), `intake-vent`, `exhaust-vent`, `thermostat`.
- **Data / AV:** `network-switch`, `router-ap` (wifi), `cellular-modem`,
  `satellite-antenna`, `camera`, `av-head`, `tv`, `speaker`.

### Domains & layers
Each node declares a **domain**: `ac`, `dc`, `lighting`, `data`, `water-fresh`,
`water-drain`, `propane`, `hydronic`, `air`. A **per-domain visibility layer**
lets the user isolate one system at a time.

## Section 3 — Components & Connections

Every component node is a placed object (footprint on a level, label) like the
existing `hvac-equipment` / `item`, carrying **typed ports** built on the
codebase's existing port machinery. A port is typed by domain; a run's endpoint
**snaps to and references a compatible port** (`runEndpoint → componentId.portId`).
These references drive:

- **Traceability** — which breaker feeds a ribbon, which tank a drain empties to,
  which roof A/C + inline-fan branch a register comes off.
- **Layer views** — following connections within a domain.

Validation: a run endpoint may only bind to a port of a matching domain.

## Section 4 — Tooling & 2D↔3D Parity

Both tool families must exist in **both** the 2D floorplan and the 3D view
(architecture mandate — port any placement/move change to the sibling view in the
same PR):

- **Route tool** — draw a run polyline: click points, snap to ports/grid, drop
  through the floor between `chassis` and `main`. Built on the existing duct/pipe
  draw-tool pattern.
- **Place-component tool** — position a component and expose its ports.
- **Per-domain layer panel** — toggle each domain's visibility.
- **Numeric coordinate / dimension entry** — type real tape-measure values for
  accurate documentation, not eyeballing. Existing `measure` tool carries over.

## Section 5 — Testing

Follow existing conventions (every node type ships a `*.test.ts`):

- **Schema** round-trip + defaults per new node type.
- **Geometry builders** — path → mesh; drain slope handling; emissive strip for
  `led-ribbon`; insulation jacket for `hydronic-line`.
- **Ports/connections** — a run binds only to a compatible-domain port; dangling
  references rejected.
- **Fixtures** — a scene exercising a cross-level run (chassis bay → main floor)
  and a three-unit ducted A/C network with inline fans.
- **MCP** — real-infra tests where these node types are exposed as MCP tools.

## Phasing

Each phase is an independent build slice reusing the two geometry helpers.

1. **Envelope** — RV template, `chassis` + `main` levels, bays-as-zones, roof
   plane, locked footprint.
2. **Power + Lighting** — `ac-circuit`, `dc-circuit`, `led-ribbon`,
   `light-fixture`, and power components. Highest safety value for remodel.
3. **Fluids** — `fresh-water-line`, `drain-line`, `propane-line`,
   `hydronic-line`, tanks/pump/heater/regulator/manifold.
4. **Climate + Data** — roof `ac-unit` ×3 + `duct-segment` distribution +
   `inline-fan` + intake/exhaust vents + `electric-heater` + `thermostat`; then
   `data-cable` + network/AV components.
5. **Interior remodel** — RV-specific assets (dinette, wet bath, RV/murphy bed,
   captain's chairs) added to the catalog; remodel workflow.

## As-Built Coach Profile — 1991 Bluebird Wanderlodge WB40 (Wide Body, tag axle)

Owner-verified specifics that drive the constants and systems inventory:

- **Envelope:** exterior body 102″ × 40′; interior clear width **95″** (→ 3.5″
  sidewall build); interior ceiling **79″**. Cabin (habitable) = **36′** with a
  front **4′ cockpit** zone. The rear engine bay is *below* the cabin plane
  (chassis level), so the cabin floor runs full-length to the rear wall (a
  built-in armoire over the engine-access port is being removed).
- **Heat (as-is):** original **Primus** LP-gas hydronic boilers (factory Primus
  2490) feeding **two hydronic loops — one per side (port / starboard)** — with
  **passive radiators**. No forced zoning today.
- **Heat (planned, sequenced):** the hydronic system is **rebuilt and re-spec'd
  first** — this is the prerequisite. Augmentation adds an **electric heater**
  (supplements the LP boilers) and **electric zone valves** to engage **radiant
  floor zones selectively**. Only after that does the **raised radiant floor**
  (hydronic loops under an **engineered-vinyl** surface, on a slightly raised
  `slab`) become viable. The raised floor is a **want-to-have**, gated on the
  hydronic rebuild — so it is NOT baked into the base envelope template; it is a
  remodel-phase overlay.
- **Domestic hot water:** separate Aqua-Hot electric water heater — failing,
  slated for replacement.
- **Water:** fresh / grey / black = **100 gal each**. **Propane:** **30 gal**.
- **A/C (as-is):** 3× rooftop Dometic 24k BTU (2 → cabin, 1 → bath with marginal
  bedroom reach; bedroom starved by poor ducting). **A/C remodel plan: ductless
  mini-splits** — condenser + per-zone head + refrigerant `lineset` + condensate
  + AC feed — replaces the roof units and structurally fixes the bedroom.
- **Electrical:** house bank upgraded to **LiFePO4**; added solar charge
  controller + **400 W** panels; original dual 160 A alternators. Inverter and
  shore-service still to confirm.

## Design Principle — Full Maintenance Access (no-demo)

Motivated by past mouse intrusion and burst water lines, a core owner
requirement: **every exterior wall must be serviceable without demolition.**
All wall panels are **removable** and all cabinets **detachable**. Modeling
implications:

- Exterior walls decompose into **discrete removable panel sections**, and
  cabinets are **detachable component** nodes — not baked-in geometry.
- Each panel/cabinet is **associated with the systems routed behind or through
  it**, so the model answers "what's behind this panel before I pull it." This
  is the through-line that gives the systems-documentation layer its purpose,
  and it governs how the remodel phase (Phase 5) decomposes walls and cabinetry.

## Open Questions

- Per-bay lengths and tag-axle position still to be measured (interior width,
  ceiling height, wall thickness, and cabin length are now known — see As-Built
  Profile).
- Mini-split condenser mounting location (roof / rear cap / basement bay) —
  drives lineset routing; decide during the climate phase.
- Whether `data-cable` subtypes warrant separate types later (deferred; one type
  with a subtype attr for now).
- Whether specialized hub semantics (e.g. `ac-panel` owning a first-class circuit
  list) are needed beyond labels — revisit after Phase 2 use.
