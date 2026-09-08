import type { Body, Joint, World } from '../engine'
import type { Camera } from './camera'
import { PALETTE, STATIC_STYLE, BACKGROUND } from './palette'
import { tagOf } from '../scenes/presets'
import type { Overlays } from './store'

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString()

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Renders the current frame as a standalone SVG document in the same visual
 * language as the canvas renderer: blueprint grid, pastel bodies with light
 * outlines, joints, and the contact / AABB overlays that are switched on.
 * Coordinates are converted to screen space so the export matches the view.
 */
export function worldToSvg(world: World, cam: Camera, overlays: Overlays): string {
  const w = Math.round(cam.width)
  const h = Math.round(cam.height)
  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="JetBrains Mono, ui-monospace, monospace">`,
  )
  parts.push(`<title>Impulse physics frame — t = ${world.time.toFixed(2)} s, ${world.bodies.length} bodies</title>`)
  // Grid anchored on the world origin, like the canvas.
  const gx = ((cam.toScreenX(0) % 32) + 32) % 32
  const gy = ((cam.toScreenY(0) % 32) + 32) % 32
  parts.push(
    `<defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse" x="${fmt(gx)}" y="${fmt(gy)}">` +
      `<path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(148,163,184,0.09)" stroke-width="1"/></pattern></defs>`,
  )
  parts.push(`<rect width="100%" height="100%" fill="${BACKGROUND}"/>`)
  parts.push(`<rect width="100%" height="100%" fill="url(#grid)"/>`)

  const drawBody = (b: Body): void => {
    const tag = tagOf(b)
    const asleep = b.type === 'dynamic' && !b.awake && overlays.sleep
    const style = b.type === 'static' ? STATIC_STYLE : PALETTE[Math.abs(tag?.color ?? 0) % PALETTE.length]!
    const fillOpacity = b.type === 'static' ? 1 : asleep ? 0.3 : 0.86
    const dash = asleep ? ' stroke-dasharray="4 3"' : ''
    const cx = cam.toScreenX(b.position.x)
    const cy = cam.toScreenY(b.position.y)
    const common = `fill="${style.fill}" fill-opacity="${fillOpacity}" stroke="${style.stroke}" stroke-width="1.5"${dash}`
    if (b.shape.kind === 'circle') {
      const r = b.shape.radius * cam.ppm
      parts.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" ${common}/>`)
      if (b.type === 'dynamic') {
        const ex = cx + Math.cos(-b.angle) * r * 0.85
        const ey = cy + Math.sin(-b.angle) * r * 0.85
        parts.push(
          `<line x1="${fmt(cx)}" y1="${fmt(cy)}" x2="${fmt(ex)}" y2="${fmt(ey)}" stroke="rgba(15,23,42,0.45)" stroke-width="1"/>`,
        )
      }
    } else {
      const pts = b.shape.vertices
        .map((v) => {
          const x = b.position.x + b.cos * v.x - b.sin * v.y
          const y = b.position.y + b.sin * v.x + b.cos * v.y
          return `${fmt(cam.toScreenX(x))},${fmt(cam.toScreenY(y))}`
        })
        .join(' ')
      parts.push(`<polygon points="${pts}" ${common} stroke-linejoin="round"/>`)
    }
  }

  parts.push('<g id="static">')
  for (const b of world.bodies) if (b.type === 'static') drawBody(b)
  parts.push('</g><g id="dynamic">')
  for (const b of world.bodies) if (b.type !== 'static') drawBody(b)
  parts.push('</g>')

  const drawJoint = (j: Joint): void => {
    const ax = fmt(cam.toScreenX(j.anchorA.x))
    const ay = fmt(cam.toScreenY(j.anchorA.y))
    const bx = fmt(cam.toScreenX(j.anchorB.x))
    const by = fmt(cam.toScreenY(j.anchorB.y))
    if (j.kind === 'distance') {
      parts.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="rgba(226,232,240,0.75)" stroke-width="1.25"/>`)
    } else if (j.kind === 'revolute') {
      parts.push(
        `<circle cx="${bx}" cy="${by}" r="${fmt(Math.max(2.5, cam.ppm * 0.09))}" fill="none" stroke="rgba(226,232,240,0.75)" stroke-width="1.25"/>`,
      )
    } else {
      parts.push(`<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="#f472b6" stroke-width="1.25" stroke-dasharray="5 4"/>`)
    }
  }
  parts.push('<g id="joints">')
  for (const j of world.joints) drawJoint(j)
  parts.push('</g>')

  if (overlays.aabb) {
    parts.push('<g id="aabbs" fill="none" stroke="#fbbf24" stroke-width="1" stroke-dasharray="4 3" opacity="0.85">')
    for (const b of world.bodies) {
      const bb = b.aabb
      parts.push(
        `<rect x="${fmt(cam.toScreenX(bb.minX))}" y="${fmt(cam.toScreenY(bb.maxY))}" width="${fmt((bb.maxX - bb.minX) * cam.ppm)}" height="${fmt((bb.maxY - bb.minY) * cam.ppm)}"/>`,
      )
    }
    parts.push('</g>')
  }

  if (overlays.contacts) {
    const arrow = Math.max(14, cam.ppm * 0.5)
    parts.push('<g id="contacts">')
    for (const c of world.contacts.values()) {
      if (!c.touching) continue
      for (let i = 0; i < c.count; i++) {
        const p = c.points[i]!
        const sx = cam.toScreenX(p.x)
        const sy = cam.toScreenY(p.y)
        const ex = sx + c.normalX * arrow
        const ey = sy - c.normalY * arrow
        parts.push(`<line x1="${fmt(sx)}" y1="${fmt(sy)}" x2="${fmt(ex)}" y2="${fmt(ey)}" stroke="#22d3ee" stroke-width="1.25"/>`)
        parts.push(`<circle cx="${fmt(sx)}" cy="${fmt(sy)}" r="3" fill="#e879f9"/>`)
      }
    }
    parts.push('</g>')
  }

  const label = `Impulse · t = ${world.time.toFixed(2)} s · ${world.bodies.length} bodies · ${world.stats.contacts} contacts`
  parts.push(`<text x="12" y="${h - 12}" font-size="11" fill="#64748b">${esc(label)}</text>`)
  parts.push('</svg>')
  return parts.join('\n')
}

/** Triggers a browser download of the SVG text. */
export function downloadSvg(svg: string, filename = 'impulse-frame.svg'): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
