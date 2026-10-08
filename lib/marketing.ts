// Marketing module types and pure helpers. Nothing here publishes content: approval records a
// human decision, and a person posts the content themselves. The database enforces the same
// rules (migration 004); these helpers only drive what the screen offers.
export const channels = [
  "website",
  "blog",
  "google_business",
  "facebook",
  "instagram",
  "email",
  "other",
] as const;
export type Channel = (typeof channels)[number];
export const channelLabels: Record<Channel, string> = {
  website: "Website page",
  blog: "Blog post",
  google_business: "Google Business Profile",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "Email",
  other: "Other",
};
export type DraftStatus = "draft" | "approved" | "published" | "archived";
export type BrandProfile = {
  id: string;
  client_id: string | null;
  name: string;
  website: string | null;
  audience: string;
  voice: string;
  services: string;
  service_area: string;
  notes: string;
  created_at: string;
  updated_at: string;
};
export type MarketingAction = {
  id: string;
  brand_profile_id: string;
  title: string;
  reason: string;
  status: "open" | "done" | "dismissed";
  source: "starter" | "manual" | "search_console" | "analytics" | "ai";
  source_date: string | null;
  evidence: Record<string, unknown> | null;
  completed_at: string | null;
  created_at: string;
};
export type MarketingDraft = {
  id: string;
  brand_profile_id: string;
  title: string;
  body: string;
  channel: Channel;
  status: DraftStatus;
  ai_generated: boolean;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
  published_url: string | null;
  created_at: string;
  updated_at: string;
};

export const draftStatusLabels: Record<DraftStatus, string> = {
  draft: "Draft",
  approved: "Approved for manual publishing",
  published: "Published (recorded manually)",
  archived: "Archived",
};
/** The status changes the database allows, for the buttons the screen shows. */
export function draftTransitions(status: DraftStatus): {
  label: string;
  to: DraftStatus;
}[] {
  switch (status) {
    case "draft":
      return [
        { label: "Approve for manual publishing", to: "approved" },
        { label: "Archive", to: "archived" },
      ];
    case "approved":
      return [
        { label: "Return to draft", to: "draft" },
        { label: "I published this", to: "published" },
        { label: "Archive", to: "archived" },
      ];
    case "published":
      return [{ label: "Archive", to: "archived" }];
    case "archived":
      return [{ label: "Restore as draft", to: "draft" }];
  }
}

export const sourceLabels: Record<MarketingAction["source"], string> = {
  starter: "Starter task",
  manual: "Added by you",
  search_console: "Search Console",
  analytics: "Analytics",
  ai: "AI suggestion",
};

// ---------------------------------------------------------------------------
// Import of the earlier browser-only marketing workspace (a JSON backup)
// ---------------------------------------------------------------------------
export type LegacyImport = {
  profile: {
    name: string;
    website: string | null;
    audience: string;
    voice: string;
    services: string;
    service_area: string;
    notes: string;
  };
  actions: { title: string; reason: string; done: boolean }[];
  drafts: { title: string; body: string }[];
  warnings: string[];
};
const LIMITS = { name: 200, field: 5000, title: 200, reason: 2000, body: 50000, items: 200 };
function text(value: unknown, label: string, max: number, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new Error(label + " must be text");
  const v = value.trim();
  if (required && !v) throw new Error(label + " is required");
  if (v.length > max) throw new Error(label + " is longer than " + max + " characters");
  return v;
}
/**
 * Reads a backup exported by the earlier localStorage-only marketing page. Everything is
 * validated before anything is saved. Drafts always come in as plain drafts: approval is a
 * recorded human decision in the new system, so it has to be given again.
 */
export function parseLegacyWorkspace(raw: string): LegacyImport {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON");
  }
  if (!data || typeof data !== "object") throw new Error("Unrecognized backup format");
  const d = data as Record<string, unknown>;
  const brand = d.brand as Record<string, unknown> | undefined;
  if (!brand || typeof brand !== "object")
    throw new Error("Unrecognized backup: no brand profile found");
  if (!Array.isArray(d.priorities) || !Array.isArray(d.drafts))
    throw new Error("Unrecognized backup: priorities and drafts are missing");
  if (d.priorities.length > LIMITS.items || d.drafts.length > LIMITS.items)
    throw new Error("Backup has more than " + LIMITS.items + " items");
  const warnings: string[] = [];
  let website: string | null = text(brand.website, "Website", 500) || null;
  if (website && !/^https?:\/\//i.test(website)) {
    warnings.push("The website was not a full http(s) address and was left blank.");
    website = null;
  }
  const profile = {
    name: text(brand.name, "Brand name", LIMITS.name, true),
    website,
    audience: text(brand.audience, "Audience", LIMITS.field),
    voice: text(brand.voice, "Voice", LIMITS.field),
    services: text(brand.services, "Services", LIMITS.field),
    service_area: text(brand.service_area, "Service area", LIMITS.field),
    notes: text(brand.notes, "Notes", LIMITS.field),
  };
  const actions = d.priorities.map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return {
      title: text(o.title, "Priority " + (i + 1) + " title", LIMITS.title, true),
      reason: text(o.reason, "Priority " + (i + 1) + " reason", LIMITS.reason),
      done: o.done === true,
    };
  });
  let approvedCount = 0;
  const drafts = d.drafts.map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    if (typeof o.status === "string" && o.status !== "Draft") approvedCount += 1;
    return {
      title: text(o.title, "Draft " + (i + 1) + " title", LIMITS.title, true),
      body: text(o.body, "Draft " + (i + 1) + " content", LIMITS.body, true),
    };
  });
  if (approvedCount)
    warnings.push(
      approvedCount +
        " draft(s) were approved in the old workspace. They are imported as drafts; approve them again here so the decision is recorded.",
    );
  return { profile, actions, drafts, warnings };
}

/** A portable backup of one brand workspace. */
export function buildExport(
  profile: BrandProfile,
  actions: MarketingAction[],
  drafts: MarketingDraft[],
  now = new Date(),
) {
  return {
    format: "studioos-marketing-v2",
    exportedAt: now.toISOString(),
    profile,
    actions,
    drafts,
  };
}
