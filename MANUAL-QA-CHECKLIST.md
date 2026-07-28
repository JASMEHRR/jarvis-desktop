# Manual QA Checklist — JARVIS Desktop

Everything below requires a real human (ears, real hardware, real other apps) to verify. Automated auditing and code-level testing already covered correctness, races, leaks, and error handling — see the QA loop report for that.

Fill in Pass/Fail and any notes as you go.

## 1. Hotkeys
1. [ ] Double-tap Right Shift from a cold start summons the orb. Pass/Fail: ____
2. [ ] Double-tap Right Ctrl while typing in Notepad starts dictation without stealing focus (cursor stays in Notepad). Pass/Fail: ____
3. [ ] Double-tap Right Shift while a dictation is actively recording force-stops it (does not open the orb window on top). Pass/Fail: ____
4. [ ] If uiohook fails to load on this machine, tray tooltip/menu correctly shows "Ctrl+Alt+J" / "Ctrl+Alt+D" and those combos work. Pass/Fail: ____

## 2. Voice feel (can't be judged by reading code)
5. [ ] ElevenLabs reply voice sounds natural, not robotic. Pass/Fail: ____
6. [ ] The ~1.7s silence-ends-turn window feels right — not cutting you off mid-sentence, not laggy waiting to respond. Pass/Fail: ____
7. [ ] The 9-second conversation-timeout (goes quiet → loop ends) feels like a reasonable amount of time, not too short/long. Pass/Fail: ____
8. [ ] Noise-floor calibration works in a normal room (not dead silent, not noisy) — the orb doesn't trigger on background hum, and it does pick up normal speech volume. Pass/Fail: ____

## 3. Dictation into real apps
9. [ ] Dictate into Notepad — text appears correctly, no missing words at the start/end. Pass/Fail: ____
10. [ ] Dictate into a browser address bar or search box. Pass/Fail: ____
11. [ ] Dictate into a chat app (Slack/Discord/Teams) — check emoji/punctuation render fine. Pass/Fail: ____
12. [ ] Confirm your original clipboard content is restored a couple seconds after a *successful* dictation paste (copy something distinctive first, dictate, then paste again elsewhere to confirm it's back to normal). Pass/Fail: ____

## 4. Visual / orb
13. [ ] Orb is clearly visible over a light-colored desktop wallpaper. Pass/Fail: ____
14. [ ] Orb is clearly visible over a busy/photo wallpaper. Pass/Fail: ____
15. [ ] Orb position looks right on your actual monitor setup (single monitor). Pass/Fail: ____
16. [ ] If you have multiple monitors: orb appears on the correct (primary) display, fully on-screen, not clipped. Pass/Fail: ____

## 5. Backend / transcription
17. [ ] Say something and confirm (via a temporary console.log or just trusting Groq's speed) that transcription feels fast — Groq should respond much quicker than the old Gemini-only path. Pass/Fail: ____
18. [ ] If you have a way to test it (e.g., temporarily using an invalid Groq key), confirm transcription still works via the Gemini fallback path. Pass/Fail: ____

## 6. Reminders
19. [ ] Set a reminder for 2 minutes from now via voice ("remind me to X in 2 minutes") — confirm the Windows toast AND the orb popup both appear on time. Pass/Fail: ____
20. [ ] Set a reminder, close the app before it's due, reopen after — confirm it fires late instead of silently vanishing. Pass/Fail: ____

## 7. Tray / autostart
21. [ ] Toggle "Start JARVIS with Windows" on, reboot (or log off/on), confirm JARVIS is running in the tray afterward with no visible console window. Pass/Fail: ____
22. [ ] Toggle it back off, reboot again, confirm it does NOT auto-launch. Pass/Fail: ____

## 8. Known minor limitation (not fixed — flagging, not a bug worth chasing)
23. [ ] If uiohook-napi's key hook ever dies mid-session (rare), the tray tooltip/menu still say "double-tap" even though hotkeys silently stopped working, until you quit and relaunch — the app no longer crashes (fixed this loop), but there's no live re-detection. If you ever notice the hotkeys stop responding, just quit and relaunch JARVIS from the tray. Pass/Fail (did this ever happen to you?): ____
