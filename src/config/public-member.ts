/**
 * The owner's choice (Nov 2026): his own member area is open to anyone at /member, read-only, so the
 * newsletter can link straight to it. Kept in a file on purpose (see CLAUDE.md, "Config lives in files").
 * This is an internal member id, not contact details. Env PUBLIC_MEMBER_ID, if set, wins; set it to an
 * empty string, or empty `memberId` here, to close the public view again.
 */
export const PUBLIC_MEMBER_CONFIG = {
  memberId: "478cc915-8eb4-4e88-bc3c-99d7b42fd895",
};
