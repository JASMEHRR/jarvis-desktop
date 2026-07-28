# Redesign Prompt: make the edge glow a living, color-mixing plasma (not a clean flowing line)

## Context

Read first: `renderer/overlay.html` (the current WebGL shader — read it fully, you are modifying this shader's fragment logic, NOT rewriting the whole WebGL/IPC/state scaffold, which works). Also read `main.js`'s `--capture-glow` harness and the audio-level path in `renderer/index.html`. Reference-only, never touch: `E:\imp\projects\ASCEND`.

### Where we are

The glow is now a per-pixel WebGL fragment shader (good — this replaced three rejected discrete-blob attempts). Current user verdict: *"better than any before,"* BUT: *"clean lines and not immersive... I want ripples reacting alive not a following line... its not blending colors... does not give an alive feel, does not give a futuristic feel... look Apple Intelligence on phone, get inspired, the colors are close, the vibe is close, not the look."*

So: palette and general concept are right. The MOTION and COLOR-MIXING are wrong. It currently reads as a clean band of color sliding around the perimeter, not as living, blending, rippling plasma light.

### Root-cause analysis of the current shader (I have read it — these are the specific defects to fix; confirm each by reading the code yourself before changing it)

1. **Hue is a function of perimeter angle ONLY** (`float t = atan(uv.y-0.5, uv.x-0.5)/TAU + 0.5;` then hue comes from `t`). Consequence: every pixel along an inward ray from a given edge point has the *same* hue. Color can only travel *around* the ring; it can never vary or blend *across the band's thickness* or bloom inward. THIS is the primary cause of "clean line, not blending colors." The hue coordinate must become a function of a genuine 2D domain (both position along the perimeter AND depth into the band), so colors mix in two dimensions like ink diffusing.
2. **The noise warp is far too weak** (`noiseWarp: 0.09`, applied only as a tiny nudge to the 1D hue coordinate). It cannot create billowing, folding, mixing color zones. Domain-warping needs to be strong and multi-layered (feed noise back into noise) to get the fluid, turbulent, "alive" look.
3. **Nothing moves ACROSS the band** (inward/outward). There are no ripples traveling from the edge toward the center, so it can't "ripple / react alive." Need animated structure along the depth axis, especially reacting to audio.

## Task — rework the fragment shader's color+motion (keep the scaffold)

Keep: the WebGL setup, fullscreen-triangle, uniform plumbing, state machine, IPC, capture harness, `TUNE` block pattern, palette array, aspect-corrected edge-distance falloff, per-state gain/lap. Change the fragment shader's hue/flow/intensity math as follows:

1. **2D domain-warped color field.** Build the hue/palette lookup coordinate from BOTH:
   - perimeter position (angle, as now), AND
   - depth into the band (the aspect-corrected edge distance `d`, normalized within the band).
   Combine them into a 2D coordinate and run **iterated domain warping** on it: sample noise, use it to offset the sample point, sample again (2-3 iterations), classic fBm/turbulence domain-warp (Inigo Quilez "domain warping" is the canonical reference technique — implement it inline in GLSL, no dependency). The palette coordinate that comes out should therefore swirl and fold in two dimensions, so distinct colors bleed INTO each other in soft organic zones rather than sitting in clean angular bands. This is the single most important change — it directly fixes "not blending colors" and "clean lines."
2. **Strong, layered flow.** Increase warp strength substantially from the current timid 0.09 (expose as tunable; start much higher and tune down if it becomes chaotic mush — but the user wants MORE movement/mixing, not less, so err toward lively). Multiple noise octaves scrolling at different speeds/directions so the field churns and folds continuously and never reads as a rigid rotation. The color regions should visibly stretch, merge, and separate over time like liquid or aurora.
3. **Inward ripples / pulses reacting to audio.** Add animated structure along the DEPTH axis: e.g. a traveling wave or noise band that moves from the edge inward (or pulses outward from the edge) and whose speed/amplitude scales with `uLevel`. On a loud audio moment, the glow should visibly surge/ripple inward, not just brighten uniformly. This is what makes it "react alive" and "immersive" rather than a static-thickness line. Keep it smooth (no hard rings) — modulate intensity with a depth+time+noise function.
4. **Immersive depth.** The user says "not immersive." Consider (tunable): a slightly wider band, and a very faint, much lower-opacity extended haze reaching further inward beyond the bright band (a second, gentler falloff term) so the light feels like it fills the space rather than stopping at a crisp inner edge. The bright core stays near the edge; a soft aura extends inward. Don't wash the whole screen — keep the center clearly clear — but soften the "line" feeling.
5. **Keep vibrancy high.** Don't lose the brightness/saturation gains. Domain warping must not desaturate — keep interpolating in HSL and keep the core boost. If mixing muddies colors, it's because two far-apart palette hues are being averaged in a way that crosses grey; mitigate by keeping the palette traversal local (warp offsets should be moderate relative to palette spacing) rather than teleporting across the whole palette.
6. **Futuristic feel.** Somewhat subjective, but concretely: faster/more responsive reaction to audio, subtle high-frequency shimmer layered on the slow flow (a fast, low-amplitude noise term) so it feels energized and electric rather than a slow lava-lamp. Tune so listening feels alert, speaking feels energetic, thinking feels like a calm idle pulse.

## Verification (report REAL measured numbers — this is the fourth iteration, do not report on vibes)

Extend the `--capture-glow` harness. Capture listening/thinking/speaking plus a `uLevel` sweep (0.0 / 0.5 / 1.0), and report:

1. **Cross-band hue variation (proves colors now blend in 2D, the core fix):** along a line running INWARD from an edge (perpendicular to it), sample hue at multiple depths and confirm hue now VARIES across the band depth (previous version: ~0 variation across depth — that was the bug). Report the measured hue range across depth at several perimeter positions. A near-zero range means the 2D warp didn't take — that's a failure.
2. **Temporal fluidity / folding:** capture frames 100ms, 500ms, and 1500ms apart in the same state; report mean per-pixel delta at each. Confirm continuous change at 100ms and structurally *reorganized* (not merely rotated) color layout at 1500ms — ideally show that a bright color zone's centroid moved non-linearly, not just angularly around the ring.
3. **Inward ripple / audio reactivity:** at uLevel 0 vs 1, report the change in how far inward significant brightness reaches AND whether the depth-profile shape changes (ripple), not just peak brightness. The inward reach must visibly change with level.
4. **Smoothness (no regression to spots):** parallel-to-edge scanline variation + autocorrelation — confirm still no periodic scalloping.
5. **Vibrancy retained:** mean/peak saturation and brightness in-band; confirm not muddied vs. the current version (compare against its archived screenshots).
6. **Edge softness & 4-edge falloff consistency:** unchanged checks, confirm no regression.
7. CPU while active + full teardown at idle unchanged.
8. `node --check` main files; syntax-check renderer.
9. Every file modified + one-line reason; and print the final `TUNE` values you settled on.

## Hard rules

- Do NOT revert to discrete radial-gradient blob sources.
- Do NOT add npm dependencies — inline GLSL noise/domain-warp only.
- Do NOT regress click-through, screen-bounds coverage, `forceGlowIdle`, idle teardown, transcription, dictation, tray voice item, chat window.
- The taskbar-surface coverage limitation (Shell_TrayWnd can't be covered via Electron's public API) is already known and accepted — do not spend effort on it again.
- Fourth iteration on this exact feature: report measured numbers, and state plainly whatever you could not verify (you can't see it; the user will do the final visual judgment). Do not claim "alive/immersive/futuristic" as achieved — those are the user's to judge. Report only the measurements.
```
