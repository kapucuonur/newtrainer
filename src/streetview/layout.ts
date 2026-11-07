/**
 * How far to lift the Street View panorama's bottom edge so Google's logo and
 * credits sit above the ride HUD deck (Google requires them to stay visible).
 * When the deck covers most of the pane (expanded HUD), the imagery is hidden
 * anyway, so the panorama keeps its full size.
 */
export function streetViewBottomInset(paneBottom: number, paneHeight: number, deckTop: number | null): number {
  if (deckTop == null || paneHeight <= 0) return 0;
  const covered = Math.max(0, paneBottom - deckTop);
  return covered <= paneHeight * 0.4 ? Math.round(covered) : 0;
}
