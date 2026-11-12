// The Commons mark: three arcs, one per keyholder, close a C around the pot in the middle. Nobody holds it alone.
// The opening of the C is wider than the gaps between the arcs, so it reads as a C and never as three equal blades.
//
// Two cuts of the same shape:
// - the 3D render (public/brand, app/apple-icon.png, link preview, bot avatar): ring radius 16, tube 5.4, 80° opening,
//   36° gaps, satin amber metal lit by a glowing core;
// - the flat favicon below (app/icon.svg), drawn for 16-32 px: a heavier stroke and wider gaps so the three arcs stay
//   apart at 16 px, no glow, no border.

export const BRAND = {
  arcs: ["M45.16 44.28A18 18 0 0 1 27.34 49.39", "M16.57 41.27A18 18 0 0 1 16.57 22.73", "M27.34 14.61A18 18 0 0 1 45.16 19.72"],
  core: { cx: 33, cy: 32, r: 6 },
  stroke: 7.5,
  ring: "#fbb124",
  dot: "#fcd34d",
  tile: "#0c0d11",
} as const;
