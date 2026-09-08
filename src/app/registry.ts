/**
 * Actions the control panel can invoke on the live sandbox. Settings flow
 * through the Zustand store; these are one-off commands that need access to
 * the World itself (serialisation, export, rewinding) and return feedback.
 */
export interface SandboxActions {
  saveToBrowser(): void
  loadFromBrowser(): void
  copyShareLink(): Promise<void>
  exportSvg(): void
  /** Restores keyframe `index` from the history ring buffer and pauses. */
  rewindTo(index: number): void
}

let current: SandboxActions | null = null

export function registerSandbox(actions: SandboxActions | null): void {
  current = actions
}

export function getSandbox(): SandboxActions | null {
  return current
}
