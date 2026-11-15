import { finishGoogle } from '../../../lib/auth.js'
export const onRequestGet = ({ request, env }) => finishGoogle(request, env)
