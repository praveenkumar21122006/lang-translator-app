# LinguaLive — Real-Time Language Translation App

Mobile app (React Native + Expo) for real-time translation between users speaking different languages.

## Features

**Core Translation**
- 18 languages (EN, ES, FR, DE, IT, PT, RU, JA, KO, ZH, AR, HI, NL, TR, PL, UK, VI, TH)
- Real-time auto-translation with 600ms debounce
- Swap languages instantly, persistent history (50 entries)
- MyMemory free API + Argos fallback, offline graceful degradation

**Voice & Speech**
- Text-to-Speech via `expo-speech` (native voice per language)
- Speech-to-Text on Web via Web Speech API (Chrome) — keyboard mic fallback on mobile
- 🔊 Speak / Listen on both source & target cards

**Modes**
- **Translate tab**: single input → output, quick phrases, copy, char count
- **Conversation tab**: split-screen dual translation (A: source→target, B: target→source) for face-to-face dialogue
- **History tab**: reuse, copy, listen, clear

**UX**
- Dark header, pill language selectors, modal picker with flags
- Cards with shadows, history timeline, empty states
- Web hint bar, responsive on web + mobile

## Tech Stack
- Expo SDK 57, React 19, React Native 0.86, react-native-web
- `expo-speech` for TTS, `expo-clipboard` for copy, `expo-status-bar`
- No API key required (MyMemory)

## Run

```bash
npm install
npm start          # Expo DevTools (scan QR with Expo Go)
npm run android    # or ios
npm run web        # web @ http://localhost:8081  (current demo)
# alternative:
npx expo start --web --port 8081
```

Tested: `http://localhost:8081` — Metro Bundler running.

## Project Structure
```
App.js        — single-file app (tabs, translation, TTS/STT, history, picker)
app.json      — Expo config (LinguaLive Translator)
package.json  — deps
assets/       — icons
```

## API
```js
GET https://api.mymemory.translated.net/get?q={text}&langpair={from}|{to}
POST https://translate.argosopentech.com/translate {q, source, target}
```

## Next Improvements
- Persist history via AsyncStorage
- Offline dictionary cache
- Camera OCR translation (expo-camera + ML Kit)
- WebSocket real-time chat between two devices
