-- A shared cache key for public representations. A rollback also rolls back
-- the key change. Take the revision row lock at commit, after catalog work.
CREATE TABLE storefront_revision (
  singleton boolean PRIMARY KEY CHECK (singleton),
  revision uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO storefront_revision(singleton) VALUES (true);

CREATE FUNCTION advance_storefront_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('poostikal.revision_advanced', true) IS DISTINCT FROM 'yes' THEN
    UPDATE storefront_revision SET revision = gen_random_uuid() WHERE singleton;
    PERFORM set_config('poostikal.revision_advanced', 'yes', true);
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['products','product_categories','brands','categories','settings'] LOOP
    EXECUTE format('CREATE CONSTRAINT TRIGGER invalidate_storefront
      AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION advance_storefront_revision()', relation);
    EXECUTE format('CREATE TRIGGER invalidate_storefront_truncate AFTER TRUNCATE ON %I
      FOR EACH STATEMENT EXECUTE FUNCTION advance_storefront_revision()', relation);
  END LOOP;
END;
$$;
