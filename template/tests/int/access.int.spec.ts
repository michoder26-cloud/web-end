// @vitest-environment node
import { getPayload, type Payload, type PayloadRequest } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { accessPolicy, type Rule } from '@/access/policy'
import config from '@/payload.config'

const operations = ['create', 'read', 'update', 'delete'] as const
const password = 'local-tests-only-password'

let payload: Payload
let member: Record<string, any>
let otherMember: Record<string, any>

const ruleFor = async (slug: string, operation: (typeof operations)[number], user: unknown) => {
  const access = payload.collections[slug as keyof Payload['collections']].config.access[operation]
  const result = await access({ req: { payload, user } as unknown as PayloadRequest })
  if (result === true) return 'yes' satisfies Rule
  if (result === false) return 'no' satisfies Rule
  return 'some' satisfies Rule
}

describe('access rules', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const emails = ['owner', 'member', 'other'].map((name) => `${name}@example.test`)
    const [, first, second] = await Promise.all(
      emails.map((email) => payload.find({ collection: 'users', where: { email: { equals: email } } })),
    ).then(async (found) => {
      const docs = []
      for (const [index, result] of found.entries()) {
        docs.push(
          result.docs[0] ??
            (await payload.create({
              collection: 'users',
              data: { email: emails[index], password, roles: ['member'] },
            })),
        )
      }
      return docs
    })
    member = { ...first, collection: 'users' }
    otherMember = { ...second, collection: 'users' }
  })

  it('has a written decision for every collection', () => {
    const collections = Object.keys(payload.collections).filter((slug) => !slug.startsWith('payload-'))
    expect(collections.sort()).toEqual(Object.keys(accessPolicy).sort())
  })

  for (const [slug, policy] of Object.entries(accessPolicy)) {
    for (const operation of operations) {
      it(`${slug}: anonymous visitors ${operation} = ${policy.anonymous[operation]}`, async () => {
        expect(await ruleFor(slug, operation, null)).toBe(policy.anonymous[operation])
      })

      it(`${slug}: members ${operation} = ${policy.member[operation]}`, async () => {
        expect(await ruleFor(slug, operation, member)).toBe(policy.member[operation])
      })
    }
  }

  it('makes the first account the admin and later accounts members', async () => {
    const { docs } = await payload.find({ collection: 'users', sort: 'createdAt', limit: 3 })
    expect(docs[0].roles).toEqual(['admin'])
    expect(member.roles).toEqual(['member'])
  })

  it('stops a member reading another member', async () => {
    await expect(
      payload.findByID({ collection: 'users', id: otherMember.id, overrideAccess: false, user: member }),
    ).rejects.toThrow()
  })

  it('stops a member changing another member', async () => {
    await expect(
      payload.update({
        collection: 'users',
        id: otherMember.id,
        data: { email: 'stolen@example.test' },
        overrideAccess: false,
        user: member,
      }),
    ).rejects.toThrow()
  })

  it('stops a member making themselves admin', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: member.id,
      data: { roles: ['admin'] },
      overrideAccess: false,
      user: member,
    })
    expect(updated.roles).toEqual(['member'])
  })
})
