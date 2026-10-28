import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Answer, Settings, defaults, languageOf } from "../core/model";
import "katex/dist/katex.min.css";
import "./style.css";
import type { TraceItem } from "../core/trace";
import type { BasketQuestion } from "../core/multi-page";
import { AnswerContent } from "./AnswerContent";
type State = {
  settings: Settings;
  history: Answer[];
  consent: boolean;
  mode: boolean;
  busy: boolean;
  capturing: boolean;
  collapsed: boolean;
  recommendations: string[];
  vision: boolean;
  locale: string;
  traceSelecting: boolean;
  traceCount: number;
  traceItems: TraceItem[];
  multi?: {active:boolean;answering:boolean;mode?:"auto"|"watch";pages:number;reason?:string;basket:BasketQuestion[]};
};
declare global {
  interface Window {
    winbot: {
      command: (
        action: string,
        payload?: unknown,
      ) => Promise<{ ok: boolean; state: State; error: string }>;
      on: (event: string, callback: (data: any) => void) => () => void;
    };
  }
}
const errors: Record<string, [string, string]> = {
  captureCoordinates: ['Could not convert the selected region to display pixels. [captureCoordinates]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureCoordinates'],
  captureDisplayChanged: ['The display changed. Open Trace again and reselect the question. [captureDisplayChanged]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureDisplayChanged'],
  captureWorkerStart: ['The capture worker could not start. [captureWorkerStart]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureWorkerStart'],
  captureWorkerLoad: ['The capture worker or native library could not load. [captureWorkerLoad]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureWorkerLoad'],
  captureWorkerExit: ['The capture worker stopped unexpectedly. [captureWorkerExit]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureWorkerExit'],
  captureTimeout: ['The capture worker timed out. [captureTimeout]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureTimeout'],
  captureNativeLoad: ['The Windows capture library could not initialize. [captureNativeLoad]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureNativeLoad'],
  captureNativeDC: ['Windows did not provide a screen device context. [captureNativeDC]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureNativeDC'],
  captureNativeBitmap: ['Windows could not allocate the selected image. [captureNativeBitmap]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureNativeBitmap'],
  captureNativeBlit: ['Windows could not copy pixels from the selected region. [captureNativeBlit]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureNativeBlit'],
  captureNativeRead: ['Windows could not read the selected bitmap. [captureNativeRead]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureNativeRead'],
  captureTransfer: ['The capture worker could not return image bytes. [captureTransfer]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureTransfer'],
  captureDecode: ['The captured image could not be decoded. [captureDecode]', 'स्क्रीन कैप्चर चरण विफल। कोड: captureDecode'],

  traceUnsupported: ["Region capture is unavailable on this platform. Linux Trace requires X11.","इस प्लेटफॉर्म पर क्षेत्र कैप्चर उपलब्ध नहीं। Linux पर X11 चाहिए।"],
  traceRegions: ["Select up to 16 complete regions, including all options.","सभी विकल्पों सहित अधिकतम 16 क्षेत्र चुनें।"],
  traceScrollUnsupported: ["Could not scroll the document. Try Watch scrolling or scroll manually.","दस्तावेज़ स्क्रोल नहीं हुआ। स्क्रोल देखते रहें चुनें या खुद स्क्रोल करें।"],
  multiRegion: ["Select one rectangle around the question list.","प्रश्न सूची के चारों ओर एक आयत चुनें।"],
  multiBusy: ["Finish the current capture first.","पहले वर्तमान कैप्चर पूरा करें।"],
  multiUnclear: ["Unclear — capture this question and all its options again.","अस्पष्ट — इस प्रश्न और सभी विकल्पों को फिर कैप्चर करें।"],
  consent: [
    "Grant screen permission and enable Answer Mode first.",
    "पहले स्क्रीन की अनुमति दें और उत्तर मोड चालू करें।",
  ],
  apiKey: [
    "Add valid provider API keys to .env, then restart Winbot.",
    "वैध API कुंजियाँ .env में जोड़ें, फिर Winbot पुनः चालू करें।",
  ],
  apiFailure: [
    "The provider could not answer. Please try again.",
    "सेवा उत्तर नहीं दे सकी। फिर से प्रयास करें।",
  ],
  apiRateLimit: [
    "AI rate limit reached. Wait a little, then use Retry provider errors.",
    "AI की अनुरोध सीमा पूरी हुई। थोड़ी देर बाद सेवा की त्रुटियाँ फिर आज़माएँ।",
  ],
  offline: [
    "Network unavailable or request timed out. Check your connection.",
    "नेटवर्क उपलब्ध नहीं या समय समाप्त हुआ। कनेक्शन जाँचें।",
  ],
  noText: [
    "No readable text found. Enlarge the question or type it below.",
    "पढ़ने योग्य पाठ नहीं मिला। प्रश्न बड़ा करें या नीचे लिखें।",
  ],
  ocrDisabled: [
    "OCR is off. Enable it in Settings or type a question.",
    "OCR बंद है। सेटिंग्स में चालू करें या प्रश्न लिखें।",
  ],
  ocrFailure: [
    "OCR failed. Check the language models and try again.",
    "OCR विफल हुआ। भाषा मॉडल जाँचें और फिर प्रयास करें।",
  ],
  capture: [
    "Screen capture failed. Retry after opening the screen you want to capture.",
    "स्क्रीन कैप्चर विफल हुआ। इच्छित स्क्रीन खोलकर फिर कोशिश करें।",
  ],
  hotkey: [
    "That shortcut is invalid or already in use. Choose another.",
    "यह शॉर्टकट अमान्य है या उपयोग में है। दूसरा चुनें।",
  ],
  settings: [
    "Could not save or load settings. Check the file and try again.",
    "सेटिंग्स सहेजी या पढ़ी नहीं जा सकीं। फ़ाइल जाँचें।",
  ],
};
function App() {
  const [state, setState] = useState<State>();
  const [draft, setDraft] = useState(defaults);
  const [answer, setAnswer] = useState<Answer>();
  const [error, setError] = useState("");
  const [tab, setTab] = useState("answer");
  const [input, setInput] = useState("");
  const [accepted, setAccepted] = useState(false);
  const s = state?.settings || defaults;
  const hindi = languageOf(s, "", state?.locale || navigator.language) === "hi";
  const t = (en: string, hi: string) => (hindi ? hi : en);
  async function command(action: string, payload?: unknown) {
    try {
      const result = await window.winbot.command(action, payload);
      if (result.ok) {
        setState(result.state);
        if (["get", "settings", "import"].includes(action))
          setDraft(result.state.settings);
        setError("");
      } else setError(result.error);
      return result.ok;
    } catch {
      setError("apiFailure");
      return false;
    }
  }
  useEffect(() => {
    void command("get");
    const off = [
      window.winbot.on("state", (next: State) => { setState(next); if (next.busy) setAnswer(undefined); }),
      window.winbot.on("answer", (a: Answer) => {
        setAnswer(a);
        setTab("answer");
        setError("");
      }),
      window.winbot.on("trace-reset", () => {setAnswer(undefined);setState(prev=>prev?{...prev,traceItems:[]}:prev);}),
      window.winbot.on("trace-item", (item:TraceItem) => {
        setAnswer(undefined);setTab("answer");setError("");
        setState(prev=>{if(!prev)return prev;const items=[...(prev.traceItems||[])];items[item.index]=item;return {...prev,traceItems:items};});
      }),
      window.winbot.on("error", setError),
      window.winbot.on("cleared", () => setAnswer(undefined)),
    ];
    return () => off.forEach((f) => f());
  }, []);
  const field = (key: keyof Settings, value: unknown) =>
    setDraft({ ...draft, [key]: value });
  const select = (
    key: keyof Settings,
    label: string,
    values: [string, string][],
  ) => (
    <label>
      {label}
      <select
        value={String(draft[key])}
        onChange={(e) => field(key, e.target.value)}
      >
        {values.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <main
      data-theme={s.theme}
      style={
        {
          "--accent": s.accent,
          fontFamily: s.font,
          fontSize: s.fontSize,
        } as React.CSSProperties
      }
    >
      <header>
        <div className="brand">
          <span className="logo">W</span>
          <div>
            <strong>Winbot</strong>
            <small>
              {t("A little clarity, on demand.", "ज़रूरत पर, स्पष्ट उत्तर।")}
            </small>
          </div>
        </div>
        <button
          aria-label={t("Collapse panel", "पैनल छोटा करें")}
          onClick={() => command("collapse")}
        >
          {state?.collapsed ? "+" : "−"}
        </button>
      </header>
      <div className="status" role="status">
        <span className={state?.busy ? "dot active" : "dot"} />
        {state?.capturing
          ? t("Capturing screen…", "स्क्रीन कैप्चर जारी…")
          : state?.busy
            ? t("Reading, searching, thinking…", "पढ़ना, खोजना, सोचना…")
            : state?.mode
              ? t(
                  "Ready · captures only when asked",
                  "तैयार · केवल कहने पर कैप्चर",
                )
              : t(
                  "Answer Mode off · no capture",
                  "उत्तर मोड बंद · कैप्चर नहीं",
                )}
      </div>
      {!state?.collapsed && (
        <>
          <nav>
            {[
              ["answer", t("Assistant", "सहायक")],
              ["history", t("History", "इतिहास")],
              ["settings", t("Settings", "सेटिंग्स")],
            ].map(([id, label]) => (
              <button
                className={tab === id ? "selected" : ""}
                key={id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {error && (
            <div role="alert" className="error">
              {(errors[error] || errors.apiFailure)[hindi ? 1 : 0]}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {!state?.consent && (
            <section className="consent">
              <span className="eyebrow">
                {t("YOUR SCREEN. YOUR CHOICE.", "आपकी स्क्रीन। आपका निर्णय।")}
              </span>
              <h1>{t("Let’s start with permission.", "पहले आपकी अनुमति।")}</h1>
              <p>
                {t(
                  "Answer Mode captures once per request. Multi-page Capture takes repeated frames only after you start a page session, and stops at Done or the page limit. Turning Answer Mode off stops capture.",
                  "उत्तर मोड हर अनुरोध पर एक कैप्चर करता है। कई पेज कैप्चर केवल आपके पेज सत्र शुरू करने पर बार-बार कैप्चर करता है और Done या पेज सीमा पर रुकता है। उत्तर मोड बंद करने पर कैप्चर रुक जाता है।",
                )}
              </p>
              <p>
                {state?.vision
                  ? t(
                      "Cloud vision is selected: screenshots are sent to your configured AI provider.",
                      "क्लाउड विज़न चुना गया है: स्क्रीनशॉट आपकी AI सेवा को भेजे जाते हैं।",
                    )
                  : t(
                      "OCR runs locally. Extracted screen text is sent to your configured AI provider and, when enabled, web search.",
                      "OCR स्थानीय रूप से चलता है। स्क्रीन से निकला पाठ AI सेवा और चालू होने पर वेब खोज को भेजा जाता है।",
                    )}
              </p>
              <p>
                {t(
                  "Screenshots are not saved. History contains text only. External services have their own retention policies. You are responsible for following your school, workplace, and exam rules.",
                  "स्क्रीनशॉट सहेजे नहीं जाते। इतिहास में केवल पाठ रहता है। बाहरी सेवाओं की अपनी डेटा नीतियाँ हैं। स्कूल, कार्यस्थल और परीक्षा के नियमों का पालन आपकी ज़िम्मेदारी है।",
                )}
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                {t(
                  "I understand and allow on-demand screen access and provider processing.",
                  "मैं समझता/समझती हूँ और माँग पर स्क्रीन पहुँच तथा सेवा द्वारा प्रसंस्करण की अनुमति देता/देती हूँ।",
                )}
              </label>
              <button
                className="primary"
                disabled={!accepted}
                onClick={() => command("consent", true)}
              >
                {t("Grant permission", "अनुमति दें")}
              </button>
              <select
                aria-label="Language / भाषा"
                value={s.language}
                onChange={(e) =>
                  command("settings", { ...s, language: e.target.value })
                }
              >
                <option value="auto">Auto / स्वतः</option>
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </select>
            </section>
          )}
          {tab === "answer" && state?.consent && (
            <>
              <section className="controls">
                <button disabled={state.busy} onClick={()=>command("trace-open")}>{t("Trace & Answer", "चुनें और उत्तर पाएँ")}</button>
                <button disabled={state.busy} onClick={()=>command("multi-open")}>{t("Multi-page Capture","कई पेज कैप्चर")}</button>
                {state.busy && state.traceItems.length>0 && <button onClick={()=>command("trace-cancel")}>{t("Cancel batch", "बैच रद्द करें")}</button>}
                {state.traceSelecting && <span>{state.traceCount} {t("questions selected", "प्रश्न चुने गए")}</span>}
                <button
                  className={state.mode ? "stop" : "primary"}
                  onClick={() => command("mode", !state.mode)}
                >
                  {state.mode
                    ? t("Turn Answer Mode off", "उत्तर मोड बंद करें")
                    : t("Start Answer Mode", "उत्तर मोड शुरू करें")}
                </button>
                <button
                  disabled={!state.mode || state.busy}
                  onClick={() => command("capture")}
                >
                  {t("Capture new question", "फिर कैप्चर करें")}
                </button>
                <small>{s.hotkey}</small>
              </section>
              {!!state.multi?.basket.length && <section className="trace-results" aria-live="polite">
                <h2>{t("Question Basket","प्रश्न टोकरी")} · {state.multi.basket.filter(q=>q.status==="answered").length}/{state.multi.basket.length}</h2>
                <p className="muted">{state.multi.active?t("Capturing pages…","पेज कैप्चर हो रहे हैं…"):state.multi.answering?t("Answering in batches…","समूहों में उत्तर आ रहे हैं…"):t("Pages captured","पेज कैप्चर हुए")} · {state.multi.pages} {t("frames","फ्रेम")}</p>
                <div className="controls">
                  {state.multi.active&&<button onClick={()=>command("multi-done")}>{t("Done · answer now","पूरा · अब उत्तर दें")}</button>}
                  {state.multi.active&&state.multi.mode==="watch"&&<button onClick={()=>command("multi-next")}>{t("Next page · F8","अगला पेज · F8")}</button>}
                  {!state.multi.active&&!state.multi.answering&&state.multi.basket.some(item=>item.error&&item.error!=="multiUnclear")&&<button onClick={()=>command("multi-retry")}>{t("Retry provider errors","सेवा की त्रुटियाँ फिर आज़माएँ")}</button>}
                  {!state.multi.active&&!state.multi.answering&&<button onClick={()=>command("multi-open")}>{t("Add more pages","और पेज जोड़ें")}</button>}
                  {!state.multi.active&&!state.multi.answering&&<button onClick={()=>command("multi-clear")}>{t("Clear basket","टोकरी साफ करें")}</button>}
                </div>
                {state.multi.basket.map((item,i)=><article key={item.id}>
                  <strong>Q{item.number||i+1}</strong> <small>{item.status==="answered"?t("Answered","उत्तर दिया"):item.error?t("Could not answer","उत्तर नहीं मिला"):t("Pending","बाकी")}</small>
                  {item.error?<p role="alert">{(errors[item.error]||errors.apiFailure)[hindi?1:0]}</p>:item.answer&&<AnswerContent text={item.answer}/>}
                  <details><summary>{t("Detected text","पहचाना गया पाठ")}</summary><p>{item.question}</p></details>
                  {s.sources&&!!item.sources?.length&&<div className="sources">{item.sources.map((source,i)=><button key={i} onClick={()=>command("link",source.url)}>{i+1}. {source.title}</button>)}</div>}
                </article>)}
              </section>}
              {!!state.traceItems?.length && <section className="trace-results" aria-live="polite">
                <h2>{t("Traced answers", "चुने गए प्रश्नों के उत्तर")}</h2>
                {state.traceItems.filter(Boolean).map(item=><article key={item.index}>
                  <strong>Q{item.index+1}</strong> <small>{item.status==='cancelled'?t("Cancelled","रद्द किया गया"):item.status==='done'?t("Complete","पूरा"):item.status==='error'?t("Could not answer","उत्तर नहीं मिला"):item.status==='reading'?t("Reading region…","चुना भाग पढ़ रहे हैं…"):item.status==='searching'?t("Searching…","खोज रहे हैं…"):t("Answering…","उत्तर आ रहा है…")}{item.cached?t(" · cached"," · कैश से"):''}{item.ms?" · "+(item.ms/1000).toFixed(1)+"s":''}</small>
                  {item.status==='error'?<p role="alert">{(errors[item.error||'apiFailure']||errors.apiFailure)[hindi?1:0]}</p>:item.text&&<AnswerContent text={item.text}/>}
                  {item.question
                    ? <details open={item.status==='done'&&(item.text.includes('Unclear')||item.text.includes('अस्पष्ट'))}><summary>{t("Detected text","पहचाना गया पाठ")}</summary><p>{item.question}</p></details>
                    : item.status==='done'&&<p className="trace-hint">{t("No text was recognized. Trace a larger region around the complete question and options.","कोई पाठ नहीं पहचाना गया। पूरे प्रश्न और विकल्पों के आसपास बड़ा भाग चुनें।")}</p>}
                  {s.sources&&item.sources.length>0&&<div className="sources">{item.sources.map((source,i)=><button key={i} onClick={()=>command('link',source.url)}>{i+1}. {source.title}</button>)}</div>}
                </article>)}
              </section>}
              {answer ? (
                <article>
                  <div className="eyebrow">
                    {answer.web
                      ? t("ANSWER · WEB SOURCES", "उत्तर · वेब स्रोत")
                      : t(
                          "ANSWER · NOT WEB-VERIFIED",
                          "उत्तर · वेब से सत्यापित नहीं",
                        )}
                  </div>
                  <details open>
                    <summary>
                      {t("Detected question", "पहचाना गया प्रश्न")}
                    </summary>
                    <p>{answer.question}</p>
                  </details>
                  <AnswerContent text={answer.text} />
                  {s.sources && answer.sources.length > 0 && (
                    <div className="sources">
                      <h3>{t("Sources", "स्रोत")}</h3>
                      {answer.sources.map((source, i) => (
                        <button
                          key={i}
                          onClick={() => command("link", source.url)}
                        >
                          {i + 1}. {source.title} ↗
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ) : !state.traceItems?.length && (
                <section className="empty">
                  <div className="orbit">✦</div>
                  <h2>
                    {t(
                      "Your next answer starts here.",
                      "आपका अगला उत्तर यहाँ से।",
                    )}
                  </h2>
                  <p>
                    {t(
                      "Show the new question on your primary screen, then click Capture new question. Each click takes one fresh screenshot.",
                      "मुख्य स्क्रीन पर प्रश्न खोलें, फिर उत्तर मोड शुरू करें।",
                    )}
                  </p>
                </section>
              )}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await command("followup", input)) setInput("");
                }}
              >
                <label>
                  {t(
                    "Type a question or follow-up",
                    "प्रश्न या अगला सवाल लिखें",
                  )}
                  <textarea
                    value={input}
                    maxLength={4000}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t(
                      "Ask in English or Hindi…",
                      "हिन्दी या अंग्रेज़ी में पूछें…",
                    )}
                  />
                </label>
                <button disabled={!state.mode || state.busy || !input.trim()}>
                  {t("Ask without capturing", "बिना कैप्चर पूछें")}
                </button>
              </form>
              {state.recommendations.map((key) => (
                <aside key={key}>
                  {key === "detail"
                    ? t(
                        "You often ask follow-ups. Try Detailed answer style in Settings.",
                        "आप अक्सर अगले सवाल पूछते हैं। सेटिंग्स में विस्तृत उत्तर आज़माएँ।",
                      )
                    : key === "search"
                      ? t(
                          "Enable web search for answers backed by current sources.",
                          "स्रोतों पर आधारित उत्तरों के लिए वेब खोज चालू करें।",
                        )
                      : t(
                          "A larger font may improve readability.",
                          "बड़ा फ़ॉन्ट पढ़ने में मदद कर सकता है।",
                        )}
                </aside>
              ))}
            </>
          )}
          {tab === "history" && (
            <section>
              <div className="row">
                <h2>{t("Recent answers", "हाल के उत्तर")}</h2>
                <button onClick={() => command("clear")}>
                  {t("Clear all", "सब मिटाएँ")}
                </button>
              </div>
              <p className="muted">
                {s.history
                  ? t(
                      "Up to 30 answers · text only, on this device",
                      "अधिकतम 30 उत्तर · इस डिवाइस पर केवल पाठ",
                    )
                  : t("History is disabled.", "इतिहास बंद है।")}
              </p>
              {state?.history.length ? (
                state.history.map((a) => (
                  <button
                    className="history"
                    key={a.id}
                    onClick={() => {
                      setAnswer(a);
                      setTab("answer");
                    }}
                  >
                    <small>
                      {new Date(a.at).toLocaleString(hindi ? "hi-IN" : "en-US")}
                    </small>
                    <strong>{a.question.slice(0, 110)}</strong>
                  </button>
                ))
              ) : (
                <p>
                  {t("No saved answers yet.", "अभी कोई उत्तर सहेजा नहीं गया।")}
                </p>
              )}
            </section>
          )}
          {tab === "settings" && (
            <section>
              <h2>{t("Make it yours", "अपनी पसंद बनाएँ")}</h2>
              <div className="grid">
                {select("language", t("Language", "भाषा"), [
                  ["auto", t("Auto-detect", "स्वतः पहचान")],
                  ["en", "English"],
                  ["hi", "हिन्दी"],
                ])}
                {select("theme", t("Theme", "थीम"), [
                  ["dark", t("Dark", "गहरा")],
                  ["light", t("Light", "हल्का")],
                ])}
                <label>
                  {t("Accent color", "मुख्य रंग")}
                  <input
                    type="color"
                    value={draft.accent}
                    onChange={(e) => field("accent", e.target.value)}
                  />
                </label>
                {select("font", t("Font", "फ़ॉन्ट"), [
                  ["system-ui", t("System", "सिस्टम")],
                  ["Arial", "Arial"],
                  ["Nirmala UI", "Nirmala UI"],
                ])}
                <label>
                  {t("Font size", "फ़ॉन्ट आकार")}
                  <input
                    type="number"
                    min="12"
                    max="24"
                    value={draft.fontSize}
                    onChange={(e) => field("fontSize", Number(e.target.value))}
                  />
                </label>
                <label>
                  {t("Opacity", "अपारदर्शिता")}{" "}
                  {Math.round(draft.opacity * 100)}%
                  <input
                    type="range"
                    min="0.5"
                    max="1"
                    step="0.05"
                    value={draft.opacity}
                    onChange={(e) => field("opacity", Number(e.target.value))}
                  />
                </label>
                {select("position", t("Position", "स्थान"), [
                  ["left", t("Dock left", "बाएँ रखें")],
                  ["right", t("Dock right", "दाएँ रखें")],
                  ["floating", t("Floating", "स्वतंत्र")],
                ])}
                {select("style", t("Answer style", "उत्तर शैली"), [
                  ["short", t("Short", "संक्षिप्त")],
                  ["detailed", t("Detailed", "विस्तृत")],
                  ["steps", t("Step by step", "चरण दर चरण")],
                  ["bullets", t("Bullet points", "बिंदुवार")],
                ])}
              </div>
              <label>
                {t("Capture hotkey", "कैप्चर शॉर्टकट")}
                <input
                  value={draft.hotkey}
                  onChange={(e) => field("hotkey", e.target.value)}
                />
              </label>
              {(["ocr", "search", "sources", "history"] as const).map(
                (key, i) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={draft[key]}
                      onChange={(e) => field(key, e.target.checked)}
                    />
                    {
                      [
                        t("Read screen text (OCR)", "स्क्रीन पाठ पढ़ें (OCR)"),
                        t("Search the web", "वेब खोज"),
                        t("Show source links", "स्रोत लिंक दिखाएँ"),
                        t("Save text history", "पाठ इतिहास सहेजें"),
                      ][i]
                    }
                  </label>
                ),
              )}
              <h3>{t("Trace & Answer settings", "चुनें और उत्तर पाएँ सेटिंग्स")}</h3>
              <div className="grid">
                {select("traceMCQStyle",t("MCQ answers","बहुविकल्पीय उत्तर"),[["answer",t("Answer only","केवल उत्तर")],["reason",t("Answer + one-line reason","उत्तर और एक पंक्ति कारण")],["full",t("Full explanation","पूरा विवरण")]])}
                {select("traceTextStyle",t("Other answers","अन्य उत्तर"),[["short",t("Short","संक्षिप्त")],["detailed",t("Detailed","विस्तृत")]])}
                {select("traceSpeed",t("Model preference","मॉडल प्राथमिकता"),[["fastest",t("Fastest","सबसे तेज")],["balanced",t("Balanced","संतुलित")],["accurate",t("Most accurate","अधिक सटीक")]])}
                <label>{t("Trace color","चयन रंग")}<input type="color" value={draft.traceColor} onChange={e=>field('traceColor',e.target.value)}/></label>
                <label>{t("Line thickness","रेखा की मोटाई")}<input type="number" min="2" max="12" value={draft.traceThickness} onChange={e=>field('traceThickness',Number(e.target.value))}/></label>
                <label>{t("Trace hotkey","चयन शॉर्टकट")}<input value={draft.traceHotkey} onChange={e=>field('traceHotkey',e.target.value)}/></label>
              </div>
              <label className="check"><input type="checkbox" checked={draft.traceSearch} onChange={e=>field('traceSearch',e.target.checked)}/>{t("Use internet sources for traced questions (slower)","चुने प्रश्नों के लिए इंटरनेट स्रोत (धीमा)")}</label>
              <p>{t("Trace uses the selected language above. Fast models are configured in .env; without overrides all preferences use your current model.","चयन मोड ऊपर चुनी भाषा का उपयोग करता है। मॉडल .env में बदलें; बिना बदलाव सभी प्राथमिकताएँ वर्तमान मॉडल उपयोग करती हैं।")}</p>
              <button
                className="primary"
                onClick={() => command("settings", draft)}
              >
                {t("Save settings", "सेटिंग्स सहेजें")}
              </button>
              <div className="row">
                <button onClick={() => command("export")}>
                  {t("Export", "निर्यात")}
                </button>
                <button onClick={() => command("import")}>
                  {t("Import", "आयात")}
                </button>
              </div>
              <button
                onClick={() => {
                  setAccepted(false);
                  command("revoke");
                }}
              >
                {t("Revoke screen permission", "स्क्रीन अनुमति वापस लें")}
              </button>
              <p className="muted">
                {t(
                  "Disabling history deletes saved history. Consent is required again after restarting.",
                  "इतिहास बंद करने पर सहेजा इतिहास मिट जाता है। पुनः शुरू करने पर अनुमति फिर देनी होगी।",
                )}
              </p>
            </section>
          )}
          <footer>
            {t(
              "Visible by design. Capture only on your command.",
              "हमेशा दिखाई देता है। केवल आपके आदेश पर कैप्चर।",
            )}
          </footer>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
