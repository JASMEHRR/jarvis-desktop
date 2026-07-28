# Redesign Prompt: fluid, audio-reactive Siri-style edge glow (replace the border-stroke approach)

## Context

Read first: `renderer/overlay.html`, `preload-overlay.js`, `main.js` (the overlay window creation + glow state machine), `preload.js`, `renderer/index.html`. Reference-only, do not touch `E:\imp\projects\ASCEND`.

The previous session implemented the screen-edge glow as a **two-layer conic-gradient border stroke** that reshuffles color stops every 180-380ms. The user tested it and rejected it. Their exact feedback, all four problems at once:

- "Too thin / harsh edge" — reads as a hard colored border LINE, not a soft diffuse glow bleeding inward.
- "Colors look wrong" — not Apple's soft bright pink/purple/blue blend.
- "Movement looks wrong" — choppy/jumpy, doesn't flow.
- "Corners look broken" — reads as a rectangle outline.
- And the key clarifying quote: **"there is no flow to it, it's not fluid, just how siri glows, no edges, just flows like water and uses bright colors, flows with sound like that."**

**The core diagnosis: a stroked border can never produce this look.** Any technique based on "draw a gradient along a path/border" will always read as an outline. That entire approach must be abandoned, not tuned. Do not try to fix the existing conic-gradient stroke by making it thicker or blurrier — replace the rendering technique wholesale.

## The correct technique

**The user has now supplied reference images (Apple's own Apple Intelligence / Siri screen glow on macOS and iOS). Study this description carefully — it is drawn from those images and is authoritative over any earlier guess:**

The effect is a **continuous soft band of light hugging the entire screen perimeter**:
- **Brightest exactly at the screen edge**, fading smoothly to fully transparent as it moves inward. The falloff distance is moderate — roughly **4-8% of the screen's smaller dimension** (on a 1080p screen, think ~50-90px of visible bleed). It is NOT a huge diffuse wash covering half the screen, and NOT a thin line. It's a soft, substantial band that clearly hugs the perimeter.
- **The hue varies smoothly as you travel around the perimeter.** In the reference: warm orange/amber in one stretch, transitioning to hot pink/magenta, into violet/purple, into blue — each color occupying a region of the perimeter and blending seamlessly into its neighbors. So at any given moment, the top edge might be magenta→purple while the left edge runs orange→pink. This traveling-hue quality is essential; a single uniform color around the whole edge is wrong.
- **It follows the rounded corners** of the display, wrapping continuously around them with no break, gap, or corner artifact.
- **Zero hard boundaries anywhere** — no stroke, no outline, no visible shape edge. Only smooth gradients.
- Against a dark background it reads luminous and vivid, as though colored light is spilling in from behind the bezel.

Implementation approach (use judgment on specifics, respect these principles):

1. **Many overlapping radial-gradient "light sources" arranged AROUND the perimeter — not strokes, and not a few scattered blobs.** Place a ring of perhaps 16-28 radial gradients at regular intervals along the screen perimeter (spaced along all four edges and around the corners), each centered ON or slightly OUTSIDE the screen edge. Each is assigned a hue sampled from a smoothly-varying color function of its position around the perimeter (e.g. hue as a function of perimeter-distance, so neighbors are always similar and the palette sweeps continuously around). Dense, overlapping placement is what creates one continuous band rather than distinguishable dots — if individual blobs are distinguishable in the output, they are too few or too small relative to their spacing.
2. **Extremely soft falloff.** Each gradient goes from its color at ~0.35-0.6 alpha at center to fully transparent at its outer radius, with intermediate stops making the falloff gradual rather than linear-harsh. Radius should be roughly 2-3x the intended visible bleed distance (since only the inner portion shows). Additionally apply a large blur (30-60px) over the whole composite so nothing has an edge and neighboring sources melt together. **If individual light sources are distinguishable as separate circles anywhere in the result, blur/density/overlap is insufficient — that is a failure state.**
3. **Additive/screen blending.** Use `globalCompositeOperation = 'lighter'` (canvas) or `mix-blend-mode: screen` (CSS) so overlapping blobs blend into brighter blended hues the way light does — this is a big part of why Apple's version looks luminous rather than like flat colored patches.
4. **Continuous fluid motion, NOT discrete reshuffling.** The previous version's "reshuffle color stops every 180-380ms" is the direct cause of "choppy/jumpy." Instead, drive everything from smooth math evaluated per animation frame. Two motions combine:
   - **The hue pattern slowly travels around the perimeter** (i.e. the color function's phase offset advances continuously with time), so the orange region drifts around toward where the pink was, etc. Slow — a full lap should take on the order of 20-60 seconds.
   - **Each light source's exact position/radius/intensity breathes independently** via slow multi-sine drift (`r = baseR + sin(t * 0.31 + phase1) * amp1 + sin(t * 0.17 + phase2) * amp2`), with different frequencies/phases per source so they never move in visible lockstep, giving the liquid/organic quality.
   Motion must be slow and liquid (cycles measured in many seconds), never snapping or stepping. Hue must interpolate continuously, never swap discretely.
5. **Bright Apple palette, swept around the perimeter.** Vivid pink/magenta, purple/violet, blue, and warm orange/coral — reference hexes: `#BC82F3`, `#F5B9EA`, `#8D9FFF`, `#AA6EEE`, `#FF6778`, `#FFBA71`, `#C686FF`. Map these around the perimeter as a smooth cyclic gradient (interpolate in a perceptually reasonable space — HSL/OKLCH beats naive RGB lerp, which muddies through grey) so adjacent regions always blend cleanly. Should read bright and saturated against a dark desktop, brightening toward near-white where sources overlap most.
6. **No corners problem by construction.** Because there's no rectangle path being stroked, corners stop being a concept — sources near a corner simply overlap and blend. Ensure the perimeter ring places sources densely enough around corners that no dark gap appears there (corners are where naive even-spacing along edges tends to leave holes — handle them deliberately).
7. **Audio-reactive, per the user's "flows with sound."** The renderer already computes a live mic level (`readMicLevel`/analyser code in `renderer/index.html`) and knows when TTS is speaking. Pipe an amplitude value (0-1) through to the overlay via the existing IPC glow-state channel (extend `reportGlowState` or add a lightweight high-frequency channel — but throttle to ~30-60fps max, don't spam IPC every sample) and drive blob radius + brightness from it, smoothed (e.g. `level = level * 0.8 + newLevel * 0.2`) so it swells and breathes with the voice rather than twitching. While Jarvis is *speaking* (TTS), drive it from the TTS audio's amplitude if practical (an `AnalyserNode` on the `Audio` element), otherwise a smooth synthetic pulse; while *listening*, drive from mic level; while *thinking*, a slow calm idle breathe.

## Verification (do all, report honestly)

1. Capture screenshots via the existing `--capture-glow` debug flow (or equivalent) for listening/thinking/speaking states and save to `screenshots/`, REPLACING the old ones.
2. **Programmatically verify "no hard edges" rather than assuming:** load a captured PNG, and check that along a horizontal scanline crossing the glow region, the alpha/brightness gradient between adjacent pixels never jumps sharply (e.g. no adjacent-pixel delta above some modest threshold within the glow area) — a stroked border produces a sharp spike, a soft glow produces a smooth ramp. Report the actual measured max delta. This is the single most important check, since "harsh edge" was the primary complaint and you cannot see the image yourself.
3. **Verify the inward falloff profile matches the reference band:** sample a perpendicular line inward from the middle of each screen edge and confirm brightness is maximal at/near the edge pixel and decays monotonically (allowing minor noise) to ~zero by roughly 4-8% of the screen's smaller dimension. Report the measured visible-bleed distance in pixels per edge. Too short = still looks like a line; too long = washes out the screen.
4. **Verify hue actually varies around the perimeter** (this is the distinguishing feature of the reference): sample pixels at many points around the perimeter, convert to hue, and confirm the hue sweeps through a meaningful range (multiple distinct hue families — e.g. warm/orange, magenta, violet, blue — not one flat color, and not random noise). Report the sampled hues in perimeter order so the sweep is visible in your report.
5. **Verify no individually-distinguishable circles:** along a line running PARALLEL to an edge (within the glow band), confirm brightness doesn't oscillate strongly in a regular periodic pattern — regular bright/dim scalloping means the individual light sources are showing as separate blobs rather than melting into one continuous band. Report the measured variation.
6. Confirm frame-to-frame motion is continuous: capture two frames ~100ms apart during the same state and confirm the image changed by a small, smooth amount (not a large discrete jump, which would indicate the reshuffle-style stepping returned) — e.g. mean per-pixel delta should be small but non-zero.
7. Confirm CPU usage is sane while active, and that the animation loop is still fully stopped (not just hidden) at idle — the previous session's cleanup guarantees must be preserved.
8. Confirm click-through still works and the overlay still covers true physical screen bounds.
9. `node --check` on changed main-process files; syntax-check renderer scripts.
10. List every file modified with a one-line reason.

## Hard rules

- Do NOT keep the conic-gradient border-stroke technique in any form — it is the root cause of three of the four complaints. Replace it.
- Do not regress: click-through, true-screen-bounds coverage, idle animation teardown, `forceGlowIdle()` safety calls, local-whisper transcription, manual double-tap dictation, or the tray "Talk to JARVIS (voice)" item.
- No new dependencies unless genuinely unavoidable (a tiny noise function can be written inline in ~20 lines — don't pull in a library for it); flag first if you think otherwise.
- If after implementing you cannot programmatically demonstrate via check #2 that the result is soft-edged, say so plainly rather than declaring success — the user has already rejected one version, do not hand back another unverified one.
