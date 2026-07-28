# Redesign Prompt: WebGL per-pixel shader glow (abandon discrete blob sources entirely)

## Context

Read first: `renderer/overlay.html`, `preload-overlay.js`, `preload.js`, `main.js` (overlay window creation, glow state machine, `captureGlowScreenshots`), `renderer/index.html` (the audio-level reporting path). Reference-only, never modify: `E:\imp\projects\ASCEND`.

### History — read this so you don't repeat a failed approach a third time

- **Attempt 1:** conic-gradient border stroke → rejected: read as a hard outline, broken corners, choppy.
- **Attempt 2:** ~52 overlapping radial-gradient sources, additively blended + blurred → rejected: still patchy/spotty, not fluid, not vibrant enough.
- **Attempt 3:** same technique, 64 sources, thinner/darker/retuned → **still rejected.** User's words: *"still not fluid enough or consistent... not giving the brightness I need... not incorporating the taskbar... I don't even feel it being active... it's half-assed... it's not that vibrant... it still looks not fluid, like so patchy. I want no spots. I want each pixel to act like a LED from a strip light with fluid flows and real time reactive vibes."*

**Root cause diagnosis (this is the important part): summing a finite number of discrete radial-gradient sources can never produce a perfectly smooth field.** Overlapping Gaussian-ish blobs always leave interference ripples between source centers — that IS the "patchy/spotty" the user keeps seeing, and no amount of adding sources, blurring, or retuning removes it; it only makes it subtler while also washing out vibrancy (which is exactly the tradeoff that made attempt 3 feel dim AND still patchy). **Stop tuning this technique. It is the wrong model for the requirement.**

The user's own phrasing describes the correct model exactly: **"each pixel acts like an LED."** That means computing the color of every pixel independently as a continuous mathematical function of its position — i.e. a fragment shader. There are no "sources" to leave gaps between, so smoothness is guaranteed by construction, and full brightness is achievable because you're not relying on blur to hide seams.

## Task 1 — reimplement the glow as a WebGL fragment shader

Replace the canvas-2D radial-gradient renderer in `renderer/overlay.html` with a WebGL (or WebGL2) full-screen fragment shader. Use raw WebGL — do NOT add three.js or any library for a single full-screen quad; it's ~40 lines of boilerplate for a fullscreen triangle/quad plus a shader, and pulling in a dependency for this is unjustified.

The fragment shader, per pixel, should compute roughly:

1. **Edge proximity → intensity.** Compute the pixel's normalized distance to the nearest screen edge (`d = min(uv.x, uv.y, 1.0-uv.x, 1.0-uv.y)` in normalized coords, corrected for aspect ratio so the band has uniform physical thickness on all four edges — an uncorrected version makes top/bottom thicker or thinner than left/right on a non-square screen, which will look wrong). Map that to intensity with a smooth falloff curve (e.g. `intensity = pow(1.0 - smoothstep(0.0, bandWidth, d), 1.6)`) so it's brightest exactly at the edge and decays smoothly inward. Expose `bandWidth` as a uniform so it's trivially tunable without restructuring anything.
2. **Perimeter position → hue.** Compute a continuous angular/perimeter coordinate for the pixel (e.g. `atan(uv.y-0.5, uv.x-0.5)` normalized to 0-1, which sweeps continuously around the screen and wraps seamlessly). Use it to sample a cyclic palette. **Interpolate the palette in a perceptual-ish space (HSL/HSV or OKLab), never naive RGB lerp** — RGB lerp between saturated hues passes through muddy grey, which will directly cause the "not vibrant" complaint again. The palette must wrap seamlessly (last color blends back into first) so there's no seam at the wrap point.
3. **Flow.** Add time-varying, continuously-evaluated distortion so the color field flows like liquid rather than merely rotating rigidly:
   - Advance the palette's phase with time (slow lap around the perimeter, ~20-40s).
   - Warp the perimeter coordinate with layered smooth noise (write a small inline 2D simplex/value-noise function in GLSL — standard ~20 line snippet, no dependency) sampled at a couple of octaves and scrolling at different speeds, so color regions stretch, swell and drift into each other organically instead of marching in lockstep. This layered-noise warp is what actually produces the "fluid / flows like water" quality; a pure rotation will read as mechanical.
   - Modulate intensity slightly with a second, slower noise field so the band breathes unevenly along its length (real LED strips / Apple's effect are never perfectly uniform brightness), but keep this subtle enough that it never reads as discrete spots.
4. **Audio reactivity — make it obvious.** A `uLevel` uniform (0-1, smoothed) driven by live mic amplitude while listening and by real TTS output amplitude while speaking. It must visibly drive **both** band thickness and brightness/saturation, with enough range that the user unmistakably *feels* it responding — the complaint "I don't even feel it being active" means the previous mapping was far too subtle. Make the difference between silence and loud speech dramatic (e.g. band width and brightness both scaling meaningfully, not by a few percent). Also make idle-but-active states (thinking) clearly alive via the noise flow, not static.
5. **Vibrancy.** Target genuinely luminous, saturated color — bright magenta/violet/blue/orange like the Apple reference, reading vividly against a dark desktop. Since you're no longer using blur to hide seams, you can push saturation and brightness far higher than attempt 3 without introducing artifacts. Consider a mild bloom-ish boost (e.g. raising intensity to a power and adding a soft additive core near the very edge) to get that "light spilling in" quality. The user has now twice said it isn't vibrant/bright enough — err on the side of too vivid; it's trivially tunable down via a uniform afterward.

## Task 2 — cover the taskbar

The user explicitly noted the glow is "not incorporating the taskbar." The overlay must visually cover the taskbar region so the glow traces the true physical screen edge, including along the bottom where the taskbar sits.

Investigate and fix:
- Confirm the overlay window's bounds are the full `screen.getPrimaryDisplay().bounds` (not `workArea`, which excludes the taskbar) — verify what the code currently does rather than assuming it's correct.
- On Windows, a normal `alwaysOnTop: true` window does NOT render above the taskbar. Use `win.setAlwaysOnTop(true, 'screen-saver')` (the highest Electron level) and verify empirically that the glow actually appears over the taskbar rather than behind it. If `screen-saver` level causes problems (e.g. covering other apps' fullscreen modes badly), report the tradeoff and pick the best working level, explaining the choice.
- Verify click-through (`setIgnoreMouseEvents(true, { forward: true })`) still holds at this window level — the taskbar must remain fully clickable. **This is a hard requirement: if raising the window level breaks taskbar interaction, that is a regression worse than the visual gap; report it rather than shipping it.**

## Verification (report real measured numbers, honestly)

Reuse/extend the existing `--capture-glow` screenshot pipeline and its programmatic checks. All must be reported:

1. **Smoothness / no spots (the critical one, since this is the third attempt at exactly this complaint):** sample a line running PARALLEL to each edge, inside the band. Compute the variation/periodicity of brightness along it. A shader-based field should show smooth low-frequency variation from the noise, with **no regular periodic scalloping** (which is the signature of discrete sources). Report the measured max local variation and confirm no periodic pattern at the old source spacing.
2. **Edge softness:** max adjacent-pixel delta along a perpendicular scanline — confirm smooth ramp, no spike.
3. **Falloff distance:** measured visible bleed in px per edge; confirm consistent on all four edges (this specifically validates the aspect-ratio correction — uncorrected shaders fail here with top/bottom differing from left/right).
4. **Hue sweep:** sample around the perimeter, report hues in order, confirm a smooth full sweep with no muddy grey stretch (validates perceptual interpolation) and no seam at the wrap point.
5. **Vibrancy:** report mean and peak saturation + brightness within the band, and compare against the previous implementation's captures if still available — it must be measurably more vivid, not just claimed to be.
6. **Audio reactivity:** capture at `uLevel = 0.0`, `0.5`, and `1.0` and report the measured difference in band thickness and peak brightness between them. If the difference isn't dramatic, increase the mapping and re-measure — "I don't feel it being active" is a rejection criterion.
7. **Taskbar coverage:** confirm empirically (screenshot of the bottom edge region, or equivalent evidence) that the glow renders over the taskbar area, and separately confirm the taskbar is still clickable.
8. **Fluidity:** capture frames ~100ms and ~500ms apart; confirm continuous small change at 100ms and clearly evolved (not merely rotated) structure at 500ms.
9. CPU/GPU: confirm reasonable usage while active and that rendering is fully stopped (not just hidden) at idle — `cancelAnimationFrame` on hide, WebGL context not left spinning.
10. `node --check` changed main-process files; syntax-check renderer scripts.
11. List every file modified, one-line reason each.

## Hard rules

- **Do not keep or fall back to the discrete radial-gradient-sources technique.** It is the proven root cause of three rejections. If WebGL is somehow unavailable in this Electron build (it won't be — Chromium supports it), stop and report rather than reverting to blobs.
- No new npm dependencies. Raw WebGL + inline GLSL noise only.
- Do not regress: click-through, true-screen-bounds coverage, `forceGlowIdle()` safety calls, idle teardown, local-whisper transcription, manual double-tap dictation, tray "Talk to JARVIS (voice)" item, chat window behavior.
- Expose the main tunables (`bandWidth`, base brightness/saturation, noise scale, flow speed, audio-reactivity gain) as clearly-named constants/uniforms at the top of the shader setup so the next tuning round is a one-line change, not a restructure.
- The user has rejected this feature three times. Do not report success on vibes — report the measured numbers from the verification section and state plainly anything you could not verify.
