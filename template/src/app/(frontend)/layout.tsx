import React from 'react'
import './styles.css'

export const metadata = {
  description: 'A new website built with web-end, Payload and Next.js.',
  title: 'New website',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
