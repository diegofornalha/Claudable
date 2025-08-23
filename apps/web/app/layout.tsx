import './globals.css'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terminal Web',
  description: 'Terminal Web Application',
  icons: {
    icon: '/favicon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}