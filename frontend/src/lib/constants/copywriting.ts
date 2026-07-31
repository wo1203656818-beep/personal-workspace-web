import { Pen, MessageCircle, Video, Megaphone, BookOpen, Sparkles } from 'lucide-react'

export const PLATFORMS = [
  { value: 'xiaohongshu', label: '小红书', icon: Pen, color: 'text-red-500' },
  { value: 'moments', label: '朋友圈', icon: MessageCircle, color: 'text-green-500' },
  { value: 'douyin', label: '抖音', icon: Video, color: 'text-black dark:text-white' },
  { value: 'weibo', label: '微博', icon: Megaphone, color: 'text-orange-500' },
  { value: 'bilibili', label: 'B站', icon: Sparkles, color: 'text-sky-500' },
  { value: 'official_account', label: '公众号', icon: BookOpen, color: 'text-blue-500' },
]

export const STYLES = [
  { value: 'seeding', label: '种草安利' },
  { value: 'review', label: '测评对比' },
  { value: 'tutorial', label: '教程攻略' },
  { value: 'daily', label: '日常分享' },
  { value: 'professional', label: '专业科普' },
]
