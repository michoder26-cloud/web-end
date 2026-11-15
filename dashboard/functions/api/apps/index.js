import { handleApps } from '../../../lib/apps.js'
export const onRequest = ({ request, env }) => handleApps(request, env)
