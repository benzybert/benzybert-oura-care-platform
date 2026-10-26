import { describe, expect, it } from "vitest";
import { decodeOAuthState, encodeOAuthState, startPath } from "./oauth-state";
import { forbiddenFamilies, grantedScopes, requestedScopes, OURA_SCOPES, NEWER_SCOPES } from "./scopes";

describe("oauth state", () => {
  it("round-trips both modes", () => {
    const login = { mode: "login" as const, subject: "-", state: "abc_DEF-1", basic: false };
    const connect = { mode: "connect" as const, subject: "6f1c0d2e-1111-2222-3333-444455556666", state: "x", basic: true };
    expect(decodeOAuthState(encodeOAuthState(login))).toEqual(login);
    expect(decodeOAuthState(encodeOAuthState(connect))).toEqual(connect);
  });
  it("rejects malformed values", () => {
    expect(decodeOAuthState(null)).toBeNull();
    expect(decodeOAuthState("connect:user:state")).toBeNull();
    expect(decodeOAuthState("admin:u:s:0")).toBeNull();
    expect(decodeOAuthState("login::s:0")).toBeNull();
  });
  it("restarts the right flow", () => {
    expect(startPath("login", true)).toBe("/api/auth/oura?basic=1");
    expect(startPath("connect", false)).toBe("/api/oura/connect");
  });
});

describe("scopes", () => {
  it("asks for the newer scopes unless basic", () => {
    expect(requestedScopes()).toEqual([...OURA_SCOPES, ...NEWER_SCOPES]);
    expect(requestedScopes(true)).toEqual(OURA_SCOPES);
  });
  it("reads the granted list from the token response", () => {
    expect(grantedScopes("extapi:daily extapi:heartrate", OURA_SCOPES)).toBe("daily heartrate");
    expect(grantedScopes("daily,personal", OURA_SCOPES)).toBe("daily personal");
    expect(grantedScopes(undefined, ["daily"])).toBe("daily");
  });
  it("lists forbidden families", () => {
    expect(
      forbiddenFamilies({ daily_spo2: { status: "forbidden" }, sleep: { status: "ok" }, vO2_max: { status: "forbidden" } }),
    ).toEqual(["daily_spo2", "vO2_max"]);
    expect(forbiddenFamilies(null)).toEqual([]);
  });
});
