/** Shared colour vocabulary for the canvas renderer and the SVG exporter. */
export interface BodyStyle {
  fill: string
  stroke: string
}

/** Pastel fills with a lighter outline shade for each slot (Tailwind 300 / 200 tones). */
export const PALETTE: ReadonlyArray<BodyStyle> = [
  { fill: '#fda4af', stroke: '#fecdd3' }, // rose
  { fill: '#fcd34d', stroke: '#fde68a' }, // amber
  { fill: '#86efac', stroke: '#bbf7d0' }, // green
  { fill: '#7dd3fc', stroke: '#bae6fd' }, // sky
  { fill: '#c4b5fd', stroke: '#ddd6fe' }, // violet
  { fill: '#f9a8d4', stroke: '#fbcfe8' }, // pink
  { fill: '#fdba74', stroke: '#fed7aa' }, // orange
  { fill: '#5eead4', stroke: '#99f6e4' }, // teal
]

export const PALETTE_SIZE = PALETTE.length

export const STATIC_STYLE: BodyStyle = { fill: 'rgba(100, 116, 139, 0.28)', stroke: '#64748b' }

export const BACKGROUND = '#0f172a'
