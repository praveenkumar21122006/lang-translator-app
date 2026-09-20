import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
  FlatList,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import * as Clipboard from 'expo-clipboard';

const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', flag: '🇺🇸', voice: 'en-US' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸', voice: 'es-ES' },
  { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷', voice: 'fr-FR' },
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪', voice: 'de-DE' },
  { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹', voice: 'it-IT' },
  { code: 'pt', name: 'Portuguese', native: 'Português', flag: '🇵🇹', voice: 'pt-PT' },
  { code: 'ru', name: 'Russian', native: 'Русский', flag: '🇷🇺', voice: 'ru-RU' },
  { code: 'ja', name: 'Japanese', native: '日本語', flag: '🇯🇵', voice: 'ja-JP' },
  { code: 'ko', name: 'Korean', native: '한국어', flag: '🇰🇷', voice: 'ko-KR' },
  { code: 'zh', name: 'Chinese', native: '中文', flag: '🇨🇳', voice: 'zh-CN' },
  { code: 'ar', name: 'Arabic', native: 'العربية', flag: '🇸🇦', voice: 'ar-SA' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳', voice: 'hi-IN' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', flag: '🇳🇱', voice: 'nl-NL' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', flag: '🇹🇷', voice: 'tr-TR' },
  { code: 'pl', name: 'Polish', native: 'Polski', flag: '🇵🇱', voice: 'pl-PL' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська', flag: '🇺🇦', voice: 'uk-UA' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', flag: '🇻🇳', voice: 'vi-VN' },
  { code: 'th', name: 'Thai', native: 'ไทย', flag: '🇹🇭', voice: 'th-TH' },
];

const QUICK_PHRASES = [
  "Hello, how are you?",
  "Where is the nearest hotel?",
  "How much does this cost?",
  "I need help",
  "Thank you very much",
  "Where is the bathroom?",
  "Can you help me?",
  "I don't understand",
];

function getLang(code) {
  return LANGUAGES.find(l => l.code === code) || LANGUAGES[0];
}

// --- translation service ---
async function translateText(text, from, to) {
  if (!text.trim()) return "";
  if (from === to) return text;
  // Try MyMemory
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.responseData?.translatedText) {
      // MyMemory sometimes returns with extra metadata, clean it
      let t = data.responseData.translatedText;
      // Remove MyMemory warnings
      if (t.includes("MYMEMORY WARNING")) {
        // fallback to matches
        if (data.matches && data.matches[0]?.translation) t = data.matches[0].translation;
      }
      return t;
    }
    if (data?.matches?.[0]?.translation) return data.matches[0].translation;
  } catch (e) {
    console.log("MyMemory failed", e);
  }
  // Fallback: LibreTranslate via argos? try alternative free endpoint
  try {
    const res2 = await fetch("https://translate.argosopentech.com/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: from, target: to, format: "text" })
    });
    const d2 = await res2.json();
    if (d2.translatedText) return d2.translatedText;
  } catch (_) {}
  // Last fallback: mock (reverse + tag) so UI still works offline
  return `[${to}] ${text}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('translate'); // translate | conversation | history
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('es');
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [history, setHistory] = useState([]);
  const [pickerFor, setPickerFor] = useState(null); // 'source' | 'target' | null
  const [isListening, setIsListening] = useState(false);
  const [convInputA, setConvInputA] = useState('');
  const [convOutputA, setConvOutputA] = useState('');
  const [convInputB, setConvInputB] = useState('');
  const [convOutputB, setConvOutputB] = useState('');
  const [convTranslating, setConvTranslating] = useState(null); // 'A' | 'B' | null
  const recognitionRef = useRef(null);
  const debounceRef = useRef(null);

  const src = getLang(sourceLang);
  const tgt = getLang(targetLang);

  // Auto translate with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!inputText.trim()) {
      setTranslatedText('');
      return;
    }
    setIsTranslating(true);
    debounceRef.current = setTimeout(async () => {
      const res = await translateText(inputText, sourceLang, targetLang);
      setTranslatedText(res);
      setIsTranslating(false);
      if (res && inputText.trim()) {
        setHistory(h => {
          const entry = { id: Date.now().toString(), from: sourceLang, to: targetLang, original: inputText, translated: res, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
          // avoid duplicate consecutive
          if (h[0]?.original === inputText && h[0]?.from === sourceLang && h[0]?.to === targetLang) return h;
          return [entry, ...h].slice(0, 50);
        });
      }
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [inputText, sourceLang, targetLang]);

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInputText(translatedText);
    setTranslatedText(inputText);
  };

  const speak = async (text, langCode) => {
    if (!text) return;
    const lang = getLang(langCode);
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) await Speech.stop();
    Speech.speak(text, {
      language: lang.voice,
      pitch: 1.0,
      rate: 0.95,
    });
  };

  const copyText = async (text) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    if (Platform.OS === 'web') {
      // web alert fallback
      // use temporary feedback instead of Alert
    }
    // Show feedback via Alert on native
    if (Platform.OS !== 'web') Alert.alert('Copied', 'Text copied to clipboard');
  };

  // Speech to text for web
  const toggleListening = (targetSetter) => {
    if (Platform.OS !== 'web') {
      Alert.alert("Voice input", "Voice input is available on Web. On mobile, use your keyboard's microphone.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser. Try Chrome.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = getLang(sourceLang).voice;
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      if (targetSetter) targetSetter(transcript);
      else setInputText(prev => prev ? prev + " " + transcript : transcript);
    };
    recognitionRef.current = rec;
    rec.start();
  };

  const handleConvTranslate = async (side) => {
    if (side === 'A') {
      if (!convInputA.trim()) return;
      setConvTranslating('A');
      const res = await translateText(convInputA, sourceLang, targetLang);
      setConvOutputA(res);
      setConvTranslating(null);
      setHistory(h => [{ id: Date.now().toString(), from: sourceLang, to: targetLang, original: convInputA, translated: res, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 50));
    } else {
      if (!convInputB.trim()) return;
      setConvTranslating('B');
      const res = await translateText(convInputB, targetLang, sourceLang);
      setConvOutputB(res);
      setConvTranslating(null);
      setHistory(h => [{ id: Date.now().toString(), from: targetLang, to: sourceLang, original: convInputB, translated: res, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 50));
    }
  };

  const LanguagePickerModal = () => (
    <Modal visible={!!pickerFor} animationType="slide" transparent onRequestClose={() => setPickerFor(null)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select language</Text>
            <TouchableOpacity onPress={() => setPickerFor(null)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={LANGUAGES}
            keyExtractor={i => i.code}
            renderItem={({ item }) => {
              const selected = (pickerFor === 'source' ? sourceLang : targetLang) === item.code;
              return (
                <TouchableOpacity
                  style={[styles.langItem, selected && styles.langItemSelected]}
                  onPress={() => {
                    if (pickerFor === 'source') setSourceLang(item.code);
                    else setTargetLang(item.code);
                    setPickerFor(null);
                  }}
                >
                  <Text style={styles.langFlag}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.langName, selected && styles.langNameSelected]}>{item.name}</Text>
                    <Text style={styles.langNative}>{item.native} • {item.code.toUpperCase()}</Text>
                  </View>
                  {selected && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.logoRow}>
            <View style={styles.logoCircle}><Text style={styles.logoIcon}>◈</Text></View>
            <View>
              <Text style={styles.headerTitle}>LinguaLive</Text>
              <Text style={styles.headerSubtitle}>Real-time translation</Text>
            </View>
          </View>
          <View style={styles.onlineBadge}>
            <View style={styles.dot} />
            <Text style={styles.onlineText}>Online</Text>
          </View>
        </View>
        {/* Tabs */}
        <View style={styles.tabs}>
          {[
            { id: 'translate', label: 'Translate', icon: '⌖' },
            { id: 'conversation', label: 'Conversation', icon: '◐' },
            { id: 'history', label: 'History', icon: '↻' },
          ].map(t => (
            <TouchableOpacity key={t.id} style={[styles.tab, activeTab === t.id && styles.tabActive]} onPress={() => setActiveTab(t.id)}>
              <Text style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>{t.icon}  {t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {activeTab === 'translate' && (
          <>
            {/* Language selector */}
            <View style={styles.langBar}>
              <TouchableOpacity style={styles.langPill} onPress={() => setPickerFor('source')}>
                <Text style={styles.flag}>{src.flag}</Text>
                <Text style={styles.langPillText}>{src.name}</Text>
                <Text style={styles.dropdown}>▾</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.swapBtn} onPress={swapLanguages}>
                <Text style={styles.swapIcon}>⇄</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.langPill} onPress={() => setPickerFor('target')}>
                <Text style={styles.flag}>{tgt.flag}</Text>
                <Text style={styles.langPillText}>{tgt.name}</Text>
                <Text style={styles.dropdown}>▾</Text>
              </TouchableOpacity>
            </View>

            {/* Source card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardLabel}>{src.name.toUpperCase()} • {src.code.toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => toggleListening(null)} style={[styles.iconBtn, isListening && styles.iconBtnActive]}>
                    <Text style={[styles.iconBtnText, isListening && { color: '#fff' }]}>{isListening ? '● Listening' : '🎤'}</Text>
                  </TouchableOpacity>
                  {inputText ? (
                    <TouchableOpacity onPress={() => setInputText('')} style={styles.iconBtn}>
                      <Text style={styles.iconBtnText}>✕ Clear</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              <TextInput
                style={styles.textInput}
                placeholder={`Type in ${src.name}...`}
                placeholderTextColor="#9CA3AF"
                multiline
                value={inputText}
                onChangeText={setInputText}
                textAlignVertical="top"
              />
              <View style={styles.cardFooter}>
                <Text style={styles.charCount}>{inputText.length} / 5000</Text>
                <TouchableOpacity onPress={() => speak(inputText, sourceLang)} style={styles.speakBtn}>
                  <Text style={styles.speakText}>🔊 Speak</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Translating indicator */}
            {isTranslating && (
              <View style={styles.translatingRow}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={styles.translatingText}>Translating...</Text>
              </View>
            )}

            {/* Arrow */}
            <View style={styles.arrowWrap}>
              <View style={styles.arrowCircle}><Text style={styles.arrowText}>↓</Text></View>
            </View>

            {/* Target card */}
            <View style={[styles.card, styles.cardTarget]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardLabel}>{tgt.name.toUpperCase()} • {tgt.code.toUpperCase()}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => copyText(translatedText)} style={styles.iconBtn}>
                    <Text style={styles.iconBtnText}>⎙ Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => speak(translatedText, targetLang)} style={styles.iconBtnPrimary}>
                    <Text style={styles.iconBtnPrimaryText}>🔊 Listen</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.translatedBox}>
                {translatedText ? (
                  <Text style={styles.translatedText}>{translatedText}</Text>
                ) : (
                  <Text style={styles.placeholder}>Translation will appear here</Text>
                )}
              </View>
              {translatedText ? (
                <View style={styles.cardFooter}>
                  <Text style={styles.charCount}>{translatedText.length} characters</Text>
                  <TouchableOpacity onPress={() => copyText(translatedText)} style={styles.speakBtn}>
                    <Text style={styles.speakText}>⎙ Copy</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {/* Quick phrases */}
            <View style={styles.phrasesSection}>
              <Text style={styles.sectionTitle}>Quick phrases</Text>
              <View style={styles.phrasesGrid}>
                {QUICK_PHRASES.map(p => (
                  <TouchableOpacity key={p} style={styles.phraseChip} onPress={() => setInputText(p)}>
                    <Text style={styles.phraseText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        {activeTab === 'conversation' && (
          <View>
            <View style={styles.convInfo}>
              <Text style={styles.convInfoTitle}>Conversation Mode</Text>
              <Text style={styles.convInfoSub}>Two people can speak different languages. Each side auto-translates.</Text>
            </View>

            {/* Person A */}
            <View style={[styles.card, { borderTopWidth: 3, borderTopColor: '#6366F1' }]}>
              <View style={styles.convHeader}>
                <View style={[styles.avatar, { backgroundColor: '#EEF2FF' }]}><Text>👤</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.convPerson}>{src.flag} {src.name} Speaker</Text>
                  <Text style={styles.convHint}>Speak in {src.name}</Text>
                </View>
                <TouchableOpacity onPress={() => speak(convOutputA, targetLang)} style={styles.iconBtn}>
                  <Text style={styles.iconBtnText}>🔊</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.textInput, { minHeight: 70 }]}
                placeholder={`${src.name}...`}
                placeholderTextColor="#9CA3AF"
                multiline
                value={convInputA}
                onChangeText={setConvInputA}
              />
              <TouchableOpacity style={styles.convTranslateBtn} onPress={() => handleConvTranslate('A')}>
                {convTranslating === 'A' ? <ActivityIndicator color="#fff" /> : <Text style={styles.convTranslateText}>Translate → {tgt.name}  ➤</Text>}
              </TouchableOpacity>
              {convOutputA ? (
                <View style={styles.convResult}>
                  <Text style={styles.convResultLabel}>{tgt.flag} {tgt.name}</Text>
                  <Text style={styles.convResultText}>{convOutputA}</Text>
                  <TouchableOpacity onPress={() => speak(convOutputA, targetLang)} style={[styles.speakBtn, { marginTop: 8 }]}><Text style={styles.speakText}>🔊 Listen</Text></TouchableOpacity>
                </View>
              ) : null}
            </View>

            <View style={styles.swapRow}>
              <TouchableOpacity style={styles.swapBtn} onPress={swapLanguages}><Text style={styles.swapIcon}>⇄ Swap</Text></TouchableOpacity>
            </View>

            {/* Person B */}
            <View style={[styles.card, { borderTopWidth: 3, borderTopColor: '#10B981' }]}>
              <View style={styles.convHeader}>
                <View style={[styles.avatar, { backgroundColor: '#ECFDF5' }]}><Text>👥</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.convPerson}>{tgt.flag} {tgt.name} Speaker</Text>
                  <Text style={styles.convHint}>Speak in {tgt.name}</Text>
                </View>
                <TouchableOpacity onPress={() => speak(convOutputB, sourceLang)} style={styles.iconBtn}>
                  <Text style={styles.iconBtnText}>🔊</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.textInput, { minHeight: 70 }]}
                placeholder={`${tgt.name}...`}
                placeholderTextColor="#9CA3AF"
                multiline
                value={convInputB}
                onChangeText={setConvInputB}
              />
              <TouchableOpacity style={[styles.convTranslateBtn, { backgroundColor: '#10B981' }]} onPress={() => handleConvTranslate('B')}>
                {convTranslating === 'B' ? <ActivityIndicator color="#fff" /> : <Text style={styles.convTranslateText}>Translate → {src.name}  ➤</Text>}
              </TouchableOpacity>
              {convOutputB ? (
                <View style={styles.convResult}>
                  <Text style={styles.convResultLabel}>{src.flag} {src.name}</Text>
                  <Text style={styles.convResultText}>{convOutputB}</Text>
                  <TouchableOpacity onPress={() => speak(convOutputB, sourceLang)} style={[styles.speakBtn, { marginTop: 8 }]}><Text style={styles.speakText}>🔊 Listen</Text></TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {activeTab === 'history' && (
          <View>
            <View style={styles.historyHeader}>
              <Text style={styles.sectionTitle}>Recent translations</Text>
              {history.length > 0 && (
                <TouchableOpacity onPress={() => setHistory([])}><Text style={styles.clearHistory}>Clear all</Text></TouchableOpacity>
              )}
            </View>
            {history.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Text style={styles.emptyIcon}>🕘</Text>
                <Text style={styles.emptyTitle}>No history yet</Text>
                <Text style={styles.emptySub}>Your translations will appear here</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setActiveTab('translate')}><Text style={styles.emptyBtnText}>Start Translating</Text></TouchableOpacity>
              </View>
            ) : (
              history.map(item => (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyTop}>
                    <Text style={styles.historyLang}>{getLang(item.from).flag} {item.from.toUpperCase()} → {getLang(item.to).flag} {item.to.toUpperCase()}</Text>
                    <Text style={styles.historyTime}>{item.time}</Text>
                  </View>
                  <Text style={styles.historyOriginal}>{item.original}</Text>
                  <View style={styles.historyDivider} />
                  <Text style={styles.historyTranslated}>{item.translated}</Text>
                  <View style={styles.historyActions}>
                    <TouchableOpacity onPress={() => { setInputText(item.original); setSourceLang(item.from); setTargetLang(item.to); setActiveTab('translate'); }} style={styles.historyActionBtn}><Text style={styles.historyActionText}>↻ Reuse</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => copyText(item.translated)} style={styles.historyActionBtn}><Text style={styles.historyActionText}>⎙ Copy</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => speak(item.translated, item.to)} style={styles.historyActionBtn}><Text style={styles.historyActionText}>🔊 Listen</Text></TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <LanguagePickerModal />

      {/* Bottom hint for web */}
      {Platform.OS === 'web' && (
        <View style={styles.webHint}>
          <Text style={styles.webHintText}>💡 Tip: Press 🎤 to use voice input (Chrome) • 🔊 for text-to-speech • ⇄ to swap languages</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { backgroundColor: '#111827', paddingTop: 12, paddingBottom: 0, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoCircle: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center' },
  logoIcon: { color: '#fff', fontWeight: '800', fontSize: 16 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  headerSubtitle: { color: '#9CA3AF', fontSize: 12, marginTop: 1 },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  onlineText: { color: '#D1D5DB', fontSize: 12, fontWeight: '600' },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, paddingBottom: 14 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#1F2937', alignItems: 'center' },
  tabActive: { backgroundColor: '#6366F1' },
  tabText: { color: '#9CA3AF', fontWeight: '700', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  body: { flex: 1, padding: 16 },
  langBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  langPill: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, gap: 8, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  flag: { fontSize: 18 },
  langPillText: { flex: 1, fontWeight: '700', color: '#111827', fontSize: 14 },
  dropdown: { color: '#9CA3AF', fontSize: 12 },
  swapBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  swapIcon: { fontSize: 16, fontWeight: '700', color: '#6366F1' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  cardTarget: { backgroundColor: '#F9FAFB', borderColor: '#E0E7FF' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardLabel: { fontSize: 11, fontWeight: '800', color: '#6B7280', letterSpacing: 0.6 },
  textInput: { minHeight: 90, fontSize: 16, color: '#111827', lineHeight: 22, paddingTop: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  charCount: { color: '#9CA3AF', fontSize: 12 },
  speakBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#EEF2FF', borderRadius: 8 },
  speakText: { color: '#6366F1', fontWeight: '700', fontSize: 12 },
  iconBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#F3F4F6', borderRadius: 8 },
  iconBtnActive: { backgroundColor: '#EF4444' },
  iconBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  iconBtnPrimary: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#6366F1', borderRadius: 8 },
  iconBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  translatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  translatingText: { color: '#6366F1', fontWeight: '600', fontSize: 13, marginLeft: 8 },
  arrowWrap: { alignItems: 'center', marginVertical: 10 },
  arrowCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: '#fff', fontWeight: '700' },
  translatedBox: { minHeight: 60, justifyContent: 'center' },
  translatedText: { fontSize: 18, fontWeight: '600', color: '#111827', lineHeight: 26 },
  placeholder: { color: '#9CA3AF', fontSize: 15, fontStyle: 'italic' },
  phrasesSection: { marginTop: 20 },
  sectionTitle: { fontWeight: '800', fontSize: 15, color: '#111827', marginBottom: 10 },
  phrasesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  phraseChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  phraseText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  // conversation
  convInfo: { backgroundColor: '#EEF2FF', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#E0E7FF' },
  convInfoTitle: { fontWeight: '800', color: '#4338CA', fontSize: 14 },
  convInfoSub: { color: '#6B7280', fontSize: 12, marginTop: 4, lineHeight: 16 },
  convHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  convPerson: { fontWeight: '800', color: '#111827', fontSize: 13 },
  convHint: { color: '#9CA3AF', fontSize: 11 },
  convTranslateBtn: { backgroundColor: '#6366F1', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  convTranslateText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  convResult: { marginTop: 12, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  convResultLabel: { fontSize: 11, fontWeight: '800', color: '#6B7280', marginBottom: 6 },
  convResultText: { fontSize: 15, fontWeight: '600', color: '#111827', lineHeight: 20 },
  swapRow: { alignItems: 'center', marginVertical: 12 },
  // history
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  clearHistory: { color: '#EF4444', fontWeight: '700', fontSize: 13 },
  emptyHistory: { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', marginTop: 20 },
  emptyIcon: { fontSize: 32, marginBottom: 10 },
  emptyTitle: { fontWeight: '800', fontSize: 16, color: '#111827' },
  emptySub: { color: '#9CA3AF', fontSize: 13, marginTop: 6 },
  emptyBtn: { marginTop: 16, backgroundColor: '#6366F1', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  emptyBtnText: { color: '#fff', fontWeight: '800' },
  historyCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10 },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  historyLang: { fontSize: 11, fontWeight: '800', color: '#6366F1' },
  historyTime: { fontSize: 11, color: '#9CA3AF' },
  historyOriginal: { fontSize: 14, color: '#111827', fontWeight: '600' },
  historyDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 8 },
  historyTranslated: { fontSize: 14, color: '#4B5563' },
  historyActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  historyActionBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#F3F4F6', borderRadius: 8 },
  historyActionText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  // modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalTitle: { fontWeight: '800', fontSize: 16, color: '#111827' },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontWeight: '700', color: '#6B7280' },
  langItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  langItemSelected: { backgroundColor: '#EEF2FF' },
  langFlag: { fontSize: 22 },
  langName: { fontWeight: '700', color: '#111827', fontSize: 14 },
  langNameSelected: { color: '#4338CA' },
  langNative: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  check: { color: '#6366F1', fontWeight: '800', fontSize: 16 },
  webHint: { backgroundColor: '#111827', padding: 10, alignItems: 'center' },
  webHintText: { color: '#9CA3AF', fontSize: 11, textAlign: 'center' },
});
