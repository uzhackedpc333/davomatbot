import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MaktabDavomat - Maktab boshqaruvi va davomat tizimi',
  description: 'Ko\'p maktabli ustoz CRM va davomat tizimi',
  keywords: ['maktab', 'davomat', 'ustoz', 'CRM', 'boshqaruv'],
}

export const viewport: Viewport = {
  themeColor: '#3b82f6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="uz" className={inter.className}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <meta name="theme-color" content="#3b82f6" />
      </head>
      <body className="min-h-screen bg-gray-50 antialiased">{children}</body>
    </html>
  )
}