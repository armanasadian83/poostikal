-- PostgreSQL delivers NOTIFY after commit and discards it on rollback.
CREATE FUNCTION notify_storefront_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('poostikal_stock', NEW.revision::text);
  RETURN NULL;
END;
$$;

CREATE TRIGGER notify_storefront_revision AFTER UPDATE OF revision ON storefront_revision
  FOR EACH ROW EXECUTE FUNCTION notify_storefront_revision();
