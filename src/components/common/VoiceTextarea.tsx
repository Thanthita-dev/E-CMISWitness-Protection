import React, { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { showToast } from '../../lib/swal'

/**
 * ช่องข้อความยาวพร้อมปุ่มไมโครโฟน (Voice-to-Text)
 * ใช้แทน `<textarea>` ได้ตรง ๆ — props ทุกตัวส่งต่อให้ textarea เดิม
 * กดไมค์หนึ่งครั้งเพื่อเริ่มฟัง กดอีกครั้งเพื่อหยุด ข้อความที่พูดจะต่อท้ายข้อความเดิมในช่อง
 * ค่าใหม่ส่งผ่าน event `input` ของ textarea จริง จึงเข้า `onChange` เดิมของแต่ละหน้าโดยไม่ต้องแก้ handler
 */

type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { resultIndex: number; results: RecognitionResultList }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

export const getSpeechRecognition = (): SpeechRecognitionCtor | undefined => {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition
}

/** ต่อข้อความที่พูดท้ายข้อความเดิม เว้นวรรคหนึ่งช่องเมื่อมีข้อความอยู่แล้ว */
export const appendTranscript = (current: string, spoken: string): string => {
  const text = spoken.trim()
  if (!text) return current
  const base = current.replace(/\s+$/, '')
  return base ? `${base} ${text}` : text
}

/** เขียนค่าลง textarea แบบเดียวกับผู้ใช้พิมพ์ เพื่อให้ React ยิง onChange ของช่องนั้น */
const setNativeValue = (el: HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const UNSUPPORTED_MESSAGE = 'เบราว์เซอร์นี้ไม่รองรับการพูดเป็นข้อความ กรุณาใช้ Google Chrome หรือ Microsoft Edge'
const DENIED_MESSAGE = 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน กรุณาอนุญาตการใช้ไมโครโฟนในเบราว์เซอร์แล้วลองใหม่'

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': DENIED_MESSAGE,
  'service-not-allowed': DENIED_MESSAGE,
  'audio-capture': 'ไม่พบไมโครโฟน กรุณาตรวจสอบการเชื่อมต่อไมโครโฟน',
  network: 'แปลงเสียงเป็นข้อความไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
}

/** ฟังได้ทีละช่อง — เริ่มฟังช่องใหม่จะหยุดช่องเดิมก่อน */
let activeRecognition: SpeechRecognitionLike | null = null

export const VoiceTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, disabled, readOnly, ...props }, forwardedRef) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null)
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
    const [listening, setListening] = useState(false)
    const [interim, setInterim] = useState('')
    const [denied, setDenied] = useState(false)
    const supported = Boolean(getSpeechRecognition())
    const unavailable = !supported || denied
    const inactive = Boolean(disabled || readOnly)

    const setRefs = useCallback(
      (el: HTMLTextAreaElement | null) => {
        innerRef.current = el
        if (typeof forwardedRef === 'function') forwardedRef(el)
        else if (forwardedRef) forwardedRef.current = el
      },
      [forwardedRef],
    )

    const stop = useCallback(() => {
      recognitionRef.current?.stop()
    }, [])

    useEffect(() => () => recognitionRef.current?.abort(), [])

    // ช่องถูกปิดระหว่างฟัง (เช่น ฉบับถูกลงนาม) — หยุดฟังทันที
    useEffect(() => {
      if (inactive && listening) stop()
    }, [inactive, listening, stop])

    const start = () => {
      const Recognition = getSpeechRecognition()
      if (!Recognition) return
      if (activeRecognition && activeRecognition !== recognitionRef.current) activeRecognition.stop()

      const recognition = new Recognition()
      recognition.lang = 'th-TH'
      recognition.continuous = true
      recognition.interimResults = true
      recognition.onresult = (event) => {
        let pending = ''
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i]
          const transcript = result[0]?.transcript ?? ''
          if (result.isFinal) {
            const el = innerRef.current
            if (el) setNativeValue(el, appendTranscript(el.value, transcript))
          } else {
            pending += transcript
          }
        }
        setInterim(pending)
      }
      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setDenied(true)
        const message = ERROR_MESSAGES[event.error]
        if (message) showToast(message, 'error')
      }
      recognition.onend = () => {
        if (activeRecognition === recognition) activeRecognition = null
        if (recognitionRef.current === recognition) recognitionRef.current = null
        setListening(false)
        setInterim('')
      }

      recognitionRef.current = recognition
      activeRecognition = recognition
      try {
        recognition.start()
        setListening(true)
        innerRef.current?.focus()
      } catch {
        recognitionRef.current = null
        activeRecognition = null
        showToast('เริ่มฟังเสียงไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error')
      }
    }

    const onMicClick = () => {
      if (inactive) return
      if (unavailable) {
        showToast(denied ? DENIED_MESSAGE : UNSUPPORTED_MESSAGE, 'warning')
        return
      }
      if (listening) stop()
      else start()
    }

    const title = !supported
      ? UNSUPPORTED_MESSAGE
      : denied
        ? DENIED_MESSAGE
        : listening
          ? 'หยุดฟังเสียง'
          : 'กดเพื่อพูด แล้วระบบจะแปลงเสียงเป็นข้อความต่อท้ายในช่องนี้'

    return (
      <div className="relative min-w-0" data-voice-textarea>
        <textarea
          ref={setRefs}
          disabled={disabled}
          readOnly={readOnly}
          className={cn(className, 'pr-12')}
          {...props}
        />
        {!inactive && (
          <button
            type="button"
            onClick={onMicClick}
            aria-disabled={unavailable || undefined}
            aria-pressed={listening}
            aria-label={listening ? 'หยุดฟังเสียง' : 'พูดเพื่อแปลงเป็นข้อความ'}
            title={title}
            data-testid="voice-input-button"
            className={cn(
              'absolute right-1.5 top-1.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border text-[0.88rem] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue',
              listening
                ? 'border-danger bg-danger text-white motion-safe:animate-pulse'
                : unavailable
                  ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                  : 'border-slate-300 bg-white text-navy hover:bg-[#edf2f6]',
            )}
          >
            <i
              className={cn('fa-solid', listening ? 'fa-stop' : unavailable ? 'fa-microphone-slash' : 'fa-microphone')}
              aria-hidden="true"
            />
          </button>
        )}
        {listening && (
          <p role="status" aria-live="polite" className="mt-1 text-[0.8rem] text-danger">
            <i className="fa-solid fa-circle mr-1 text-[0.6rem]" aria-hidden="true" />
            กำลังฟัง… พูดได้เลย แล้วกดปุ่มอีกครั้งเพื่อหยุด
            {interim && <span className="ml-1 text-muted">“{interim}”</span>}
          </p>
        )}
      </div>
    )
  },
)

VoiceTextarea.displayName = 'VoiceTextarea'
