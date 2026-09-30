-- Definition/document order is meaningful (screens and rule lists follow it), so it is stored explicitly.
ALTER TABLE "db_tables" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "db_fields" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "rule_codes" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
