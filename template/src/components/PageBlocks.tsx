import React from 'react'

import type { Labels } from '@/lib/session'
import { isSafeHref } from '@/lib/theme'
import type { Media, Page, User } from '@/payload-types'

import { DataForm, DataList, PageList } from './DataBlocks'

type Block = NonNullable<Page['layout']>[number]
type Props = {
  contactState?: 'error' | 'sent'
  error?: string
  labels: Labels
  language: string
  page: Page
  pagePath: string
  sent?: string
  user: null | User
}

const Paragraphs = ({ text }: { text?: null | string }) =>
  text
    ? text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((paragraph, index) => <p key={index}>{paragraph}</p>)
    : null

const Button = ({ href, label }: { href?: null | string; label?: null | string }) =>
  label && isSafeHref(href) ? (
    <a className="button" href={href}>
      {label}
    </a>
  ) : null

const Picture = ({ eager, media }: { eager?: boolean; media?: Media | null | number }) => {
  if (!media || typeof media === 'number' || !media.url) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={media.alt}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      height={media.height ?? undefined}
      loading={eager ? 'eager' : 'lazy'}
      src={media.url}
      width={media.width ?? undefined}
    />
  )
}

const SectionHead = ({ heading, intro }: { heading?: null | string; intro?: null | string }) =>
  heading || intro ? (
    <div className="section-head">
      {heading && <h2>{heading}</h2>}
      {intro && <p className="intro">{intro}</p>}
    </div>
  ) : null

const Section = ({
  children,
  id,
  name,
  tone,
}: {
  children: React.ReactNode
  id?: string
  name: string
  tone?: null | string
}) => (
  <section className={`block block--${name} tone-${tone || 'plain'}`} id={id}>
    {children}
  </section>
)

const lines = (text?: null | string) => (text ?? '').split('\n').map((line) => line.trim()).filter(Boolean)

const render = (
  block: Block,
  isMainHeading: boolean,
  { contactState, error, labels, language, pagePath, sent, user }: Omit<Props, 'page'>,
) => {
  switch (block.blockType) {
    case 'dataForm':
      return <DataForm block={block} error={error} key={block.id} labels={labels} pagePath={pagePath} sent={sent} user={user} />
    case 'dataList':
      return <DataList block={block} key={block.id} user={user} />
    case 'pageList':
      return <PageList block={block} key={block.id} language={language} />
    case 'hero': {
      const Title = isMainHeading ? 'h1' : 'h2'
      const layout = block.image ? block.layout || 'split' : block.layout === 'centered' ? 'centered' : 'plain'
      return (
        <section className={`block block--hero hero--${layout} tone-${block.tone || 'plain'}`} key={block.id}>
          {layout === 'cover' && (
            <div className="hero__media">
              <Picture eager={isMainHeading} media={block.image} />
            </div>
          )}
          <div className="wrap hero">
            <div className="hero__copy">
              {block.eyebrow && <p className="eyebrow">{block.eyebrow}</p>}
              <Title>{block.heading}</Title>
              {block.text && <p className="lead">{block.text}</p>}
              <Button href={block.buttonHref} label={block.buttonLabel} />
            </div>
            {layout !== 'cover' && block.image && (
              <div className="hero__image">
                <Picture eager={isMainHeading} media={block.image} />
              </div>
            )}
          </div>
        </section>
      )
    }
    case 'text':
      return (
        <Section key={block.id} name="text" tone={block.tone}>
          <div className="wrap prose">
            {block.heading && <h2>{block.heading}</h2>}
            <Paragraphs text={block.body} />
          </div>
        </Section>
      )
    case 'split':
      return (
        <Section key={block.id} name="split" tone={block.tone}>
          <div className={`wrap split split--image-${block.imageSide || 'right'}`}>
            <div className="split__copy">
              {block.heading && <h2>{block.heading}</h2>}
              <Paragraphs text={block.body} />
              <Button href={block.buttonHref} label={block.buttonLabel} />
            </div>
            <div className="split__image">
              <Picture media={block.image} />
            </div>
          </div>
        </Section>
      )
    case 'features':
      return (
        <Section key={block.id} name="features" tone={block.tone}>
          <div className="wrap">
            <SectionHead heading={block.heading} intro={block.intro} />
            <div className="grid features">
              {block.items.map((item) => (
                <article className="card" key={item.id}>
                  <h3>{item.title}</h3>
                  <Paragraphs text={item.text} />
                </article>
              ))}
            </div>
          </div>
        </Section>
      )
    case 'steps':
      return (
        <Section key={block.id} name="steps" tone={block.tone}>
          <div className="wrap">
            <SectionHead heading={block.heading} intro={block.intro} />
            <ol className="steps">
              {block.items.map((item) => (
                <li key={item.id}>
                  <h3>{item.title}</h3>
                  <Paragraphs text={item.text} />
                </li>
              ))}
            </ol>
          </div>
        </Section>
      )
    case 'stats':
      return (
        <Section key={block.id} name="stats" tone={block.tone}>
          <div className="wrap">
            <SectionHead heading={block.heading} />
            <dl className="stats">
              {block.items.map((item) => (
                <div key={item.id}>
                  <dd>{item.value}</dd>
                  <dt>{item.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </Section>
      )
    case 'pricing':
      return (
        <Section key={block.id} name="pricing" tone={block.tone}>
          <div className="wrap">
            <SectionHead heading={block.heading} intro={block.intro} />
            <div className="grid pricing">
              {block.plans.map((plan) => (
                <article className={`card plan${plan.highlighted ? ' plan--highlighted' : ''}`} key={plan.id}>
                  <h3>{plan.name}</h3>
                  <p className="plan__price">{plan.price}</p>
                  {plan.note && <p className="plan__note">{plan.note}</p>}
                  {lines(plan.features).length > 0 && (
                    <ul>
                      {lines(plan.features).map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  )}
                  <Button href={plan.buttonHref} label={plan.buttonLabel} />
                </article>
              ))}
            </div>
          </div>
        </Section>
      )
    case 'testimonials':
      return (
        <Section key={block.id} name="testimonials" tone={block.tone}>
          <div className="wrap">
            <SectionHead heading={block.heading} />
            <div className="grid testimonials">
              {block.items.map((item) => (
                <figure className="card quote" key={item.id}>
                  <blockquote>{item.quote}</blockquote>
                  <figcaption>
                    <strong>{item.name}</strong>
                    {item.role && <span>{item.role}</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </Section>
      )
    case 'team':
      return (
        <Section key={block.id} name="team" tone={block.tone}>
          <div className="wrap">
            <SectionHead heading={block.heading} intro={block.intro} />
            <div className="grid team">
              {block.members.map((member) => (
                <article key={member.id}>
                  <div className="team__photo">
                    <Picture media={member.image} />
                  </div>
                  <h3>{member.name}</h3>
                  {member.role && <p className="team__role">{member.role}</p>}
                  <Paragraphs text={member.text} />
                </article>
              ))}
            </div>
          </div>
        </Section>
      )
    case 'gallery':
      return (
        <Section key={block.id} name="gallery" tone={block.tone}>
          <div className="wrap">
            <SectionHead heading={block.heading} />
            <div className="gallery">
              {block.images.map((item) => (
                <figure key={item.id}>
                  <Picture media={item.image} />
                  {item.caption && <figcaption>{item.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        </Section>
      )
    case 'info':
      return (
        <Section key={block.id} name="info" tone={block.tone}>
          <div className="wrap info">
            {block.heading && <h2>{block.heading}</h2>}
            <div>
              <dl>
                {block.items.map((item) => (
                  <div key={item.id}>
                    <dt>{item.label}</dt>
                    <dd className="pre-line">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <Button href={block.buttonHref} label={block.buttonLabel} />
            </div>
          </div>
        </Section>
      )
    case 'faq':
      return (
        <Section key={block.id} name="faq" tone={block.tone}>
          <div className="wrap info">
            {block.heading && <h2>{block.heading}</h2>}
            <div>
              {block.items.map((item) => (
                <details key={item.id}>
                  <summary>{item.question}</summary>
                  <Paragraphs text={item.answer} />
                </details>
              ))}
            </div>
          </div>
        </Section>
      )
    case 'cta':
      return (
        <Section key={block.id} name="cta" tone={block.tone || 'dark'}>
          <div className="wrap cta">
            <div>
              <h2>{block.heading}</h2>
              <Paragraphs text={block.text} />
            </div>
            <Button href={block.buttonHref} label={block.buttonLabel} />
          </div>
        </Section>
      )
    case 'contact':
      return (
        <Section id="contact" key={block.id} name="contact" tone={block.tone}>
          <div className="wrap info">
            <div>
              {block.heading && <h2>{block.heading}</h2>}
              <Paragraphs text={block.text} />
            </div>
            <div>
              {contactState === 'sent' && (
                <p role="status">{block.sentMessage || 'Thank you. Your message has been sent.'}</p>
              )}
              {contactState === 'error' && (
                <p role="alert">{block.errorMessage || 'That did not send. Please check the form and try again.'}</p>
              )}
              <form action="/api/contact" className="contact-form" method="post">
                <input name="page" type="hidden" value={pagePath} />
                <label>
                  {block.nameLabel || 'Name'}
                  <input autoComplete="name" maxLength={120} name="name" required />
                </label>
                <label>
                  {block.emailLabel || 'Email'}
                  <input autoComplete="email" name="email" required type="email" />
                </label>
                <label>
                  {block.messageLabel || 'Message'}
                  <textarea maxLength={5000} name="message" required rows={5} />
                </label>
                <label aria-hidden="true" className="trap">
                  Leave this empty
                  <input autoComplete="off" name="website" tabIndex={-1} />
                </label>
                <button className="button" type="submit">
                  {block.buttonLabel || 'Send message'}
                </button>
              </form>
            </div>
          </div>
        </Section>
      )
    default:
      return null
  }
}

export function PageBlocks({ page, ...context }: Props) {
  const layout = page.layout ?? []
  const firstHero = layout.findIndex((block) => block.blockType === 'hero')

  return (
    <>
      {firstHero === -1 && (
        <section className="block block--title tone-plain">
          <div className="wrap">
            <h1>{page.title}</h1>
          </div>
        </section>
      )}
      {layout.map((block, index) => render(block, index === firstHero, context))}
    </>
  )
}
