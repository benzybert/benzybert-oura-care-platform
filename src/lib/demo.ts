/** Accounts created by `npm run db:seed`. Used only when DEMO_AUTH=true. */
export const DEMO_EMAILS = {
  member: "demo-member-01@example.test",
  care: "demo-care@example.test",
  org: "demo-org@example.test",
  /** The owner's real member (no synthetic data); created in the database, not by the seed. */
  me: "owner@oura-care.local",
} as const;

export type DemoRole = keyof typeof DEMO_EMAILS;

export const DEMO_HOME: Record<DemoRole, string> = {
  member: "/member",
  care: "/care",
  org: "/org",
  me: "/member",
};
