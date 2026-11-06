-- Which fields of each table have their own index (data_field_<table id>_<field>), comma separated.
-- NULL means the table was saved before indexes existed; its indexes are built on its next save or write.
-- Only adds a column: no record is rewritten and nothing is deleted.
ALTER TABLE data_tables ADD COLUMN indexed TEXT;
