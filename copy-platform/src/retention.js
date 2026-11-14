const DAY = 86400000;

export async function runRetention(env, now = Date.now()) {
  // Never erase user content unless the reminder can reach the owner and its link opens the project.
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.APP_HOST) return { warnings: 0, filesDeleted: 0, skipped: 'email-not-configured' };
  let warnings = 0, filesDeleted = 0;
  const cutoff = now - 76 * DAY;
  const candidates = (await env.DB.prepare('SELECT projects.id, projects.title, projects.last_active_at, users.email FROM projects JOIN users ON users.id = projects.owner_id WHERE projects.last_active_at < ? AND projects.warned_at IS NULL AND projects.deletion_started_at IS NULL ORDER BY projects.last_active_at LIMIT 30').bind(cutoff).all()).results;
  for (const item of candidates) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `web-end-retention-${item.id}-${item.last_active_at}` },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [item.email], subject: 'Your web-end project is scheduled for deletion', text: `Your project “${item.title}” has been inactive for 76 days. Open https://${env.APP_HOST}/projects/${item.id} within 14 days to keep it. Otherwise, its copied files and edits will be deleted after 90 days of inactivity.` })
    });
    if (!response.ok) { console.error('Retention email failed', item.id, response.status); continue; }
    const result = await env.DB.prepare('UPDATE projects SET warned_at = ? WHERE id = ? AND last_active_at = ? AND warned_at IS NULL AND deletion_started_at IS NULL').bind(now, item.id, item.last_active_at).run();
    if (result.meta?.changes) warnings++;
  }
  const due = (await env.DB.prepare('SELECT id, last_active_at, warned_at FROM projects WHERE last_active_at < ? AND warned_at < ? AND deletion_started_at IS NULL ORDER BY last_active_at LIMIT 1').bind(now - 90 * DAY, now - 14 * DAY).all()).results;
  for (const item of due) {
    await env.DB.prepare('UPDATE projects SET deletion_started_at = ? WHERE id = ? AND last_active_at = ? AND warned_at = ? AND deletion_started_at IS NULL').bind(now, item.id, item.last_active_at, item.warned_at).run();
  }
  const deleting = await env.DB.prepare('SELECT id FROM projects WHERE deletion_started_at IS NOT NULL ORDER BY deletion_started_at LIMIT 1').first();
  if (!deleting) return { warnings, filesDeleted };
  const files = (await env.DB.prepare('SELECT path FROM project_files WHERE project_id = ? LIMIT 100').bind(deleting.id).all()).results;
  for (const file of files) {
    await env.FILES.delete(`${deleting.id}/${file.path}`);
    await env.DB.prepare('DELETE FROM project_files WHERE project_id = ? AND path = ?').bind(deleting.id, file.path).run();
    filesDeleted++;
  }
  if (files.length < 100) await env.DB.prepare('DELETE FROM projects WHERE id = ? AND deletion_started_at IS NOT NULL').bind(deleting.id).run();
  return { warnings, filesDeleted };
}
