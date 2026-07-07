'use client'

import { emitter, type GridEvent, HydronicComponentNode, useScene } from '@pascal-app/core'
import { isGridSnapActive, isMagneticSnapActive, triggerSFX, useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { Html } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { alignDrawPoint, clearDrawAlignment } from '../shared/draw-alignment'
import { LevelOffsetGroup } from '../shared/level-offset-group'
import { hydronicComponentDefinition } from './definition'
import { buildHydronicComponentGeometry } from './geometry'
import { HYDRONIC_KINDS } from './schema'

const PREVIEW_OPACITY = 0.55
/** R/T yaw step — 45°, matching the editor's default rotate. */
const ROTATE_STEP_RAD = Math.PI / 4

function snap(value: number, step: number): number {
  if (step <= 0) return value
  return Math.round(value / step) * step
}

/**
 * Click-place tool for hydronic components (pump / zone valve / manifold /
 * radiator). A translucent body ghost follows the cursor on the floor with
 * grid snap; **R / T** rotate the ghost ±45° around Y. Click places the
 * unit — its in/out (or manifold branch) ports become ports the hydronic
 * line tool snaps onto. Component kind and diameter are edited in the
 * inspector after placement.
 */
const HydronicComponentTool = () => {
  const activeLevelId = useViewer((s) => s.selection.levelId)
  const [cursor, setCursor] = useState<[number, number, number] | null>(null)
  const [yaw, setYaw] = useState(0)
  const yawRef = useRef(0)

  const previewNode = useMemo(
    () => HydronicComponentNode.parse({ ...hydronicComponentDefinition.defaults(), name: 'Circulator pump' }),
    [],
  )
  const ghost = useMemo(() => {
    const group = buildHydronicComponentGeometry(previewNode)
    group.traverse((child) => {
      const mesh = child as { material?: { transparent: boolean; opacity: number } }
      if (mesh.material) {
        mesh.material.transparent = true
        mesh.material.opacity = PREVIEW_OPACITY
      }
    })
    return group
  }, [previewNode])

  useEffect(() => {
    if (!activeLevelId) return

    const resolve = (event: GridEvent): [number, number, number] => {
      const step = isGridSnapActive() ? useEditor.getState().gridSnapStep : 0
      return [snap(event.localPosition[0], step), 0, snap(event.localPosition[2], step)]
    }

    // Grid-snap the cursor, then layer Figma-style alignment so the unit lines
    // up with ducts, other equipment, and items as it's placed. Grid + lines
    // follow the active snapping mode (the contextual HUD chip — Shift cycles
    // it); `'off'` is the no-snap bypass.
    const resolveAligned = (event: GridEvent): [number, number, number] =>
      alignDrawPoint(resolve(event), {
        applySnap: isMagneticSnapActive(),
        bypass: false,
      })

    const onMove = (event: GridEvent) => setCursor(resolveAligned(event))

    const onClick = (event: GridEvent) => {
      const position = resolveAligned(event)
      const unit = HydronicComponentNode.parse({
        ...hydronicComponentDefinition.defaults(),
        name: 'Circulator pump',
        position,
        rotation: yawRef.current,
      })
      useScene.getState().createNode(unit, activeLevelId)
      useViewer.getState().setSelection({ selectedIds: [unit.id] })
      triggerSFX('sfx:item-place')
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const key = e.key
      if (key !== 'r' && key !== 'R' && key !== 't' && key !== 'T') return
      // Capture-phase + stopPropagation so the editor's selection-rotate
      // handler doesn't also spin the previously placed unit.
      e.preventDefault()
      e.stopPropagation()
      const steps = key === 't' || key === 'T' || e.shiftKey ? -1 : 1
      yawRef.current += steps * ROTATE_STEP_RAD
      setYaw(yawRef.current)
      triggerSFX('sfx:item-rotate')
    }

    emitter.on('grid:move', onMove)
    emitter.on('grid:click', onClick)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      emitter.off('grid:move', onMove)
      emitter.off('grid:click', onClick)
      window.removeEventListener('keydown', onKeyDown, true)
      clearDrawAlignment()
    }
  }, [activeLevelId])

  if (!activeLevelId || !cursor) return null

  return (
    <LevelOffsetGroup>
      <group position={cursor} rotation={[0, yaw, 0]}>
        <primitive object={ghost} />
      </group>
      <Html
        center
        position={[cursor[0], cursor[1] + HYDRONIC_KINDS[previewNode.kind].size[1] + 0.4, cursor[2]]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        zIndexRange={[100, 0]}
      >
        <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border/60 bg-background/90 px-4 py-1.5 text-xs tabular-nums shadow-sm backdrop-blur">
          <span className="font-medium text-foreground">R/T rotate</span>
        </div>
      </Html>
    </LevelOffsetGroup>
  )
}

export default HydronicComponentTool
