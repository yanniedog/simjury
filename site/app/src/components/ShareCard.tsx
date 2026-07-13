import { useEffect, useRef, useState } from 'react'

export function ShareCard({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const resetTimeoutRef = useRef<number | null>(null)

  // Clear a pending "reset copied" timeout on unmount so it can't fire a state
  // update (and the React warning that comes with it) after the component is gone.
  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
      }
    }
  }, [])

  async function copy() {
    // Clipboard API is absent in insecure contexts / some older browsers;
    // calling writeText on `undefined` would throw instead of failing gracefully.
    if (!navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
      }
      resetTimeoutRef.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard can be blocked (insecure context / permissions); ignore.
    }
  }

  return (
    <div className="space-y-3">
      <pre className="whitespace-pre-wrap break-words rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-center text-sm leading-relaxed text-neutral-200">
        {text}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-semibold text-neutral-900 transition hover:bg-white"
      >
        {copied ? 'Copied to clipboard' : 'Share your result'}
      </button>
    </div>
  )
}
