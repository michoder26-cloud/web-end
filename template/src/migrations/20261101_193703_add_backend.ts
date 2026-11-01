import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`pages_blocks_data_form\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`data_type\` text NOT NULL,
  	\`heading\` text,
  	\`intro\` text,
  	\`button_label\` text,
  	\`sent_message\` text,
  	\`error_message\` text,
  	\`tone\` text DEFAULT 'plain',
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`pages_blocks_data_form_order_idx\` ON \`pages_blocks_data_form\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`pages_blocks_data_form_parent_id_idx\` ON \`pages_blocks_data_form\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_blocks_data_form_path_idx\` ON \`pages_blocks_data_form\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`pages_blocks_data_list\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`data_type\` text NOT NULL,
  	\`heading\` text,
  	\`intro\` text,
  	\`empty_message\` text,
  	\`limit\` numeric DEFAULT 24,
  	\`tone\` text DEFAULT 'plain',
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`pages_blocks_data_list_order_idx\` ON \`pages_blocks_data_list\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`pages_blocks_data_list_parent_id_idx\` ON \`pages_blocks_data_list\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_blocks_data_list_path_idx\` ON \`pages_blocks_data_list\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`pages_blocks_page_list\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`category\` text NOT NULL,
  	\`heading\` text,
  	\`intro\` text,
  	\`empty_message\` text,
  	\`limit\` numeric DEFAULT 12,
  	\`tone\` text DEFAULT 'plain',
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`pages_blocks_page_list_order_idx\` ON \`pages_blocks_page_list\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`pages_blocks_page_list_parent_id_idx\` ON \`pages_blocks_page_list\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`pages_blocks_page_list_path_idx\` ON \`pages_blocks_page_list\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`data_types_fields\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`label\` text NOT NULL,
  	\`type\` text DEFAULT 'text' NOT NULL,
  	\`required\` integer DEFAULT false,
  	\`options\` text,
  	\`public\` integer DEFAULT false,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`data_types\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`data_types_fields_order_idx\` ON \`data_types_fields\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`data_types_fields_parent_id_idx\` ON \`data_types_fields\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`data_types\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`who_can_submit\` text DEFAULT 'nobody' NOT NULL,
  	\`who_can_see\` text DEFAULT 'owner' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`data_types_slug_idx\` ON \`data_types\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`data_types_updated_at_idx\` ON \`data_types\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`data_types_created_at_idx\` ON \`data_types\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`records\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`data_type_id\` integer NOT NULL,
  	\`summary\` text,
  	\`data\` text NOT NULL,
  	\`owner_id\` integer,
  	\`status\` text DEFAULT 'new' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`data_type_id\`) REFERENCES \`data_types\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`records_data_type_idx\` ON \`records\` (\`data_type_id\`);`)
  await db.run(sql`CREATE INDEX \`records_owner_idx\` ON \`records\` (\`owner_id\`);`)
  await db.run(sql`CREATE INDEX \`records_status_idx\` ON \`records\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`records_updated_at_idx\` ON \`records\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`records_created_at_idx\` ON \`records\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`pages\` ADD \`visibility\` text DEFAULT 'public' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`pages\` ADD \`category\` text;`)
  await db.run(sql`CREATE INDEX \`pages_category_idx\` ON \`pages\` (\`category\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`data_types_id\` integer REFERENCES data_types(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`records_id\` integer REFERENCES records(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_data_types_id_idx\` ON \`payload_locked_documents_rels\` (\`data_types_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_records_id_idx\` ON \`payload_locked_documents_rels\` (\`records_id\`);`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`allow_signup\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_account\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_login\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_signup\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_logout\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_email\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_password\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_login_first\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_login_error\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_signup_error\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_my_records\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_no_records\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_delete_account\` text;`)
  await db.run(sql`ALTER TABLE \`site\` ADD \`labels_delete_confirm\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`pages_blocks_data_form\`;`)
  await db.run(sql`DROP TABLE \`pages_blocks_data_list\`;`)
  await db.run(sql`DROP TABLE \`pages_blocks_page_list\`;`)
  await db.run(sql`DROP TABLE \`data_types_fields\`;`)
  await db.run(sql`DROP TABLE \`data_types\`;`)
  await db.run(sql`DROP TABLE \`records\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`pages_id\` integer,
  	\`media_id\` integer,
  	\`messages_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`pages_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`messages_id\`) REFERENCES \`messages\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "pages_id", "media_id", "messages_id") SELECT "id", "order", "parent_id", "path", "users_id", "pages_id", "media_id", "messages_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_pages_id_idx\` ON \`payload_locked_documents_rels\` (\`pages_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_messages_id_idx\` ON \`payload_locked_documents_rels\` (\`messages_id\`);`)
  await db.run(sql`DROP INDEX \`pages_category_idx\`;`)
  await db.run(sql`ALTER TABLE \`pages\` DROP COLUMN \`visibility\`;`)
  await db.run(sql`ALTER TABLE \`pages\` DROP COLUMN \`category\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`allow_signup\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_account\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_login\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_signup\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_logout\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_email\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_password\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_login_first\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_login_error\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_signup_error\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_my_records\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_no_records\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_delete_account\`;`)
  await db.run(sql`ALTER TABLE \`site\` DROP COLUMN \`labels_delete_confirm\`;`)
}
