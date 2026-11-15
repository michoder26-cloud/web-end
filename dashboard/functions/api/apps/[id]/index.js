import { handleApps } from '../../../../lib/apps.js'
export const onRequest = ({ request, env, params }) => handleApps(request, env, { id: params.id })
