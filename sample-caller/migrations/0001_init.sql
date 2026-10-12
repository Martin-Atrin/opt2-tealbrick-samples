-- Baseline (SDK-API §7.1): forward-only, one transaction per file, never edited after release.
-- Sample Caller keeps no app table: each send is recorded by the SDK receipt (input digest, status). `tb_*` names are
-- reserved for the SDK; add app tables in 0002_<name>.sql.
SELECT 1;
