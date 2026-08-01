import { useState, useRef, useEffect } from 'react'
import { Volume2, VolumeX, Headphones } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const sounds = [
  { id: 'rain', label: '雨声', emoji: '🌧' },
  { id: 'forest', label: '森林', emoji: '🌲' },
  { id: 'ocean', label: '海浪', emoji: '🌊' },
  { id: 'fire', label: '壁炉', emoji: '🔥' },
]

function createNoiseBuffer(ctx: AudioContext, duration: number) {
  const sampleRate = ctx.sampleRate
  const length = sampleRate * duration
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

function startRain(ctx: AudioContext): () => void {
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 4)
  noise.loop = true

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1200
  filter.Q.value = 0.5

  const gain = ctx.createGain()
  gain.gain.value = 0.3

  noise.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  noise.start()

  return () => {
    try { noise.stop() } catch {}
  }
}

function startForest(ctx: AudioContext): () => void {
  // Background ambient (soft filtered noise)
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 4)
  noise.loop = true

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 2000
  filter.Q.value = 1.5

  const gain = ctx.createGain()
  gain.gain.value = 0.15

  noise.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  noise.start()

  // Periodic bird-like chirps
  const chirpInterval = setInterval(() => {
    try {
      const osc = ctx.createOscillator()
      const chirpGain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 2000 + Math.random() * 1500
      chirpGain.gain.setValueAtTime(0, ctx.currentTime)
      chirpGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05)
      chirpGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2)
      osc.connect(chirpGain)
      chirpGain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.2)
    } catch {}
  }, 3000 + Math.random() * 4000)

  return () => {
    clearInterval(chirpInterval)
    try { noise.stop() } catch {}
  }
}

function startOcean(ctx: AudioContext): () => void {
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 4)
  noise.loop = true

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 600
  filter.Q.value = 0.3

  const gain = ctx.createGain()
  gain.gain.value = 0.3

  // LFO to modulate gain for wave effect
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.08
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.15
  lfo.connect(lfoGain)
  lfoGain.connect(gain.gain)

  noise.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  noise.start()
  lfo.start()

  return () => {
    try { noise.stop(); lfo.stop() } catch {}
  }
}

function startFire(ctx: AudioContext): () => void {
  // Low rumble (brown noise approximation)
  const noise = ctx.createBufferSource()
  noise.buffer = createNoiseBuffer(ctx, 4)
  noise.loop = true

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 400
  filter.Q.value = 0.8

  const gain = ctx.createGain()
  gain.gain.value = 0.25

  noise.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  noise.start()

  // Random crackling pops
  const crackleInterval = setInterval(() => {
    try {
      const crackle = ctx.createBufferSource()
      const crackleGain = ctx.createGain()
      const crackleLen = 0.03 + Math.random() * 0.06
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * crackleLen), ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1
      }
      crackle.buffer = buf
      crackleGain.gain.setValueAtTime(0.15 + Math.random() * 0.1, ctx.currentTime)
      crackleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + crackleLen)
      crackle.connect(crackleGain)
      crackleGain.connect(ctx.destination)
      crackle.start(ctx.currentTime)
    } catch {}
  }, 200 + Math.random() * 500)

  return () => {
    clearInterval(crackleInterval)
    try { noise.stop() } catch {}
  }
}

const soundStarters: Record<string, (ctx: AudioContext) => () => void> = {
  rain: startRain,
  forest: startForest,
  ocean: startOcean,
  fire: startFire,
}

export function AmbientSounds() {
  const [activeSound, setActiveSound] = useState<string | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  // Stop current sound when activeSound changes or component unmounts
  useEffect(() => {
    return () => {
      stopRef.current?.()
      ctxRef.current?.close()
    }
  }, [])

  const toggleSound = (id: string) => {
    if (activeSound === id) {
      // Stop current sound
      stopRef.current?.()
      ctxRef.current?.close()
      ctxRef.current = null
      stopRef.current = null
      setActiveSound(null)
    } else {
      // Stop previous sound if any
      stopRef.current?.()
      ctxRef.current?.close()

      // Start new sound
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        if (ctx.state === 'suspended') ctx.resume()
        const starter = soundStarters[id]
        if (starter) {
          const stop = starter(ctx)
          ctxRef.current = ctx
          stopRef.current = stop
        }
        setActiveSound(id)
      } catch {
        setActiveSound(null)
      }
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Headphones className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">白噪音</span>
        {activeSound ? (
          <Volume2 className="ml-auto size-3.5 text-emerald-500" />
        ) : (
          <VolumeX className="ml-auto size-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {sounds.map((sound) => (
          <Button
            key={sound.id}
            variant="outline"
            size="sm"
            onClick={() => toggleSound(sound.id)}
            className={cn(
              'rounded-lg px-3 text-xs transition-all',
              activeSound === sound.id &&
                'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            )}
          >
            <span className="mr-1">{sound.emoji}</span>
            {sound.label}
          </Button>
        ))}
      </div>
      {activeSound && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          🌿 {sounds.find((s) => s.id === activeSound)?.label} 正在播放...
        </p>
      )}
    </div>
  )
}