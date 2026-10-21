/**
 * Settings for the "context events" feature (war, pandemic, ...), kept in this file on purpose
 * (fast project, no env vars to manage).
 *
 * Detection reads public Hebrew news RSS, counts headlines that match a rule's keywords, and opens
 * an event when enough of them show up in one fetch. It stores no headline, only our own label.
 * It is a heuristic: tune keywords and `minHeadlines` here after watching real results, and use
 * MANUAL_EVENTS to fix a start or end date the detector got wrong.
 */

export type DetectionRule = {
  kind: "war" | "pandemic" | "disaster";
  /** label shown to members */
  titleHe: string;
  /** a headline matches when its title or description contains any of these */
  keywords: string[];
  /** matching headlines needed in one fetch to open (or keep alive) an event */
  minHeadlines: number;
  /** event is closed after this many days without enough matching headlines */
  quietDaysToEnd: number;
};

export const EVENT_FEEDS: string[] = [
  // ynet "latest news" RSS. Add more feeds (Maariv, Walla, Kan) the same way.
  "https://www.ynet.co.il/Integration/StoryRss2.xml",
];

export const DETECTION_RULES: DetectionRule[] = [
  {
    kind: "war",
    titleHe: "מצב ביטחוני מתוח",
    keywords: ["אזעקות", "אזעקה", "פיקוד העורף", "שיגורים", "מטח", "יירוט", "חזית הבית"],
    minHeadlines: 4,
    quietDaysToEnd: 5,
  },
  {
    kind: "pandemic",
    titleHe: "התפרצות מחלה",
    keywords: ["התפרצות", "מגפה", "קורונה", "סגר", "הנחיות משרד הבריאות"],
    minHeadlines: 5,
    quietDaysToEnd: 10,
  },
  {
    kind: "disaster",
    titleHe: "אירוע חירום אזרחי",
    keywords: ["רעידת אדמה", "שריפות", "הצפות", "מצב חירום"],
    minHeadlines: 4,
    quietDaysToEnd: 4,
  },
];

export type ManualEvent = {
  /** stable id, never reuse */
  id: string;
  kind: "war" | "pandemic" | "disaster" | "other";
  titleHe: string;
  /** YYYY-MM-DD */
  startsOn: string;
  /** YYYY-MM-DD, omit while ongoing */
  endsOn?: string;
};

/**
 * Hand-entered events. Added to the database by the daily job. Example:
 *   { id: "covid-2020", kind: "pandemic", titleHe: "קורונה", startsOn: "2020-03-11", endsOn: "2022-04-01" }
 */
export const MANUAL_EVENTS: ManualEvent[] = [];
