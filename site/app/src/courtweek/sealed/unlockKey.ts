const fragments = import.meta.glob('./keys/day*.ts', {
  import: 'default',
}) as Record<string, () => Promise<string>>

export async function loadUnlockFragment(ordinal: number): Promise<string> {
  const key = `./keys/day${String(ordinal).padStart(2, '0')}.ts`
  const loader = fragments[key]
  if (!loader) throw new Error('No unlock material exists for this court day.')
  return loader()
}
