-- Livro-razão: somente inclusão e soma zero por transação (verificada no fim da transação do banco).
CREATE TRIGGER ledger_transactions_append_only
  BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER brand_payments_append_only
  BEFORE UPDATE OR DELETE ON brand_payments
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ledger_check_balanced() RETURNS trigger AS $$
DECLARE
  total bigint;
  demo_mismatch int;
BEGIN
  SELECT coalesce(sum(amount_cents), 0) INTO total FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF total <> 0 THEN
    RAISE EXCEPTION 'Transação % desbalanceada (soma = %)', NEW.transaction_id, total USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO demo_mismatch
    FROM ledger_entries e JOIN ledger_transactions t ON t.id = e.transaction_id
    WHERE e.transaction_id = NEW.transaction_id AND e.is_demo <> t.is_demo;
  IF demo_mismatch > 0 THEN
    RAISE EXCEPTION 'Lançamentos de demonstração misturados a lançamentos reais' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced();
--> statement-breakpoint
-- Resgate pago é definitivo.
CREATE OR REPLACE FUNCTION payout_paid_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('paid', 'rejected', 'canceled') THEN
    RAISE EXCEPTION 'Resgate finalizado não pode ser alterado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payout_requests_final_guard
  BEFORE UPDATE OR DELETE ON payout_requests
  FOR EACH ROW EXECUTE FUNCTION payout_paid_guard();
--> statement-breakpoint
-- Defesa em profundidade: num banco de produção (ALTER DATABASE ... SET app.environment = 'production'),
-- nenhum registro marcado como demonstração pode ser gravado.
CREATE OR REPLACE FUNCTION reject_demo_in_production() RETURNS trigger AS $$
BEGIN
  IF NEW.is_demo AND coalesce(current_setting('app.environment', true), '') = 'production' THEN
    RAISE EXCEPTION 'Dados de demonstração não são permitidos no banco de produção (%)', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER orders_no_demo_in_production BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION reject_demo_in_production();
--> statement-breakpoint
CREATE TRIGGER conversions_no_demo_in_production BEFORE INSERT OR UPDATE ON conversions FOR EACH ROW EXECUTE FUNCTION reject_demo_in_production();
--> statement-breakpoint
CREATE TRIGGER ledger_transactions_no_demo_in_production BEFORE INSERT ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION reject_demo_in_production();
--> statement-breakpoint
CREATE TRIGGER payout_requests_no_demo_in_production BEFORE INSERT OR UPDATE ON payout_requests FOR EACH ROW EXECUTE FUNCTION reject_demo_in_production();
