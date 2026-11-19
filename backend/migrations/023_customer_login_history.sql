-- Unknown historical logins stay unknown. Record only successful new logins.
ALTER TABLE customers ADD COLUMN last_login_at timestamptz;
