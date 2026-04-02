import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import { DirectionProvider } from '@radix-ui/react-direction'
import './globals.css'

const heebo = Heebo({ subsets: ['hebrew', 'latin'] })

export const metadata: Metadata = {
  title: 'ClearFin — ניהול פיננסי',
  description: 'ניהול פיננסי ביתי חכם',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.className}>
      <body>
        <DirectionProvider dir="rtl">
          {children}
        </DirectionProvider>
      </body>
    </html>
  )
}
