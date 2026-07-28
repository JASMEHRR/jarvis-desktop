# Fix Prompt: eliminate the grainy/static look, pull reach back to a thin edge band, remove the rhythmic ripple, brighten colors

## Context

Read `renderer/overlay.html` fully (the current shader — you're editing it, not rewriting the scaffold). Reference-only, never touch `E:\imp\projects\ASCEND`.

The user attached a real screenshot of this running live. Verdict, compared directly against their two Apple Intelligence reference images: **the entire glow looks like TV static/grain**, not a smooth light. Confirmed by the user as a genuine rendering artifact (not a screenshot compression artifact — visible to their eye in person too). Also: colors read muddy/dark (maroon-ish) rather than vivid magenta/purple/blue, and the glow reaches noticeably further into the screen than intended.

Separately, from a clarifying-question round, the user's actual spec is now nailed down precisely:
- Full 4-edge perimeter (already correct).
- **Thin band, edge only** — color should stay close to the edge, NOT a deep bloom toward center. The current haze/ripple reach overshoots this.
- **Nothing visible at idle** (already correct).
- **Slow liquid drift only** — colors slowly swirl/bleed like ink in water, calm and continuous. The user explicitly did NOT choose "rhythmic pulse/ripple in sync with voice" — so the current inward traveling-ripple-pulse feature (`ripple`/`uRippleSpeed`/`uRippleWidth`/`uRippleAmount` in the shader) should be removed or reduced to near-nothing; it's the wrong motion style per the user's own choice.

## Root cause of the grain (confirmed by reading the code — fix both)

1. **`gl.getContext('webgl', { ..., antialias: false, ... })`** — antialiasing is explicitly disabled. For a raw single-sample-per-pixel fragment shader with noise functions, this is a direct cause of aliasing artifacts reading as static. Change to `antialias: true`.
2. **The shimmer layer samples noise at too high a spatial frequency for a single-sample shader:** `float shimmer = snoise(vec2(t * uShimmerScale + uTime * uShimmerSpeed, depthN * uShimmerScale * 0.4));` then `rgb *= 1.0 + shimmer * uShimmerAmount;` — if `uShimmerScale` is high enough that `t * uShimmerScale` changes a lot between adjacent pixels, the noise function is being sampled above its effective Nyquist limit for on-screen pixel density, which produces exactly this "random-looking per-pixel static" look, not smooth shimmer. This is very likely the dominant cause given how pervasive the grain is across the whole visible glow. Either remove the shimmer layer entirely (simplest, and the user never asked for "electric shimmer" — that was an unrequested embellishment from a previous round) or drastically reduce its spatial frequency AND amplitude so it's subtle. Given four rejected iterations, prefer removing it outright — reintroduce later only if explicitly asked for.
3. **Add a real smoothing safety net regardless of the above:** implement a small two-pass render — pass 1 renders the current per-pixel shader to an offscreen texture (framebuffer), pass 2 samples that texture with a simple separable blur (a modest 5-9 tap gaussian or box blur, small radius e.g. 2-4px, is enough to erase any remaining per-pixel noise floor without destroying the intended large-scale color structure). This is a standard, cheap technique and guarantees the final output cannot look grainy regardless of how the noise functions are tuned — treat this as a hard requirement given how many rounds have already failed on exactly this complaint, not an optional nice-to-have. Do not skip it even if steps 1-2 alone seem to fix it in your own reasoning — you cannot see the result, and this is the belt-and-suspenders fix.
4. Also check whether the domain-warp/hue-field noise sampling (`domainWarp(domain, uTime*0.2)` fed by `angPos = ... * uNoiseScale` and the depth term) has spatial frequency high enough to contribute to the same aliasing problem — if `uNoiseScale` or `uDepthWarpScale` are large relative to how many screen pixels span one noise "cell," reduce them so noise features are large and smooth (many tens to hundreds of pixels wide), not fine-grained.

## Other fixes per the locked-in spec

5. **Pull the reach back to a thin edge band.** Reduce `uHazeReach`/`uHazeOpacity`/`hazeBand` so the visible color stays close to the true edge, not blooming deep into the screen — re-read the current `TUNE` defaults and cut the haze reach substantially (the screenshot shows it currently extends much further than "thin band, edge only" calls for).
6. **Remove or near-zero the rhythmic ripple.** The traveling inward pulse (`ripple = exp(-pow(pulseDist/uRippleWidth,2.0)) * uRippleAmount * uLevel`) implements the "rhythmic pulse" motion style the user did NOT choose. Remove this term from `intensity`, or set its amplitude to effectively zero, so motion comes only from the slow domain-warp color drift (liquid swirl), not a pulsing wave. Audio should still react (brightness/band-width scaling with `uLevel` as already implemented is fine and matches "reacting alive" without being a rhythmic pulse), just not via a traveling ripple wave.
7. **Brighten/de-mud the palette.** Current result reads dark/maroon rather than vivid. Increase base lightness in the `PALETTE` HSL values and/or `uBrightness`, and confirm (via pixel sampling) the result is measurably brighter and more saturated than the previous captures, closer to the vivid magenta/purple/blue/orange in the Apple references.

## Verification (report honestly, this is the fifth iteration on this feature)

1. **Grain check, the critical one:** sample a small patch of the glow band and measure pixel-to-pixel color variance between immediate neighbors. Compare before/after your fix — report both numbers. High-frequency neighbor-to-neighbor variance (static) must drop dramatically. If you can, describe the qualitative difference a human would see (smooth gradient vs. speckled).
2. Confirm the blur pass is actually wired into the render pipeline (framebuffer created, bound, sampled) — not just written and unused.
3. Confirm band reach is now thin/edge-hugging: report measured falloff distance in px per edge, and confirm it's noticeably less than the previous iteration's measurement.
4. Confirm no traveling ripple: capture two frames and confirm no wave-like structure moving across the depth axis, only slow perimeter-relative drift.
5. Confirm brightness/saturation increased vs. the last captured baseline (compare actual numbers).
6. Confirm click-through, screen-bounds coverage, idle teardown, CPU-at-idle all still hold (unchanged from previous sessions — just re-confirm, don't re-derive).
7. `node --check` on changed files.
8. **Save a fresh screenshot of the glow actively running** (as before, via the capture harness) and tell the user explicitly to look at it themselves / send it back for a direct visual check — automated pixel checks alone have not been sufficient signal across the last several rounds, a human visual pass is required before this is considered resolved.
9. List every file modified, one-line reason each, and the final tunable values you landed on.

## Hard rules

- Do not reintroduce discrete radial-gradient blob sources.
- Do not add npm dependencies — the blur pass is plain WebGL (a second framebuffer + a small blur fragment shader), no library needed.
- Do not regress dictation, transcription, hotkeys, tray items, chat window, or the taskbar-coverage limitation (already accepted as a known gap).
- This is the fifth attempt at this visual feature. Prioritize the grain fix above all else — it is the single complaint that has never actually been addressed in any previous round (all four prior prompts targeted fluidity/blending/vibrancy, none targeted rendering artifacts, because the artifact wasn't visible until a real screenshot was reviewed this round). Report measured before/after numbers, not impressions.
