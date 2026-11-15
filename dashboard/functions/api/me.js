import { currentUser, json } from '../../lib/auth.js'
export async function onRequestGet({ request, env }) {
  const user = await currentUser(request, env)
  return user ? json({ email: user.email, name: user.name }) : json({ error: 'not signed in' }, 401)
}
