import type { MemberTab } from "@/lib/member-tabs";

/** Line icons for the member sidebar: 24px grid, stroke follows the text colour. Decorative only. */
const PATHS: Record<MemberTab, string[]> = {
  home: [
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  ],
  heart: [
    "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z",
    "M5 12h3.5l1.5-2.5 2.5 5 1.5-2.5H19",
  ],
  circle: [
    "M9 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    "M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5",
    "M16.5 6.5a2.5 2.5 0 1 1 0 5",
    "M17 14c2.5.4 4 2.2 4 5",
  ],
  challenges: [
    "M8 4h8v5a4 4 0 0 1-8 0V4z",
    "M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4",
    "M12 13v4M8.5 20h7M10 17h4v3h-4z",
  ],
  data: ["M4 4h6v7H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 15h6v5H4z"],
  experiments: ["M9 3h6M10 3v6l-5.2 9.2A1.9 1.9 0 0 0 6.5 21h11a1.9 1.9 0 0 0 1.7-2.8L14 9V3", "M7.5 15h9"],
  goals: [
    "M4 9h16v4H4zM5.5 13h13v7h-13zM12 9v11",
    "M12 9c-2.2 0-4.5-.8-4.5-2.6a2 2 0 0 1 3.6-1.2L12 6.5l.9-1.3a2 2 0 0 1 3.6 1.2C16.5 8.2 14.2 9 12 9z",
  ],
  sharing: ["M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z", "M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6", "M18.5 8v6M15.5 11h6"],
  profile: ["M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M4.5 21c0-4 3.4-6.8 7.5-6.8s7.5 2.8 7.5 6.8"],
};

export function MemberNavIcon({ tab }: { tab: MemberTab }) {
  return (
    <svg
      className="member-nav-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[tab].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
