import type { MediaAsset } from '../../lib/v2/caseSchema'
import { storyParagraphs } from '../../lib/storyText'

/** Authoring captions must start with a fiction label; players see the label stripped. */
export function playerMediaCaption(caption: string): string {
  return caption
    .replace(
      /^Fictional (court sketch|character portrait|reconstruction)\b\s*/i,
      (_: string, kind: string) => kind.charAt(0).toUpperCase() + kind.slice(1) + ' ',
    )
    .trim()
}

export function CaseMedia({
  asset,
  priority = false,
}: {
  asset: MediaAsset
  priority?: boolean
}) {
  const src = asset.src.replace(/^\/today\//, import.meta.env.BASE_URL)
  return (
    <figure className={`case-media ${asset.kind}`}>
      <img
        src={src}
        alt={asset.alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        className={asset.kind === 'evidence' ? 'aspect-video' : 'aspect-[3/2]'}
      />
      <figcaption>
        {playerMediaCaption(asset.caption)}
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
