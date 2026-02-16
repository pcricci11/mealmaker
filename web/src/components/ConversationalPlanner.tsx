// components/ConversationalPlanner.tsx
// Natural language input for describing the week's meal plan

import { useState, useRef, useCallback } from "react";

interface Props {
  onSmartSetup: (text: string) => void;
  loading?: boolean;
  onPickFromRecipes?: () => void;
}

// Browser Speech Recognition types
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } }; length: number };
  resultIndex: number;
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function ConversationalPlanner({ onSmartSetup, loading, onPickFromRecipes }: Props) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSmartSetup(trimmed);
  };

  const toggleListening = useCallback(() => {
    // Stop if already listening
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setText((prev) => {
        const separator = prev.trim() ? " " : "";
        return prev + separator + transcript.trim();
      });
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-bold text-lg text-gray-900 mb-1">
        Tell me about your week
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Describe your schedule and we'll set up your meal plan automatically.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`e.g. "We're cooking Monday through Thursday, eating out Friday. My daughter needs lunch on Tuesday and Wednesday. Saturday we want something special — maybe Italian. Keep it quick on weeknights, 30 min max."`}
        className="w-full h-32 border border-gray-300 rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        disabled={loading}
      />

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSubmit}
          disabled={loading || !text.trim()}
          className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Setting up..." : "Smart Setup"}
        </button>

        <button
          onClick={toggleListening}
          className={`p-2.5 border rounded-lg transition-colors ${
            listening
              ? "border-red-400 bg-red-50 text-red-500 hover:bg-red-100"
              : "border-gray-300 text-gray-600 hover:border-emerald-500 hover:text-emerald-600"
          }`}
          title={listening ? "Stop listening" : "Voice input"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={`w-5 h-5 ${listening ? "animate-pulse" : ""}`}
          >
            <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2Z" />
          </svg>
        </button>

        {listening && (
          <span className="text-sm text-red-500 font-medium">Listening...</span>
        )}
      </div>

      {onPickFromRecipes && (
        <button
          onClick={onPickFromRecipes}
          className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          or pick from your saved recipes &rarr;
        </button>
      )}
    </div>
  );
}
