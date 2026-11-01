import config from '@payload-config'
import { headers } from 'next/headers.js'
import { getPayload } from 'payload'

/** The logged-in person for this request, or null. */
export async function getSessionUser() {
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: await headers() })
  return user
}

const defaults = {
  account: 'My account',
  deleteAccount: 'Delete my account',
  deleteConfirm: 'Yes, delete my account and everything I sent',
  email: 'Email',
  login: 'Log in',
  loginError: 'That email or password is not right.',
  loginFirst: 'Please log in to continue.',
  logout: 'Log out',
  myRecords: 'What you have sent',
  noRecords: 'Nothing here yet.',
  password: 'Password',
  signup: 'Create an account',
  signupError: 'That did not work. Use a valid email and a password of at least 10 characters.',
}

export type Labels = typeof defaults

export const labelsFrom = (labels?: null | Partial<Record<keyof Labels, null | string>>): Labels =>
  Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [key, labels?.[key as keyof Labels] || value]),
  ) as Labels
