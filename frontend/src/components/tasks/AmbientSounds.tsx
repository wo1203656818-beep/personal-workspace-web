import { useState, useRef, useCallback } from 'react'
import { Volume2, VolumeX, Play, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface SoundOption {
  id: string
  name: string
  emoji: string
  url: string
}

const SOUNDS: SoundOption[] = [
  { id: 'rain', name: '雨声', emoji: '🌧️', url: 'https://cdn.freesound.org/previews/670/670946_13808315-lq.mp3' },
  { id: 'forest', name: '森林', emoji: '🌲', url: 'https://cdn.freesound.org/previews/369/369592_5121236-lq.mp3' },
  { id: 'ocean', name: '海浪', emoji: '🌊', url: 'https://cdn.freesound.org/previews/420/420225_8611577-lq.mp3' },
  { id: 'whitenoise', name: '白噪音', emoji: '📡', url: 'https://cdn.freesound.org/previews/486/486486_10276401-lq.mp3' },
  { id: 'fire', name: '壁炉', emoji: '🔥', url: 'https://cdn.freesound.org/previews/616/616639_12796425-lq.mp3' },
]

export function AmbientSounds() {
  const [activeSound, setActiveSound] = useState<string | null>(null)
  const [volume, setVolume] = useState(0.5)
  const [sleepTimer, setSleepTimer] = useState<number>(0)
  const [sleepTimerRef, setSleepTimerRef] = useState<ReturnType<typeof setTimeout> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playSound = useCallback((sound: SoundOption) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    
    if (activeSound === sound.id) {
      setActiveSound(null)
      return
    }
    
    const audio = new Audio(sound.url)
    audio.loop = true
    audio.volume = volume
    audio.play().catch(() => {})
    audioRef.current = audio
    setActiveSound(sound.id)
  }, [activeSound, volume])

  const changeVolume = (v: number[]) => {
    const val = v[0]
    setVolume(val)
    if (audioRef.current) {
      audioRef.current.volume = val
    }
  }

  const stopAll = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setActiveSound(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">环境音</h3>
        {activeSound && (
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={stopAll}>
            <VolumeX className="size-3" /> 停止
          </Button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {SOUNDS.map((sound) => (
          <button
            key={sound.id}
            type="button"
            onClick={() => playSound(sound)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl p-2.5 transition-all',
              activeSound === sound.id
                ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="text-lg">{sound.emoji}</span>
            <span className="text-[10px]">{sound.name}</span>
            {activeSound === sound.id ? (
              <Pause className="size-3" />
            ) : (
              <Play className="size-3" />
            )}
          </button>
        ))}
      </div>
      {activeSound && (
        <div className="flex items-center gap-2 px-1">
          <Volume2 className="size-3 text-muted-foreground" />
          <Slider value={[volume]} onValueChange={changeVolume} min={0} max={1} step={0.05} className="flex-1" />
          <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(volume * 100)}%</span>
        </div>
      )}
      {activeSound && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">定时关闭:</span>
          {[0, 15, 30, 60].map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => {
                if (sleepTimerRef) clearTimeout(sleepTimerRef)
                setSleepTimer(min)
                if (min > 0) {
                  const ref = setTimeout(() => {
                    if (audioRef.current) {
                      audioRef.current.pause()
                      audioRef.current = null
                    }
                    setActiveSound(null)
                    setSleepTimer(0)
                    toast.success('环境音已关闭')
                  }, min * 60 * 1000)
                  setSleepTimerRef(ref)
                }
              }}
              className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                sleepTimer === min
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {min === 0 ? '关闭' : `${min}分钟`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}