import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { formatValue, type FieldDefinition } from '@/lib/data'
import { getSessionUser, labelsFrom } from '@/lib/session'
import { getSite } from '@/lib/site'
import type { DataType } from '@/payload-types'

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite()
  return { robots: { index: false }, title: labelsFrom(site.labels).account }
}

export default async function AccountPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const site = await getSite()
  const labels = labelsFrom(site.labels)
  const payload = await getPayload({ config: await config })
  const isOwner = user.roles?.includes('admin')
  const { docs } = await payload.find({
    collection: 'records',
    depth: 0,
    limit: 100,
    overrideAccess: false,
    sort: '-createdAt',
    user,
    where: { owner: { equals: user.id } },
  })
  // Members can't read data types directly, so the labels are looked up here on the server.
  const { docs: types } = await payload.find({
    collection: 'data-types',
    depth: 0,
    limit: 100,
    where: { id: { in: [...new Set(docs.map((record) => record.dataType as number))] } },
  })
  const typeById = new Map<number, DataType>(types.map((type) => [type.id, type]))

  return (
    <section className="block tone-plain">
      <div className="wrap account account--wide">
        <h1>{labels.account}</h1>
        <p>{user.email}</p>
        {isOwner && <Link href="/admin">Admin</Link>}

        <h2>{labels.myRecords}</h2>
        {docs.length === 0 && <p>{labels.noRecords}</p>}
        {docs.map((record) => {
          const type = typeById.get(record.dataType as number)
          const values = record.data as Record<string, unknown>
          if (!type) return null
          return (
            <article className="card account__record" key={record.id}>
              <h3>{type.name}</h3>
              <dl>
                {((type.fields ?? []) as FieldDefinition[])
                  .filter((field) => values[field.name] !== undefined)
                  .map((field) => (
                    <div key={field.name}>
                      <dt>{field.label}</dt>
                      <dd className="pre-line">{formatValue(values[field.name])}</dd>
                    </div>
                  ))}
              </dl>
            </article>
          )
        })}

        <form action="/api/account/logout" method="post">
          <button className="button" type="submit">
            {labels.logout}
          </button>
        </form>

        {!isOwner && (
          <form action="/api/account/delete" className="account__delete" method="post">
            <label>
              <input name="confirm" required type="checkbox" /> {labels.deleteConfirm}
            </label>
            <button className="button button--small" type="submit">
              {labels.deleteAccount}
            </button>
          </form>
        )}
      </div>
    </section>
  )
}
