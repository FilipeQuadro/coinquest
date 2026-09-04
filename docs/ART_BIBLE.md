# CoinQuest Art Bible

CoinQuest is a 2D pixel-art tech RPG about a programmer managing personal finance. The world should feel alive, comfortable and modern. It must not copy sprites, tiles, UI, music, proportions or identity from Terraria or any other game.

## Base Resolution

- World canvas: 960x540 logical pixels.
- Composition: one compact programmer room/lab, not a scrolling map yet.
- Camera:
  - Desktop: show almost the full 960x540 room.
  - Tablet: crop moderately around the main room.
  - Mobile: focus on programmer + workstation + digital vault.
- Pixel grid: draw source sprites on a 1 px grid and render with nearest-neighbor.
- Runtime scale: prefer integer-feeling sizes when possible, but camera may use fractional zoom on mobile to preserve composition. Use `roundPixels` to reduce blur.

## Sprite Scale

- Source sprites are authored at native pixel-art resolution.
- Runtime sprite scale target: 2x to 3x perceived scale depending on camera.
- Avoid oversized source PNGs. A sprite should be only as large as its visible logical frame requires.
- Keep sprite origins documented in implementation when they matter for animation.

## Character Specification

The programmer must be readable on an iPhone-width viewport after the mobile camera crop.

- Frame size: 48x64 px.
- Visible body target: 42-46 px high inside the frame.
- Runtime fallback scale: about 1.28x in the 960x540 world before camera zoom.
- Proportion:
  - Head: 30-34% of visible height.
  - Torso/hoodie: 35-40%.
  - Legs/shoes: 24-30%.
  - Arms/hands must read clearly while typing.
- Required visual traits: hoodie or tech jacket, hair, simple face, headset, small mic, hands, pants, sneakers, cyan/purple/green tech accent.
- Keep silhouette recognizable even if facial details are reduced.

## Character Sprite Sheet Plan

Recommended first sheet: `public/assets/characters/programmer.png`

- Frame: 48x64.
- Layout: horizontal rows by animation.
- `idle`: 4 frames, breathing and slight headset/visor shimmer.
- `typing`: 6 frames, alternating hands and shoulders.
- `income`: 6 frames, short upbeat celebration.
- `expense`: 4 frames, mild concerned reaction.
- `walk`: 8 frames, prepared for future room movement.

Initial total: 28 frames.

## Workstation Specification

Recommended asset split:

- `public/assets/furniture/workstation-base.png`
  - Frame: 320x174.
  - Includes desk, main monitor frame, secondary monitor frame, keyboard, mouse, PC case, chair, small desk objects and cable shapes.
- Monitor contents remain procedural in Phaser:
  - terminal label;
  - abstract code lines;
  - cursor;
  - abstract finance monitor bars.
- PC LEDs and fan can remain procedural overlays so health states can recolor without duplicating sprites.

Only split into `desk.png`, `monitor-frame.png` or `pc-case.png` when animation or layering requires it.

## Digital Vault Specification

Recommended asset split:

- `public/assets/tech/digital-vault-shell.png`
  - Frame: 120x108.
  - Includes physical shell, pedestal, display casing, ports and antenna.
- Procedural Phaser overlays:
  - core color;
  - ring;
  - energy bars;
  - display pixels;
  - glow;
  - income/expense flashes.

Keep states (`unknown`, `excellent`, `healthy`, `attention`, `tight`, `critical`) as color/energy overlays, not separate body sprites.

## Room Layers

- Background:
  - sky;
  - distant city;
  - medium city.
- Midground:
  - near buildings;
  - window glass/frame;
  - wall panels.
- Foreground:
  - floor;
  - workstation;
  - programmer;
  - digital vault;
  - shelf/props.

The room should remain a single compact lab. Do not design a large map in this phase.

## Official Palette

Core:

- Ink black: `#05070D`
- Graphite: `#07090F`
- Navy wall: `#12182E`
- Panel navy: `#17213A`
- Deep screen: `#07101F`
- Line blue: `#2C3A5F`
- Bright line: `#536184`
- Text warm: `#F6F3E8`
- Muted text: `#A8B2CB`

Tech accents:

- Cyan tech: `#42D9F4`
- Electric blue: `#5A82FF`
- Soft purple: `#7F67D8`
- Green income: `#69E697`
- Gold balance: `#F3CF64`
- Amber attention: `#FFD36F`
- Red-orange expense: `#FF786F`
- Orange alert: `#FFA45B`

Health overlays:

- `unknown`: muted blue-gray `#7F8AA8`
- `excellent`: gold `#F3CF64` + green `#69E697`
- `healthy`: cyan `#42D9F4` + green `#69E697`
- `attention`: amber `#FFD36F`
- `tight`: cold blue `#7FB2FF`
- `critical`: red-orange `#FF786F` + orange `#FFA45B`

Use fewer colors per asset than the whole palette. Reserve bright colors for function, focus and state.

## Light Direction

- Primary environmental light: from the window, top/back of the room.
- Secondary light: monitor from front-left of the programmer.
- Accent lights: PC LEDs and digital vault from right/front.
- Shadows should fall down and slightly right.

## Detail Level

- Small props: 3-6 readable details each.
- Main props: 8-14 details each.
- Character: enough detail to read job/personality, but avoid noisy facial pixels.
- Avoid large flat rectangles unless they are broken by bevels, highlights, vents, pixels or shadows.

## Outlines

- Main objects: 1-2 px dark outline.
- Important foreground objects: 2 px outline where readability needs it.
- Internal detail: 1 px darker/lighter lines.
- Do not outline every light/glow; glow should sit behind sprite geometry.

## Shadows

- Use contact shadows under character, chair, workstation and vault.
- Shadows may be procedural ellipses or dark pixel clusters.
- Keep shadows low alpha and soft enough to avoid muddying the pixel art.

## Color Limits

- Character body frame: target 12-18 colors plus transparency.
- Furniture prop: target 10-16 colors plus transparency.
- Vault shell: target 10-14 colors plus transparency.
- Environment chunk: target 12-20 colors.
- Effects/glows: procedural alpha overlays are exempt.

## Glow and Neon

- Use glow to identify tech objects, not to flood the scene.
- Prefer small cyan/green/gold highlights.
- Avoid full-screen neon saturation.
- Health state colors must be paired with icon/text in React and shape/energy in Phaser.

## Animation Rules

- Idle loops should be subtle and readable.
- Income/expense reactions are short, then return to current idle/typing state.
- Prefer 4-8 frames for character loops.
- Procedural tweens are acceptable for lights, glows, cursors, monitor bars and particles.
- Destroy temporary effects and remove listeners on scene shutdown.

## UI Versus World

- React UI is the objective financial interface.
- Phaser world is atmosphere and feedback.
- Do not render sensitive detailed financial data inside the world canvas.
- HUD should stay compact and support the scene, not replace the dashboard.
- UI panels can borrow pixel-tech borders, but should stay more restrained than the world.

## Effects Policy

Procedural:

- glows;
- floating values;
- small particles;
- monitor lines;
- bars;
- cursor;
- health overlays.

Sprites:

- programmer;
- furniture bodies;
- PC case;
- physical room props;
- vault shell;
- non-luminous room details.

This keeps state changes cheap and avoids duplicating many sprite variants.

## Performance Rules

- Do not use images much larger than their logical frame.
- Use nearest-neighbor rendering.
- Avoid hundreds of tiny files; consider a simple atlas only when asset count grows enough to justify it.
- Do not introduce shaders for the current room.
- Keep particle counts low and temporary.

