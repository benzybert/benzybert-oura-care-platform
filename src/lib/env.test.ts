import { afterEach, describe, expect, it, vi } from "vitest";
import { demoAuthEnabled, orgMinCohort } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("demoAuthEnabled", () => {
  it("is off by default", () => {
    vi.stubEnv("DEMO_AUTH", "");
    expect(demoAuthEnabled()).toBe(false);
  });

  it("is on when DEMO_AUTH=true outside production", () => {
    vi.stubEnv("DEMO_AUTH", "true");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(demoAuthEnabled()).toBe(true);
  });

  it("is on in Vercel Production when DEMO_AUTH=true", () => {
    vi.stubEnv("DEMO_AUTH", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(demoAuthEnabled()).toBe(true);
  });
});

describe("orgMinCohort", () => {
  it("defaults to 5 and never goes below 2", () => {
    vi.stubEnv("ORG_MIN_COHORT", "");
    expect(orgMinCohort()).toBe(5);
    vi.stubEnv("ORG_MIN_COHORT", "1");
    expect(orgMinCohort()).toBe(5);
    vi.stubEnv("ORG_MIN_COHORT", "8");
    expect(orgMinCohort()).toBe(8);
  });
});
