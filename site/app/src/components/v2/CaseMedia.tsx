import type { MediaAsset } from '../../lib/v2/caseSchema'
import { storyParagraphs } from '../../lib/storyText'

export function CaseMedia({
  asset,
  priority = false,
}: {
  asset: MediaAsset
  priority?: boolean
}) {
  const src = asset.src.replace(/^\/today\//, import.meta.env.BASE_URL)
  return (
    <figure className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60 shadow-2xl shadow-black/30">
      <img
        src={src}
        alt={asset.alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        className={`${asset.kind === 'evidence' ? 'aspect-video' : 'aspect-[3/2]'} w-full object-cover`}
      />
      <figcaption className="border-t border-neutral-800 px-4 py-3 text-xs leading-relaxed text-neutral-400">
        {asset.caption}
      </figcaption>
    </figure>
  )
}

export function StoryText({ text, className = '' }: { text: string; className?: string }) {
  const paragraphs = storyParagraphs(text)
  if (paragraphs.length === 0) return null
  return (
    <div className={`space-y-3 ${className}`}>
      {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </div>
  )
}
