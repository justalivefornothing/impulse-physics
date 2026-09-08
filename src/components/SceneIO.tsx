import { getSandbox } from '../app/registry'
import { Segmented, ToggleButton } from './controls'
import { LinkIcon, LoadIcon, SaveIcon, SvgIcon } from './icons'

/** Save / load through localStorage, share via URL, export the frame as SVG. */
export function SceneIO() {
  return (
    <div>
      <Segmented columns={2}>
        <ToggleButton onClick={() => getSandbox()?.saveToBrowser()} title="Store the full world state in this browser (localStorage)">
          <SaveIcon width={14} height={14} />
          save
        </ToggleButton>
        <ToggleButton onClick={() => getSandbox()?.loadFromBrowser()} title="Restore the world saved in this browser">
          <LoadIcon width={14} height={14} />
          load
        </ToggleButton>
        <ToggleButton
          onClick={() => void getSandbox()?.copyShareLink()}
          title="Compress the world into the URL and copy it to the clipboard"
        >
          <LinkIcon width={14} height={14} />
          share link
        </ToggleButton>
        <ToggleButton onClick={() => getSandbox()?.exportSvg()} title="Download the current frame as an SVG drawing">
          <SvgIcon width={14} height={14} />
          export svg
        </ToggleButton>
      </Segmented>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        Snapshots are plain JSON; links carry the scene deflated in the URL hash, so nothing ever leaves your device.
      </p>
    </div>
  )
}
