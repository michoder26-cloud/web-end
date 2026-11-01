import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { getSessionUser, labelsFrom } from '@/lib/session'
import { getSite } from '@/lib/site'

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite()
  return { robots: { index: false }, title: labelsFrom(site.labels).signup }
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect('/account')
  const site = await getSite()
  if (!site.allowSignup) notFound()
  const labels = labelsFrom(site.labels)
  const { error } = await searchParams

  return (
    <section className="block tone-plain">
      <div className="wrap account">
        <h1>{labels.signup}</h1>
        {error && <p role="alert">{labels.signupError}</p>}
        <form action="/api/account/signup" className="contact-form" method="post">
          <label>
            {labels.email}
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <label>
            {labels.password}
            <input autoComplete="new-password" minLength={10} name="password" required type="password" />
          </label>
          <label aria-hidden="true" className="trap">
            Leave this empty
            <input autoComplete="off" name="website" tabIndex={-1} />
          </label>
          <button className="button" type="submit">
            {labels.signup}
          </button>
        </form>
        <p className="account__alt">
          <Link href="/login">{labels.login}</Link>
        </p>
      </div>
    </section>
  )
}
