# Login lips artwork

Generated with the built-in ImageGen tool on 2026-11-08. The existing Poostikal wordmark and isolated lips supplied by the user informed the design. The wordmark itself remains unchanged in `public/brand/poostikal-wordmark-transparent.png`.

- `lips-open.png`: 1254 × 1254 transparent PNG, glossy pink 3D lips with a transparent mouth opening.
- `lips-closed.png`: matching 1254 × 1254 transparent PNG, used as the login's closed-pose geometry reference.
- The live logo, Persian copy, fields, buttons and code boxes are HTML controls. No text or form is baked into either asset.
- The files are preserved as generated. The login animation renders only `lips-open.png`, matching the user's approved open-lips silhouette exactly at rest. Transparency defines the open mouth contours; the closed artwork supplies only the target outer contours for a smooth compact shape. A continuous mesh closes the opening onto a shared seam, then returns every point to its original position. WebGL and a 2D fallback share the same shape. There is no image crossfade.
- The login lips use 50% opacity, as confirmed by the user. The logo and form are independent of that transparency.

Open-pose prompt: Extract only the sculptural glossy rose-pink 3D open lips from the concept. Preserve the plump upper cupid bow, thick lower lip, rounded volume, softbox reflections and pink resin material. Remove UI, lettering, background, teeth, tongue, face and skin. Make the outside and complete mouth opening genuinely transparent. Deliver one centered symmetric square web asset with generous negative space for the live form and no cropped lip edges.

Closed-pose prompt: Create the matching closed pose on the same square canvas. Preserve the exact front view, lighting, shiny rose-pink resin, highlights, texture, width and cupid bow. Close the mouth into plump lips with a delicate wavy seam, centered at 50%/50% and vertically compact around 27%–73% of the canvas. Use genuine transparency outside, with no text, UI, background, teeth or face.
