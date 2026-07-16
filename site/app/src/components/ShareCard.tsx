import { useEffect, useRef, useState } from 'react'

export function ShareCard({ text }: { text: string }) {
  const [status, setStatus] = useState('')
  const resetTimeoutRef = useRef<number | null>(null)
  const isShareSupported =
    typeof navigator !== 'undefined' &&
    typeof (navigator as { share?: unknown }).share === 'function'

  // Clear a pending "reset copied" timeout on unmount so it can't fire a state
  // update (and the React warning that comes with it) after the component is gone.
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
      }
    }
  }, [])

  async function share() {
    try {
      if (isShareSupported) {
        await navigator.share({ text })
        setStatus('Share sheet opened.')
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setStatus('Copied to clipboard.')
      } else {
        setStatus('Sharing is unavailable in this browser. Select the text above to copy it.')
      }
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
      }
      resetTimeoutRef.current = window.setTimeout(() => setStatus(''), 3000)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setStatus('Sharing was blocked. Select the text above to copy it.')
    }
  }

  return (
    <div className="space-y-3">
      <pre className="whitespace-pre-wrap break-words rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-center text-sm leading-relaxed text-neutral-200">
        {text}
      </pre>
      <button
        type="button"
        onClick={share}
        className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
      >
        {isShareSupported ? 'Share this docket' : 'Copy your docket card'}
      </button>
      <p aria-live="polite" className="min-h-[1.25rem] text-center text-xs text-neutral-500">
        {status}
      </p>
    </div>
  )
}
