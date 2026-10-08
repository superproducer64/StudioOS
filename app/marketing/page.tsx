"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { useClients, useRows } from "@/lib/store";
import {
  buildExport,
  channelLabels,
  channels,
  draftStatusLabels,
  draftTransitions,
  parseLegacyWorkspace,
  sourceLabels,
  type BrandProfile,
  type Channel,
  type DraftStatus,
  type MarketingAction,
  type MarketingDraft,
} from "@/lib/marketing";

const dateTime = (v: string | null) => (v ? new Date(v).toLocaleString() : "");
const friendly = (m: string) =>
  m.includes("brand_profiles_owner_client")
    ? "That client already has a brand profile."
    : m;

function Profile({ p, onSaved }: { p: BrandProfile; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    name: p.name,
    website: p.website ?? "",
    audience: p.audience,
    voice: p.voice,
    services: p.services,
    service_area: p.service_area,
    notes: p.notes,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const r = await getSupabase()
        .from("brand_profiles")
        .update({ ...f, name: f.name.trim(), website: f.website.trim() || null })
        .eq("id", p.id);
      if (r.error) throw r.error;
      await onSaved();
      setMsg("Saved.");
    } catch (e) {
      setMsg(friendly((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  const area = (k: keyof typeof f, label: string) => (
    <label>
      {label}
      <textarea value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </label>
  );
  return (
    <section>
      <h2>Brand profile</h2>
      <div className="grid">
        <label>
          Brand name
          <input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label>
          Website (https://…)
          <input value={f.website} onChange={(e) => set("website", e.target.value)} />
        </label>
      </div>
      {area("audience", "Audience")}
      {area("voice", "Voice and tone")}
      {area("services", "Services")}
      {area("service_area", "Service area")}
      {area("notes", "Notes and rules (what never to claim)")}
      <button disabled={busy || !f.name.trim()} onClick={() => void save()}>
        Save profile
      </button>
      {msg && <span role="status">{msg}</span>}
    </section>
  );
}

function Actions({
  profile,
  actions,
  onChange,
}: {
  profile: BrandProfile;
  actions: MarketingAction[];
  onChange: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      if (r.error) throw new Error(r.error.message);
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sb = () => getSupabase();
  const setStatus = (id: string, status: string) =>
    run(() => sb().from("marketing_actions").update({ status }).eq("id", id));
  return (
    <section>
      <h2>Action plan</h2>
      <p>
        Starter tasks are generic planning steps. Anything sourced from Search
        Console or Analytics must carry its date and evidence; nothing here is
        invented performance data.
      </p>
      <button
        disabled={busy}
        onClick={() =>
          void run(() => sb().rpc("seed_marketing_starter_actions", { p_profile: profile.id }))
        }
      >
        Add starter tasks
      </button>
      {actions.map((a) => (
        <div key={a.id} className="row">
          <input
            type="checkbox"
            aria-label={"Done: " + a.title}
            disabled={busy || a.status === "dismissed"}
            checked={a.status === "done"}
            onChange={(e) => void setStatus(a.id, e.target.checked ? "done" : "open")}
          />
          <span style={a.status !== "open" ? { textDecoration: "line-through" } : undefined}>
            <strong>{a.title}</strong>{" "}
            <span className="badge">{sourceLabels[a.source]}</span>
            {a.source_date && <small> as of {a.source_date}</small>}
            {a.reason && (
              <>
                <br />
                <small>{a.reason}</small>
              </>
            )}
          </span>
          {a.status === "dismissed" ? (
            <button disabled={busy} onClick={() => void setStatus(a.id, "open")}>
              Restore
            </button>
          ) : (
            a.status === "open" && (
              <button disabled={busy} onClick={() => void setStatus(a.id, "dismissed")}>
                Dismiss
              </button>
            )
          )}
        </div>
      ))}
      {!actions.length && <p>No tasks yet.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            sb().from("marketing_actions").insert({
              brand_profile_id: profile.id,
              title: title.trim(),
              reason: reason.trim(),
              source: "manual",
            }),
          ).then(() => {
            setTitle("");
            setReason("");
          });
        }}
      >
        <label>
          New task
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Why it matters (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button disabled={busy || !title.trim()}>Add task</button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function DraftCard({ d, onChange }: { d: MarketingDraft; onChange: () => Promise<void> }) {
  const [title, setTitle] = useState(d.title);
  const [body, setBody] = useState(d.body);
  const [channel, setChannel] = useState<Channel>(d.channel);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = d.status === "published" || d.status === "archived";
  const dirty = title !== d.title || body !== d.body || channel !== d.channel;
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      if (r.error) throw new Error(r.error.message);
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const move = (to: DraftStatus) =>
    run(() =>
      getSupabase()
        .from("marketing_drafts")
        .update(to === "published" && url.trim() ? { status: to, published_url: url.trim() } : { status: to })
        .eq("id", d.id),
    );
  return (
    <div className="card">
      <p>
        <span className={d.status === "approved" ? "badge" : "badge warn"}>{draftStatusLabels[d.status]}</span>
        {d.ai_generated && <span className="badge warn">AI-generated: review carefully</span>}
        {d.approved_at && <small>Approved {dateTime(d.approved_at)}</small>}
        {d.published_at && <small> · Published {dateTime(d.published_at)}</small>}
      </p>
      <label>
        Title
        <input disabled={locked || busy} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Channel
        <select disabled={locked || busy} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
          {channels.map((c) => (
            <option key={c} value={c}>
              {channelLabels[c]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Content
        <textarea disabled={locked || busy} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {d.status === "approved" && (
        <p>
          <small>Editing approved content withdraws the approval, so a person reviews the final wording.</small>
        </p>
      )}
      {d.published_url && (
        <p>
          <a href={d.published_url} target="_blank" rel="noreferrer noopener">
            {d.published_url}
          </a>
        </p>
      )}
      {!locked && (
        <button
          disabled={busy || !dirty || !title.trim() || !body.trim()}
          onClick={() =>
            void run(() =>
              getSupabase()
                .from("marketing_drafts")
                .update({ title: title.trim(), body, channel })
                .eq("id", d.id),
            )
          }
        >
          Save changes
        </button>
      )}
      {d.status === "approved" && (
        <label>
          Link to the live post (optional)
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
      )}
      {draftTransitions(d.status).map((t) => (
        <button key={t.to} disabled={busy || dirty} onClick={() => void move(t.to)}>
          {t.label}
        </button>
      ))}
      {dirty && <small>Save your edits before changing the status.</small>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Drafts({
  profile,
  drafts,
  onChange,
}: {
  profile: BrandProfile;
  drafts: MarketingDraft[];
  onChange: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<Channel>("website");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await getSupabase()
        .from("marketing_drafts")
        .insert({ brand_profile_id: profile.id, title: title.trim(), body, channel });
      if (r.error) throw r.error;
      setTitle("");
      setBody("");
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = drafts.filter((d) => showArchived || d.status !== "archived");
  return (
    <section>
      <h2>Content drafts</h2>
      <p>
        StudioOS never posts anything. Approving records that you reviewed the
        wording; you then publish it yourself and mark it published.
      </p>
      <form onSubmit={add}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Channel
          <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {channels.map((c) => (
              <option key={c} value={c}>
                {channelLabels[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Content
          <textarea value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <button disabled={busy || !title.trim() || !body.trim()}>Save draft</button>
      </form>
      {error && <p className="error">{error}</p>}
      <label>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Show archived
      </label>
      {visible.map((d) => (
        <DraftCard key={d.id + d.updated_at} d={d} onChange={onChange} />
      ))}
      {!visible.length && <p>No drafts yet.</p>}
    </section>
  );
}

export default function Marketing() {
  const { user } = useAuth();
  const profiles = useRows<BrandProfile>("brand_profiles", "*", "name");
  const actions = useRows<MarketingAction>("marketing_actions");
  const drafts = useRows<MarketingDraft>("marketing_drafts");
  const clients = useClients();
  const [picked, setPicked] = useState("");
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const profile = profiles.rows.find((p) => p.id === picked) ?? profiles.rows[0];
  const all = () => Promise.all([profiles.refresh(), actions.refresh(), drafts.refresh()]).then(() => undefined);
  const myActions = actions.rows.filter((a) => a.brand_profile_id === profile?.id);
  const myDrafts = drafts.rows.filter((d) => d.brand_profile_id === profile?.id);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await getSupabase()
        .from("brand_profiles")
        .insert({ name: name.trim(), client_id: clientId || null })
        .select("id")
        .single();
      if (r.error) throw r.error;
      setName("");
      await profiles.refresh();
      setPicked(r.data.id);
    } catch (err) {
      setError(friendly((err as Error).message));
    } finally {
      setBusy(false);
    }
  }
  function exportJson() {
    if (!profile) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(buildExport(profile, myActions, myDrafts), null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "marketing-" + profile.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file?: File) {
    if (!file || !user) return;
    setBusy(true);
    setError("");
    setNotice("");
    let createdId = "";
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Backup is larger than 2 MB");
      const parsed = parseLegacyWorkspace(await file.text());
      const sb = getSupabase();
      const p = await sb.from("brand_profiles").insert(parsed.profile).select("id").single();
      if (p.error) throw p.error;
      createdId = p.data.id;
      if (parsed.actions.length) {
        const a = await sb.from("marketing_actions").insert(
          parsed.actions.map((x) => ({
            brand_profile_id: createdId,
            title: x.title,
            reason: x.reason,
            source: "manual",
            status: x.done ? "done" : "open",
          })),
        );
        if (a.error) throw a.error;
      }
      if (parsed.drafts.length) {
        const d = await sb.from("marketing_drafts").insert(
          parsed.drafts.map((x) => ({ brand_profile_id: createdId, title: x.title, body: x.body, channel: "other" })),
        );
        if (d.error) throw d.error;
      }
      await all();
      setPicked(createdId);
      setNotice(
        "Imported " + parsed.profile.name + ". " + parsed.warnings.join(" ") +
          (parsed.drafts.length ? " Channels were set to Other; adjust them as needed." : ""),
      );
    } catch (err) {
      if (createdId) await getSupabase().from("brand_profiles").delete().eq("id", createdId);
      setError("Nothing was imported. " + friendly((err as Error).message));
    } finally {
      setBusy(false);
    }
  }
  const errors = profiles.error || actions.error || drafts.error || clients.error || error;
  return (
    <>
      <h1>Marketing</h1>
      <p>
        Brand profiles, an action plan and a draft review queue per client.
        Drafts need your approval before they are marked ready, and nothing is
        posted automatically.
      </p>
      {errors && <p className="error">{errors}</p>}
      {notice && <p role="status">{notice}</p>}
      <section>
        {profiles.rows.length > 0 && (
          <label>
            Brand
            <select value={profile?.id ?? ""} onChange={(e) => setPicked(e.target.value)}>
              {profiles.rows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <form onSubmit={create}>
          <label>
            New brand profile
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Linked client (optional)
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">No client (your own brand)</option>
              {clients.rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy || !name.trim()}>Create profile</button>
        </form>
        <label>
          Import an earlier marketing backup (JSON)
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              void importBackup(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {profile && <button onClick={exportJson}>Export this brand as JSON</button>}
      </section>
      {profiles.ready && !profile && <section>Create a brand profile to begin.</section>}
      {profile && (
        <>
          <Profile key={profile.id} p={profile} onSaved={all} />
          <Actions profile={profile} actions={myActions} onChange={all} />
          <Drafts profile={profile} drafts={myDrafts} onChange={all} />
        </>
      )}
    </>
  );
}
