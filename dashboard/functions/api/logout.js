import { json, logout, sameOrigin } from '../../lib/auth.js'
export const onRequestPost = ({ request, env }) => (sameOrigin(request) ? logout(request, env) : json({ error: 'bad origin' }, 403))
