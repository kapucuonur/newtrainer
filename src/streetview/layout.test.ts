import assert from 'node:assert/strict';
import { streetViewBottomInset } from './layout';

// Compact HUD at the bottom: lift the panorama above it.
assert.equal(streetViewBottomInset(640, 584, 512), 128);
// No HUD: nothing to clear.
assert.equal(streetViewBottomInset(640, 584, null), 0);
// Expanded HUD covering most of the pane: keep the panorama full size.
assert.equal(streetViewBottomInset(640, 584, 60), 0);
// Deck below the pane (not overlapping): no inset.
assert.equal(streetViewBottomInset(640, 584, 700), 0);
// Degenerate pane.
assert.equal(streetViewBottomInset(0, 0, 0), 0);

console.log('street view layout checks passed');
