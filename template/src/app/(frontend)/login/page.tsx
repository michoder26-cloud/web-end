import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'

import { getSessionUser, labelsFrom } from '@/lib/session'
import { getSite } from '@/lib/site'

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite()
  return { robots: { index: false }, title: labelsFrom(site.labels).login }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect('/account')
  const site = await getSite()
  const labels = labelsFrom(site.labels)
  const { error } = await searchParams

  return (
    <section className="block tone-plain">
      <div className="wrap account">
        <h1>{labels.login}</h1>
        {error && <p role="alert">{labels.loginError}</p>}
        <form action="/api/account/login" className="contact-form" method="post">
          <label>
            {labels.email}
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <label>
            {labels.password}
            <input autoComplete="current-password" name="password" required type="password" />
          </label>
          <button className="button" type="submit">
            {labels.login}
          </button>
        </form>
        {site.allowSignup && (
          <p className="account__alt">
            <Link href="/signup">{labels.signup}</Link>
          </p>
        )}
      </div>
    </section>
  )
}
