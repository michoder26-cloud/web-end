-- A transaction-local admission ticket for an unconfirmed starter. The ticket
-- is removed in the same batch; it is never a persistent site lock.
CREATE TABLE starter_guard (token TEXT PRIMARY KEY);
