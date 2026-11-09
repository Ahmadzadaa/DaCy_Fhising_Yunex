# DaCy — HANDOFF (layihənin tam vəziyyəti, yeni AI söhbəti üçün)

> **Yeni AI-a:** bu faylı əvvəldən sonadək oxu. Burada layihənin məqsədi, istifadəçinin
> dəqiq tələbləri, verilmiş qərarlar, arxitektura, hər faylın vəzifəsi, necə işə salmaq,
> hansı problemlərin necə həll olunduğu və qalan işlər var. İstifadəçi ilə **Azərbaycan
> dilində**, qısa və aydın danış. Kod/şərhlər ingiliscədir.
> Son yenilənmə: 9 noyabr 2026.

---

## 1. Layihə nədir

**DaCy** — YUNEX Hackathon üçün anti-fraud (dələduzluğa qarşı) AI mobil tətbiqi.
Hədəf: yaşlı insanları (nənə-baba) və uşaqları telefon və mesaj fırıldaqlarından qorumaq.
Kateqoriyalar: Recode Finance / **Digital Inclusion** / Loyalty Lab.
Şüar: **“Fırıldaqçı tələsdirir. DaCy düşündürür.”** (EN: “Scammers rush you. DaCy makes you think.”)
Münsiflər ingilisdilidir → **UI default ingilis**, Azərbaycan dili bir toxunuşla (EN/AZ düyməsi).
Nitq tanıma: prioritet ingilis, Azərbaycan dili də dəstəklənir.

### İstifadəçinin dəqiq tələbləri (dəyişdirmə!)
1. **Ekran skanı:** telefonun yuxarısındakı qısayol (Control Center / Action düyməsi / Back Tap).
   Basanda AI **həmin anda açıq olan ekranı** skan edir, linki sandbox-da yoxlayır, “dələduzluqdur/deyil” deyir.
   **Mesajı tətbiqə yapışdırmaq əsas yol deyil** (amma “Check” ekranında manual yoxlama da var).
2. **Real vaxt zəng qoruması:** nənəyə/uşağa zəng gələndə AI ilk **5 saniyə** dinləyir.
   Zəng edən **kontaktdan/yaxın adamdırsa** → dinlədiyini **silir və özünü söndürür**.
   Dələduzluq aşkarlasa → zəng zamanı **qulağa/səsli xəbərdarlıq** edir və ya bildiriş göndərir.
   **Tanınmış fırıldaqçı nömrələrini bloklamaq istəmir** (maraqlı deyil).
3. **Ailə/uşaq rejimi:** WhatsApp/çat **izlənmir**. Yalnız uşağı zənglə aldatmağa çalışanlar
   aşkarlanır və **valideynə bildiriş** gedir. Məzmun paylaşılmır.
4. **Ailə qrupundan çıxış PIN-i:** qorunan üzv (uşaq) qrupdan **yalnız qrupu yaradan valideynin
   təyin etdiyi PIN ilə** çıxa bilər (son əlavə edilən tələb — hazırdır).
5. **DaCy Kids (uşaq istismarına qarşı):** valideyn **tətbiqləri seçir** (Instagram, WhatsApp, Telegram, TikTok,
   Snapchat, Discord, Roblox, SMS). Uşaq telefonu **adi qaydada** istifadə edir. AI yoxlaması **7/24 deyil — yalnız
   seçilmiş tətbiq açıq olanda** işləyir. Yalnız **şübhəli** bir şey olanda valideynə **qısa bildiriş** (risk, kateqoriya,
   tətbiq, vaxt) gedir — mesajlar heç vaxt. Uşağa yumşaq, gizli məsləhət çıxır, heç nə bloklanmır.
6. iOS-da **Expo Go** ilə açılmalıdır (iPhone 15 Pro). Dizayn (9 noyabr 2026, son qərar): **ultra-minimal, ağ (Apple HIG)** — ağ fon, çoxlu boşluq, kölgə/şüşə/animasiya yoxdur, 1 px boz sərhədlər, yalnız BİR vurğu rəngi (Safety Green #0A8754); uzun mətnlər ⓘ və “More” arxasında (`docs/ui-architecture.md`). Əvvəlki isti-açıq və tünd-şüşə dizaynlar Desktop-dakı ehtiyat zip-lərdədir. iOS üslubu,
   responsiv, animasiyalı, gözü yormayan.

### Verilmiş qərarlar
- **DaCy Üzlük (ağıllı telefon üzlüyü) YOXDUR** — imtina edilib.
- **Azercell operator inteqrasiyası “əlavə”dir** (gələcək/məhsul yolu). iOS heç bir tətbiqə zəng səsini
  vermir, ona görə **demoda zəng dinamikdə olur və ikinci telefon/eyni telefonun mikrofonu dinləyir**.
  Münsiflərə dürüst deyilir: “məhsulda səs operatordan (şəbəkədən) gələcək”.
- Zəng edənin nömrəsini iPhone tətbiqlərə vermir → istifadəçi zəngdən əvvəl seçir (Naməlum nömrə və ya etibarlı kontakt).
- **Yalnız real hallar (9 noyabr 2026, istifadəçinin qərarı):** Check, Ekran skanı, Zəng qoruması, Voice Lab və Ailə
  bölmələrində **heç bir hazır ssenari yoxdur** — demo SMS-lər, “Demo zəngi başlat”, Voice Lab ssenariləri, “Send test alert”
  düyməsi və `demo/` qovluğu (saxta zəng səsləri, `play-call.sh`) silinib. **Yalnız DaCy Kids simulyatorunda ssenarilər qalır.**
  Silinənlərin hamısı `~/Desktop/DaCy-backup-before-scenario-removal-2026-11-09.zip`-dədir.
  Köhnə ssenari kataloqu indi yalnız test məlumatıdır: `mobile/tests/fixtures/engineCases.ts` (tətbiqə daxil deyil).
- Twilio ilə şəbəkə səviyyəli demo ideyası müzakirə edilib, **qurulmayıb** (istifadəçi “sonra baxarıq” dedi).
- İstifadəçi əvvəl “mobile-guard” adlı başqa spesifikasiya zip-i göndərdi — **kənara qoyuldu, istifadə olunmur**.
- 0–100 risk balını **həmişə telefondakı deterministik mühərrik** hesablayır; AI yalnız sitatlı göstəricilər verir.
- Səs klonu (deepfake) aşkarlanması: **“eksperimental — model gözlənilir”**, saxta bal göstərilmir.
- **DaCy Kids yalnız Android-də real işləyə bilər** (AccessibilityService + NotificationListener agenti,
  dizayn: `docs/dacy-kids-android-agent.md`). iPhone heç bir tətbiqə başqa tətbiqləri oxumağa icazə vermir →
  iPhone-da Apple Communication Safety + Ekran skanı + Zəng qoruması. Expo Go-da fon agenti yoxdur →
  demoda **“Uşaq telefonu simulyatoru”** (`/kids-demo`) eyni mühərriki göstərir, xəbərdarlıqları **“Demo”** işarəlidir.
  Kodda bayraq: `KIDS_AGENT_AVAILABLE = false`.
- Uşağın çatları **heç vaxt serverə/AI-a getmir** — grooming mühərriki telefonda, yaddaşda işləyir.

---

## 2. Qovluq və arxitektura

Kök: `~/Desktop/dacy/`
```
dacy/
  HANDOFF.md          ← bu fayl
  README.md           ← münsiflər üçün EN təsvir + 5 dəq demo planı (yalnız real hallar)
  dev.sh              ← server + Expo-nu birlikdə işə salır (Node ≥22 seçir). ./dev.sh (tunnel) | --lan | --web
    scripts.txt       ← həmin səslərin mətni
    xeberdarliq-az.mp3← AZ səsli xəbərdarlıq nümunəsi
  docs/
    dacy-kids-android-agent.md ← Android yoxlama agentinin istehsal dizaynı (icazələr, Play qaydaları, məxfilik)
  mobile/             ← Expo SDK 58 tətbiqi (expo-router, TypeScript, React 19.3, RN 0.88)
  server/             ← Node 24 + Hono backend
```

### Axın
```
iPhone (Expo Go) ──HTTP──► Metro dev server :8081 ──/dacy-api/* proxy──► DaCy server :8787
                                                                         ├─ OpenAI: nitq→mətn (gpt-4o-mini-transcribe), TTS (gpt-4o-mini-tts),
                                                                         │          AI analiz + ekran şəkli (gpt-4.1-mini) — Claude açarı yoxdursa
                                                                         ├─ Claude (claude-opus-5-5) — ANTHROPIC_API_KEY olsa üstünlük verilir
                                                                         ├─ Link sandbox (SSRF-safe fetch, RDAP domen yaşı)
                                                                         └─ Ailə relay (in-memory + data/family.json)
```
- `mobile/metro.config.js` **proksi** əlavə edir: tətbiq serverə `<metro host>/dacy-api/...` ilə çatır.
  Bu həm LAN-da, həm tuneldə işləyir (ikinci tunel lazım deyil).
- `mobile/src/services/api/serverUrl.ts`: LAN IP → `http`, tunel host → `https` (tunel http→https 301 POST-u pozurdu).

### Mobil (`mobile/src`)
| Fayl | Vəzifə |
|---|---|
| `app/_layout.tsx` | Root Stack + provider-lər (Settings → ServerStatus → History → Family), açıq minimal tema (DefaultTheme, tünd StatusBar), FamilyAlertBanner |
| `app/(tabs)/_layout.tsx` | 5 tab: Home, Check, Call Guard, History, Family (iOS-da blur tab bar, haptik) |
| `app/(tabs)/index.tsx` | Əsas: status kartı, sürətli əməliyyatlar (2/4 sütun responsiv), statistika, son yoxlamalar |
| `app/(tabs)/analyze.tsx` | Mesaj/link/ekran şəkli yoxlaması (yalnız real mətn və ekran şəkli) |
| `app/(tabs)/voice.tsx` | Canlı zəng (CallGuardPanel) + Voice Lab |
| `app/(tabs)/history.tsx` | Lokal tarixçə (filtr, hamısını sil) |
| `app/(tabs)/family.tsx` | Ailə qrupu (yarat/qoşul, **çıxış PIN-i**, PIN dəyiş), etibarlı dairə, xəbərdarlıqlar, məxfilik önizləməsi |
| `app/kids-demo.tsx` | **Uşaq telefonu simulyatoru**: telefon çərçivəsində günlərlə axan çat, tətbiq açıq/bağlı, agent paneli (risk xətti, mərhələ, göstəricilər, valideynə tövsiyələr), xəbərdarlıq + eskalasiya (şəkil tələbi → şantaj), `demo:true` |
| `app/scan.tsx` | **Ekran skanı** deep-link girişi: `.../--/scan?text=...` və ya `?from=clipboard` |
| `app/shortcut-guide.tsx` | iOS Shortcuts qurulma təlimatı (link kopyalama) |
| `app/settings.tsx` | Dil, nitq dili, AI rejimi (Cloud/On-device/Deterministic), server URL, məxfilik |
| `app/result/[id].tsx` | Tarixçədən nəticə detalları |
| `features/callGuard/useCallGuard.ts` | **Canlı dinləmə mühərriki**: expo-audio recorder ilə 4 s AAC seqmentləri (ilk 5 s identifikasiya), `/v1/live/chunk`-a göndərir, transkripti telefonda skorlayır, 5 s qaydası, səsli xəbərdarlıq, ailə bildirişi (yalnız canlı mikrofon, demo zəng yoxdur) |
| `features/callGuard/CallGuardPanel.tsx` | Zəng ekranı UI (zəng edən seçimi, səviyyə zolağı, transkript, sayğac “X seqment · Y göndərildi”, xəta mesajı) |
| `features/callGuard/speakWarning.ts` | Səsli xəbərdarlıq: EN → iOS səsi (expo-speech); AZ → server TTS, yoxdursa tr-TR səsi |
| `features/voiceLab/VoiceLabPanel.tsx` | Səs yaz/fayl seç → söhbət riski + səs həqiqiliyi kartı |
| `services/security/riskEngine.ts` | **Deterministik 0–100 mühərrik** (`assessRisk`, `detectRuleSignals`, `scoreToBand`, `ENGINE_VERSION`) |
| `services/security/lexicon.ts` | EN+AZ fırıldaq və **uşaq təhlükəsizliyi** qaydaları (qatlanmış mətnə qarşı regex) |
| `services/security/groomingEngine.ts` | **DaCy Kids mühərriki**: `assessConversation(messages, {now, windowDays:30, knownContact})` → bal, mərhələ (trust→isolation→probing→image_request→coercion), `shouldAlert`, `alertCategory`, valideyn tövsiyələri, uşaq məsləhəti. Yalnız qarşı tərəfin mesajları sayılır |
| `constants/kidsScenarios.ts` | 4 EN+AZ ssenari: 28 günlük grooming (alert), sinif yoldaşı (yox), oyun yoldaşı (yox), gizli görüş (alert) |
| `constants/monitoredApps.ts` | 8 seçilə bilən tətbiq (ikon, rəng, Android paket adı) |
| `constants/childSafetyGuidance.ts` | Valideyn üçün “sakit olun, uşağı günahlandırmayın, sübutu saxlayın, şikayət edin” mətnləri |
| `components/kids/*` | ChildProtectionSection (valideyn: tətbiq seçimi; uşaq: şəffaflıq kartı), ChildPhone, RiskTimeline, StageStepper, childSettings (`KIDS_AGENT_AVAILABLE`) |
| `services/security/urlAnalyzer.ts` | Link çıxarma, leksik siqnallar, brend oxşarlığı, server yoxlamasını birləşdirmə |
| `services/security/textNormalize.ts` | `foldText` (uzunluğu saxlayır), `detectLanguage`, `locateEvidence` |
| `services/security/redact.ts` | Tarixçədə kod/kart/IBAN/şifrəni maskalayır (uzunluğu saxlayır) |
| `services/ai/modelProvider.ts` | Inference router: CLOUD_API / ON_DEVICE (Expo Go-da yox → fallback) / DETERMINISTIC |
| `services/api/client.ts` | Server client. **Fayl yükləmə `expo-file-system` `File` ilə** (SDK 58 fetch `{uri,name,type}` qəbul etmir) |
| `services/api/contract.ts` | Wire müqaviləsi — **`server/src/contract.ts` ilə sinxron saxlanmalıdır** |
| `state/*.tsx` | settings, history, serverStatus (20 s /health poll), family (3 s alert poll, PIN-li çıxış) |
| `constants/theme.ts` | **Minimal** tokenlər (ağ fon, boz sərhəd #E5E5EA, tək vurğu #0A8754, risk rəngləri yalnız məlumat üçün), kölgəsiz `elevation`, `TAB_BAR`, motion — `docs/ui-architecture.md` |
| `components/ui/{TabBar,InfoTip}.tsx` | Düz tab bar, ⓘ tooltip |
| `constants/indicators.ts` | Göstəricilərin kataloqu (çəki, EN/AZ ad/izah/tövsiyə, ikon) |
| `components/ui/*` | Card (giriş animasiyası), Button/PressableScale (yay animasiyası + haptik), Screen (iOS böyük başlıq), SegmentedControl (sürüşən), PulseDot |
| `components/result/*` | ResultView, RiskGauge (animasiyalı), HighlightedText, IndicatorList, UrlReportCard, VoiceAuthenticityCard |

### Server (`server/src`)
| Fayl | Vəzifə |
|---|---|
| `app.ts` | Bütün route-lar (Hono). CORS (`x-family-secret`, `x-leave-pin`) |
| `llm.ts` | Claude (structured outputs, `fallbacks:"default"`, effort low, prompt caching). Claude açarı yoxdursa → `llmOpenAI.ts` |
| `llmOpenAI.ts` | OpenAI Chat Completions + `json_schema strict`, vision (data URL) |
| `prompt.ts` | Sabit sistem promptu + few-shot (EN/AZ) |
| `stt.ts` / `tts.ts` | OpenAI (və ya Groq) nitq→mətn; OpenAI TTS |
| `urlInspect.ts` / `netguard.ts` | Sandbox: SSRF bloku (özəl IP-lər), redirect ≤5, 1 MB, 7 s, RDAP |
| `family.ts` | Ailə relay: üzv başına sirr (hash), **çıxış PIN-i (scrypt) + 5 səhv → 15 dəq blok**, guardian PIN dəyişə/üzv silə bilər. **DaCy Kids ayarları** (yalnız guardian dəyişir). Kodla qoşulan hər kəs **həmişə protected** olur. Protected üzv yalnız öz xəbərdarlıqlarını görür |
| `config.ts` | Env oxuma; `getLlmProvider()` = anthropic > openai > null |

### API (qısa)
`GET /health` · `POST /v1/analyze/text` · `POST /v1/analyze/image` · `POST /v1/transcribe` ·
`POST /v1/live/chunk` · `POST /v1/url/inspect` · `GET|POST /v1/tts` ·
`POST /v1/family` `{displayName, leavePin}` · `POST /v1/family/join` · `POST|GET /v1/family/:id/alerts` ·
`DELETE /v1/family/:id/members/:memberId` (protected → `x-leave-pin` lazımdır) · `PUT /v1/family/:id/leave-pin` (guardian) ·
`PUT /v1/family/:id/child-settings` `{enabled, monitoredApps, childWarnings}` (guardian).
Alert: `{band, category, source:'call'|'message'|'screen'|'voice'|'app', app?, demo?}` — `app` yalnız `source:'app'` olanda (məcburi); `demo` yalnız DaCy Kids simulyatorundan gəlir.

---

## 3. Necə işə salmaq

**Tələblər:** Node ≥ 22.13 (Mac-də `/usr/local/bin/node` v24 var; default PATH-dakı Node v20 KÖHNƏDİR),
iPhone-da ən son **Expo Go** (SDK 58), Expo hesabı: **ziyaddi17** (CLI-də `npx expo login` ilə daxil olunub).

```bash
cd ~/Desktop/dacy/mobile && npm install      # node_modules export-a daxil deyil
cd ~/Desktop/dacy/server && npm install
cp ~/Desktop/dacy/server/.env.example ~/Desktop/dacy/server/.env   # açarları yaz (aşağıya bax)
~/Desktop/dacy/dev.sh --lan                   # və ya ./dev.sh (ngrok tunel)
```
Terminalda çıxan QR-ı iPhone kamerası ilə skan et. Əllə: Expo Go → Enter URL manually → `exp://<Mac IP>:8081`.

**Açarlar (`server/.env`):**
- `OPENAI_API_KEY=` — hazırda istifadə olunan (nitq, TTS, AI analiz). **Export-a daxil edilməyib** (təhlükəsizlik) — yenidən yazmaq lazımdır.
- `ANTHROPIC_API_KEY=` — istəyə bağlı; olarsa AI analizi Claude ilə gedir.
- `server/.env` saxlananda server avtomatik yenidən başlayır (`tsx watch --include .env`). Bəzən başlamır → serveri əl ilə yenidən işə sal.

**Testlər:** `cd mobile && npm run test:engine` (236/236) · `cd server && npm test` (74/74) · `npm run typecheck` (hər ikisi).
iOS bundle yoxlaması: `cd mobile && CI=1 npx expo export --platform ios --output-dir /tmp/x`.

---

## 4. Şəbəkə problemləri və həlləri (VACİB)
- **LAN “timed out”:** telefon LTE-də idi və ya Wi-Fi “client isolation” edirdi. **Ən etibarlı həll: Mac-i iPhone-un Personal Hotspot-una qoşmaq** (IP adətən `172.20.10.2`). Sonra `./dev.sh --lan`.
- **Expo Go “signed in as ziyaddi17, but not signed in to Expo CLI”:** CLI-də `npx expo login` (brauzerlə) — edilib.
- **Köhnə tunel xətası (ERR_NGROK_3200, …exp.direct offline):** Expo Go “Try again” köhnə ünvanı açır → **Go home**, yeni QR skan et.
- `--tunnel` (Expo imzalı) və `--tunnel ngrok` hərdən qoşulmur (şəbəkə `expo.dev`/ngrok-u kəsəndə). Cloudflare quick tunnel bu şəbəkədə bloklanıb idi.
- Claude Code daxilində fon prosesləri sandbox-da internetə çıxa bilmirdi → serveri sandbox-suz işə salmaq lazım idi. İstifadəçinin öz terminalında bu problem yoxdur.
- Mac yuxuya getsə/şəbəkə dəyişsə → serverləri yenidən işə sal, yeni QR.

## 5. Həll edilmiş əsas xətalar (tarixçə)
1. Expo SDK 58 Node 22+ tələb edir → `/usr/local/bin` Node 24.
2. `useAudioStream` (PCM axını) Expo Go-da səs vermirdi → **adi recorder ilə seqmentlərə** keçildi.
3. **“Unsupported FormDataPart implementation”** → fayllar `expo-file-system` `File` kimi göndərilir.
4. Tunel http→https 301 POST-u pozurdu → tunel hostlarında `https`.
5. Ailə: server sıfırlananda köhnə link 401 verirdi → avtomatik unlink.
7. **Yalançı “kart/CVV” xəbərdarlığı (9 noyabr):** STT-yə göndərilən lüğət ipucu (“Bank, SMS code, OTP, CVV, PIN, card…”) sükut/fon səsində model tərəfindən sözbəsöz transkriptə yazılırdı → adi rəsmi danışıqda fırıldaq xəbərdarlığı. Həll: `server/src/stt.ts`-də ipucu silindi + sükut artefaktları süzülür (`cleanTranscript`); mühərrikdə sitatı mətndə tapılmayan AI “tələb” göstəriciləri atılır. Real səslə yoxlanıldı.
8. **“CVV/kart adı çəkildi → xəbərdarlıq” (9 noyabr):** sözün keçməsi artıq tələb sayılmır. Həssas məlumat adı yalnız soruşan fellə (deyin/oxuyun/göndərin/tell/read/send…) birlikdə tələbdir; fel yoxdursa 0 bal, “yalnız adı çəkildi” kimi göstərilir (`riskEngine` ASK_CUE_RE, MENTION_CONFIDENCE). AI təlimatına “mention ≠ request” qaydası əlavə olundu. “CVV kodunu deyin” artıq SMS kodu sayılmır. “kibertəhlükəsizlik şöbəsi” bank adından danışma kimi tanınır.
9. **Zəngdə yalançı/vaxtsız müdaxilə:** `features/callGuard/callExplain.ts` — səsli xəbərdarlıq yalnız `sure` olanda (kritik bal + real tələb + qaydalar+AI razılığı və ya ardıcıl 2 analiz), danışan susanda (1.2 s fasilə, maks. 8 s) deyilir; az əminlikdə yalnız ekranda, ailəyə bildiriş getmir. İzah şablon deyil: sitatlarla nə eşidildiyi, AI xülasəsi və konkret səsli xəbərdarlıq.
10. **Zərərçəkənin səsi / açıq fırıldaq 0% (9 noyabr):** server canlı hissəni paralel iki modeldən keçirir — dəqiq mətn `gpt-4o-mini-transcribe`, danışan dəyişikliyi `gpt-4o-transcribe-diarize` (AZ-ni türkcəyə çəkir, ona görə yalnız ipucu kimi), sonra `roles.ts` (`splitByRole`) mətni “Zəng edən / Siz” hissələrinə bölür (sözlər dəyişsə `validateSplit` rədd edir → rolsuz). Telefonda yalnız zəng edənin sözləri qiymətləndirilir (`scoredCallText`), transkriptdə “Zəng edən:/Siz:”. Gecikmə ~5–6 s/hissə; söndürmək: `STT_DIARIZE=0`. Mühərrik: “bloka düşüb” qorxutma, “…şöbəsindən zəng edirəm/yığmışam” rəsmi qurum, STT-nin pozduğu fellər üçün “nömrənizi/CVV-ni/kodunu” obyekt ipucu; səsli xəbərdarlıq həddi `SURE_MIN_SCORE = 65` (real tələb + təsdiq şərti qalır).
6. OpenAI ilk açarın krediti yox idi → istifadəçi yeni açar verdi (köhnəni ləğv etmək tövsiyə olunub).

## 6. Hazırda nə işləyir (yoxlanılıb)
- Brauzerdə: Əsas, Check (100/100 Kritik + vurğular + link sandbox), (o vaxt hələ mövcud olan) demo zəng (92/100, səsli xəbərdarlıq), ailə canlı bildirişi (3 s), EN/AZ, açıq isti tema, planşet 4 sütun.
- Serverdə real OpenAI: transkripsiya (“tell me the six-digit code…” sözbəsöz), AZ TTS (2 s), AI analiz AZ dolayı ifadəni tutdu (“o rəqəmləri mənə oxuyun” → OTP_REQUEST), live chunk (STT ~2 s + AI ~2–3 s).
- **DaCy Kids (brauzerdə, iki ayrı “telefon”: localhost və 127.0.0.1):** valideyn qrup yaradıb tətbiqləri saxladı →
  uşaq kodla qoşuldu, seçimləri gördü → uşaqda simulyator: 14-cü mesajda (şəkil tələbi) Kritik xəbərdarlıq,
  28-ci gündə şantaj üçün ikinci xəbərdarlıq → hər ikisi valideyndə canlı göründü (“Demo” işarəsi + növbəti addımlar).
  “Should not alert” ssenariləri 0 bal. Mühərrik versiyaları: `dacy-risk-1.2.0`, `dacy-kids-1.1.0`.
- iPhone-da: tətbiq açıldı, mikrofon səviyyəsi hərəkət edirdi; FormData düzəlişindən **sonra canlı transkript hələ təsdiqlənməyib**.

## 7. QALAN İŞLƏR (növbəti addımlar, prioritet sırası ilə)
1. **iPhone-da canlı zəng testi** (FormData düzəlişindən sonra): Call Guard → Unknown → Start; komanda üzvü ikinci telefondan zəng edib (dinamikdə) “bank təhlükəsizliyi” kimi SMS kodu istəyir. Gözlənilən: transkript, bal qalxır, səsli xəbərdarlıq.
2. Səsli xəbərdarlığın iPhone-da **dinamikdən** çıxdığını yoxla (qulaqlıqdan zəif ola bilər).
3. **Azərbaycan dilində canlı nitq** testi (nitq dili: Azərbaycanca).
4. **Ailə: iki telefonla** test (valideyn qrup yaradır + PIN, ikinci telefon kodla qoşulur, PIN-siz çıxa bilmədiyini yoxla).
   Sonra uşaq telefonunda **DaCy Kids simulyatoru** → valideyn telefonunda bildiriş gəlməlidir.
5. **Ekran skanı qısayolu**nu iPhone Shortcuts-da qur və Action Button/Control Center-dən sına (`shortcut-guide` ekranındakı link LAN IP-yə bağlıdır — şəbəkə dəyişəndə yenilə).
6. Voice Lab (yaz / fayl seç) və qalereyadan ekran şəkli analizi telefonda.
7. DaCy Kids-in kiçik qalan rəy qeydləri (aşağı prioritet): VoiceOver uşaq məsləhətini elan etmir; 720px+ ekranda
   4-cü ssenari çipi tam sətrə uzanır; simulyator bitəndə iki oxşar düymə var; `alertCategory` qeyri-grooming
   tələblərində (kart kodu + sirr) “Secrecy” göstərə bilər.
8. Kodu **git commit** et (heç nə commit olunmayıb; `mobile/` öz git repo-sudur, kökdə repo yoxdur).
9. **Pitch slaydları** + 5 dəqiqəlik demo məşqi.
10. (İstəyə bağlı) Twilio ilə real zəng (şəbəkə səviyyəli) demosu; Claude açarı.

## 8. README
- README yenilənib (9 noyabr 2026): 4 funksiya (DaCy Kids daxil), OpenAI/Claude, hotspot + `./dev.sh --lan`, PIN, məxfilik.

## 9. İstifadəçi haqqında
- Azərbaycanca yazır, qısa cavab sevir, “text kimi” sadə izah istəyir; texniki detalları bacardıqca özün həll et.
- Hər şeyi özün icra etməyə icazə verib; sonda QR kodu istəyir.
- Açarları çatda paylaşıb — açarları **heç vaxt** cavablarda təkrar yazma, yalnız `server/.env`-ə yaz.
- Expo Go-dakı göy “dişli” düymə Expo-nun developer düyməsidir (DaCy-nin deyil) — sürüşdürmək/telefonu silkələyib söndürmək olar.
