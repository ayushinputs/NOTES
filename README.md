# Voice Prediction Notes

A mobile-first web app for mentalism performances. It looks like a plain notes app (inspired by One UI, not affiliated with or endorsed by Samsung, and it uses no Samsung logos). Using a secret tap and a wake word, the spectator's spoken choice appears in a blank note as animated typing.

**Flow:** open blank note → secret tap → wake word → spectator's choice → typed reveal.

## Run it locally

No build step and no dependencies.

```bash
cd project
python3 -m http.server 8080
```

Open `http://localhost:8080` in Chrome. `localhost` counts as a secure context, so the microphone works.

### Use it on your phone

Speech recognition needs **HTTPS** (a plain `http://192.168.x.x` address will not get microphone access). Pick one:

- Upload the three files to GitHub Pages, Netlify, Vercel or Cloudflare Pages (all free, HTTPS by default).
- Run a tunnel such as `ngrok http 8080` and open the HTTPS link on the phone.
- Chrome on Android: add the page to the home screen for a full-screen look.

## Browser support

| Browser | Status |
|---|---|
| Chrome / Edge on Android | Best choice. Works with continuous listening. |
| Chrome on desktop | Works (good for rehearsal). |
| Safari / iOS | Partial. Recognition may be limited or stop on its own. Test before relying on it. |
| Firefox | No Web Speech recognition. Use the manual backup. |
| Samsung Internet | Support varies by version. Test it, or use Chrome. |

Chrome's recognition sends audio to Google's servers, so **an internet connection is required**. Continuous listening is not guaranteed on every browser. The app restarts sessions that the browser ends, but you should still rehearse on the exact phone and browser you will perform with.

## Secret settings

Open them with a **1.2 second long-press** on the "Notes" title (home screen) or on the date line under the title in an open note. On desktop, press Ctrl+Shift+S.

| Setting | Notes |
|---|---|
| Wake word and alternate spellings | The recognizer may hear "Coco" as "koko", so add likely mishearings. |
| Hotspot corner, size and taps required | The hotspot is an invisible coordinate check, not an element, so normal editing is unaffected. Avoid the top-left corner unless you accept overlapping the back button. |
| Typing speed, human rhythm, typos | Makes the typing look manual. |
| Language, capture timeout, pause before reveal | The pause is the silence needed after the choice before typing begins. |
| Capitalization, spoken numbers | Title Case by default. "Convert words to digits" turns "seven thousand four hundred twenty-five" into 7425. |
| Reveal automatically | When off, the prediction waits until you tap the hotspot again. |
| Vibration | See the haptic guide below. |
| Allow microphone | Grants permission ahead of time so no prompt appears on stage. |
| Flash hotspot | Shows the hotspot outline for 1.5 seconds so you can place it. |
| Status panel | Shows state, permission, last heard text and errors. |
| Retry listening, Reset trick, Manual backup | Backup types the prediction into the note if speech fails. |

Settings are saved in `localStorage`.

## Magician page (hidden in the Grocery list note)

Open the **Grocery list** note, then long-press (1.2 s) its **title** or the **date line**. The magician page slides in with:

- **Start performance**: opens a fresh blank note, and goes full screen if enabled.
- **Full screen / Exit full screen** button. iPhone Safari does not support it for web pages; use Add to Home Screen instead.
- Live state display, plus the status log.
- **Allow microphone**, **Test wake word** (listens for 8 seconds and says whether it matched), **Show hotspot** and **Reset trick**.
- Every setting (wake word, hotspot corner, size, taps, typing speed, language, timeout and the rest) edited inline.
- Manual backup, which types your text into a new blank note.

The hotspot is disabled while this page is open. Reset only removes the revealed text and never the note's own contents. The older settings sheet (long-press on the "Notes" title or on the date line in other notes) still works.

## Performing

1. Before the show: open the settings, tap **Allow microphone**, set your wake word, and rehearse in the venue's noise level.
2. Open a **new blank note** with the + button. The microphone is off.
3. Show the note: "See here, I will type the prediction."
4. Secretly tap the hotspot corner. You feel one short buzz: the app is armed.
5. Say your wake word. You feel three pulses: the app is now capturing.
6. Say, or have the spectator say, their choice. After a short pause it types out.
7. One longer buzz means done. The microphone is already off.
8. To repeat: long-press the date line → **Reset trick**, or go back and open another new note.

### Haptic guide

| Pattern | Meaning |
|---|---|
| 1 short | Armed, listening for the wake word |
| 3 quick pulses | Wake word heard |
| 1 medium | Reveal finished |
| 2 long | Error (microphone denied or unsupported); use the manual backup |

## Tips

- Keep the phone close to the speaker. Recognition is much worse across a room.
- Choose a wake word that is distinctive and not part of common speech.
- Short one-word choices like single letters are hardest for recognizers. Rehearse them.
- Turn off the **Flash hotspot** outline. It is only displayed inside the settings and disappears on its own.
- If the number of taps required is set above 1, taps must land within about 0.9 seconds.

## Files

- `index.html` screens and settings sheet
- `style.css` styling, dark mode and transitions
- `script.js` state machine, hotspot, speech recognition, typing and settings
