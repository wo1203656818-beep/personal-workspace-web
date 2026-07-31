import { useState, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'

export function useVoiceInput({ setInput }: { setInput: Dispatch<SetStateAction<string>> }) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const [speechSupported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition
  })

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'zh-CN'
    rec.interimResults = false
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript || ''
      if (text) setInput((v) => (v ? v + ' ' : '') + text)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {}
  }

  return { listening, speechSupported, toggleVoice }
}
