# 3D unboxing assets and source photographs

User supplied CAFFEINA / S&h Real Care photographs, copied byte for byte on 2026-11-08. No crop, background removal, retouching, generative alteration, or re-encoding.

| Bundled asset | Original file |
| --- | --- |
| caffeina-closed.jpg | F:/Downloads/photo_6019508124500299672_y.jpg |
| caffeina-open.jpg | F:/Downloads/photo_6019508124500299673_y.jpg |
| caffeina-extract.jpg | F:/Downloads/photo_6019508124500299674_y.jpg |
| caffeina-reveal.jpg | F:/Downloads/photo_6019508124500299675_y.jpg |

The user subsequently clarified that the result must be continuous and video-like, with only the product visible on white, no hands or room, no frame borders or progress indicators. The original photo-crossfade implementation was replaced by an actual scroll-controlled Three.js reconstruction. These originals are preserved as references and are not rendered in the scene.

## Generated production assets

Created using the built-in ImageGen tool on 2026-11-08; copied into this directory for local delivery. These derived textures are an illustrative reconstruction, not exact original print-ready artwork or authoritative product instructions. The website's factual catalog remains separate from the CAFFEINA demonstration.

| Asset | Purpose | Generated source |
| --- | --- | --- |
| caffeina-carton-print.png | Full-bleed flat cream carton face with original CAFFEINA identity, Persian print layout and burgundy footer | exec-04e97159-7458-4908-b1d3-21bb97627a67.png |
| caffeina-bottle-label.png | Flat cream S&h / CAFFEINA bottle-label texture | exec-a4831c55-131c-4ffd-851e-e86d4c2381ed.png |
| caffeina-closed-cutout.png | Transparent closed-carton loading/WebGL fallback, without hands or room | exec-cf7a19ef-ad64-489a-bfc9-efb280d9ade9.png |

Generation briefs:

- Carton: reconstruct only the front-facing CAFFEINA print artwork from the closed and final photographs as a flat full-bleed cream rectangle, retaining heading, Persian paragraph hierarchy, maker mark and burgundy footer; remove perspective, lighting, seal, other panels, bottle, hands, people, table and room.
- Bottle: reconstruct only the cream paper label from the final photograph, unwrapped and flat, retaining the S&h / Real Care / CAFFEINA / NOURISHING SERUM identity and burgundy footer; remove glass, cap, hand, room, table, curvature and perspective.
- Fallback: high-quality standalone 3D catalog cutout of the closed cream CAFFEINA carton, original print hierarchy, burgundy base and black tamper seal; narrow right side visible, entire object uncropped; true transparent alpha, no bottle, hands, people, room or table.

The canvas animation uses actual carton walls, hinged flaps, a deforming seal and lathed bottle/cap geometry. No generated video or photographic frame transitions are involved. Its progress is a deterministic function of page scroll. Other product names, variants, prices, and cart data are unchanged.
