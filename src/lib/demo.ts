/** Accounts created by `npm run db:seed`. Used only when DEMO_AUTH=true. */
export const DEMO_EMAILS = {
  member: "demo-member-01@example.test",
  care: "demo-care@example.test",
  org: "demo-org@example.test",
} as const;
// The owner's real account is not a demo role: it signs in with Oura (or an emailed link) like everyone else.

export type DemoRole = keyof typeof DEMO_EMAILS;

export const DEMO_HOME: Record<DemoRole, string> = {
  member: "/member",
  care: "/care",
  org: "/org",
};
