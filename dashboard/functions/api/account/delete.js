import { deleteAccount, json, sameOrigin } from '../../../lib/auth.js'
export const onRequestPost = ({ request, env }) => (sameOrigin(request) ? deleteAccount(request, env) : json({ error: 'bad origin' }, 403))
