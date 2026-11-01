import config from '@payload-config'
import Link from 'next/link'
import { getPayload } from 'payload'
import React from 'react'

import { formatValue, optionsOf, type FieldDefinition } from '@/lib/data'
import type { Labels } from '@/lib/session'
import type { DataType, Page, User } from '@/payload-types'

type Blocks = NonNullable<Page['layout']>
type DataFormBlock = Extract<Blocks[number], { blockType: 'dataForm' }>
type DataListBlock = Extract<Blocks[number], { blockType: 'dataList' }>
type PageListBlock = Extract<Blocks[number], { blockType: 'pageList' }>

const findType = async (slug: string): Promise<DataType | undefined> => {
  const payload = await getPayload({ config: await config })
  const { docs } = await payload.find({
    collection: 'data-types',
    depth: 0,
    limit: 1,
    where: { slug: { equals: slug } },
  })
  return docs[0]
}

const inputType: Record<string, string> = {
  date: 'date',
  email: 'email',
  number: 'number',
  phone: 'tel',
  text: 'text',
  time: 'time',
  url: 'url',
}

const Field = ({ field }: { field: FieldDefinition }) => {
  const required = Boolean(field.required)
  if (field.type === 'checkbox') {
    return (
      <label className="check">
        <input name={field.name} required={required} type="checkbox" /> {field.label}
      </label>
    )
  }
  return (
    <label>
      {field.label}
      {field.type === 'textarea' ? (
        <textarea maxLength={5000} name={field.name} required={required} rows={4} />
      ) : field.type === 'select' ? (
        <select defaultValue="" name={field.name} required={required}>
          <option disabled={required} value="">
            —
          </option>
          {optionsOf(field).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input maxLength={500} name={field.name} required={required} step={field.type === 'number' ? 'any' : undefined} type={inputType[field.type] || 'text'} />
      )}
    </label>
  )
}

export async function DataForm({
  block,
  error,
  labels,
  pagePath,
  sent,
  user,
}: {
  block: DataFormBlock
  error?: string
  labels: Labels
  pagePath: string
  sent?: string
  user: null | User
}) {
  const type = await findType(block.dataType)
  if (!type || type.whoCanSubmit === 'nobody') return null
  const mustLogIn = type.whoCanSubmit === 'members' && !user

  return (
    <section className={`block block--form tone-${block.tone || 'plain'}`} id={`form-${type.slug}`}>
      <div className="wrap info">
        <div>
          {block.heading && <h2>{block.heading}</h2>}
          {block.intro && <p>{block.intro}</p>}
        </div>
        <div>
          {sent === type.slug && <p role="status">{block.sentMessage || 'Thank you. We have received this.'}</p>}
          {error === type.slug && (
            <p role="alert">{block.errorMessage || 'That did not send. Please check the form and try again.'}</p>
          )}
          {mustLogIn ? (
            <p>
              <Link className="button" href="/login">
                {labels.loginFirst}
              </Link>
            </p>
          ) : (
            <form action={`/api/data/${type.slug}`} className="contact-form" method="post">
              <input name="page" type="hidden" value={pagePath} />
              {((type.fields ?? []) as FieldDefinition[]).map((field) => (
                <Field field={field} key={field.name} />
              ))}
              <label aria-hidden="true" className="trap">
                Leave this empty
                <input autoComplete="off" name="website" tabIndex={-1} />
              </label>
              <button className="button" type="submit">
                {block.buttonLabel || 'Send'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

export async function DataList({ block, user }: { block: DataListBlock; user: null | User }) {
  const type = await findType(block.dataType)
  if (!type || type.whoCanSee === 'owner' || (type.whoCanSee === 'members' && !user)) return null

  const payload = await getPayload({ config: await config })
  const { docs } = await payload.find({
    collection: 'records',
    depth: 0,
    limit: block.limit || 24,
    sort: '-createdAt',
    where: { and: [{ dataType: { equals: type.id } }, { status: { equals: 'published' } }] },
  })
  // Only fields marked public ever reach the page.
  const fields = ((type.fields ?? []) as FieldDefinition[]).filter((field) => field.public)

  return (
    <section className={`block block--list tone-${block.tone || 'plain'}`}>
      <div className="wrap">
        {(block.heading || block.intro) && (
          <div className="section-head">
            {block.heading && <h2>{block.heading}</h2>}
            {block.intro && <p className="intro">{block.intro}</p>}
          </div>
        )}
        {docs.length === 0 && block.emptyMessage && <p>{block.emptyMessage}</p>}
        <div className="grid">
          {docs.map((record) => {
            const values = record.data as Record<string, unknown>
            const [title, ...rest] = fields.filter((field) => values[field.name] !== undefined)
            if (!title) return null
            return (
              <article className="card" key={record.id}>
                <h3>{formatValue(values[title.name])}</h3>
                {rest.map((field) => (
                  <p className="pre-line" key={field.name}>
                    {field.type === 'textarea' ? '' : <strong>{field.label}: </strong>}
                    {formatValue(values[field.name])}
                  </p>
                ))}
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export async function PageList({ block, language }: { block: PageListBlock; language: string }) {
  const payload = await getPayload({ config: await config })
  const { docs } = await payload.find({
    collection: 'pages',
    depth: 0,
    limit: block.limit || 12,
    overrideAccess: false,
    sort: '-createdAt',
    where: { category: { equals: block.category } },
  })
  const date = new Intl.DateTimeFormat(/^[a-zA-Z-]{2,12}$/.test(language) ? language : 'en', { dateStyle: 'long' })

  return (
    <section className={`block block--list tone-${block.tone || 'plain'}`}>
      <div className="wrap">
        {(block.heading || block.intro) && (
          <div className="section-head">
            {block.heading && <h2>{block.heading}</h2>}
            {block.intro && <p className="intro">{block.intro}</p>}
          </div>
        )}
        {docs.length === 0 && block.emptyMessage && <p>{block.emptyMessage}</p>}
        <div className="grid">
          {docs.map((page) => (
            <article className="card" key={page.id}>
              <p className="post-date">{date.format(new Date(page.createdAt))}</p>
              <h3>
                <a href={`/${page.slug}`}>{page.title}</a>
              </h3>
              <p>{page.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
