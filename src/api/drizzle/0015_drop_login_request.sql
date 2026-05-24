-- The login_request table was part of the original "user requests login,
-- admin approves" flow. Auth is now JWT-based with Google SSO + email OTP
-- + admin password (and user.status still carries the pending/approved
-- gate). No route, lib, or component references this table — dropping it.
DROP TABLE IF EXISTS "ytai"."login_request";
