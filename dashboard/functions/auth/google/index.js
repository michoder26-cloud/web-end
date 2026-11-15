import { beginGoogle } from '../../../lib/auth.js'
export const onRequestGet = ({ request, env }) => beginGoogle(request, env)
