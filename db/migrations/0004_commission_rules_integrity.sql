-- Integridade das regras de comissão (docs/05 §2): sem vigências sobrepostas e sem alteração após aprovação.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_no_overlap
  EXCLUDE USING gist (
    campaign_id WITH =,
    tstzrange(valid_from, coalesce(valid_to, 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE (status = 'approved');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION commission_rules_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Regras revisadas não podem ser apagadas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'approved' THEN
    -- Única mudança permitida: encerrar a vigência (valid_to) no futuro, quando uma nova versão a substitui.
    IF (to_jsonb(NEW) - 'valid_to') IS DISTINCT FROM (to_jsonb(OLD) - 'valid_to')
       OR NEW.valid_to IS NULL
       OR (OLD.valid_to IS NOT NULL AND NEW.valid_to > OLD.valid_to)
       OR NEW.valid_to < now() - interval '1 minute' THEN
      RAISE EXCEPTION 'Regra aprovada é imutável; crie uma nova versão' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF OLD.status = 'rejected' THEN
    RAISE EXCEPTION 'Regra rejeitada é imutável' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER commission_rules_guard
  BEFORE UPDATE OR DELETE ON commission_rules
  FOR EACH ROW EXECUTE FUNCTION commission_rules_guard();
