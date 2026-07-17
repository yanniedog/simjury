/**
 * Ensure a GitHub release exists, tolerating another publisher creating it
 * between the initial lookup and our create attempt.
 *
 * @param {{
 *   view: () => boolean,
 *   create: () => void,
 *   update: () => void,
 * }} commands
 */
export function ensureRelease({ view, create, update }) {
  if (view()) {
    update();
    return 'updated';
  }

  try {
    create();
    return 'created';
  } catch (createError) {
    // A concurrent run can win the create race after our first lookup. Only
    // recover when the release is now visible; otherwise preserve the failure.
    if (!view()) throw createError;
    update();
    return 'updated';
  }
}
