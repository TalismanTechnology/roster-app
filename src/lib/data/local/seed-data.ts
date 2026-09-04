import type { AchievementKind, AthleteLevel, VerificationState } from "@/lib/database.types";

/**
 * The seeded roster. Every person, school, and number here is fictional.
 *
 * Kept realistic on purpose: a long school name, a 4-character time next to
 * a 7-character one, a verified entry beside a self-reported one — the cases
 * worth catching in a design review.
 */

export const DEMO_PASSWORD = "roster-demo";

export type SeedEntry = {
  kind: AchievementKind;
  title: string;
  on: string;
  value?: string;
  unit?: string;
  competition?: string;
  location?: string;
  placement?: number;
  field?: number;
  detail?: string;
  org?: string;
  event?: string;
  state?: VerificationState;
  pinned?: boolean;
};

export type SeedAthlete = {
  handle: string;
  name: string;
  sport: string;
  level: AthleteLevel;
  grad: number;
  region: string;
  city: string;
  school: string;
  positions: string[];
  height: number;
  weight: number;
  gpa: number | null;
  sat?: number;
  act?: number;
  bio: string;
  jersey?: string;
  visibility?: "public" | "unlisted" | "private";
  recruitable?: boolean;
  entries: SeedEntry[];
  film: { title: string; url: string; season?: string }[];
  coaches: { name: string; role: string; org: string; email?: string; phone?: string }[];
};

const V: VerificationState = "verified";

export const ATHLETES: SeedAthlete[] = [
  {
    handle: "jordanreyes",
    name: "Jordan Reyes",
    sport: "football",
    level: "high_school",
    grad: 2027,
    region: "TX",
    city: "Austin, TX",
    school: "Westlake High School",
    positions: ["WR", "DB"],
    height: 185,
    weight: 84,
    gpa: 3.8,
    sat: 1290,
    bio: "WR/DB. 4.48 laser. Chasing 1,000 yards this fall. Open to conversations.",
    jersey: "7",
    recruitable: true,
    entries: [
      { kind: "personal_record", title: "40-yard dash", on: "2026-04-18", value: "4.48", unit: "s", competition: "Spring combine", location: "Austin, TX", state: V, pinned: true },
      { kind: "result", title: "Receiving, 2025 season", on: "2025-11-14", value: "58 rec · 912 yds · 11 TD", competition: "District 25-6A", org: "Westlake High School", state: V, pinned: true },
      { kind: "personal_record", title: "Vertical jump", on: "2026-03-07", value: "36.5", unit: "in", state: V },
      { kind: "result", title: "200m", on: "2026-05-02", value: "22.14", unit: "s", competition: "District meet", location: "Round Rock, TX", placement: 2, field: 16, state: V },
      { kind: "award", title: "All-District, first team", on: "2025-12-05", org: "District 25-6A", state: V, pinned: true },
      { kind: "personal_record", title: "Bench press", on: "2026-02-20", value: "225 × 8", detail: "Self-reported from spring lifting." },
      { kind: "selection", title: "Elite 11 regional — invited", on: "2026-05-30", state: "submitted" },
    ],
    film: [
      { title: "Senior season highlights", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", season: "2025" },
      { title: "vs. Lake Travis — full game", url: "https://www.hudl.com/video/3/abc123", season: "2025" },
    ],
    coaches: [
      { name: "Tom Bradley", role: "Head Coach", org: "Westlake High School", email: "tbradley@example.org", phone: "(512) 555-0131" },
      { name: "Andre Wilkins", role: "WR Coach", org: "Westlake High School", email: "awilkins@example.org" },
    ],
  },
  {
    handle: "devinokafor",
    name: "Devin Okafor",
    sport: "football",
    level: "high_school",
    grad: 2027,
    region: "TX",
    city: "Katy, TX",
    school: "Katy High School",
    positions: ["WR"],
    height: 188,
    weight: 86,
    gpa: 3.5,
    bio: "Outside receiver. 1,104 yards as a junior. Film first, then talk.",
    recruitable: true,
    entries: [
      { kind: "result", title: "Receiving, 2025 season", on: "2025-11-21", value: "61 rec · 1,104 yds · 13 TD", competition: "District 19-6A", state: V, pinned: true },
      { kind: "personal_record", title: "40-yard dash", on: "2026-04-11", value: "4.52", unit: "s", state: V },
      { kind: "award", title: "District Offensive MVP", on: "2025-12-10", org: "District 19-6A", state: V, pinned: true },
      { kind: "personal_record", title: "Vertical jump", on: "2026-03-14", value: "34", unit: "in" },
    ],
    film: [{ title: "Junior highlights", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", season: "2025" }],
    coaches: [{ name: "Ray Sutton", role: "Head Coach", org: "Katy High School", email: "rsutton@example.org" }],
  },
  {
    handle: "samwhitfield",
    name: "Sam Whitfield",
    sport: "football",
    level: "high_school",
    grad: 2026,
    region: "TX",
    city: "Allen, TX",
    school: "Allen High School",
    positions: ["WR", "KR"],
    height: 180,
    weight: 79,
    gpa: 3.9,
    sat: 1380,
    bio: "Slot and return. Three return touchdowns in 2025. 3.9 GPA, AP heavy.",
    recruitable: true,
    entries: [
      { kind: "result", title: "Kick returns, 2025 season", on: "2025-11-28", value: "3 TD · 31.2 avg", state: V, pinned: true },
      { kind: "personal_record", title: "40-yard dash", on: "2026-04-04", value: "4.55", unit: "s", state: V },
      { kind: "result", title: "Receiving, 2025 season", on: "2025-11-28", value: "44 rec · 690 yds · 6 TD", state: V },
      { kind: "award", title: "All-State honorable mention", on: "2025-12-18", org: "TSWA", state: V },
      { kind: "captaincy", title: "Named team captain", on: "2025-08-01", org: "Allen High School", state: V },
      { kind: "milestone", title: "First varsity touchdown", on: "2023-09-08" },
      { kind: "result", title: "100m", on: "2026-04-25", value: "10.94", unit: "s", competition: "Area meet", placement: 1, field: 9, state: V },
      { kind: "personal_record", title: "Broad jump", on: "2026-03-01", value: "10'4\"", state: V },
      { kind: "selection", title: "Texas–Oklahoma all-star game", on: "2026-06-06", state: V },
      { kind: "result", title: "Punt returns, 2025 season", on: "2025-11-28", value: "1 TD · 14.8 avg", state: V },
      { kind: "personal_record", title: "Pro agility", on: "2026-03-01", value: "4.12", unit: "s", state: V },
    ],
    film: [
      { title: "Return highlights", url: "https://www.youtube.com/watch?v=ScMzIvxBSi4", season: "2025" },
      { title: "Receiving cut-ups", url: "https://vimeo.com/76979871", season: "2025" },
    ],
    coaches: [
      { name: "Chris Delgado", role: "Head Coach", org: "Allen High School", email: "cdelgado@example.org", phone: "(972) 555-0119" },
      { name: "Marcus Lee", role: "Special Teams Coordinator", org: "Allen High School", email: "mlee@example.org" },
    ],
  },
  {
    handle: "elijahbrooks",
    name: "Elijah Brooks",
    sport: "football",
    level: "high_school",
    grad: 2028,
    region: "GA",
    city: "Marietta, GA",
    school: "Marietta High School",
    positions: ["QB"],
    height: 190,
    weight: 88,
    gpa: 3.6,
    bio: "Sophomore starter. 2,300 yards, 24 touchdowns, 5 picks.",
    recruitable: false,
    visibility: "unlisted",
    entries: [
      { kind: "result", title: "Passing, 2025 season", on: "2025-11-21", value: "2,312 yds · 24 TD · 5 INT", state: V, pinned: true },
      { kind: "personal_record", title: "40-yard dash", on: "2026-04-18", value: "4.71", unit: "s" },
    ],
    film: [{ title: "Sophomore highlights", url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", season: "2025" }],
    coaches: [{ name: "Darnell Price", role: "Head Coach", org: "Marietta High School", email: "dprice@example.org" }],
  },
  {
    handle: "avareyes",
    name: "Ava Reyes",
    sport: "track_field",
    level: "high_school",
    grad: 2027,
    region: "MI",
    city: "Grand Rapids, MI",
    school: "East Kentwood High School",
    positions: ["400m", "4x400 anchor"],
    height: 170,
    weight: 59,
    gpa: 3.9,
    sat: 1340,
    bio: "400m / 4x400. Chasing 53 flat before outdoor states. Recruiting class of 2027 — open to conversations.",
    jersey: "7",
    recruitable: true,
    entries: [
      { kind: "personal_record", title: "400m personal best", on: "2026-05-30", value: "53.94", unit: "s", competition: "MHSAA D1 State Final", location: "Rockford, MI", placement: 2, field: 9, event: "400 Meters", state: V, pinned: true },
      { kind: "award", title: "All-State, first team", on: "2026-06-08", detail: "Selected by the Michigan Track Coaches Association following the D1 state final.", org: "MITCA", state: V, pinned: true },
      { kind: "record", title: "School record — 4x400 relay", on: "2026-05-16", value: "3:52.11", competition: "OK Red Conference Championship", org: "East Kentwood High School", state: V, pinned: true },
      { kind: "captaincy", title: "Named team captain", on: "2026-03-04", org: "East Kentwood High School", state: V },
      { kind: "result", title: "200m — Conference Championship", on: "2026-05-16", value: "25.31", unit: "s", competition: "OK Red Conference Championship", placement: 3, field: 24, state: V },
      { kind: "selection", title: "Brooks PR Invitational — invited", on: "2026-04-22", detail: "Invitation extended on the strength of the indoor 400m mark.", state: "submitted" },
      { kind: "personal_record", title: "Indoor 400m personal best", on: "2026-02-14", value: "55.20", unit: "s", competition: "MITS Championship", location: "Mount Pleasant, MI", state: V },
      { kind: "milestone", title: "First sub-56 400m", on: "2025-05-02", value: "55.87", unit: "s", competition: "Grand Rapids City Championship" },
    ],
    film: [
      { title: "2026 outdoor season — race highlights", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", season: "2026" },
      { title: "D1 State Final — 400m, lane 5", url: "https://www.hudl.com/video/3/def456", season: "2026" },
      { title: "Indoor 400m PB — MITS Championship", url: "https://vimeo.com/76979871", season: "2026 indoor" },
    ],
    coaches: [
      { name: "Marcus Kim", role: "Head Coach, Track & Field", org: "East Kentwood High School", email: "mkim@example.org", phone: "(616) 555-0142" },
      { name: "Dana Whitfield", role: "Sprints Coach", org: "Grand Rapids Flight TC", phone: "(616) 555-0177" },
    ],
  },
  {
    handle: "noahlindqvist",
    name: "Noah Lindqvist",
    sport: "track_field",
    level: "high_school",
    grad: 2026,
    region: "OR",
    city: "Eugene, OR",
    school: "Sheldon High School",
    positions: ["800m", "1600m"],
    height: 178,
    weight: 63,
    gpa: 4.0,
    act: 33,
    bio: "Middle distance. 1:52 / 4:08. Engineering-minded, looking at D1 and D3 alike.",
    recruitable: true,
    entries: [
      { kind: "personal_record", title: "800m", on: "2026-05-23", value: "1:52.40", competition: "OSAA 6A State", placement: 1, field: 12, state: V, pinned: true },
      { kind: "personal_record", title: "1600m", on: "2026-04-30", value: "4:08.91", competition: "Oregon Relays", placement: 3, field: 18, state: V, pinned: true },
      { kind: "award", title: "State champion, 800m", on: "2026-05-23", org: "OSAA", state: V },
      { kind: "result", title: "3200m", on: "2025-11-01", value: "9:21.05", competition: "Cross country invitational", detail: "Run on a road course." },
    ],
    film: [{ title: "State 800m final", url: "https://www.youtube.com/watch?v=9bZkp7q19f0", season: "2026" }],
    coaches: [{ name: "Ellen Ruiz", role: "Distance Coach", org: "Sheldon High School", email: "eruiz@example.org" }],
  },
  {
    handle: "priyanair",
    name: "Priya Nair",
    sport: "track_field",
    level: "club",
    grad: 2027,
    region: "NJ",
    city: "Edison, NJ",
    school: "J.P. Stevens High School",
    positions: ["100m hurdles", "long jump"],
    height: 168,
    weight: 57,
    gpa: 3.7,
    bio: "Hurdles and jumps. 14.1 and 18'6\". Club season with Garden State Elite.",
    recruitable: true,
    entries: [
      { kind: "personal_record", title: "100m hurdles", on: "2026-06-13", value: "14.12", unit: "s", competition: "NJSIAA Meet of Champions", placement: 4, field: 9, state: V, pinned: true },
      { kind: "personal_record", title: "Long jump", on: "2026-05-31", value: "18'6\"", competition: "Group 4 sectionals", placement: 1, field: 14, state: V },
      { kind: "result", title: "Triple jump", on: "2026-05-31", value: "38'2\"", placement: 5, field: 14 },
    ],
    film: [],
    coaches: [{ name: "Kevin Osei", role: "Jumps Coach", org: "Garden State Elite", email: "kosei@example.org" }],
  },
  {
    handle: "marcusbell",
    name: "Marcus Bell",
    sport: "basketball",
    level: "high_school",
    grad: 2027,
    region: "IL",
    city: "Chicago, IL",
    school: "Whitney M. Young Magnet High School",
    positions: ["PG"],
    height: 185,
    weight: 77,
    gpa: 3.4,
    bio: "Lead guard. 17.8 and 6.1 assists as a junior. Two-way, plays fast.",
    jersey: "3",
    recruitable: true,
    entries: [
      { kind: "result", title: "2025–26 season averages", on: "2026-03-06", value: "17.8 pts · 6.1 ast · 2.3 stl", competition: "Chicago Public League", state: V, pinned: true },
      { kind: "award", title: "All-City, first team", on: "2026-03-20", org: "Chicago Public League", state: V, pinned: true },
      { kind: "result", title: "Career high — 34 points", on: "2026-01-23", value: "34 pts", competition: "vs. Simeon", state: V },
      { kind: "personal_record", title: "Vertical jump", on: "2026-06-02", value: "35", unit: "in" },
      { kind: "selection", title: "Nike EYBL — 17U roster", on: "2026-04-15", org: "Mac Irvin Fire", state: V },
    ],
    film: [{ title: "Junior season mixtape", url: "https://www.youtube.com/watch?v=kJQP7kiw5Fk", season: "2025–26" }],
    coaches: [
      { name: "Tyrone Slaughter", role: "Head Coach", org: "Whitney Young", email: "tslaughter@example.org", phone: "(312) 555-0188" },
    ],
  },
  {
    handle: "leilawashington",
    name: "Leila Washington",
    sport: "basketball",
    level: "high_school",
    grad: 2026,
    region: "CA",
    city: "Oakland, CA",
    school: "Bishop O'Dowd High School",
    positions: ["SF", "PF"],
    height: 183,
    weight: 74,
    gpa: 3.8,
    sat: 1310,
    bio: "Wing. Rebounds, defends, 38% from three. Committed to nothing yet.",
    recruitable: true,
    entries: [
      { kind: "result", title: "2025–26 season averages", on: "2026-03-13", value: "15.2 pts · 9.4 reb · 38% 3PT", state: V, pinned: true },
      { kind: "award", title: "CIF NorCal Open Division — All-Tournament", on: "2026-03-14", org: "CIF", state: V },
      { kind: "result", title: "Double-doubles, 2025–26", on: "2026-03-13", value: "14", state: V },
      { kind: "captaincy", title: "Named team captain", on: "2025-11-01", org: "Bishop O'Dowd", state: V },
    ],
    film: [{ title: "Senior highlights", url: "https://www.youtube.com/watch?v=3JZ_D3ELwOQ", season: "2025–26" }],
    coaches: [{ name: "Malik Johnson", role: "Head Coach", org: "Bishop O'Dowd", email: "mjohnson@example.org" }],
  },
  {
    handle: "tomasherrera",
    name: "Tomás Herrera",
    sport: "basketball",
    level: "juco",
    grad: 2027,
    region: "AZ",
    city: "Mesa, AZ",
    school: "Mesa Community College",
    positions: ["C"],
    height: 208,
    weight: 104,
    gpa: 3.1,
    bio: "Rim protector. 3.1 blocks. Transfer-ready for 2027.",
    recruitable: true,
    entries: [
      { kind: "result", title: "2025–26 season averages", on: "2026-03-01", value: "11.4 pts · 9.8 reb · 3.1 blk", competition: "ACCAC", state: V, pinned: true },
      { kind: "award", title: "ACCAC Defensive Player of the Year", on: "2026-03-10", org: "ACCAC", state: V },
      { kind: "personal_record", title: "Standing reach", on: "2025-10-01", value: "9'2\"" },
    ],
    film: [],
    coaches: [{ name: "Sam Ballard", role: "Head Coach", org: "Mesa Community College", email: "sballard@example.org" }],
  },
  {
    handle: "ninakowalczyk",
    name: "Nina Kowalczyk",
    sport: "soccer",
    level: "club",
    grad: 2027,
    region: "NC",
    city: "Cary, NC",
    school: "Green Hope High School",
    positions: ["GK"],
    height: 175,
    weight: 66,
    gpa: 3.9,
    sat: 1400,
    bio: "Goalkeeper. ECNL with NCFC Youth. 0.71 GAA, 11 clean sheets.",
    jersey: "1",
    recruitable: true,
    entries: [
      { kind: "result", title: "ECNL 2025–26", on: "2026-05-17", value: "0.71 GAA · 11 clean sheets · 22 GP", org: "NCFC Youth", state: V, pinned: true },
      { kind: "selection", title: "ECNL National Selection Program — invited", on: "2026-04-03", org: "ECNL", state: V, pinned: true },
      { kind: "award", title: "Conference Goalkeeper of the Year", on: "2025-11-08", org: "SWAC 4A", state: V },
      { kind: "milestone", title: "First penalty save in a shootout", on: "2025-03-22", competition: "State Cup quarterfinal" },
    ],
    film: [
      { title: "Goalkeeper highlights", url: "https://www.youtube.com/watch?v=hY7m5jjJ9mM", season: "2025–26" },
      { title: "State Cup quarterfinal shootout", url: "https://vimeo.com/148751763", season: "2025" },
    ],
    coaches: [
      { name: "Gareth Owens", role: "Goalkeeper Coach", org: "NCFC Youth", email: "gowens@example.org", phone: "(919) 555-0164" },
      { name: "Hannah Cole", role: "Head Coach", org: "Green Hope High School", email: "hcole@example.org" },
    ],
  },
  {
    handle: "diegoalvarez",
    name: "Diego Álvarez",
    sport: "soccer",
    level: "high_school",
    grad: 2026,
    region: "CA",
    city: "Chula Vista, CA",
    school: "Eastlake High School",
    positions: ["CM", "CAM"],
    height: 173,
    weight: 68,
    gpa: 3.3,
    bio: "Central midfielder. 9 goals, 14 assists. Sees the pass before the run.",
    recruitable: true,
    entries: [
      { kind: "result", title: "2025–26 season", on: "2026-02-28", value: "9 G · 14 A · 24 GP", competition: "Metro-Mesa League", state: V, pinned: true },
      { kind: "award", title: "League MVP", on: "2026-03-05", org: "Metro-Mesa League", state: V },
      { kind: "result", title: "CIF San Diego Section — Open Division", on: "2026-02-28", value: "Semifinalist", state: V },
      { kind: "personal_record", title: "Yo-yo intermittent recovery test", on: "2026-01-10", value: "Level 20.4" },
    ],
    film: [{ title: "Midfield highlights", url: "https://www.youtube.com/watch?v=L_jWHffIx5E", season: "2025–26" }],
    coaches: [{ name: "Patrick Nolan", role: "Head Coach", org: "Eastlake High School", email: "pnolan@example.org" }],
  },
  {
    handle: "graceokoro",
    name: "Grace Okoro",
    sport: "soccer",
    level: "high_school",
    grad: 2028,
    region: "MN",
    city: "Edina, MN",
    school: "Edina High School",
    positions: ["ST"],
    height: 170,
    weight: 62,
    gpa: 3.7,
    bio: "Striker. 21 goals as a freshman. Building the record early.",
    visibility: "private",
    recruitable: false,
    entries: [
      { kind: "result", title: "2025 season", on: "2025-10-30", value: "21 G · 6 A", competition: "Lake Conference", state: V, pinned: true },
    ],
    film: [],
    coaches: [{ name: "Beth Carlson", role: "Head Coach", org: "Edina High School", email: "bcarlson@example.org" }],
  },
];

export const STAFF_ACCOUNTS = [
  {
    email: "coach@roster.local",
    handle: "coach_kim",
    name: "Marcus Kim",
    account_kind: "coach" as const,
  },
  {
    email: "recruiter@roster.local",
    handle: "scout_morgan",
    name: "Casey Morgan",
    account_kind: "recruiter" as const,
  },
];
