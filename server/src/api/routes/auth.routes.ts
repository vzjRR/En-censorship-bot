import { Router } from "express";
import { env } from "../../config/env.js";
import { generateOAuthState, buildAuthorizeUrl, exchangeCodeForProfile } from "../../auth/discordOAuth.js";
import { resolveAccess } from "../../auth/authorization.js";
import { ensureCsrfToken } from "../middleware/csrf.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { loginRateLimit } from "../middleware/rateLimit.js";
import { recordAuditLog, AUDIT_ACTIONS } from "../../audit/audit.service.js";

export const authRouter = Router();

authRouter.get("/discord/login", loginRateLimit, (req, res) => {
  const state = generateOAuthState();
  req.session.oauthState = state;
  const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/";
  req.session.oauthReturnTo = returnTo.startsWith("/") ? returnTo : "/";
  res.redirect(buildAuthorizeUrl(state));
});

authRouter.get("/discord/callback", loginRateLimit, async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  const frontendUrl = new URL("/login", env.APP_BASE_URL);

  if (oauthError) {
    frontendUrl.searchParams.set("authError", "discord_denied");
    return res.redirect(frontendUrl.toString());
  }

  const expectedState = req.session.oauthState;
  if (!expectedState || typeof state !== "string" || state !== expectedState) {
    frontendUrl.searchParams.set("authError", "invalid_state");
    return res.redirect(frontendUrl.toString());
  }

  if (typeof code !== "string") {
    frontendUrl.searchParams.set("authError", "missing_code");
    return res.redirect(frontendUrl.toString());
  }

  try {
    const profile = await exchangeCodeForProfile(code);
    const ip = req.ip ?? null;
    const access = await resolveAccess(profile, ip);

    if (access.status === "denied") {
      await recordAuditLog({
        actorDiscordId: profile.id,
        actorName: profile.username,
        action: AUDIT_ACTIONS.ACCESS_DENIED,
        targetType: "login_attempt",
        metadata: { reason: access.reason },
        ipAddress: ip,
      });
      frontendUrl.searchParams.set("authError", access.reason);
      return res.redirect(frontendUrl.toString());
    }

    const returnTo = req.session.oauthReturnTo && req.session.oauthReturnTo.startsWith("/") ? req.session.oauthReturnTo : "/";

    req.session.regenerate((err) => {
      if (err) {
        console.error("[auth] session regenerate failed:", err);
        frontendUrl.searchParams.set("authError", "session_error");
        return res.redirect(frontendUrl.toString());
      }

      req.session.user = access.user;
      ensureCsrfToken(req);

      req.session.save(async (saveErr) => {
        if (saveErr) {
          console.error("[auth] session save failed:", saveErr);
          frontendUrl.searchParams.set("authError", "session_error");
          return res.redirect(frontendUrl.toString());
        }

        await recordAuditLog({
          actorDiscordId: access.user.discordUserId,
          actorName: access.user.displayName,
          action: AUDIT_ACTIONS.LOGIN_SUCCESS,
          targetType: "session",
          metadata: { roleKey: access.user.roleKey },
          ipAddress: ip,
        });

        const dest = new URL(returnTo, env.APP_BASE_URL);
        res.redirect(dest.toString());
      });
    });
  } catch (err) {
    console.error("[auth] OAuth callback failed:", err);
    frontendUrl.searchParams.set("authError", "server_error");
    res.redirect(frontendUrl.toString());
  }
});

authRouter.post("/logout", requireAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("[auth] logout failed:", err);
      return res.status(500).json({ error: "internal_error", message: "Failed to log out." });
    }
    res.clearCookie("enclave.sid");
    res.json({ ok: true });
  });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({
    user: req.auth,
    csrfToken: ensureCsrfToken(req),
  });
});
