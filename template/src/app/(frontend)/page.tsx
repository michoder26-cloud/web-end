import Link from 'next/link'
import React from 'react'

export default function HomePage() {
  return (
    <div className="home">
      <h1>Your website starts here.</h1>
      <p>This page is a placeholder. The team replaces it when it builds your site.</p>
      <Link href="/admin">Open the admin panel</Link>
    </div>
  )
}
