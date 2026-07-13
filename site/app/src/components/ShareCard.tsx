import { useState } from 'react'

export function ShareCard({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
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
