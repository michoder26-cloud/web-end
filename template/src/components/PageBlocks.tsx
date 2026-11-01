import React from 'react'

import { isSafeHref } from '@/lib/theme'
import type { Media, Page } from '@/payload-types'

type Blocks = NonNullable<Page['layout']>
type Props = { contactState?: 'error' | 'sent'; page: Page; pagePath: string }

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

const Heading = ({ text }: { text?: null | string }) => (text ? <h2>{text}</h2> : null)

const render = (
  block: Blocks[number],
  mainHeadingUsed: boolean,
  { contactState, pagePath }: Pick<Props, 'contactState' | 'pagePath'>,
) => {
  switch (block.blockType) {
    case 'hero': {
      const Title = mainHeadingUsed ? 'h2' : 'h1'
      return (
        <section className={`block block--hero${block.image ? ' block--hero-image' : ''}`} key={block.id}>
          <div className="wrap hero">
            <div>
              <Title>{block.heading}</Title>
              {block.text && <p className="lead">{block.text}</p>}
              <Button href={block.buttonHref} label={block.buttonLabel} />
            </div>
            <Picture eager={!mainHeadingUsed} media={block.image} />
          </div>
        </section>
      )
    }
    case 'text':
      return (
        <section className="block" key={block.id}>
          <div className="wrap prose">
            <Heading text={block.heading} />
            <Paragraphs text={block.body} />
          </div>
        </section>
      )
    case 'features':
      return (
        <section className="block" key={block.id}>
          <div className="wrap">
            <Heading text={block.heading} />
            <div className="features">
              {block.items.map((item) => (
                <article key={item.id}>
                  <h3>{item.title}</h3>
                  <Paragraphs text={item.text} />
                </article>
              ))}
            </div>
          </div>
        </section>
      )
    case 'gallery':
      return (
        <section className="block" key={block.id}>
          <div className="wrap">
            <Heading text={block.heading} />
            <div className="gallery">
              {block.images.map((item) => (
                <figure key={item.id}>
                  <Picture media={item.image} />
                  {item.caption && <figcaption>{item.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        </section>
      )
    case 'faq':
      return (
        <section className="block" key={block.id}>
          <div className="wrap prose">
            <Heading text={block.heading} />
            {block.items.map((item) => (
              <details key={item.id}>
                <summary>{item.question}</summary>
                <Paragraphs text={item.answer} />
              </details>
            ))}
          </div>
        </section>
      )
    case 'cta':
      return (
        <section className="block block--cta" key={block.id}>
          <div className="wrap">
            <h2>{block.heading}</h2>
            <Paragraphs text={block.text} />
            <Button href={block.buttonHref} label={block.buttonLabel} />
          </div>
        </section>
      )
    case 'contact':
      return (
        <section className="block" id="contact" key={block.id}>
          <div className="wrap prose">
            <Heading text={block.heading} />
            <Paragraphs text={block.text} />
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
        </section>
      )
    default:
      return null
  }
}

export function PageBlocks({ contactState, page, pagePath }: Props) {
  const layout = page.layout ?? []
  const firstHero = layout.findIndex((block) => block.blockType === 'hero')

  return (
    <>
      {firstHero === -1 && (
        <section className="block block--title">
          <div className="wrap">
            <h1>{page.title}</h1>
          </div>
        </section>
      )}
      {layout.map((block, index) => render(block, index !== firstHero, { contactState, pagePath }))}
    </>
  )
}
