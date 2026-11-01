import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`pages_blocks_contact\` ADD \`name_label\` text;`)
  await db.run(sql`ALTER TABLE \`pages_blocks_contact\` ADD \`email_label\` text;`)
  await db.run(sql`ALTER TABLE \`pages_blocks_contact\` ADD \`message_label\` text;`)
  await db.run(sql`ALTER TABLE \`pages_blocks_contact\` ADD \`sent_message\` text;`)
  await db.run(sql`ALTER TABLE \`pages_blocks_contact\` ADD \`error_message\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`pages_blocks_contact\` DROP COLUMN \`name_label\`;`)
  await db.run(sql`ALTER TABLE \`pages_blocks_contact\` DROP COLUMN \`email_label\`;`)
  await db.run(sql`ALTER TABLE \`pages_blocks_contact\` DROP COLUMN \`message_label\`;`)
  await db.run(sql`ALTER TABLE \`pages_blocks_contact\` DROP COLUMN \`sent_message\`;`)
  await db.run(sql`ALTER TABLE \`pages_blocks_contact\` DROP COLUMN \`error_message\`;`)
}
