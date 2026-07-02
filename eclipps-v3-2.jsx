import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

// ═══════════════════════════════════════════════════════════════════════════════
// eCLIPPS v3 — Community Insights Engine
// ═══════════════════════════════════════════════════════════════════════════════
// DO NOT reference Anthropic, Claude, or any AI vendor in user-facing UI.
// All AI references use "eCLIPPS engine" only.
// App domain: app.eclipps.io | Marketing: eclipps.io
// Auth: Supabase Auth + `profiles` table (RLS-enforced). No hardcoded/seeded admin.
// Storage: localStorage still used for sessions/archives/tickets pending Supabase migration.
// Payments: Stripe webhooks provision/suspend accounts by tier
// ═══════════════════════════════════════════════════════════════════════════════

// ── Theme ─────────────────────────────────────────────────────────────────────
const T={
  bg:"#06090f",surface:"#0d1422",surface2:"#111827",
  border:"#1a2540",cyan:"#00ccff",violet:"#7c5cf5",
  amber:"#f5a623",green:"#12b978",red:"#f04040",
  orange:"#f07830",slate:"#5a6a88",text:"#dce4f0",
  muted:"#5a6a88",dim:"#1e2d48",gold:"#f5c842",
};

// ── Tier Configuration ────────────────────────────────────────────────────────
const TIERS = {
  free:     { id:"free",     label:"Free",           color:T.slate,  level:0 },
  core:     { id:"core",     label:"Core",           color:T.cyan,   level:1 },
  companion:{ id:"companion",label:"Companion",      color:T.violet, level:2 },
  analyst:  { id:"analyst",  label:"Analyst",        color:T.green,  level:3 },
  total:    { id:"total",    label:"Total eCLIPPS",  color:T.gold,   level:4 },
  admin:    { id:"admin",    label:"Admin",          color:T.red,    level:99 },
};

// ── Feature Permission Map ────────────────────────────────────────────────────
const PERMS = {
  signals_all:        ["core","companion","analyst","total","admin"],
  signals_3:          ["free"],
  full_report:        ["companion","analyst","total","admin"],
  recommendations:    ["companion","analyst","total","admin"],
  companions_tab:     ["companion","analyst","total","admin"],
  open_prompts:       ["companion","analyst","total","admin"],
  analyst_download:   ["analyst","total","admin"],
  stakeholder_dl:     ["analyst","total","admin"],
  longitudinal:       ["total","admin"],
  graphs_view:        ["total","admin"],
  graphs_run:         ["admin"],
  mirror_audience:    ["total","admin"],
  consulting_page:    ["total","admin"],
  admin_tab:          ["admin"],
  copy_protection:    ["free"],
};

const can = (user, feature) => {
  if (!user) return false;
  const allowed = PERMS[feature];
  if (!allowed) return true;
  return allowed.includes(user.tier);
};

const tierLevel = (tier) => TIERS[tier]?.level ?? 0;

// ── Tabs (all tiers see all tabs; permissions gate content) ───────────────────
const TABS = [
  { id:"home",      icon:"🏠", label:"Home"       },
  { id:"brief",     icon:"📋", label:"Brief"      },
  { id:"signals",   icon:"📡", label:"Signals"    },
  { id:"report",    icon:"📄", label:"Report"     },
  { id:"companions",icon:"🧭", label:"Companions" },
  { id:"graphs",    icon:"📊", label:"Graphs"     },
  { id:"archive",   icon:"🗂", label:"Archive"    },
  { id:"services",  icon:"🛍", label:"Services"   },
  { id:"guide",     icon:"📖", label:"User Guide" },
  { id:"settings",  icon:"⚙",  label:"Settings"   },
  { id:"admin",     icon:"🔐", label:"Admin",  adminOnly:true },
];

// ── Industries ────────────────────────────────────────────────────────────────
const INDUSTRIES = [
  { id:"",              label:"— Select Industry —" },
  { id:"nonprofit",     label:"Nonprofit / NGO" },
  { id:"education",     label:"Education" },
  { id:"health",        label:"Health & Healthcare" },
  { id:"creator",       label:"Content Creator / Social Media" },
  { id:"coach",         label:"Coach / Consultant" },
  { id:"grantwriter",   label:"Grant Writer / Fundraising" },
  { id:"smallbiz",      label:"Small Business" },
  { id:"corporation",   label:"Corporation / Enterprise" },
  { id:"faithbased",    label:"Faith-Based Organization" },
  { id:"government",    label:"Government / Public Sector" },
  { id:"academic",      label:"Academic / Research" },
  { id:"startup",       label:"Startup / Emerging Brand" },
  { id:"advocacy",      label:"Advocacy / Campaign Org" },
];

const HIPAA_INDUSTRIES = new Set(["health"]);

// ── Industry Prompt Packs ─────────────────────────────────────────────────────
const INDUSTRY_PROMPTS = {
  nonprofit: [
    "Based on this report, what community need could be most compellingly articulated for a grant application?",
    "What language from this community should appear in our program description?",
    "Which signals indicate the community is ready to engage with our mission?",
    "What trust barriers need to be addressed before our program will be adopted?",
    "What advocacy message would resonate most strongly based on these findings?",
    "How would you describe this community's relationship with organizations like ours?",
  ],
  education: [
    "What learning challenges or frustrations are most prominent in this data?",
    "Which signals suggest readiness for a new educational format or approach?",
    "What language do learners use that we should reflect in our curriculum?",
    "What barriers to engagement or completion appear in these signals?",
    "How does this community define success in learning contexts?",
    "What topics or questions are generating the most curiosity in this data?",
  ],
  health: [
    "What health concerns or fears are most prominent in this community data?",
    "Which signals suggest readiness to engage with health information or programs?",
    "What language does this community use around health that we should mirror?",
    "What trust signals or skepticism appear around healthcare providers or treatments?",
    "What barriers to care or behavior change appear in these signals?",
    "What format of health information does this community appear most receptive to?",
  ],
  creator: [
    "What content topics are generating the highest engagement signals in this data?",
    "What language does my audience use that I should incorporate into my content?",
    "What pain points could I address in an upcoming series or campaign?",
    "Which signals indicate what format my audience prefers (video, written, live)?",
    "What objections or resistance signals appear around paid offers or products?",
    "What does this audience say when they are ready to buy or commit?",
  ],
  coach: [
    "What transformation does this audience believe they need most urgently?",
    "What language should I use to describe my offer so it resonates with this community?",
    "What objections to coaching or consulting appear most frequently in this data?",
    "Which signals suggest readiness to invest in a solution?",
    "What does this community try before reaching out to a professional?",
    "What results or outcomes matter most to this audience?",
  ],
  grantwriter: [
    "What community need signals are strongest for inclusion in a grant narrative?",
    "What language from this data best describes the target population for funders?",
    "Which signals demonstrate urgency or gap in current services?",
    "What outcomes would resonate most with funders based on what this community values?",
    "How would you frame the problem statement using signals from this report?",
    "What evidence of community voice exists in this data that funders want to see?",
  ],
};

const GENERIC_COMPANION_PROMPTS = [
  "Do people actually want this offer? What signals support your answer?",
  "What problem is this community really trying to solve beneath the surface?",
  "What specific language should we use to describe our offer to this audience?",
  "What format is this community most ready for — webinar, course, checklist, live session, ebook, or something else?",
  "What objections or trust issues need to be addressed before this audience will commit?",
  "What is the single strongest next move based on what people are already saying?",
];

const LONGITUDINAL_PROMPTS = [
  "What themes have grown strongest across these reports over time?",
  "Where has sentiment shifted most significantly between reporting periods?",
  "What signals have disappeared and what new ones have emerged?",
  "How has the community's trust level changed across these periods?",
  "What opportunities are becoming more urgent based on the trend direction?",
  "What risks have escalated or diminished over time?",
];

// ── Other Constants ───────────────────────────────────────────────────────────
const FOLDER_COLORS=["#00ccff","#7c5cf5","#f5a623","#12b978","#f07830","#5a6a88","#e879f9","#34d399"];
const SIG_COLOR={pain:T.red,curiosity:T.cyan,aspiration:T.green,frustration:T.orange,"validation-seeking":T.violet,"humor-deflection":T.slate};
const SEV_COLOR={high:T.red,critical:T.red,medium:T.amber,moderate:T.amber,low:T.orange,minor:T.orange};
const PHASES=[{id:"e",full:"Excavate",desc:"Surfacing raw patterns from the noise..."},{id:"C",full:"Conversational Language",desc:"Reading how people actually talk..."},{id:"L",full:"Logic Processing",desc:"Applying social intelligence frameworks..."},{id:"I",full:"Interpretation",desc:"Reading cultural and contextual layers..."},{id:"P1",full:"Problem Spotting",desc:"Mapping explicit and implicit pain..."},{id:"P2",full:"Prioritization",desc:"Ranking by signal strength and frequency..."}];
const TIMING_MODES=[{id:"most-recent",label:"Most Recent Activity",wording:"Signals reflect the most recent activity collected."},{id:"date-range",label:"Specific Date Range",wording:"Signals reflect comments posted within the analyst-specified date range."},{id:"evergreen",label:"Thread Lifetime / Evergreen",wording:"Signals reflect the full visible thread history, not a single time period."},{id:"revived",label:"Revived Older Thread",wording:"Original post is older; signal activity is based on recent revived engagement."},{id:"analytics",label:"Analytics Snapshot",wording:"Signals combine conversation text with platform analytics."},{id:"mixed",label:"Unknown / Mixed Dates",wording:"Timing should be treated as directional because comment dates were incomplete."}];
const PASTE_TIERS=[{max:5000,label:"Small",color:T.green,msg:null},{max:15000,label:"Medium",color:T.cyan,msg:"Manageable batch — analysis will work well at this size."},{max:25000,label:"Large",color:T.amber,msg:"Consider splitting by thread, topic, date range, or platform."},{max:Infinity,label:"Too Large",color:T.red,msg:"This source may be too large for clean analysis. Consider splitting it first."}];
const ORG_TYPES=[{id:"nonprofit",label:"Nonprofit / NGO"},{id:"creator",label:"Content Creator"},{id:"smallbiz",label:"Small Business"},{id:"healthcare",label:"Healthcare Organization"},{id:"corporation",label:"Corporation / Enterprise"},{id:"faithbased",label:"Faith-Based Organization"},{id:"government",label:"Government / Public Sector"},{id:"academic",label:"Academic / Research"},{id:"startup",label:"Startup / Emerging Brand"},{id:"advocacy",label:"Advocacy / Campaign Org"}];
const TONE_NOTES={nonprofit:"Use mission-driven, empathetic, equity-centered language. Frame findings in terms of community outcomes and program impact.",creator:"Use casual, direct, conversational language. Say 'your audience' not 'the community'. Think like a content strategist.",smallbiz:"Be practical and plain-spoken. Frame findings in terms of customers and revenue. Action-first.",healthcare:"Be careful, precise, and evidence-sensitive. Avoid overstatement.",corporation:"Be formal and data-forward. Frame in terms of stakeholder impact and ROI.",faithbased:"Use values-centered, community-first language.",government:"Use neutral, evidence-based, policy-oriented framing.",academic:"Be thorough and nuanced. Acknowledge uncertainty where it exists.",startup:"Be energetic and opportunity-focused. Frame in terms of market fit and growth.",advocacy:"Be movement-oriented. Frame in terms of mobilization and narrative power."};
const REPORT_SECTIONS=[{id:"summary",label:"Executive Summary",internal:false},{id:"fingerprint",label:"Community Profile",internal:false},{id:"signals",label:"Signal Map",internal:false},{id:"sentiment",label:"Sentiment Layers",internal:false},{id:"problems",label:"Problem Spots",internal:false},{id:"readiness",label:"Readiness & Action",internal:false},{id:"risks",label:"Risk Signals",internal:false},{id:"opps",label:"Opportunity Map",internal:false},{id:"lexicon",label:"Lexicon Insights",internal:false},{id:"resources",label:"Supporting Resources",internal:false},{id:"analyst",label:"Analyst Notes",internal:true},{id:"brief",label:"Client Brief",internal:false},{id:"sources",label:"Excavation Sources",internal:true}];

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#06090f;color:#dce4f0;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
@keyframes blink{0%,80%,100%{opacity:.2;transform:scale(.8);}40%{opacity:1;transform:scale(1);}}
@keyframes phaseSlide{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
@keyframes modalIn{from{opacity:0;transform:scale(.96);}to{opacity:1;transform:scale(1);}}
.fade-up{animation:fadeUp .35s ease-out both;}
.phase-label{animation:phaseSlide .4s ease-out both;}
.modal-in{animation:modalIn .2s ease-out both;}
textarea,input,select{font-family:'Inter',sans-serif;}
::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#1e2d48;border-radius:2px;}
.no-select{user-select:none;-webkit-user-select:none;}
`;

// ── Utilities ─────────────────────────────────────────────────────────────────
const genId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const todayISO=()=>new Date().toISOString().split("T")[0];
const todayLong=()=>new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
const wcCount=(t)=>t.trim()?t.trim().split(/\s+/).length:0;
const pasteTier=(n)=>PASTE_TIERS.find(t=>n<t.max)||PASTE_TIERS[3];
const fileExt=(n)=>({txt:"📄",csv:"📊",json:"📋",pdf:"📕",md:"📝"}[n.split(".").pop().toLowerCase()]||"📁");
const mcColor=(v)=>v==="hot"?T.green:v==="warm"?T.amber:T.red;
const rtfEsc=(s="")=>String(s).replace(/\\/g,"\\\\").replace(/\{/g,"\\{").replace(/\}/g,"\\}");

// ── Storage Layer ─────────────────────────────────────────────────────────────
// NOTE: In production, replace these localStorage calls with
// fetch() calls to your Vercel KV API endpoints.
const sGet = (key, fb = null) => {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fb;
  } catch { return fb; }
};
const sSet = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch { return false; }
};
const sDel = (key) => { try { localStorage.removeItem(key); } catch {} };

// ── Auth ─────────────────────────────────────────────────────────────────────
// Real auth now lives in Supabase Auth + the `profiles` table (see supabaseClient.js).
// There is no seeded admin account and no client-side password storage of any kind.
// A user's role/tier is read from their `profiles` row, and only an existing admin
// (via direct DB access or the future Admin panel) can change role/tier — enforced
// by Postgres RLS + trigger, not by frontend code.

// Fetch the profile row for a Supabase auth user and shape it into the
// user object the rest of this app expects (id, username, email, tier, role, status).
const fetchProfile = async (authUser) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", authUser.id)
    .single();
  if (error || !data) return null;
  return {
    id: data.user_id,
    username: data.display_name || (data.email || "").split("@")[0],
    email: data.email,
    tier: data.tier_key,
    role: data.role,
    status: data.status,
    createdAt: (data.created_at || "").split("T")[0],
  };
};

// ── Session / Archive Storage ─────────────────────────────────────────────────
const getUserKey = (userId, key) => `eclipps_u_${userId}_${key}`;

const persistSession = (sess, userId) => {
  if (!userId) return;
  sSet(getUserKey(userId, `sess_${sess.id}`), sess);
  const list = sGet(getUserKey(userId, "sessions"), []);
  const summary = {
    id: sess.id, folderId: sess.folderId,
    name: sess.brief.reportName || "Untitled",
    clientName: sess.brief.clientName, clientOrg: sess.brief.clientOrg,
    created: sess.created, updated: todayISO(), hasReport: !!sess.report,
    hasGraphs: !!(sess.graphs && sess.graphs.length > 0),
  };
  const idx = list.findIndex(x => x.id === sess.id);
  if (idx >= 0) list[idx] = summary; else list.unshift(summary);
  sSet(getUserKey(userId, "sessions"), list);
};

const loadSessions = (userId) => sGet(getUserKey(userId, "sessions"), []);
const loadSession = (userId, sessId) => sGet(getUserKey(userId, `sess_${sessId}`), null);
const loadFolders = (userId) => sGet(getUserKey(userId, "folders"), []);
const saveFolders = (userId, folders) => sSet(getUserKey(userId, "folders"), folders);

// Tickets (support queue)
const getTickets = () => sGet("eclipps_tickets", []);
const addTicket = (ticket) => {
  const tickets = getTickets();
  tickets.unshift({ ...ticket, id: genId(), createdAt: todayISO(), status: "open" });
  sSet("eclipps_tickets", tickets);
};
const updateTicket = (id, updates) => {
  const tickets = getTickets();
  const idx = tickets.findIndex(t => t.id === id);
  if (idx >= 0) { tickets[idx] = { ...tickets[idx], ...updates }; sSet("eclipps_tickets", tickets); }
};

// Consulting documents
const getConsultDocs = (userId) => sGet(getUserKey(userId, "consult_docs"), []);
const addConsultDoc = (userId, doc) => {
  const docs = getConsultDocs(userId);
  docs.unshift({ ...doc, id: genId(), uploadedAt: todayISO() });
  sSet(getUserKey(userId, "consult_docs"), docs);
  return docs;
};

// ── Source Library Storage ────────────────────────────────────────────────────
// Per-user library of reusable source files, independent of any session.
const getSourceLibrary = (userId) => sGet(getUserKey(userId, "source_library"), []);
const saveSourceLibrary = (userId, items) => sSet(getUserKey(userId, "source_library"), items);
const addToSourceLibrary = (userId, item) => {
  const lib = getSourceLibrary(userId);
  // Avoid duplicates by label+wordCount fingerprint
  const exists = lib.some(x => x.label === item.label && x.wordCount === item.wordCount);
  if (exists) return lib;
  const newItem = { ...item, id: genId(), savedAt: todayISO() };
  const updated = [newItem, ...lib];
  saveSourceLibrary(userId, updated);
  return updated;
};
const removeFromSourceLibrary = (userId, itemId) => {
  const updated = getSourceLibrary(userId).filter(x => x.id !== itemId);
  saveSourceLibrary(userId, updated);
  return updated;
};

// ── Session Factory ───────────────────────────────────────────────────────────
const newSession = (folderId = "", carryBrief = null) => ({
  id: genId(), folderId, created: todayISO(),
  brief: {
    clientName:"", clientOrg:"", industry:"", programName:"",
    missionGoals:"", listeningObjective:"", useDefaultObj:false,
    audience:"", community:"", communityType:"online",
    reportName:"", dataDateRange:"", excavationDate:"",
    timingMode:"most-recent", orgTypes:[], specificQuestions:"",
    knownContext:"", excavationSites:"", useMirrorAudience:false,
    mirrorSource:"", mirrorPlatform:"",
    ...(carryBrief || {}),
  },
  sourceItems:[], report:null, companions:[], graphs:[], qaItems:[],
});

// ── Default Closing ───────────────────────────────────────────────────────────
const DEFAULT_CLOSING = `This report was generated using eCLIPPS, a community insights engine designed to surface organic signals from real community conversations.\n\nAll personally identifiable information linked to usernames or individual accounts has been removed or generalized. This analysis is based on publicly available or client-provided community data and is intended solely for the recipient's internal use.\n\nIf you would like to review this report with your analyst, we offer 1:1 consultation sessions, presentation design services, business strategy support, program development, and speaking engagements.\n\nThis report was prepared for your organization's use only and may not be redistributed without consent.`;

// ── RTF Generator ─────────────────────────────────────────────────────────────
function generateRTF(sess, opts, downloadType = "internal") {
  const { brief: b, sourceItems: si, report: r = {}, qaItems = [], graphs = [] } = sess;
  const ag = opts.analystGlobal || {};
  const client = [b.clientName, b.clientOrg].filter(Boolean).join(" — ");
  const analyst = [ag.preparedBy, ag.title, ag.organization].filter(Boolean).join(", ");
  const rname = b.reportName || "eCLIPPS Signals Report";
  const timing = TIMING_MODES.find(m => m.id === b.timingMode);
  const isClient = downloadType === "stakeholder";
  const isCIB = downloadType === "analyst" || downloadType === "internal";
  const inSec = (id) => !isClient || (opts.sections || REPORT_SECTIONS.map(s => s.id)).includes(id);
  const line = (txt, sz = 22) => `\\pard\\f1\\fs${sz} ${rtfEsc(txt)}\\par\n`;
  const bold = (txt, sz = 22) => `\\pard\\f1\\fs${sz}\\b ${rtfEsc(txt)}\\b0\\par\n`;
  const bullets = (arr = []) => arr.map(i => `\\pard\\f1\\fs22   \\bullet  ${rtfEsc(i)}\\par\n`).join("");

  let s = `{\\rtf1\\ansi\\ansicpg1252\\deff0\n{\\fonttbl{\\f0\\froman Times New Roman;}{\\f1\\fswiss Arial;}{\\f2\\fmodern Courier New;}}\n{\\colortbl ;\\red0\\green170\\blue204;\\red80\\green80\\blue80;}\n`;

  // Cover
  s += `\\pard\\qc\\f1\\fs14\\cf2 COMMUNITY INTELLIGENCE ENGINE\\cf0\\par\n\\par\n`;
  s += `\\pard\\qc\\f1\\fs72\\b eCLIPPS\\b0\\par\n\\par\n`;
  if (downloadType === "internal") s += `\\pard\\qc\\f1\\fs20\\cf2 INTERNAL USE ONLY\\cf0\\par\n`;
  else if (downloadType === "analyst") s += `\\pard\\qc\\f1\\fs20\\cf2 COMMUNITY INTELLIGENCE BRIEF — ANALYST COPY\\cf0\\par\n`;
  else s += `\\pard\\qc\\f1\\fs20 Prepared for External Distribution\\par\n`;
  s += `\\pard\\qc\\f1\\fs36\\b ${rtfEsc(rname)}\\b0\\par\n`;
  s += `\\pard\\qc\\f1\\fs28 eCLIPPS Signals Report\\par\n`;
  if (client) s += `\\pard\\qc\\f1\\fs24 Analysis Prepared for: ${rtfEsc(client)}\\par\n`;
  s += `\\par\\par\n`;
  if (analyst) s += `\\pard\\qc\\f1\\fs22 Prepared by: ${rtfEsc(analyst)}\\par\n`;
  s += `\\pard\\qc\\f1\\fs22 Report Date: ${todayLong()}\\par\n`;
  if (b.dataDateRange) s += `\\pard\\qc\\f1\\fs22 Data Period: ${rtfEsc(b.dataDateRange)}\\par\n`;
  if (b.excavationDate) s += `\\pard\\qc\\f1\\fs22 Excavation Date: ${rtfEsc(b.excavationDate)}\\par\n`;
  if (timing) s += `\\pard\\qc\\f1\\fs22 Timing Mode: ${rtfEsc(timing.label)}\\par\n`;
  s += `\\page\n`;

  // Brief
  if (inSec("brief")) {
    s += bold("Engagement Brief", 36) + `\\par\n`;
    if (b.clientName) s += line(`Client: ${b.clientName}`);
    if (b.clientOrg) s += line(`Organization: ${b.clientOrg}`);
    if (b.industry) s += line(`Industry: ${b.industry}`);
    if (b.programName) s += line(`Program: ${b.programName}`);
    if (b.missionGoals) s += bold("Mission / Goals") + line(b.missionGoals);
    if (b.listeningObjective) s += bold("Listening Objectives") + line(b.listeningObjective);
    if (b.audience) s += bold("Audience") + line(b.audience);
    if (b.community) s += bold("Community") + line(b.community);
    if (b.specificQuestions) s += bold("Specific Questions") + line(b.specificQuestions);
    if (inSec("sources") && (si.length || b.excavationSites)) {
      s += bold("Excavation Sources");
      if (b.excavationSites) s += line(`Sites: ${b.excavationSites}`);
      si.forEach((src, i) => { s += line(`${i + 1}. ${src.label || "Unnamed"} (${(src.wordCount || 0).toLocaleString()} words)`); });
    }
    if (b.useMirrorAudience && b.mirrorSource) {
      s += bold("Mirror Audience") + line(`Source: ${b.mirrorSource}`) + line(`Platform: ${b.mirrorPlatform || "—"}`);
    }
    s += `\\page\n`;
  }

  // Report content
  s += bold(rname, 36);
  if (client) s += `\\pard\\f1\\fs22\\i Prepared for: ${rtfEsc(client)}\\i0\\par\n`;
  s += `\\par\n`;
  const fp = r.community_fingerprint || {}, sl = r.sentiment_layers || {}, ps = r.problems || {}, rd = r.readiness || {}, ao = r.action_orientation || {};
  if (inSec("summary") && r.summary) {
    s += bold("Executive Summary", 28) + line(r.summary);
    s += line(`Awareness Stage: ${fp.awareness_stage || "—"} | Momentum: ${rd.community_momentum || "—"} | Trust: ${sl.trust_level || "—"}`);
    if (r.noise_note) s += line(`Signal Quality: ${r.noise_note}`);
    s += `\\par\n`;
  }
  if (inSec("fingerprint")) {
    s += bold("Community Profile", 28);
    if (fp.who_they_are) s += line(`Who They Are: ${fp.who_they_are}`);
    if (fp.dominant_mood) s += line(`Dominant Mood: ${fp.dominant_mood}`);
    if (fp.awareness_stage) s += line(`Awareness Stage: ${fp.awareness_stage}`);
    if (fp.sophistication) s += line(`Sophistication: ${fp.sophistication}`);
    s += `\\par\n`;
  }
  if (inSec("signals") && r.signal_map?.length) {
    s += bold("Signal Map", 28);
    r.signal_map.forEach(sig => {
      s += `\\pard\\f1\\fs22\\b ${rtfEsc(sig.signal)}\\b0  [${rtfEsc(sig.signal_type)}] Frequency: ${rtfEsc(sig.frequency)} | P2 Score: ${sig.prioritization_score}/10\\par\n`;
      if (sig.what_it_reveals) s += `\\pard\\f1\\fs20\\cf2 ${rtfEsc(sig.what_it_reveals)}\\cf0\\par\n`;
    });
    s += `\\par\n`;
  }
  if (inSec("sentiment")) {
    s += bold("Sentiment Layers", 28);
    if (sl.surface) s += line(`Surface: ${sl.surface}`);
    if (sl.underlying) s += line(`Underlying: ${sl.underlying}`);
    if (sl.trust_level) s += line(`Trust Level: ${sl.trust_level}`);
    if (sl.emotional_drivers?.length) s += bold("Emotional Drivers") + bullets(sl.emotional_drivers);
    s += `\\par\n`;
  }
  if (inSec("problems")) {
    s += bold("Problem Spots", 28);
    if (ps.explicit?.length) s += bold("Explicit") + bullets(ps.explicit);
    if (ps.implicit?.length) s += bold("Implicit") + bullets(ps.implicit);
    if (ps.fears?.length) s += bold("Unspoken Fears") + bullets(ps.fears);
    s += `\\par\n`;
  }
  if (inSec("readiness")) {
    s += bold("Readiness & Action", 28);
    if (rd.community_momentum) s += line(`Community Momentum (P2): ${rd.community_momentum}`);
    if (rd.ready_for?.length) s += bold("Ready For") + bullets(rd.ready_for);
    if (rd.not_ready_for?.length) s += bold("Not Ready For") + bullets(rd.not_ready_for);
    if (ao.community_engagement?.length) s += bold("Community Engagement Recommendations") + bullets(ao.community_engagement);
    if (ao.preferred_format) s += line(`Preferred Format: ${ao.preferred_format}`);
    s += `\\par\n`;
  }
  if (inSec("risks") && r.risk_signals?.length) {
    s += bold("Risk Signals", 28);
    r.risk_signals.forEach(rs => { s += `\\pard\\f1\\fs22\\b ${rtfEsc(rs.risk)}\\b0  [${rtfEsc(rs.severity)}]\\par\n\\pard\\f1\\fs20\\cf2 ${rtfEsc(rs.what_it_means)}\\cf0\\par\n`; });
    s += `\\par\n`;
  }
  if (inSec("opps")) {
    const opp = r.opportunity_map || {};
    s += bold("Opportunity Map", 28);
    ["content","program","product","advocacy","partnership","resource"].filter(k => opp[k]?.length).forEach(k => { s += bold(k.charAt(0).toUpperCase() + k.slice(1)) + bullets(opp[k]); });
    s += `\\par\n`;
  }
  if (inSec("lexicon") && r.lexicon?.length) {
    s += bold("Lexicon Insights", 28);
    r.lexicon.forEach(x => { s += `\\pard\\f2\\fs22 "${rtfEsc(x.phrase)}"\\f1\\par\n\\pard\\f1\\fs20\\cf2 ${rtfEsc(x.signals)}\\cf0\\par\n`; });
    s += `\\par\n`;
  }
  if (inSec("resources") && r.supporting_resources?.length) {
    s += bold("Supporting Resources", 28);
    r.supporting_resources.forEach(res => { s += bold(res.title) + line(`${res.source} — ${res.url}`); if (res.relevance) s += `\\pard\\f1\\fs20\\cf2 ${rtfEsc(res.relevance)}\\cf0\\par\n`; });
    s += `\\par\n`;
  }
  if (inSec("analyst") && ag.analystNotes) {
    s += `\\page\n` + bold("Analyst Notes", 28) + line(ag.analystNotes) + `\\par\n`;
  }

  // Companions Q&A appendix
  if (qaItems && qaItems.length > 0) {
    s += `\\page\n` + bold("Companion Intelligence — Q&A Appendix", 28) + `\\par\n`;
    qaItems.forEach((qa, i) => {
      s += bold(`Q${i + 1}: ${qa.question}`, 22) + line(qa.answer || "—") + `\\par\n`;
    });
  }

  // Closing
  s += `\\page\n` + bold("A Note from Your Analyst", 28);
  const closing = ag.closingStatement || DEFAULT_CLOSING;
  closing.split("\n\n").forEach(para => { if (para.trim()) s += line(para); });
  if (ag.contactInfo) { s += `\\par\n` + bold("Contact") + line(ag.contactInfo); }
  s += `}`;
  return s;
}

function dlRTF(sess, opts, filename, downloadType = "internal") {
  const content = generateRTF(sess, opts, downloadType);
  const blob = new Blob([content], { type: "application/rtf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Micro Components ──────────────────────────────────────────────────────────
const Tag=({children,color})=>(
  <span style={{display:"inline-block",fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:500,padding:"2px 8px",borderRadius:4,background:color+"1a",color,border:`1px solid ${color}40`,textTransform:"uppercase",letterSpacing:".05em"}}>{children}</span>
);
const Card=({children,style={},delay=0})=>(
  <div className="fade-up" style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:22,marginBottom:14,animationDelay:`${delay}s`,...style}}>{children}</div>
);
const SecHead=({children,color=T.cyan})=>(
  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
    <div style={{width:3,height:18,background:color,borderRadius:2}}/>
    <span style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:13,fontWeight:600,letterSpacing:".07em",textTransform:"uppercase",color:T.muted}}>{children}</span>
  </div>
);
const Bar=({value=5,color=T.cyan})=>(
  <div style={{background:T.dim,borderRadius:4,height:6,overflow:"hidden"}}>
    <div style={{width:`${(value/10)*100}%`,height:"100%",background:`linear-gradient(90deg,${color}88,${color})`,borderRadius:4}}/>
  </div>
);
const Dot=({filled,color})=>(
  <div style={{width:9,height:9,borderRadius:"50%",background:filled?color:T.dim,border:`1.5px solid ${filled?color:T.border}`,flexShrink:0}}/>
);
const Divider=()=><div style={{borderTop:`1px solid ${T.border}`,margin:"14px 0"}}/>;
const FInput=({label,value,onChange,placeholder=""})=>(
  <div style={{marginBottom:14}}>
    <label style={{display:"block",fontSize:11,color:T.muted,letterSpacing:".05em",textTransform:"uppercase",marginBottom:5}}>{label}</label>
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:7,padding:"9px 12px",color:T.text,fontSize:13,outline:"none"}}/>
  </div>
);
const FTextarea=({label,value,onChange,placeholder="",rows=3,note})=>(
  <div style={{marginBottom:14}}>
    <label style={{display:"block",fontSize:11,color:T.muted,letterSpacing:".05em",textTransform:"uppercase",marginBottom:5}}>{label}</label>
    <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:7,padding:"9px 12px",color:T.text,fontSize:13,outline:"none",resize:"vertical",lineHeight:1.6}}/>
    {note&&<div style={{fontSize:11,color:T.muted,marginTop:4}}>{note}</div>}
  </div>
);
const FSelect=({label,value,onChange,options=[]})=>(
  <div style={{marginBottom:14}}>
    <label style={{display:"block",fontSize:11,color:T.muted,letterSpacing:".05em",textTransform:"uppercase",marginBottom:5}}>{label}</label>
    <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:T.bg,border:`1px solid ${T.border}`,borderRadius:7,padding:"9px 12px",color:T.text,fontSize:13,outline:"none"}}>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select>
  </div>
);
const Btn=({children,onClick,color=T.cyan,disabled=false,style={}})=>(
  <button onClick={onClick} disabled={disabled} style={{background:disabled?T.dim:`linear-gradient(135deg,${color}cc,${color})`,border:"none",borderRadius:9,padding:"9px 20px",color:disabled?T.muted:"#fff",cursor:disabled?"not-allowed":"pointer",fontSize:13,fontWeight:600,fontFamily:"'Space Grotesk',sans-serif",opacity:disabled?.6:1,transition:"all .2s",...style}}>{children}</button>
);
const GhostBtn=({children,onClick,style={}})=>(
  <button onClick={onClick} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 16px",color:T.muted,cursor:"pointer",fontSize:13,fontFamily:"'Inter',sans-serif",...style}}>{children}</button>
);

// Tier badge
const TierBadge=({tier})=>{
  const t=TIERS[tier]||TIERS.free;
  return <span style={{display:"inline-block",padding:"2px 10px",borderRadius:100,fontSize:11,fontWeight:600,background:t.color+"20",color:t.color,border:`1px solid ${t.color}40`,letterSpacing:".04em"}}>{t.label}</span>;
};

// ── Upgrade Modal ─────────────────────────────────────────────────────────────
function UpgradeModal({ feature, requiredTier, onClose }) {
  const tier = TIERS[requiredTier] || TIERS.core;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div className="modal-in" style={{background:T.surface,border:`1px solid ${tier.color}40`,borderRadius:16,padding:36,maxWidth:440,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:16}}>🔒</div>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:22,fontWeight:700,color:T.text,marginBottom:8}}>Feature Locked</div>
        <p style={{fontSize:14,color:T.muted,lineHeight:1.7,marginBottom:20}}>
          <strong style={{color:tier.color}}>{feature}</strong> is available on the <strong style={{color:tier.color}}>{tier.label}</strong> plan.
        </p>
        <div style={{background:tier.color+"10",border:`1px solid ${tier.color}30`,borderRadius:10,padding:"12px 16px",marginBottom:24,fontSize:13,color:T.muted,lineHeight:1.6}}>
          Upgrade your subscription at <span style={{color:tier.color}}>eclipps.io/pricing</span> to unlock this feature.
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <GhostBtn onClick={onClose}>Maybe Later</GhostBtn>
          <Btn onClick={()=>window.open("https://eclipps.io/pricing","_blank")} color={tier.color}>View Plans →</Btn>
        </div>
      </div>
    </div>
  );
}

// HIPAA Disclaimer Modal
function HIPAAModal({ onConfirm, onCancel }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div className="modal-in" style={{background:T.surface,border:`1px solid ${T.amber}40`,borderRadius:16,padding:32,maxWidth:500,width:"100%"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <span style={{fontSize:24}}>⚠️</span>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:18,fontWeight:700,color:T.amber}}>Health Industry Notice</div>
        </div>
        <div style={{background:T.amber+"10",border:`1px solid ${T.amber}30`,borderRadius:10,padding:"14px 16px",marginBottom:20,fontSize:13,color:T.text,lineHeight:1.75}}>
          <strong>eCLIPPS is not HIPAA-certified software.</strong> This engine is designed to analyze community and audience data. It automatically excludes names from pasted text content. However, uploaded spreadsheets (.csv, .xlsx) may contain personal identifiers if included in the file structure. Please ensure any data you submit complies with your organization's privacy obligations before proceeding.
        </div>
        <p style={{fontSize:12,color:T.muted,marginBottom:20,lineHeight:1.6}}>By continuing, you confirm that you have reviewed the data you are submitting and accept responsibility for ensuring it meets your organization's privacy and compliance requirements.</p>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <GhostBtn onClick={onCancel}>Go Back</GhostBtn>
          <Btn onClick={onConfirm} color={T.amber}>I Understand, Continue</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | register
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setErr(""); setInfo(""); setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setErr(error.message === "Invalid login credentials" ? "Invalid email or password." : error.message);
      setLoading(false);
      return;
    }
    const profile = await fetchProfile(data.user);
    if (!profile) {
      setErr("Signed in, but no profile record was found. Contact support.");
      setLoading(false);
      return;
    }
    if (profile.status === "suspended") {
      setErr("Your subscription is inactive. Please update your payment method at eclipps.io/billing to restore access.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    onLogin(profile);
    setLoading(false);
  };

  const handleRegister = async () => {
    setErr(""); setInfo("");
    if (!email.trim() || !password.trim()) { setErr("Email and password are required."); return; }
    if (password !== confirm) { setErr("Passwords do not match."); return; }
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: displayName.trim() || email.split("@")[0] } },
    });
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }
    // If email confirmation is required, there's no session yet.
    if (!data.session) {
      setInfo("Account created. Check your email to confirm your address, then sign in.");
      setMode("login");
      setLoading(false);
      return;
    }
    const profile = await fetchProfile(data.user);
    if (profile) onLogin(profile);
    setLoading(false);
  };

  const inp = (val, set, ph, type = "text") => (
    <input value={val} onChange={e => set(e.target.value)} placeholder={ph} type={type}
      onKeyDown={e => { if (e.key === "Enter") mode === "login" ? handleLogin() : handleRegister(); }}
      style={{ width: "100%", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "11px 14px", color: T.text, fontSize: 14, outline: "none", marginBottom: 12 }} />
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',sans-serif" }}>
      <style>{CSS}</style>
      <div className="modal-in" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: 44, maxWidth: 420, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 48, fontWeight: 700, letterSpacing: "-2px", marginBottom: 6 }}>
            <span style={{ color: T.cyan }}>e</span><span style={{ color: T.text }}>CLIPPS</span>
          </div>
          <div style={{ fontSize: 12, color: T.muted, letterSpacing: "3px", textTransform: "uppercase" }}>Community Insights Engine</div>
        </div>

        <div style={{ display: "flex", background: T.bg, borderRadius: 10, padding: 4, marginBottom: 24 }}>
          {[["login","Sign In"],["register","Create Free Account"]].map(([m, l]) => (
            <button key={m} onClick={() => { setMode(m); setErr(""); }}
              style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: mode === m ? T.surface : "none", color: mode === m ? T.text : T.muted, fontSize: 13, cursor: "pointer", fontWeight: mode === m ? 600 : 400, transition: "all .2s" }}>{l}</button>
          ))}
        </div>

        {mode === "login" ? (
          <>
            {inp(email, setEmail, "Email address", "email")}
            {inp(password, setPassword, "Password", "password")}
          </>
        ) : (
          <>
            {inp(displayName, setDisplayName, "Your name (optional)")}
            {inp(email, setEmail, "Email address", "email")}
            {inp(password, setPassword, "Password (min 6 chars)", "password")}
            {inp(confirm, setConfirm, "Confirm password", "password")}
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 12, lineHeight: 1.6 }}>
              Free accounts include 3 signals preview. Upgrade at <span style={{ color: T.cyan }}>eclipps.io/pricing</span> for full access.
            </div>
          </>
        )}

        {info && <div style={{ background: T.cyan + "15", border: `1px solid ${T.cyan}40`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: T.cyan, marginBottom: 12 }}>{info}</div>}
        {err && <div style={{ background: T.red + "15", border: `1px solid ${T.red}40`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: T.red, marginBottom: 12 }}>⚠ {err}</div>}

        <Btn onClick={mode === "login" ? handleLogin : handleRegister} disabled={loading} color={T.cyan} style={{ width: "100%", padding: "13px", fontSize: 15 }}>
          {loading ? "Please wait…" : mode === "login" ? "Sign In →" : "Create Account →"}
        </Btn>

        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: T.muted }}>
            Don't have an account? <span onClick={() => setMode("register")} style={{ color: T.cyan, cursor: "pointer" }}>Create one free</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Report Section Views (from v2, kept intact) ───────────────────────────────
function SummaryView({r}){
  const mc=mcColor(r.readiness?.community_momentum),trust=r.sentiment_layers?.trust_level,stage=r.community_fingerprint?.awareness_stage;
  return (
    <div>
      <SecHead color={T.cyan}>Executive Summary</SecHead>
      <Card><p style={{fontSize:15,lineHeight:1.8,color:T.text}}>{r.summary||"—"}</p></Card>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:14}}>
        {[{label:"Awareness Stage",val:stage,color:T.violet},{label:"Community Momentum",val:r.readiness?.community_momentum,color:mc},{label:"Trust Level",val:trust,color:T.amber}].map(s=>(
          <Card key={s.label} style={{textAlign:"center",padding:16}}>
            <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>{s.label}</div>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:700,color:s.color,textTransform:"capitalize"}}>{s.val||"—"}</div>
          </Card>
        ))}
      </div>
      {r.noise_note&&<Card style={{borderColor:T.slate+"60"}}><div style={{fontSize:10,color:T.slate,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>📡 Signal Quality</div><p style={{fontSize:13,color:T.muted,lineHeight:1.65}}>{r.noise_note}</p></Card>}
    </div>
  );
}
function FingerprintView({r}){
  const fp=r.community_fingerprint||{};
  return (
    <div>
      <SecHead color={T.violet}>Community Profile</SecHead>
      <Card>
        <div style={{marginBottom:16}}><div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Who They Are</div><p style={{fontSize:15,color:T.text,lineHeight:1.65}}>{fp.who_they_are||"—"}</p></div>
        <Divider/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          {[{label:"Dominant Mood",val:fp.dominant_mood,color:T.amber},{label:"Awareness Stage",val:fp.awareness_stage,color:T.violet},{label:"Sophistication",val:fp.sophistication,color:T.cyan},{label:"Data Appears",val:fp.data_appears,color:T.slate}].map(s=>(
            <div key={s.label}><div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>{s.label}</div><div style={{fontSize:14,color:s.color,fontWeight:500,textTransform:"capitalize",lineHeight:1.4}}>{s.val||"—"}</div></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
function SignalsView({r}){
  return (
    <div>
      <SecHead color={T.cyan}>Signal Map</SecHead>
      {(r.signal_map||[]).length===0&&<Card><p style={{color:T.muted}}>No signals detected.</p></Card>}
      {(r.signal_map||[]).map((s,i)=>{
        const color=SIG_COLOR[s.signal_type]||T.cyan,fill=s.frequency==="high"?3:s.frequency==="medium"?2:1;
        return (
          <Card key={i} delay={i*.05}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div><div style={{fontSize:16,fontWeight:600,color:T.text,marginBottom:6}}>{s.signal}</div><Tag color={color}>{s.signal_type||"signal"}</Tag></div>
              <div style={{textAlign:"right"}}><div style={{fontSize:10,color:T.muted,textTransform:"uppercase",marginBottom:5}}>Frequency</div><div style={{display:"flex",gap:4,justifyContent:"flex-end"}}>{[1,2,3].map(n=><Dot key={n} filled={n<=fill} color={color}/>)}</div></div>
            </div>
            <div style={{marginBottom:10}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".05em"}}>P2 Prioritization Score</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color}}>{s.prioritization_score}/10</span></div><Bar value={s.prioritization_score} color={color}/></div>
            {s.what_it_reveals&&<p style={{fontSize:13,color:T.muted,lineHeight:1.65,borderLeft:`2px solid ${color}40`,paddingLeft:10}}>{s.what_it_reveals}</p>}
          </Card>
        );
      })}
    </div>
  );
}
function SentimentView({r}){
  const sl=r.sentiment_layers||{},drivers=sl.emotional_drivers||[],trust=sl.trust_level;
  const tc=trust==="high"?T.green:trust==="medium"?T.amber:T.red,tb=trust==="high"?3:trust==="medium"?2:1;
  return (
    <div>
      <SecHead color={T.amber}>Sentiment Layers</SecHead>
      <Card>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:18}}>
          {[{label:"What they appear to feel",val:sl.surface,color:T.muted},{label:"What underlies it",val:sl.underlying,color:T.amber}].map(s=>(
            <div key={s.label}><div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:5}}>{s.label}</div><div style={{fontSize:15,color:s.color,fontWeight:500,lineHeight:1.5}}>{s.val||"—"}</div></div>
          ))}
        </div>
        <Divider/>
        <div><div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8}}>Trust Level</div><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{display:"flex",gap:5}}>{[1,2,3].map(n=><div key={n} style={{width:36,height:8,borderRadius:4,background:n<=tb?tc:T.dim}}/>)}</div><span style={{fontSize:13,color:tc,fontWeight:500,textTransform:"capitalize"}}>{trust||"—"}</span></div></div>
      </Card>
      {drivers.length>0&&<Card><div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:12}}>Emotional Drivers</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{drivers.map((d,i)=><span key={i} style={{background:T.amber+"18",border:`1px solid ${T.amber}40`,color:T.amber,borderRadius:8,padding:"5px 12px",fontSize:13}}>{d}</span>)}</div></Card>}
    </div>
  );
}
function ProblemsView({r}){
  const ps=r.problems||{};
  return (
    <div>
      <SecHead color={T.red}>Problem Spots</SecHead>
      {[{label:"Explicit Problems",icon:"📍",items:ps.explicit,color:T.red},{label:"Implicit Problems",icon:"🔎",items:ps.implicit,color:T.orange},{label:"Unspoken Fears",icon:"👁",items:ps.fears,color:T.violet}].filter(g=>g.items?.length>0).map(group=>(
        <Card key={group.label}>
          <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:12}}>{group.icon} {group.label}</div>
          {group.items.map((item,i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:i<group.items.length-1?`1px solid ${T.border}`:"none"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:group.color,marginTop:5,flexShrink:0}}/>
              <span style={{fontSize:14,color:T.text,lineHeight:1.55}}>{item}</span>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
function ReadinessView({r,brief}){
  const rd=r.readiness||{},ao=r.action_orientation||{},opp=r.opportunity_map||{};
  const mc=mcColor(rd.community_momentum);
  const objectives=(brief?.listeningObjective||"").split("\n").filter(Boolean);
  return (
    <div>
      <SecHead color={T.green}>Readiness & Action</SecHead>
      {objectives.length>0&&(
        <Card>
          <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>Listening Objectives</div>
          {objectives.map((obj,i)=>(
            <div key={i} style={{display:"flex",gap:10,padding:"6px 0",borderBottom:i<objectives.length-1?`1px solid ${T.border}`:"none",alignItems:"flex-start"}}>
              <span style={{color:T.cyan,fontWeight:700,flexShrink:0,fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{i+1}.</span>
              <span style={{fontSize:14,color:T.text,lineHeight:1.55}}>{obj}</span>
            </div>
          ))}
        </Card>
      )}
      <Card style={{textAlign:"center",padding:24}}>
        <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>P2 — Community Momentum</div>
        <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:34,fontWeight:700,color:mc,textTransform:"capitalize"}}>{rd.community_momentum||"—"}</div>
      </Card>
      {rd.not_ready_for?.length>0&&(
        <Card style={{borderColor:T.red+"30"}}>
          <div style={{fontSize:10,color:T.red,textTransform:"uppercase",letterSpacing:".05em",marginBottom:12}}>✗ Not Ready For</div>
          {rd.not_ready_for.map((item,i)=>(
            <div key={i} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:i<rd.not_ready_for.length-1?`1px solid ${T.border}`:"none",alignItems:"flex-start"}}>
              <span style={{color:T.red,fontSize:13,marginTop:1,flexShrink:0}}>✗</span>
              <span style={{fontSize:14,color:T.text,lineHeight:1.55}}>{item}</span>
            </div>
          ))}
        </Card>
      )}
      {rd.ready_for?.length>0&&(
        <Card style={{borderColor:T.green+"30"}}>
          <div style={{fontSize:10,color:T.green,textTransform:"uppercase",letterSpacing:".05em",marginBottom:12}}>✓ Ready For</div>
          {rd.ready_for.map((item,i)=>(
            <div key={i} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:i<rd.ready_for.length-1?`1px solid ${T.border}`:"none",alignItems:"flex-start"}}>
              <span style={{color:T.green,fontSize:13,marginTop:1,flexShrink:0}}>✓</span>
              <span style={{fontSize:14,color:T.text,lineHeight:1.55}}>{item}</span>
            </div>
          ))}
        </Card>
      )}
      {ao.community_engagement?.length>0&&(
        <Card>
          <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:12}}>Community Engagement Recommendations</div>
          {ao.community_engagement.map((item,i)=>(
            <div key={i} style={{display:"flex",gap:10,padding:"6px 0",borderBottom:i<ao.community_engagement.length-1?`1px solid ${T.border}`:"none",alignItems:"flex-start"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:T.green,marginTop:5,flexShrink:0}}/>
              <span style={{fontSize:14,color:T.text,lineHeight:1.55}}>{item}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
function RiskView({r}){
  return (
    <div>
      <SecHead color={T.orange}>Risk Signals</SecHead>
      {(r.risk_signals||[]).length===0&&<Card><p style={{color:T.muted}}>No risk signals identified.</p></Card>}
      {(r.risk_signals||[]).map((rs,i)=>{
        const sc=SEV_COLOR[rs.severity]||T.amber;
        return (
          <Card key={i} delay={i*.05} style={{borderColor:sc+"30"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{fontSize:15,fontWeight:600,color:T.text,flex:1,paddingRight:10}}>{rs.risk}</div>
              <Tag color={sc}>{rs.severity}</Tag>
            </div>
            {rs.what_it_means&&<p style={{fontSize:13,color:T.muted,lineHeight:1.65,borderLeft:`2px solid ${sc}40`,paddingLeft:10}}>{rs.what_it_means}</p>}
          </Card>
        );
      })}
    </div>
  );
}
function OppView({r}){
  const opp=r.opportunity_map||{};
  const cats=[{key:"content",label:"Content",color:T.cyan,icon:"✍"},{key:"program",label:"Program",color:T.violet,icon:"🏛"},{key:"product",label:"Product",color:T.amber,icon:"📦"},{key:"advocacy",label:"Advocacy",color:T.green,icon:"📣"},{key:"partnership",label:"Partnership",color:T.orange,icon:"🤝"},{key:"resource",label:"Resource",color:T.slate,icon:"📚"}];
  return (
    <div>
      <SecHead color={T.green}>Opportunity Map</SecHead>
      {cats.filter(c=>opp[c.key]?.length>0).map((cat,i)=>(
        <Card key={cat.key} delay={i*.05}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:16}}>{cat.icon}</span><Tag color={cat.color}>{cat.label}</Tag></div>
          {(opp[cat.key]||[]).map((item,j)=>(
            <div key={j} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0",borderBottom:j<opp[cat.key].length-1?`1px solid ${T.border}`:"none"}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:cat.color,marginTop:5,flexShrink:0}}/>
              <span style={{fontSize:14,color:T.text,lineHeight:1.55}}>{item}</span>
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}
function LexiconView({r}){
  return (
    <div>
      <SecHead color={T.cyan}>Lexicon Insights</SecHead>
      {(r.lexicon||[]).length===0&&<Card><p style={{color:T.muted,fontSize:14}}>No lexical patterns identified.</p></Card>}
      {(r.lexicon||[]).map((item,i)=>(
        <Card key={i} delay={i*.05}>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:14,color:T.cyan,background:T.cyan+"12",border:`1px solid ${T.cyan}28`,borderRadius:5,padding:"4px 12px",display:"inline-block",marginBottom:10}}>"{item.phrase}"</div>
          <p style={{fontSize:14,color:T.muted,lineHeight:1.65}}>{item.signals}</p>
        </Card>
      ))}
    </div>
  );
}
function ResourcesView({r}){
  const res=r.supporting_resources||[];
  return (
    <div>
      <SecHead color={T.slate}>Supporting Resources</SecHead>
      {res.length===0&&<Card><p style={{color:T.muted,fontSize:14}}>No supporting resources found.</p></Card>}
      {res.map((item,i)=>(
        <Card key={i} delay={i*.05}>
          <div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:4}}>{item.title}</div>
          <div style={{fontSize:12,color:T.slate,marginBottom:8}}>{item.source}</div>
          {item.relevance&&<p style={{fontSize:13,color:T.muted,lineHeight:1.65,marginBottom:8}}>{item.relevance}</p>}
          {item.url&&<a href={item.url} target="_blank" rel="noreferrer" style={{fontSize:12,color:T.cyan,textDecoration:"none"}}>🔗 {item.url}</a>}
        </Card>
      ))}
    </div>
  );
}

// ── Educational Signals (Home) ─────────────────────────────────────────────────
const EDU=[{icon:"🗺",title:"Signal Map",color:T.cyan,desc:"Each signal is labeled, typed, frequency-ranked, and scored P2 1–10."},{icon:"🌡",title:"Sentiment Layers",color:T.amber,desc:"Surface emotion vs. what drives it underneath, plus Trust Level and Emotional Drivers."},{icon:"📊",title:"Community Profile",color:T.violet,desc:"Awareness stage, sophistication, dominant mood, and whether data appears organic or prompted."},{icon:"📍",title:"Problem Spots",color:T.red,desc:"Explicit pain, implicit pain, and unspoken fears the community never says out loud."},{icon:"✅",title:"Readiness & Action",color:T.green,desc:"Momentum score, ready/not-ready signals, and a full Action Orientation split."},{icon:"⚠",title:"Risk Signals",color:T.orange,desc:"Resistance, trust breakdown, adoption barriers — rated by severity."},{icon:"🗝",title:"Opportunity Map",color:T.green,desc:"Content, Program, Product, Advocacy, Partnership, Resource — translated from signals."},{icon:"💬",title:"Lexicon Insights",color:T.cyan,desc:"The specific words and phrases this community uses, and what each reveals."}];

// ── Home Tab ──────────────────────────────────────────────────────────────────
function HomeTab({ onGetStarted, user }) {
  const tier = TIERS[user?.tier] || TIERS.free;
  return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px", textAlign: "center" }}>
      <div style={{ fontSize: 12, letterSpacing: "4px", color: T.muted, textTransform: "uppercase", marginBottom: 20 }}>Community Insights Engine</div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 64, fontWeight: 700, lineHeight: 1, marginBottom: 16, letterSpacing: "-2px" }}>
        <span style={{ color: T.cyan }}>e</span><span style={{ color: T.text }}>CLIPPS</span>
      </div>
      <div style={{ width: 60, height: 3, background: `linear-gradient(90deg,${T.cyan},${T.violet})`, borderRadius: 2, margin: "0 auto 20px" }} />
      <div style={{ marginBottom: 24 }}><TierBadge tier={user?.tier || "free"} /></div>
      <p style={{ fontSize: 18, color: T.text, maxWidth: 520, lineHeight: 1.7, marginBottom: 16 }}>What if the most honest market research wasn't a survey — it was already happening in plain sight?</p>
      <p style={{ fontSize: 15, color: T.muted, maxWidth: 480, lineHeight: 1.75, marginBottom: 40 }}>eCLIPPS excavates raw community conversations and transforms them into strategic intelligence — surfacing what people actually mean, not just what they say.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginBottom: 48 }}>
        {["🔍 Organic signal detection", "📊 P2 Prioritization scoring", "⚠ Risk identification", "🗝 Opportunity mapping", tier.level >= 3 ? "📥 Downloadable reports" : "🔒 Downloads from Analyst tier"].map(f => (
          <span key={f} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: "6px 14px", fontSize: 13, color: T.muted }}>{f}</span>
        ))}
      </div>
      <Btn onClick={onGetStarted} color={T.cyan} style={{ fontSize: 16, padding: "14px 40px" }}>Get Started →</Btn>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 48, maxWidth: 700, width: "100%" }}>
        {EDU.map(e => (
          <div key={e.title} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 12px", textAlign: "left" }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{e.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: e.color, marginBottom: 4 }}>{e.title}</div>
            <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{e.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── WorkspaceNavBar ───────────────────────────────────────────────────────────
function WorkspaceNavBar({ tab, setTab, visibleTabs }) {
  const tabs = visibleTabs || TABS;
  const idx = tabs.findIndex(t => t.id === tab);
  const prev = idx > 0 ? tabs[idx - 1] : null;
  const next = idx < tabs.length - 1 ? tabs[idx + 1] : null;
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, padding: "13px 36px", display: "flex", justifyContent: "space-between", alignItems: "center", background: T.surface, flexShrink: 0 }}>
      <button onClick={() => prev && setTab(prev.id)} disabled={!prev}
        style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 18px", background: !prev ? "none" : T.surface2, border: `1px solid ${!prev ? "transparent" : T.border}`, borderRadius: 9, color: !prev ? T.dim : T.muted, cursor: !prev ? "default" : "pointer", fontSize: 13, fontFamily: "'Inter',sans-serif", fontWeight: 500 }}>
        ← {prev ? prev.label : "Back"}
      </button>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        {tabs.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} title={t.label}
            style={{ width: tab === t.id ? 22 : 7, height: 7, borderRadius: 4, background: tab === t.id ? T.cyan : T.dim, cursor: "pointer", transition: "all .3s" }} />
        ))}
      </div>
      <button onClick={() => next && setTab(next.id)} disabled={!next}
        style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 18px", background: !next ? T.dim : `linear-gradient(135deg,${T.violet},${T.cyan})`, border: "none", borderRadius: 9, color: !next ? T.muted : "#fff", cursor: !next ? "default" : "pointer", fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}>
        {next ? next.label : "Done"}{next ? " →" : ""}
      </button>
    </div>
  );
}

// ── New Analysis Modal ────────────────────────────────────────────────────────
function NewAnalysisModal({ folders, currentSession, onConfirm, onCancel }) {
  const [mode, setMode] = useState(null);
  const [folderId, setFolderId] = useState(currentSession?.folderId || "");
  const folderOptions = [{ id: "", label: "— No Folder —" }, ...folders.map(f => ({ id: f.id, label: f.name }))];
  const handleContinue = () => {
    if (!mode) return;
    if (mode === "keep") {
      const b = currentSession.brief;
      const carry = { clientName: b.clientName, clientOrg: b.clientOrg, industry: b.industry, programName: b.programName, missionGoals: b.missionGoals, listeningObjective: b.listeningObjective, useDefaultObj: b.useDefaultObj, orgTypes: b.orgTypes, audience: b.audience, community: b.community, communityType: b.communityType, specificQuestions: b.specificQuestions, knownContext: b.knownContext };
      onConfirm(newSession(folderId, carry));
    } else { onConfirm(newSession(folderId)); }
  };
  const optStyle = (active, color) => ({ padding: "18px 16px", background: active ? color + "18" : T.bg, border: `2px solid ${active ? color : T.border}`, borderRadius: 12, textAlign: "left", cursor: "pointer", transition: "all .2s", width: "100%", fontFamily: "'Inter',sans-serif" });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 32, maxWidth: 540, width: "100%" }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 6 }}>＋ New Analysis</div>
        <p style={{ fontSize: 13, color: T.muted, marginBottom: 24, lineHeight: 1.65 }}>A session is currently active. How would you like to begin the next one?</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <button onClick={() => setMode("keep")} style={optStyle(mode === "keep", T.violet)}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${mode === "keep" ? T.violet : T.border}`, background: mode === "keep" ? T.violet : "none", flexShrink: 0 }} />
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, color: mode === "keep" ? T.violet : T.text }}>Keep Current Profile</div>
            </div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.65, paddingLeft: 22 }}>Carries client info, objectives, and org type. Clears sources and report.</div>
          </button>
          <button onClick={() => setMode("fresh")} style={optStyle(mode === "fresh", T.cyan)}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${mode === "fresh" ? T.cyan : T.border}`, background: mode === "fresh" ? T.cyan : "none", flexShrink: 0 }} />
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600, color: mode === "fresh" ? T.cyan : T.text }}>Start Fresh</div>
            </div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.65, paddingLeft: 22 }}>Clears everything and starts a completely blank analysis.</div>
          </button>
        </div>
        <FSelect label="Assign to Folder" value={folderId} onChange={setFolderId} options={folderOptions} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <GhostBtn onClick={onCancel}>Cancel</GhostBtn>
          <Btn onClick={handleContinue} disabled={!mode} color={T.violet}>Continue →</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Brief Tab ─────────────────────────────────────────────────────────────────
function BriefTab({ session, onUpdate, folders, onRun, user }) {
  const b = session.brief;
  const fileRef = useRef();
  const [dragOver, setDragOver] = useState(false);
  const [pasteInput, setPasteInput] = useState("");
  const [pasteLabel, setPasteLabel] = useState("");
  const [showHIPAA, setShowHIPAA] = useState(false);
  const [hipaaConfirmed, setHipaaConfirmed] = useState(false);
  const [upgrade, setUpgrade] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryItems, setLibraryItems] = useState([]);

  // Load source library on mount
  useEffect(() => {
    setLibraryItems(getSourceLibrary(user.id));
  }, [user.id]);

  const refreshLibrary = () => setLibraryItems(getSourceLibrary(user.id));

  const upd = (k, v) => onUpdate(prev => ({ ...prev, brief: { ...prev.brief, [k]: v } }));

  const handleIndustryChange = (val) => {
    if (HIPAA_INDUSTRIES.has(val) && !hipaaConfirmed) {
      setShowHIPAA(true);
      upd("industry", val);
    } else {
      upd("industry", val);
    }
  };

  const handleMirrorToggle = () => {
    if (!can(user, "mirror_audience")) { setUpgrade({ feature: "Mirror Audience", requiredTier: "total" }); return; }
    upd("useMirrorAudience", !b.useMirrorAudience);
  };

  const addPaste = () => {
    if (!pasteInput.trim() || !pasteLabel.trim()) return;
    const item = { id: genId(), type: "paste", label: pasteLabel, content: pasteInput, wordCount: wcCount(pasteInput) };
    onUpdate(prev => ({ ...prev, sourceItems: [...prev.sourceItems, item] }));
    setPasteInput(""); setPasteLabel("");
  };

  const addFiles = async (files) => {
    for (const file of files) {
      const text = await file.text();
      const item = { id: genId(), type: "file", filename: file.name, label: file.name, content: text, wordCount: wcCount(text) };
      onUpdate(prev => ({ ...prev, sourceItems: [...prev.sourceItems, item] }));
    }
  };

  const removeSource = (id) => onUpdate(prev => ({ ...prev, sourceItems: prev.sourceItems.filter(s => s.id !== id) }));
  const updateLabel = (id, label) => onUpdate(prev => ({ ...prev, sourceItems: prev.sourceItems.map(s => s.id === id ? { ...s, label } : s) }));
  const timingWording = TIMING_MODES.find(m => m.id === b.timingMode)?.wording;
  const folderOptions = [{ id: "", label: "— No Folder —" }, ...folders.map(f => ({ id: f.id, label: f.name }))];

  return (
    <div style={{ maxWidth: 680 }}>
      {upgrade && <UpgradeModal feature={upgrade.feature} requiredTier={upgrade.requiredTier} onClose={() => setUpgrade(null)} />}
      {showHIPAA && (
        <HIPAAModal
          onConfirm={() => { setHipaaConfirmed(true); setShowHIPAA(false); }}
          onCancel={() => { upd("industry", ""); setShowHIPAA(false); }}
        />
      )}
      <Card>
        <SecHead color={T.violet}>Engagement Brief</SecHead>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <FInput label="Client Name" value={b.clientName} onChange={v => upd("clientName", v)} placeholder="Full name or pseudonym" />
          <FInput label="Client Organization" value={b.clientOrg} onChange={v => upd("clientOrg", v)} placeholder="Organization or project name" />
        </div>
        <FInput label="Report Name" value={b.reportName} onChange={v => upd("reportName", v)} placeholder="e.g. Q3 Community Pulse Report" />
        <FSelect label="Industry" value={b.industry} onChange={handleIndustryChange} options={INDUSTRIES} />
        {HIPAA_INDUSTRIES.has(b.industry) && hipaaConfirmed && (
          <div style={{ fontSize: 11, color: T.amber, background: T.amber + "10", border: `1px solid ${T.amber}30`, borderRadius: 6, padding: "7px 10px", marginBottom: 14 }}>
            ⚠ Health industry selected — HIPAA notice acknowledged
          </div>
        )}
        <FInput label="Program / Initiative Name" value={b.programName} onChange={v => upd("programName", v)} placeholder="e.g. Community Mentorship Initiative" />
        <FSelect label="Assign to Folder" value={b.folderId || ""} onChange={v => onUpdate(prev => ({ ...prev, folderId: v }))} options={folderOptions} />
      </Card>

      <Card>
        <SecHead color={T.cyan}>Organization & Audience</SecHead>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, color: T.muted, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8 }}>Organization Type</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ORG_TYPES.map(ot => {
              const sel = b.orgTypes.includes(ot.id);
              return (
                <button key={ot.id} onClick={() => { const arr = sel ? b.orgTypes.filter(x => x !== ot.id) : [...b.orgTypes, ot.id]; upd("orgTypes", arr); }}
                  style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${sel ? T.violet : T.border}`, background: sel ? T.violet + "18" : T.bg, color: sel ? T.violet : T.muted, fontSize: 12, cursor: "pointer", transition: "all .2s" }}>
                  {ot.label}
                </button>
              );
            })}
          </div>
        </div>
        <FTextarea label="Target Audience Description" value={b.audience} onChange={v => upd("audience", v)} placeholder="Who are you trying to reach or understand?" rows={2} />
        <FInput label="Community or Group Name" value={b.community} onChange={v => upd("community", v)} placeholder="e.g. First-Gen College Students Facebook Group" />
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, color: T.muted, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8 }}>Community Type</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[["online", "Online"], ["inperson", "In-Person"], ["hybrid", "Hybrid"]].map(([v, l]) => (
              <button key={v} onClick={() => upd("communityType", v)}
                style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${b.communityType === v ? T.cyan : T.border}`, background: b.communityType === v ? T.cyan + "18" : T.bg, color: b.communityType === v ? T.cyan : T.muted, fontSize: 13, cursor: "pointer" }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <SecHead color={T.green}>Listening Objectives</SecHead>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <input type="checkbox" id="useDefault" checked={b.useDefaultObj} onChange={e => upd("useDefaultObj", e.target.checked)} style={{ accentColor: T.cyan }} />
            <label htmlFor="useDefault" style={{ fontSize: 13, color: T.text, cursor: "pointer" }}>Use default eCLIPPS listening objectives</label>
          </div>
        </div>
        {!b.useDefaultObj && <FTextarea label="Custom Listening Objectives" value={b.listeningObjective} onChange={v => upd("listeningObjective", v)} placeholder="What specific questions are you trying to answer with this analysis?" rows={4} />}
        <FTextarea label="Mission / Program Goals" value={b.missionGoals} onChange={v => upd("missionGoals", v)} placeholder="What is the mission or goal of the organization or program?" rows={3} />
        <FTextarea label="Specific Questions (optional)" value={b.specificQuestions} onChange={v => upd("specificQuestions", v)} placeholder="Any specific questions you want the engine to address?" rows={2} />
        <FTextarea label="Known Context (optional)" value={b.knownContext} onChange={v => upd("knownContext", v)} placeholder="Anything the engine should know going in?" rows={2} />
      </Card>

      <Card>
        <SecHead color={T.amber}>Data Context</SecHead>
        <FSelect label="Signal Timing Mode" value={b.timingMode} onChange={v => upd("timingMode", v)} options={TIMING_MODES} />
        {timingWording && <div style={{ fontSize: 12, color: T.cyan, background: T.cyan + "10", border: `1px solid ${T.cyan}20`, borderRadius: 6, padding: "8px 10px", marginBottom: 14, marginTop: -8 }}>{timingWording}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <FInput label="Data Date Range" value={b.dataDateRange} onChange={v => upd("dataDateRange", v)} placeholder="e.g. Jan 2026 – June 2026" />
          <FInput label="Excavation Date" value={b.excavationDate} onChange={v => upd("excavationDate", v)} placeholder="e.g. June 28, 2026" />
        </div>

        {/* Mirror Audience — visible all tiers, clickable Tier 4 only */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.dim, borderRadius: 10, border: `1px solid ${b.useMirrorAudience ? T.gold + "60" : T.border}` }}>
            <input type="checkbox" id="mirrorAud" checked={b.useMirrorAudience}
              onChange={handleMirrorToggle}
              style={{ accentColor: T.gold, cursor: can(user, "mirror_audience") ? "pointer" : "not-allowed" }} />
            <div>
              <label htmlFor="mirrorAud" style={{ fontSize: 13, color: can(user, "mirror_audience") ? T.text : T.muted, cursor: can(user, "mirror_audience") ? "pointer" : "not-allowed", fontWeight: 500 }}>
                Include a Mirrored Audience in this report
                {!can(user, "mirror_audience") && <span style={{ marginLeft: 8, fontSize: 11, color: T.gold }}>🔒 Total eCLIPPS</span>}
              </label>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>A mirror is a publicly available audience/conversation set matching your target demographic — e.g. a public Facebook group or subreddit.</div>
            </div>
          </div>
          {b.useMirrorAudience && can(user, "mirror_audience") && (
            <div style={{ marginTop: 10, padding: "12px 14px", background: T.gold + "08", border: `1px solid ${T.gold}30`, borderRadius: 8 }}>
              <FInput label="Mirror Source Description" value={b.mirrorSource} onChange={v => upd("mirrorSource", v)} placeholder="e.g. r/careerguidance — general career advice subreddit" />
              <FInput label="Mirror Platform" value={b.mirrorPlatform} onChange={v => upd("mirrorPlatform", v)} placeholder="e.g. Reddit, Facebook Group, YouTube comments" />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <SecHead color={T.cyan}>Excavation Sources</SecHead>
        <FTextarea label="Excavation Sites" value={b.excavationSites || ""} onChange={v => upd("excavationSites", v)} placeholder="e.g. Facebook Group — Homeschool Parents Network, Reddit — r/firsttimehomebuyer, YouTube comments — Career Pivot channel" rows={2} note="List where you collected data. Write it however feels natural — commas, line breaks, or a sentence. No specific format required." />

        {/* Upload row — two options side by side */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={async e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }} onClick={() => fileRef.current?.click()}
            style={{ flex: 1, border: `2px dashed ${dragOver ? T.cyan : T.border}`, borderRadius: 12, padding: "16px", textAlign: "center", cursor: "pointer", background: dragOver ? T.cyan + "08" : T.bg, transition: "all .3s" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>📁</div>
            <div style={{ fontSize: 13, color: T.text, fontWeight: 500, marginBottom: 2 }}>Upload from computer</div>
            <div style={{ fontSize: 11, color: T.muted }}>.txt · .csv · .json · .pdf · .md</div>
            <input ref={fileRef} type="file" multiple accept=".txt,.csv,.json,.pdf,.md" onChange={e => addFiles(e.target.files)} style={{ display: "none" }} />
          </div>
          <button onClick={() => { refreshLibrary(); setShowLibrary(!showLibrary); }}
            style={{ flex: 1, border: `2px dashed ${showLibrary ? T.violet : T.border}`, borderRadius: 12, padding: "16px", textAlign: "center", cursor: "pointer", background: showLibrary ? T.violet + "10" : T.bg, transition: "all .3s", fontFamily: "'Inter',sans-serif" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>🗄</div>
            <div style={{ fontSize: 13, color: showLibrary ? T.violet : T.text, fontWeight: 500, marginBottom: 2 }}>Browse Source Library</div>
            <div style={{ fontSize: 11, color: T.muted }}>{libraryItems.length} saved file{libraryItems.length !== 1 ? "s" : ""}</div>
          </button>
        </div>

        {/* Source Library browser panel */}
        {showLibrary && (
          <div className="fade-up" style={{ background: T.bg, border: `1px solid ${T.violet}40`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: T.violet, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Source Library</span>
              <button onClick={() => setShowLibrary(false)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            {libraryItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: T.muted, fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                No files saved yet. Upload a source below and click "Save to Library" to store it for reuse.
              </div>
            ) : (
              libraryItems.map(item => {
                const tier = pasteTier(item.wordCount || 0);
                const alreadyAdded = session.sourceItems.some(s => s.label === item.label && s.wordCount === item.wordCount);
                return (
                  <div key={item.id} style={{ background: T.surface, border: `1px solid ${alreadyAdded ? T.violet + "40" : T.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{item.type === "paste" ? "📝" : fileExt(item.filename || "")}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: tier.color }}>{tier.label}: {(item.wordCount || 0).toLocaleString()} words · Saved {item.savedAt}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => {
                        if (alreadyAdded) return;
                        const newItem = { ...item, id: genId() };
                        onUpdate(prev => ({ ...prev, sourceItems: [...prev.sourceItems, newItem] }));
                      }} disabled={alreadyAdded}
                        style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${alreadyAdded ? T.border : T.violet + "60"}`, background: alreadyAdded ? "none" : T.violet + "18", color: alreadyAdded ? T.muted : T.violet, fontSize: 11, cursor: alreadyAdded ? "not-allowed" : "pointer" }}>
                        {alreadyAdded ? "✓ Added" : "+ Use"}
                      </button>
                      <button onClick={() => {
                        const updated = removeFromSourceLibrary(user.id, item.id);
                        setLibraryItems(updated);
                      }} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: "none", color: T.muted, fontSize: 11, cursor: "pointer" }}>
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <FInput label="Excavation Site Label (required before pasting)" value={pasteLabel} onChange={setPasteLabel} placeholder="e.g. Facebook Group — Youth Soccer Parents · June 2026" />
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: "block", fontSize: 11, color: T.muted, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 5 }}>Paste Conversation Text</label>
          <textarea value={pasteInput} onChange={e => setPasteInput(e.target.value)} placeholder="Paste posts, threads, comments, forum discussions here…" rows={5}
            style={{ width: "100%", background: T.bg, border: `1px solid ${pasteInput.trim() ? T.cyan + "80" : T.border}`, borderRadius: 7, padding: "9px 12px", color: T.text, fontSize: 13, outline: "none", resize: "vertical", lineHeight: 1.6, transition: "border-color .2s" }} />
        </div>
        {pasteInput.trim() && (() => { const n = wcCount(pasteInput), tier = pasteTier(n); return (<div style={{ marginBottom: 8 }}><span style={{ fontSize: 11, color: tier.color, fontWeight: 500 }}>{tier.label}: {n.toLocaleString()} words</span>{tier.msg && <div style={{ fontSize: 12, color: tier.color, background: tier.color + "10", border: `1px solid ${tier.color}30`, borderRadius: 6, padding: "6px 10px", marginTop: 4 }}>{tier.msg}</div>}</div>); })()}
        <button onClick={addPaste} disabled={!pasteInput.trim() || !pasteLabel.trim()}
          style={{ background: pasteInput.trim() && pasteLabel.trim() ? T.cyan + "20" : T.dim, border: `1px solid ${pasteInput.trim() && pasteLabel.trim() ? T.cyan : T.border}`, borderRadius: 6, padding: "7px 14px", color: pasteInput.trim() && pasteLabel.trim() ? T.cyan : T.muted, cursor: pasteInput.trim() && pasteLabel.trim() ? "pointer" : "not-allowed", fontSize: 13, fontFamily: "'Inter',sans-serif", marginBottom: 16 }}>
          + Add Source
        </button>

        {session.sourceItems.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Queued Excavation Sites ({session.sourceItems.length})</div>
            {session.sourceItems.map(src => {
              const tier = pasteTier(src.wordCount || 0);
              const inLibrary = libraryItems.some(x => x.label === src.label && x.wordCount === src.wordCount);
              return (
                <div key={src.id} className="fade-up" style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{src.type === "paste" ? "📝" : fileExt(src.filename || "")}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input value={src.label} onChange={e => updateLabel(src.id, e.target.value)} style={{ width: "100%", background: "none", border: "none", color: T.text, fontSize: 13, fontWeight: 500, outline: "none", padding: 0, marginBottom: 2 }} placeholder="Excavation site label…" />
                    <div style={{ fontSize: 11, color: tier.color }}>{tier.label}: {(src.wordCount || 0).toLocaleString()} words</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    <button onClick={() => {
                      if (inLibrary) return;
                      const updated = addToSourceLibrary(user.id, src);
                      setLibraryItems(updated);
                    }} title={inLibrary ? "Already in library" : "Save to Source Library"}
                      style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${inLibrary ? T.border : T.violet + "50"}`, background: inLibrary ? "none" : T.violet + "12", color: inLibrary ? T.muted : T.violet, fontSize: 11, cursor: inLibrary ? "default" : "pointer" }}>
                      {inLibrary ? "✓ Saved" : "🗄 Save"}
                    </button>
                    <button onClick={() => removeSource(src.id)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 18 }}>×</button>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${T.border}`, textAlign: "center" }}>
              <Btn onClick={onRun} color={T.cyan} style={{ fontSize: 15, padding: "12px 32px" }}>Extract Signals →</Btn>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Signals Tab ───────────────────────────────────────────────────────────────
function SignalsTab({ report, user, onUpgrade }) {
  const isFree = user?.tier === "free";
  const allSignals = report?.signal_map || [];
  const visibleSignals = isFree ? allSignals.slice(0, 3) : allSignals;

  if (!report) {
    return (
      <div style={{ maxWidth: 680 }}>
        <SecHead color={T.cyan}>What Signals Will Appear Here</SecHead>
        <div style={{ display: "grid", gap: 12 }}>
          {[{ icon: "🗺", title: "Signal Map", color: T.cyan, desc: "Labeled, typed, frequency-ranked, and P2-scored signals from your excavation data." }, { icon: "🌡", title: "Sentiment Layers", color: T.amber, desc: "Surface emotion vs. underlying drivers — including Trust Level and Emotional Drivers." }, { icon: "📍", title: "Problem Spots", color: T.red, desc: "Explicit pain, implicit pain, and unspoken fears the community never says out loud." }].map(e => (
            <Card key={e.title}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 28, flexShrink: 0 }}>{e.icon}</span>
                <div><div style={{ fontSize: 14, fontWeight: 600, color: e.color, marginBottom: 4 }}>{e.title}</div><p style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>{e.desc}</p></div>
              </div>
            </Card>
          ))}
        </div>
        <Card style={{ textAlign: "center", borderStyle: "dashed" }}>
          <p style={{ color: T.muted, fontSize: 14 }}>Add sources in the Brief tab and click Extract Signals to generate your report.</p>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <SignalsView r={{ ...report, signal_map: visibleSignals }} />
      {isFree && allSignals.length > 3 && (
        <div style={{ background: `linear-gradient(180deg, transparent, ${T.bg})`, padding: "30px 24px", textAlign: "center", border: `1px solid ${T.cyan}30`, borderRadius: 14, marginTop: -8 }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>🔒</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>{allSignals.length - 3} More Signals Hidden</div>
          <p style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>Free accounts view the first 3 signals. Upgrade to Core or higher to unlock all signals.</p>
          <Btn onClick={() => onUpgrade("All Signals", "core")} color={T.cyan}>Upgrade to View All →</Btn>
        </div>
      )}
      <SentimentView r={report} />
      <FingerprintView r={report} />
    </div>
  );
}

// ── Report Tab ────────────────────────────────────────────────────────────────
function ReportTab({ session, ag, user, onUpgrade }) {
  const [section, setSection] = useState("summary");
  const [showDlOptions, setShowDlOptions] = useState(false);
  const [dlSections, setDlSections] = useState(REPORT_SECTIONS.map(s => s.id));
  const [includeQA, setIncludeQA] = useState(true);
  const r = session.report;
  const hasGraphs = session.graphs && session.graphs.length > 0;

  if (!r) {
    return (
      <div style={{ maxWidth: 680, textAlign: "center", padding: "60px 0", color: T.muted }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
        <p>Your full report will appear here after extracting signals.</p>
      </div>
    );
  }

  const NAV = [
    { id: "summary", label: "Executive Summary", color: T.cyan },
    { id: "fingerprint", label: "Community Profile", color: T.violet },
    { id: "signals", label: "Signal Map", color: T.cyan },
    { id: "sentiment", label: "Sentiment Layers", color: T.amber },
    { id: "problems", label: "Problem Spots", color: T.red },
    { id: "readiness", label: "Readiness & Action", color: T.green },
    { id: "risks", label: "Risk Signals", color: T.red },
    { id: "opps", label: "Opportunity Map", color: T.green },
    { id: "lexicon", label: "Lexicon", color: T.cyan },
    { id: "resources", label: "Resources", color: T.slate },
  ];

  const handleDownload = (dlType) => {
    if (dlType === "internal") {
      dlRTF(session, { analystGlobal: ag }, `${session.brief.reportName || "eCLIPPS"}_internal.rtf`, "internal");
    } else if (dlType === "analyst") {
      dlRTF({ ...session, qaItems: includeQA ? session.qaItems : [] }, { analystGlobal: ag }, `${session.brief.reportName || "eCLIPPS"}_CIB.rtf`, "analyst");
    } else if (dlType === "stakeholder") {
      dlRTF({ ...session, qaItems: includeQA ? session.qaItems : [] }, { analystGlobal: ag, sections: dlSections, isClient: true }, `${session.brief.reportName || "eCLIPPS"}_stakeholder.rtf`, "stakeholder");
    }
    setShowDlOptions(false);
  };

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "60vh" }}>
      <div style={{ width: 190, flexShrink: 0, paddingRight: 16 }}>
        {NAV.map(item => (
          <button key={item.id} onClick={() => setSection(item.id)}
            style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: section === item.id ? item.color + "10" : "none", border: "none", borderLeft: `3px solid ${section === item.id ? item.color : "transparent"}`, color: section === item.id ? item.color : T.muted, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", borderRadius: "0 6px 6px 0", marginBottom: 2 }}>
            {item.label}
          </button>
        ))}

        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, marginTop: 12 }}>
          {/* Internal download — always available to admin */}
          {user?.tier === "admin" && (
            <button onClick={() => handleDownload("internal")}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", marginBottom: 6 }}>
              ⬇ Full Report (Admin)
            </button>
          )}

          {/* Community Intelligence Brief — Tier 3+ */}
          {can(user, "analyst_download") ? (
            <button onClick={() => handleDownload("analyst")}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: T.green + "18", border: `1px solid ${T.green}40`, borderRadius: 8, color: T.green, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", marginBottom: 6 }}>
              📄 Community Intelligence Brief
            </button>
          ) : (
            <button onClick={() => onUpgrade("Community Intelligence Brief Download", "analyst")}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: T.dim, border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", marginBottom: 6 }}>
              🔒 Community Intelligence Brief
            </button>
          )}

          {/* Stakeholder / Customizable report — Tier 3+ */}
          {can(user, "stakeholder_dl") ? (
            <button onClick={() => setShowDlOptions(!showDlOptions)}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: T.violet + "18", border: `1px solid ${T.violet}40`, borderRadius: 8, color: T.violet, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", marginBottom: 6 }}>
              📦 Stakeholder Report
            </button>
          ) : (
            <button onClick={() => onUpgrade("Stakeholder Report Download", "analyst")}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: T.dim, border: `1px solid ${T.border}`, borderRadius: 8, color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: "'Inter',sans-serif", marginBottom: 6 }}>
              🔒 Stakeholder Report
            </button>
          )}

          {/* Include graphs checkbox — only shows if graphs exist */}
          {hasGraphs && can(user, "graphs_view") && (
            <div style={{ padding: "6px 8px", marginBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted, cursor: "pointer" }}>
                <input type="checkbox" checked={includeQA} onChange={e => setIncludeQA(e.target.checked)} style={{ accentColor: T.gold }} />
                Include graphs in download
              </label>
            </div>
          )}
        </div>

        {/* Stakeholder download customizer */}
        {showDlOptions && can(user, "stakeholder_dl") && (
          <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginTop: 8 }}>
            <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Select Sections to Include</div>
            {REPORT_SECTIONS.filter(s => !s.internal).map(sec => (
              <label key={sec.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer", fontSize: 12, color: T.text }}>
                <input type="checkbox" checked={dlSections.includes(sec.id)} onChange={e => { const arr = e.target.checked ? [...dlSections, sec.id] : dlSections.filter(x => x !== sec.id); setDlSections(arr); }} style={{ accentColor: T.violet }} />
                {sec.label}
              </label>
            ))}
            <Btn onClick={() => handleDownload("stakeholder")} color={T.violet} style={{ width: "100%", marginTop: 8, justifyContent: "center" }}>Download →</Btn>
          </div>
        )}
      </div>

      <div style={{ flex: 1, paddingLeft: 20, borderLeft: `1px solid ${T.border}`, maxWidth: 540 }}>
        {section === "summary" && <SummaryView r={r} />}
        {section === "fingerprint" && <FingerprintView r={r} />}
        {section === "signals" && <SignalsView r={r} />}
        {section === "sentiment" && <SentimentView r={r} />}
        {section === "problems" && <ProblemsView r={r} />}
        {section === "readiness" && <ReadinessView r={r} brief={session.brief} />}
        {section === "risks" && <RiskView r={r} />}
        {section === "opps" && <OppView r={r} />}
        {section === "lexicon" && <LexiconView r={r} />}
        {section === "resources" && <ResourcesView r={r} />}
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
function SettingsTab({ ag, setAg, user, onPasswordChange }) {
  const upd = (k, v) => setAg(prev => ({ ...prev, [k]: v }));
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  const handlePwChange = async () => {
    if (newPw.length < 6) { setPwMsg("Password must be at least 6 characters."); return; }
    if (newPw !== confirmPw) { setPwMsg("Passwords do not match."); return; }
    const result = await onPasswordChange(newPw);
    if (result?.error) { setPwMsg(result.error); return; }
    setPwMsg("Password updated successfully.");
    setNewPw(""); setConfirmPw("");
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <Card>
        <SecHead color={T.violet}>Analyst Information</SecHead>
        <FInput label="Prepared By" value={ag.preparedBy || ""} onChange={v => upd("preparedBy", v)} placeholder="Your full name" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <FInput label="Title / Role" value={ag.title || ""} onChange={v => upd("title", v)} placeholder="e.g. Senior Analyst" />
          <FInput label="Organization" value={ag.organization || ""} onChange={v => upd("organization", v)} placeholder="Your org or firm" />
        </div>
        <FTextarea label="Contact Info" value={ag.contactInfo || ""} onChange={v => upd("contactInfo", v)} placeholder="Email, website, phone, booking link…" rows={2} />
      </Card>
      <Card>
        <SecHead color={T.cyan}>Your Account</SecHead>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
          Logged in as <strong style={{ color: T.text }}>{user?.username}</strong> &nbsp;<TierBadge tier={user?.tier || "free"} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <FInput label="New Password" value={newPw} onChange={setNewPw} placeholder="Min 6 characters" />
          <FInput label="Confirm Password" value={confirmPw} onChange={setConfirmPw} placeholder="Repeat new password" />
        </div>
        {pwMsg && <div style={{ fontSize: 12, color: pwMsg.includes("success") ? T.green : T.red, marginBottom: 10 }}>{pwMsg}</div>}
        <GhostBtn onClick={handlePwChange}>Update Password</GhostBtn>
      </Card>
      <Card style={{ borderColor: T.red + "20" }}>
        <SecHead color={T.red}>Internal Use Only</SecHead>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <FInput label="Price / Fee" value={ag.price || ""} onChange={v => upd("price", v)} placeholder="e.g. $450" />
          <FInput label="Delivery Method" value={ag.deliveryMethod || ""} onChange={v => upd("deliveryMethod", v)} placeholder="Zoom / Email / In-Person" />
        </div>
        <FTextarea label="Analyst Notes" value={ag.analystNotes || ""} onChange={v => upd("analystNotes", v)} placeholder="Internal methodology notes." rows={4} />
      </Card>
      <Card style={{ borderColor: T.green + "20" }}>
        <SecHead color={T.green}>Client-Facing Closing Statement</SecHead>
        <FTextarea label="Closing Statement" value={ag.closingStatement || DEFAULT_CLOSING} onChange={v => upd("closingStatement", v)} rows={10} />
      </Card>
    </div>
  );
}

// ── Companions Tab ────────────────────────────────────────────────────────────
function CompanionsTab({ session, onUpdate, user, onUpgrade }) {
  const [loading, setLoading] = useState(false);
  const [activePrompt, setActivePrompt] = useState(null);
  const [openPrompts, setOpenPrompts] = useState(["", "", "", "", ""]);
  const [openLoading, setOpenLoading] = useState([false, false, false, false, false]);
  const qaItems = session.qaItems || [];

  if (!can(user, "companions_tab")) {
    return (
      <div style={{ textAlign: "center", padding: "80px 40px" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🧭</div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 12 }}>Companions</div>
        <p style={{ fontSize: 14, color: T.muted, maxWidth: 400, margin: "0 auto 24px", lineHeight: 1.7 }}>
          The Companion prompt suite lets you go deeper into your report data — asking strategic questions and building a Q&A appendix for your download.
        </p>
        <Btn onClick={() => onUpgrade("Companions Tab", "companion")} color={T.violet}>Upgrade to Companion →</Btn>
      </div>
    );
  }

  if (!session.report) {
    return (
      <div style={{ textAlign: "center", padding: "80px 40px" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🧭</div>
        <p style={{ fontSize: 14, color: T.muted }}>Run your report first, then come back to explore it deeper with Companions.</p>
      </div>
    );
  }

  const askQuestion = async (question, isOpen = false, idx = null) => {
    if (!question.trim()) return;
    if (isOpen) { const l = [...openLoading]; l[idx] = true; setOpenLoading(l); }
    else setLoading(true);
    setActivePrompt(question);

    const reportContext = JSON.stringify({ brief: session.brief, report: session.report }, null, 2).slice(0, 8000);
    const industryPack = INDUSTRY_PROMPTS[session.brief.industry] || [];

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `You are a strategic analyst reviewing a community intelligence report. Answer the following question using the report data provided. Be specific, direct, and grounded in the actual signals from the report.\n\nREPORT DATA:\n${reportContext}\n\nQUESTION: ${question}\n\nProvide a clear, strategic answer in 3-5 paragraphs.`
          }]
        })
      });
      const data = await res.json();
      const answer = data.content?.[0]?.text || "No response generated.";
      const newQA = { id: genId(), question, answer, createdAt: todayISO(), source: isOpen ? "open" : "curated" };
      onUpdate(prev => ({ ...prev, qaItems: [...(prev.qaItems || []), newQA] }));
    } catch (e) {
      const errQA = { id: genId(), question, answer: "Error generating response. Please try again.", createdAt: todayISO() };
      onUpdate(prev => ({ ...prev, qaItems: [...(prev.qaItems || []), errQA] }));
    }

    setActivePrompt(null);
    if (isOpen) { const l = [...openLoading]; l[idx] = false; setOpenLoading(l); }
    else setLoading(false);
  };

  const removeQA = (id) => onUpdate(prev => ({ ...prev, qaItems: (prev.qaItems || []).filter(q => q.id !== id) }));

  const industryPrompts = INDUSTRY_PROMPTS[session.brief.industry] || GENERIC_COMPANION_PROMPTS;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 6 }}>🧭 Companions</div>
        <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.7 }}>Ask strategic questions about your report. Answers are generated by the eCLIPPS engine using your data as context and saved to your Q&A appendix for download.</p>
      </div>

      <Card>
        <SecHead color={T.violet}>Strategic Prompt Pack</SecHead>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
          {session.brief.industry ? `Industry-specific prompts for: ${INDUSTRIES.find(i => i.id === session.brief.industry)?.label || session.brief.industry}` : "Generic companion prompts (select an industry in Brief for tailored questions)"}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {industryPrompts.map((prompt, i) => {
            const alreadyAsked = qaItems.some(q => q.question === prompt);
            return (
              <div key={i} style={{ background: T.bg, border: `1px solid ${alreadyAsked ? T.violet + "40" : T.border}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, fontSize: 13, color: alreadyAsked ? T.muted : T.text, lineHeight: 1.5 }}>{prompt}</div>
                <button onClick={() => askQuestion(prompt)} disabled={loading || alreadyAsked}
                  style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 7, border: `1px solid ${alreadyAsked ? T.border : T.violet + "60"}`, background: alreadyAsked ? T.dim : T.violet + "18", color: alreadyAsked ? T.muted : T.violet, cursor: loading || alreadyAsked ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                  {activePrompt === prompt ? "Asking…" : alreadyAsked ? "✓ Asked" : "Ask →"}
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {can(user, "open_prompts") && (
        <Card>
          <SecHead color={T.cyan}>Open Prompt Fields (5 max)</SecHead>
          <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>Write your own question and ask the engine directly.</p>
          {openPrompts.map((prompt, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: T.cyan + "20", color: T.cyan, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 10 }}>{i + 1}</div>
              <textarea value={prompt} onChange={e => { const arr = [...openPrompts]; arr[i] = e.target.value; setOpenPrompts(arr); }} placeholder={`Custom question ${i + 1}…`} rows={2}
                style={{ flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 13, outline: "none", resize: "vertical" }} />
              <Btn onClick={() => askQuestion(prompt, true, i)} disabled={!prompt.trim() || openLoading[i]} color={T.cyan} style={{ flexShrink: 0, marginTop: 2, padding: "9px 14px" }}>
                {openLoading[i] ? "…" : "Ask"}
              </Btn>
            </div>
          ))}
        </Card>
      )}

      {qaItems.length > 0 && (
        <Card>
          <SecHead color={T.green}>Q&A Appendix ({qaItems.length} responses)</SecHead>
          <p style={{ fontSize: 11, color: T.muted, marginBottom: 14 }}>These responses will be included in your report download when you choose to include Q&A.</p>
          {qaItems.map((qa, i) => (
            <div key={qa.id} className="fade-up" style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.violet, flex: 1, paddingRight: 10 }}>Q{i + 1}: {qa.question}</div>
                <button onClick={() => removeQA(qa.id)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>×</button>
              </div>
              <p style={{ fontSize: 13, color: T.text, lineHeight: 1.7 }}>{qa.answer}</p>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>{qa.createdAt} · {qa.source === "open" ? "Open prompt" : "Curated prompt"}</div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ── Graphs Tab ────────────────────────────────────────────────────────────────
function GraphsTab({ session, onUpdate, user, onUpgrade }) {
  const graphs = session.graphs || [];
  const [loading, setLoading] = useState(false);

  const runGraph = async () => {
    if (!session.report) return;
    setLoading(true);
    const signals = session.report.signal_map || [];
    const sentiment = session.report.sentiment_layers || {};
    const graphData = {
      id: genId(),
      createdAt: todayISO(),
      signalFrequency: signals.map(s => ({ name: s.signal?.slice(0, 30) || "Signal", score: s.prioritization_score || 5, type: s.signal_type })),
      sentimentBreakdown: [
        { label: "Trust", value: sentiment.trust_level === "high" ? 80 : sentiment.trust_level === "medium" ? 50 : 25 },
        { label: "Momentum", value: session.report.readiness?.community_momentum === "hot" ? 90 : 55 },
      ],
      title: session.brief.reportName || "Signal Analysis",
    };
    onUpdate(prev => ({ ...prev, graphs: [...(prev.graphs || []), graphData] }));
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 6 }}>📊 Graphs</div>
        <p style={{ fontSize: 13, color: T.muted }}>Data visualizations produced from your report signals. Graphs are archived in your dashboard and can be included in downloads.</p>
      </div>

      {/* Admin run control */}
      {can(user, "graphs_run") && (
        <Card style={{ borderColor: T.gold + "40" }}>
          <SecHead color={T.gold}>Admin — Run Graph</SecHead>
          {!session.report ? (
            <p style={{ fontSize: 13, color: T.muted }}>Run a report first to generate graphs.</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Generate signal frequency and sentiment visualizations from the current report.</p>
              <Btn onClick={runGraph} disabled={loading} color={T.gold}>{loading ? "Generating…" : "Generate Graphs →"}</Btn>
            </>
          )}
        </Card>
      )}

      {/* Locked state for tiers below Total eCLIPPS */}
      {!can(user, "graphs_view") && (
        <div style={{ textAlign: "center", padding: "60px 40px", border: `1px solid ${T.border}`, borderRadius: 14, background: T.surface }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 12 }}>Data Visualization</div>
          <p style={{ fontSize: 14, color: T.muted, maxWidth: 400, margin: "0 auto 24px", lineHeight: 1.7 }}>
            Your graphs are produced by your eCLIPPS analyst and archived here for your review and download. Available on the Total eCLIPPS plan.
          </p>
          <Btn onClick={() => onUpgrade("Data Visualization", "total")} color={T.gold}>Upgrade to Total eCLIPPS →</Btn>
        </div>
      )}

      {/* Graph display — Tier 4+ */}
      {can(user, "graphs_view") && graphs.length === 0 && !can(user, "graphs_run") && (
        <Card style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <p style={{ fontSize: 14, color: T.muted }}>No graphs have been generated for this report yet. Your eCLIPPS analyst will produce graphs during your Total eCLIPPS session.</p>
        </Card>
      )}

      {can(user, "graphs_view") && graphs.map((g, gi) => (
        <Card key={g.id} delay={gi * 0.05}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>{g.title}</div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 16 }}>Generated {g.createdAt}</div>

          {/* Signal Frequency Bar Chart */}
          {g.signalFrequency?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>Signal P2 Score Distribution</div>
              {g.signalFrequency.slice(0, 8).map((sig, i) => {
                const color = SIG_COLOR[sig.type] || T.cyan;
                return (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{sig.name}</span>
                      <span style={{ fontSize: 11, color, fontFamily: "'JetBrains Mono',monospace" }}>{sig.score}/10</span>
                    </div>
                    <div style={{ background: T.dim, borderRadius: 4, height: 8 }}>
                      <div style={{ width: `${(sig.score / 10) * 100}%`, height: "100%", background: `linear-gradient(90deg,${color}80,${color})`, borderRadius: 4, transition: "width 1s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sentiment indicators */}
          {g.sentimentBreakdown?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>Community Indicators</div>
              <div style={{ display: "flex", gap: 12 }}>
                {g.sentimentBreakdown.map((s, i) => (
                  <div key={i} style={{ flex: 1, background: T.bg, borderRadius: 10, padding: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, color: s.value >= 70 ? T.green : s.value >= 40 ? T.amber : T.red }}>{s.value}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ── Archive Tab ───────────────────────────────────────────────────────────────
function ArchiveTab({ userId, onOpenSession, onLongitudinal, folders, onFoldersChange }) {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [activeFolder, setActiveFolder] = useState("all");
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [libraryItems, setLibraryItems] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libDragOver, setLibDragOver] = useState(false);
  const libFileRef = useRef();

  useEffect(() => {
    setSessions(loadSessions(userId));
    setLibraryItems(getSourceLibrary(userId));
  }, [userId]);

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const uploadToLibrary = async (files) => {
    let current = getSourceLibrary(userId);
    for (const file of files) {
      const text = await file.text().catch(() => "[Binary file]");
      const item = { id: genId(), type: "file", filename: file.name, label: file.name, content: text, wordCount: wcCount(text), savedAt: todayISO() };
      const exists = current.some(x => x.label === item.label && x.wordCount === item.wordCount);
      if (!exists) current = [item, ...current];
    }
    saveSourceLibrary(userId, current);
    setLibraryItems(current);
  };

  const createFolder = () => {
    const f = { id: genId(), name: "New Folder", color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length], created: todayISO() };
    const updated = [...folders, f];
    onFoldersChange(updated);
    setEditingFolderId(f.id);
    setEditingName(f.name);
  };

  const renameFolder = (id) => {
    const updated = folders.map(f => f.id === id ? { ...f, name: editingName || "Untitled Folder" } : f);
    onFoldersChange(updated);
    setEditingFolderId(null);
  };

  const deleteFolder = (id) => {
    const updated = folders.filter(f => f.id !== id);
    onFoldersChange(updated);
    if (activeFolder === id) setActiveFolder("all");
  };

  const visibleSessions = activeFolder === "all"
    ? sessions
    : sessions.filter(s => s.folderId === activeFolder);

  return (
    <div style={{ maxWidth: 900 }}>

      {/* Source Library section */}
      <div style={{ marginBottom: 28 }}>
        <button onClick={() => setShowLibrary(!showLibrary)}
          style={{ display: "flex", alignItems: "center", gap: 10, background: showLibrary ? T.violet + "10" : T.surface, border: `1px solid ${showLibrary ? T.violet + "50" : T.border}`, borderRadius: 12, padding: "12px 18px", cursor: "pointer", width: "100%", fontFamily: "'Inter',sans-serif", transition: "all .2s" }}>
          <span style={{ fontSize: 18 }}>🗄</span>
          <div style={{ textAlign: "left", flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: showLibrary ? T.violet : T.text }}>Source Library</div>
            <div style={{ fontSize: 12, color: T.muted }}>{libraryItems.length} saved file{libraryItems.length !== 1 ? "s" : ""} — reusable across all analyses</div>
          </div>
          <span style={{ color: T.muted, fontSize: 13, transform: showLibrary ? "rotate(180deg)" : "none", transition: "transform .2s" }}>⌄</span>
        </button>

        {showLibrary && (
          <div className="fade-up" style={{ background: T.surface, border: `1px solid ${T.violet}30`, borderRadius: "0 0 12px 12px", padding: 18, borderTop: "none" }}>
            {/* Upload to library drop zone */}
            <div onDragOver={e => { e.preventDefault(); setLibDragOver(true); }} onDragLeave={() => setLibDragOver(false)}
              onDrop={async e => { e.preventDefault(); setLibDragOver(false); uploadToLibrary(e.dataTransfer.files); }}
              onClick={() => libFileRef.current?.click()}
              style={{ border: `2px dashed ${libDragOver ? T.violet : T.border}`, borderRadius: 10, padding: "14px", textAlign: "center", cursor: "pointer", background: libDragOver ? T.violet + "08" : T.bg, transition: "all .3s", marginBottom: 14 }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>📁</div>
              <div style={{ fontSize: 13, color: T.muted }}>Drop files here or click to add to library</div>
              <input ref={libFileRef} type="file" multiple accept=".txt,.csv,.json,.pdf,.md" onChange={e => uploadToLibrary(e.target.files)} style={{ display: "none" }} />
            </div>

            {libraryItems.length === 0 ? (
              <p style={{ fontSize: 13, color: T.muted, textAlign: "center" }}>No files saved yet. Upload above or click "🗄 Save" on any source in the Brief tab.</p>
            ) : (
              libraryItems.map(item => {
                const tier = pasteTier(item.wordCount || 0);
                return (
                  <div key={item.id} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{item.type === "paste" ? "📝" : fileExt(item.filename || "")}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: tier.color }}>{tier.label}: {(item.wordCount || 0).toLocaleString()} words · Saved {item.savedAt}</div>
                    </div>
                    <button onClick={() => {
                      const updated = removeFromSourceLibrary(userId, item.id);
                      setLibraryItems(updated);
                    }} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: "none", color: T.muted, fontSize: 11, cursor: "pointer" }}>
                      Remove
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Reports + folder layout */}
      <div style={{ display: "flex", gap: 0 }}>
      {/* Folder sidebar */}
      <div style={{ width: 180, flexShrink: 0, paddingRight: 16, borderRight: `1px solid ${T.border}`, marginRight: 24 }}>
        <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Folders</div>
        <button onClick={() => setActiveFolder("all")}
          style={{ width: "100%", textAlign: "left", padding: "8px 10px", background: activeFolder === "all" ? T.cyan + "10" : "none", border: "none", borderRadius: 7, color: activeFolder === "all" ? T.cyan : T.muted, fontSize: 13, cursor: "pointer", marginBottom: 4 }}>
          📂 All Reports ({sessions.length})
        </button>
        {folders.map(f => (
          <div key={f.id}>
            {editingFolderId === f.id ? (
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                <input value={editingName} onChange={e => setEditingName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") renameFolder(f.id); if (e.key === "Escape") setEditingFolderId(null); }}
                  autoFocus
                  style={{ flex: 1, background: T.bg, border: `1px solid ${f.color}`, borderRadius: 5, padding: "5px 7px", color: T.text, fontSize: 12, outline: "none" }} />
                <button onClick={() => renameFolder(f.id)} style={{ background: "none", border: "none", color: T.green, cursor: "pointer", fontSize: 14 }}>✓</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <button onClick={() => setActiveFolder(f.id)}
                  style={{ flex: 1, textAlign: "left", padding: "7px 10px", background: activeFolder === f.id ? f.color + "15" : "none", border: "none", borderLeft: `3px solid ${activeFolder === f.id ? f.color : "transparent"}`, borderRadius: "0 6px 6px 0", color: activeFolder === f.id ? f.color : T.muted, fontSize: 12, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name}
                </button>
                <button onClick={() => { setEditingFolderId(f.id); setEditingName(f.name); }} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 12, padding: "2px 3px" }}>✏</button>
                <button onClick={() => deleteFolder(f.id)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 14, padding: "2px 3px" }}>×</button>
              </div>
            )}
          </div>
        ))}
        <button onClick={createFolder}
          style={{ width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: `1px dashed ${T.border}`, borderRadius: 7, color: T.muted, fontSize: 12, cursor: "pointer", marginTop: 8 }}>
          ＋ New Folder
        </button>
      </div>

      {/* Sessions list */}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 4 }}>
              {activeFolder === "all" ? "🗂 All Reports" : `📁 ${folders.find(f => f.id === activeFolder)?.name || "Folder"}`}
            </div>
            <p style={{ fontSize: 13, color: T.muted }}>All reports saved here automatically.</p>
          </div>
          {selected.length >= 2 && (
            <Btn onClick={() => onLongitudinal(selected)} color={T.violet}>📈 Track Changes ({selected.length} reports)</Btn>
          )}
        </div>

        {visibleSessions.length === 0 && (
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
            <p style={{ fontSize: 14, color: T.muted }}>{activeFolder === "all" ? "No archived reports yet. Run your first analysis to see it here." : "No reports in this folder yet."}</p>
          </Card>
        )}

        {visibleSessions.length > 0 && (
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>Select 2 or more reports to run longitudinal comparison (Analyst+ tier).</div>
        )}

        {visibleSessions.map((s, i) => (
          <div key={s.id} className="fade-up" style={{ background: T.surface, border: `1px solid ${selected.includes(s.id) ? T.violet : T.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12, animationDelay: `${i * .04}s` }}>
            <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)} style={{ accentColor: T.violet, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name || "Untitled"}</div>
              <div style={{ fontSize: 12, color: T.muted }}>{[s.clientName, s.clientOrg].filter(Boolean).join(" — ") || "No client"} · {s.created}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {s.hasReport && <span style={{ fontSize: 11, color: T.green, background: T.green + "15", padding: "2px 8px", borderRadius: 100 }}>Report</span>}
              {s.hasGraphs && <span style={{ fontSize: 11, color: T.gold, background: T.gold + "15", padding: "2px 8px", borderRadius: 100 }}>Graphs</span>}
            </div>
            <GhostBtn onClick={() => onOpenSession(s.id)} style={{ fontSize: 12, padding: "6px 12px" }}>Open →</GhostBtn>
          </div>
        ))}
      </div>
      </div>{/* end reports+folder layout */}
    </div>
  );
}

// ── Longitudinal Modal ────────────────────────────────────────────────────────
function LongitudinalModal({ sessionIds, userId, user, onClose, onUpgrade }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);

  if (!can(user, "longitudinal")) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="modal-in" style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 36, maxWidth: 440, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📈</div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 12 }}>Longitudinal Tracking</div>
          <p style={{ fontSize: 14, color: T.muted, marginBottom: 24, lineHeight: 1.7 }}>Track how your community's signals, sentiment, and themes change over time. Available on the Analyst plan and above.</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <GhostBtn onClick={onClose}>Cancel</GhostBtn>
            <Btn onClick={() => onUpgrade("Longitudinal Tracking", "analyst")} color={T.violet}>Upgrade →</Btn>
          </div>
        </div>
      </div>
    );
  }

  const sessions = sessionIds.map(id => loadSession(userId, id)).filter(Boolean);

  const runComparison = async (prompt) => {
    setLoading(true); setSelectedPrompt(prompt);
    const context = sessions.map((s, i) => `REPORT ${i + 1} (${s.brief.reportName || s.created}):\n${JSON.stringify({ brief: s.brief, summary: s.report?.summary, signals: s.report?.signal_map, sentiment: s.report?.sentiment_layers }, null, 2).slice(0, 3000)}`).join("\n\n---\n\n");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          messages: [{ role: "user", content: `You are analyzing ${sessions.length} community intelligence reports from different time periods. Compare them to answer the following question:\n\n${prompt}\n\nREPORTS:\n${context}\n\nProvide a clear longitudinal analysis in 3-5 paragraphs.` }]
        })
      });
      const data = await res.json();
      setResults(data.content?.[0]?.text || "No result generated.");
    } catch { setResults("Error running comparison. Please try again."); }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflowY: "auto" }}>
      <div className="modal-in" style={{ background: T.surface, border: `1px solid ${T.violet}40`, borderRadius: 16, padding: 32, maxWidth: 640, width: "100%" }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 6 }}>📈 Track Changes Over Time</div>
        <p style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>Comparing {sessions.length} reports: {sessions.map(s => s.brief.reportName || s.created).join(", ")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {LONGITUDINAL_PROMPTS.map((p, i) => (
            <button key={i} onClick={() => runComparison(p)} disabled={loading}
              style={{ textAlign: "left", padding: "10px 14px", background: selectedPrompt === p ? T.violet + "20" : T.bg, border: `1px solid ${selectedPrompt === p ? T.violet : T.border}`, borderRadius: 8, color: selectedPrompt === p ? T.violet : T.text, fontSize: 13, cursor: loading ? "not-allowed" : "pointer" }}>
              {p}
            </button>
          ))}
        </div>
        {loading && <div style={{ textAlign: "center", color: T.muted, fontSize: 13, marginBottom: 16 }}>Analyzing across reports…</div>}
        {results && (
          <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: T.violet, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Longitudinal Analysis</div>
            <p style={{ fontSize: 13, color: T.text, lineHeight: 1.75 }}>{results}</p>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <GhostBtn onClick={onClose}>Close</GhostBtn>
        </div>
      </div>
    </div>
  );
}

// ── User Guide Tab ────────────────────────────────────────────────────────────
function UserGuideTab({ user }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!subject.trim() || !message.trim()) return;
    addTicket({ userId: user.id, username: user.username, tier: user.tier, subject, message });
    setSubmitted(true);
    setSubject(""); setMessage("");
    setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 8 }}>📖 User Guide</div>
        <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.7 }}>Everything you need to get started and get the most out of eCLIPPS.</p>
      </div>

      {/* Video embed placeholder */}
      <Card>
        <SecHead color={T.cyan}>Getting Started — Walkthrough Video</SecHead>
        <div style={{ background: T.bg, border: `2px dashed ${T.border}`, borderRadius: 12, padding: "60px 40px", textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>▶</div>
          <div style={{ fontSize: 14, color: T.muted, marginBottom: 6 }}>Video walkthrough coming soon</div>
          <div style={{ fontSize: 12, color: T.dim }}>Replace this block with your YouTube embed code</div>
        </div>
      </Card>

      <Card>
        <SecHead color={T.violet}>Quick Start Guide</SecHead>
        {[
          { step: "1", title: "Fill in Your Brief", desc: "Go to the Brief tab. Enter your client information, select your industry, define your listening objectives, and set your timing mode." },
          { step: "2", title: "Add Your Sources", desc: "In the Brief tab, paste conversation text from your community (comments, threads, posts) or upload .txt, .csv, or .json files. Label each source clearly." },
          { step: "3", title: "Extract Signals", desc: "Click 'Extract Signals →' to run the eCLIPPS engine. Processing takes 30-60 seconds depending on data volume." },
          { step: "4", title: "Review Your Report", desc: "Navigate to the Signals and Report tabs to explore your results. Use the Companions tab to ask deeper questions about your data." },
          { step: "5", title: "Download Your Report", desc: "From the Report tab, download your Community Intelligence Brief (Analyst+) or create a customizable Stakeholder Report." },
        ].map(item => (
          <div key={item.step} style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.cyan + "20", color: T.cyan, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{item.step}</div>
            <div><div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 3 }}>{item.title}</div><div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>{item.desc}</div></div>
          </div>
        ))}
      </Card>

      <Card>
        <SecHead color={T.green}>Submit a Support Ticket</SecHead>
        <p style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.65 }}>Have a question, technical issue, or need help? Submit a ticket and we'll respond via email.</p>
        {submitted ? (
          <div style={{ background: T.green + "15", border: `1px solid ${T.green}40`, borderRadius: 10, padding: "14px 16px", fontSize: 14, color: T.green }}>✓ Ticket submitted! We'll be in touch shortly.</div>
        ) : (
          <>
            <FInput label="Subject" value={subject} onChange={setSubject} placeholder="e.g. Question about signals, Download issue, Feature request" />
            <FTextarea label="Message" value={message} onChange={setMessage} placeholder="Describe your issue or question in detail…" rows={5} />
            <Btn onClick={handleSubmit} disabled={!subject.trim() || !message.trim()} color={T.green}>Submit Ticket →</Btn>
          </>
        )}
      </Card>
    </div>
  );
}

// ── Admin Tab ─────────────────────────────────────────────────────────────────
function AdminTab({ currentUser }) {
  const [view, setView] = useState("subscribers"); // subscribers | tickets
  const [users, setUsers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [selTicket, setSelTicket] = useState(null);
  const [resetMsg, setResetMsg] = useState("");

  const loadUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setUsers(data);
  };

  useEffect(() => { loadUsers(); setTickets(getTickets()); }, [view]);

  const updateUserTier = async (userId, tier_key) => {
    const { error } = await supabase.from("profiles").update({ tier_key }).eq("user_id", userId);
    if (!error) loadUsers();
  };
  const updateUserStatus = async (userId, status) => {
    const { error } = await supabase.from("profiles").update({ status }).eq("user_id", userId);
    if (!error) loadUsers();
  };
  // Admin can trigger a password reset email for any user without ever seeing their password.
  const sendPasswordReset = async (email) => {
    setResetMsg("");
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setResetMsg(error ? `Failed to send reset email: ${error.message}` : `Password reset email sent to ${email}.`);
  };

  const tierOptions = Object.entries(TIERS).filter(([k]) => k !== "admin").map(([k, v]) => ({ id: k, label: v.label }));

  const navBtn = (id, label) => (
    <button key={id} onClick={() => setView(id)}
      style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: view === id ? T.red + "20" : "none", color: view === id ? T.red : T.muted, fontSize: 13, cursor: "pointer", fontWeight: view === id ? 600 : 400 }}>
      {label}
    </button>
  );

  const userList = users.filter(u => u.role !== "admin");

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: T.red }}>🔐 Admin Panel</div>
        <TierBadge tier="admin" />
      </div>

      <div style={{ display: "flex", gap: 4, background: T.dim, borderRadius: 10, padding: 4, marginBottom: 24 }}>
        {navBtn("subscribers", `Subscribers (${userList.length})`)}
        {navBtn("tickets", `Support Tickets (${tickets.filter(t => t.status === "open").length} open)`)}
      </div>

      {resetMsg && <div style={{ fontSize: 12, color: resetMsg.startsWith("Failed") ? T.red : T.green, marginBottom: 16 }}>{resetMsg}</div>}

      {view === "subscribers" && (
        <div>
          {userList.length === 0 && <Card><p style={{ color: T.muted, fontSize: 14 }}>No subscribers yet. Accounts are created when someone signs up or Stripe confirms payment.</p></Card>}
          {userList.map(u => (
            <div key={u.user_id} style={{ background: T.surface, border: `1px solid ${u.status === "suspended" ? T.red + "40" : T.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 2 }}>{u.display_name || u.email}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{u.email} · Joined {(u.created_at || "").split("T")[0]}</div>
              </div>
              <TierBadge tier={u.tier_key} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select value={u.tier_key} onChange={e => updateUserTier(u.user_id, e.target.value)}
                  style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 8px", color: T.text, fontSize: 12, cursor: "pointer" }}>
                  {tierOptions.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <button onClick={() => updateUserStatus(u.user_id, u.status === "active" ? "suspended" : "active")}
                  style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${u.status === "active" ? T.red + "60" : T.green + "60"}`, background: "none", color: u.status === "active" ? T.red : T.green, fontSize: 11, cursor: "pointer" }}>
                  {u.status === "active" ? "Suspend" : "Reactivate"}
                </button>
                <button onClick={() => sendPasswordReset(u.email)}
                  style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "none", color: T.muted, fontSize: 11, cursor: "pointer" }}>
                  Send Password Reset
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "tickets" && (
        <div>
          {tickets.length === 0 && <Card><p style={{ color: T.muted, fontSize: 14 }}>No support tickets yet.</p></Card>}
          {tickets.map(t => (
            <div key={t.id} style={{ background: T.surface, border: `1px solid ${t.status === "open" ? T.amber + "40" : T.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, cursor: "pointer" }} onClick={() => setSelTicket(selTicket?.id === t.id ? null : t)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 2 }}>{t.subject}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>{t.username} · {t.tier} · {t.createdAt}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 100, background: t.status === "open" ? T.amber + "20" : T.green + "20", color: t.status === "open" ? T.amber : T.green }}>{t.status}</span>
                  {t.status === "open" && (
                    <button onClick={e => { e.stopPropagation(); updateTicket(t.id, { status: "resolved" }); setTickets(getTickets()); }}
                      style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${T.green}40`, background: "none", color: T.green, fontSize: 11, cursor: "pointer" }}>
                      Resolve
                    </button>
                  )}
                </div>
              </div>
              {selTicket?.id === t.id && (
                <div style={{ marginTop: 12, padding: "12px 14px", background: T.bg, borderRadius: 8, fontSize: 13, color: T.text, lineHeight: 1.7 }}>{t.message}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {view === "credentials" && null}
    </div>
  );
}

// ── Consulting Tab (Tier 4) ───────────────────────────────────────────────────
function ConsultingTab({ user, onUpgrade }) {
  const [docs, setDocs] = useState([]);
  const [question, setQuestion] = useState("");
  const [questions, setQuestions] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    if (can(user, "consulting_page")) setDocs(getConsultDocs(user.id));
  }, [user.id]);

  if (!can(user, "consulting_page")) {
    return (
      <div style={{ textAlign: "center", padding: "80px 40px" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🤝</div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 12 }}>Total eCLIPPS Consulting</div>
        <p style={{ fontSize: 14, color: T.muted, maxWidth: 440, margin: "0 auto 24px", lineHeight: 1.7 }}>
          Total eCLIPPS includes a done-with-you consulting session. Upload your documents, submit questions, and your eCLIPPS analyst will run your report and produce both an internal and stakeholder-ready output.
        </p>
        <Btn onClick={() => onUpgrade("Consulting Session", "total")} color={T.gold}>Upgrade to Total eCLIPPS →</Btn>
      </div>
    );
  }

  const addFile = async (files) => {
    for (const file of files) {
      const text = await file.text().catch(() => "[Binary file — contents not previewable]");
      const doc = { name: file.name, size: file.size, type: file.type, content: text.slice(0, 5000) };
      const updated = addConsultDoc(user.id, doc);
      setDocs(updated);
    }
  };

  const addQuestion = () => {
    if (!question.trim()) return;
    setQuestions(prev => [...prev, { id: genId(), text: question, addedAt: todayISO() }]);
    setQuestion("");
  };

  const submitConsult = () => {
    sSet(getUserKey(user.id, "consult_questions"), questions);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 5000);
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: T.gold, marginBottom: 6 }}>🤝 Total eCLIPPS Consulting</div>
        <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.7 }}>Upload your source documents and submit questions before your consulting session. Your eCLIPPS analyst will access this library to run your report.</p>
      </div>

      <Card style={{ borderColor: T.gold + "30" }}>
        <SecHead color={T.gold}>Your Consulting Instructions</SecHead>
        <div style={{ background: T.bg, borderRadius: 10, padding: "16px 18px", fontSize: 13, color: T.text, lineHeight: 1.75 }}>
          <div style={{ marginBottom: 10 }}><strong style={{ color: T.gold }}>Step 1:</strong> Upload your source data files below. These can be text exports from your community platform, CSV files, or any relevant documents.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: T.gold }}>Step 2:</strong> Add any questions or specific areas of focus you want your analyst to address during the session.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: T.gold }}>Step 3:</strong> Submit your consult request. Your analyst will review your uploads and prepare for your session.</div>
          <div><strong style={{ color: T.gold }}>Step 4:</strong> During your scheduled session, your analyst will run the eCLIPPS engine on your data, walk through results with you, and help you create your stakeholder report.</div>
        </div>
      </Card>

      <Card>
        <SecHead color={T.cyan}>Document Library</SecHead>
        <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFile(e.dataTransfer.files); }} onClick={() => fileRef.current?.click()}
          style={{ border: `2px dashed ${T.border}`, borderRadius: 12, padding: "24px", textAlign: "center", cursor: "pointer", background: T.bg, marginBottom: 14 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>Drop files or click to upload</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Any file type accepted · Up to 5000 characters previewed</div>
          <input ref={fileRef} type="file" multiple onChange={e => addFile(e.target.files)} style={{ display: "none" }} />
        </div>
        {docs.length === 0 && <p style={{ fontSize: 13, color: T.muted }}>No files uploaded yet.</p>}
        {docs.map((doc, i) => (
          <div key={doc.id} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>{fileExt(doc.name)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{doc.name}</div>
              <div style={{ fontSize: 11, color: T.muted }}>Uploaded {doc.uploadedAt}</div>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <SecHead color={T.violet}>Pre-Session Questions</SecHead>
        <p style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Add specific questions or focus areas for your analyst to address during the session.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <textarea value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. I want to understand why engagement dropped in March…" rows={2}
            style={{ flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "9px 12px", color: T.text, fontSize: 13, outline: "none", resize: "vertical" }} />
          <Btn onClick={addQuestion} disabled={!question.trim()} color={T.violet} style={{ flexShrink: 0, alignSelf: "flex-end" }}>Add</Btn>
        </div>
        {questions.map((q, i) => (
          <div key={q.id} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ color: T.violet, fontWeight: 700, flexShrink: 0, fontSize: 12, marginTop: 1 }}>Q{i + 1}</span>
            <span style={{ fontSize: 13, color: T.text, flex: 1, lineHeight: 1.55 }}>{q.text}</span>
            <button onClick={() => setQuestions(prev => prev.filter(x => x.id !== q.id))} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        ))}
        {(docs.length > 0 || questions.length > 0) && !submitted && (
          <div style={{ marginTop: 16 }}>
            <Btn onClick={submitConsult} color={T.gold}>Submit Consult Request →</Btn>
          </div>
        )}
        {submitted && <div style={{ marginTop: 12, fontSize: 13, color: T.green }}>✓ Consult request submitted! Your analyst will be in touch to confirm your session time.</div>}
      </Card>
    </div>
  );
}

// ── Services Data (from v2) ───────────────────────────────────────────────────
const CATEGORIES=[
  {id:"grant",icon:"🏛",label:"Grant & Funding",color:T.violet,tagline:"Turn community evidence into fundable language.",services:[
    {name:"Grant Needs Narrative",price:"$500 – $1,500",tag:"Add-On",desc:"We take your eCLIPPS Signal Report and write the community need and target population sections of your grant application — using real signal data, sentiment findings, and community-voiced language as evidence.",includes:["Community need statement (2–4 paragraphs)","Target population description using signal data","Urgency indicators from problem spots and risk signals","Language calibrated to your funder's priorities"],bestFor:"Nonprofits, advocacy orgs, faith communities, social enterprises"},
    {name:"Impact Quantification Framework",price:"$750 – $2,000",tag:"Add-On",desc:"Build a measurable outcomes framework: what you're tracking, what 'better' looks like, and how community sentiment connects to program goals.",includes:["3–5 measurable outcome indicators drawn from report signals","Baseline description using current community sentiment","Progress markers tied to readiness and momentum data","Evaluation narrative ready for a grant application"],bestFor:"Nonprofits and programs needing logic models or evaluation plans"},
    {name:"Mirror Audience Analysis",price:"$1,500 – $3,000",tag:"Standalone or Bundle",desc:"Identify and analyze a comparable public community that mirrors your intended audience. Get real community intelligence as evidence for your grant, program design, or pitch.",includes:["Identification of 1–3 mirror communities with rationale","Full eCLIPPS Signal Report on the mirror audience","'Proxy Evidence' narrative explaining how findings apply to your org","Opportunity map scoped to your actual objectives"],bestFor:"New organizations, pre-launch initiatives, orgs entering a new market"},
  ]},
  {id:"zoom",icon:"🎙",label:"Live Event Intelligence",color:T.cyan,tagline:"What your audience said during the session is data. Let's read it.",services:[
    {name:"Zoom Session Signal Report",price:"$750 – $2,000",tag:"Standalone or Add-On",desc:"Upload your Zoom AI transcript and chat log and we run it through eCLIPPS to surface what your audience was actually saying, asking, and feeling in real time.",includes:["Full eCLIPPS Signal Report on session transcript + chat data","Top questions, objections, and unmet needs from the audience","Engagement quality analysis","Recommendations for your next session","Risk signals: confusion, disengagement, or trust breakdown patterns"],bestFor:"Coaches, consultants, educators, community leaders, corporate trainers, nonprofit program staff"},
    {name:"Engagement Question Library",price:"$297 – $597",tag:"Standalone Product",desc:"A curated library of substantive engagement prompts — organized by session type and topic — that generate real qualitative responses worth analyzing.",includes:["40–60 substantive engagement questions organized by category","Questions for: needs assessment, program feedback, readiness testing","Do/Don't guide for facilitation","Adaptation guide for your specific audience or topic area","Bonus: 5 closing questions that capture post-session sentiment"],bestFor:"Anyone who runs webinars, trainings, town halls, lives, or facilitated sessions"},
  ]},
  {id:"content",icon:"✍",label:"Content & Communications",color:T.amber,tagline:"Speak their language — because now you know what it is.",services:[
    {name:"Lexicon-Powered Content Strategy",price:"$750 – $2,000",tag:"Add-On",desc:"Take the exact words, phrases, and emotional patterns your community uses and build a 30–60 day content strategy around them.",includes:["30–60 day content calendar with themes and platform recommendations","10–15 content prompts using exact community language","Messaging dos and don'ts from the signal map","Sample captions or post frameworks for each theme"],bestFor:"Content creators, community managers, small businesses, social enterprises"},
    {name:"Campaign Messaging Guide",price:"$500 – $1,500",tag:"Add-On",desc:"Based on emotional drivers, trust level, and signal map in your report, we write the messaging framework for your next campaign.",includes:["3–5 headline/hook options with rationale","Emotional framing guide based on sentiment layers","Words and phrases to use and to avoid","One platform-specific copy sample (email, caption, or ad)"],bestFor:"Campaign launches, awareness initiatives, product or program announcements"},
    {name:"Stakeholder Communication Package",price:"$500 – $1,200",tag:"Add-On",desc:"The same findings. Three different audiences. Community-facing plain language, professional partner summary, and an executive brief.",includes:["Community-facing summary (accessible, warm, plain language)","Partner/collaborator brief (professional, 1 page)","Executive brief (data-forward, 90-second read)","Optional: talking points for a walkthrough call"],bestFor:"Organizations with boards, funders, staff, and community members"},
  ]},
  {id:"strategy",icon:"🗝",label:"Strategy & Program Design",color:T.green,tagline:"From signals to structure. From insight to initiative.",services:[
    {name:"Program Blueprint",price:"$1,500 – $3,500",tag:"Add-On or Standalone",desc:"Use your Opportunity Map, Readiness signals, and Action Orientation findings to draft a full program structure.",includes:["Program rationale grounded in signal data","Target participant description from community profile","Format recommendation with reasoning","Phased rollout plan (90-day and 6-month view)","Community engagement recommendations for launch"],bestFor:"Nonprofits designing new programs, course creators, community organizations"},
  ]},
  {id:"presentation",icon:"🎯",label:"Presentation & Delivery",color:T.orange,tagline:"Show the data. Tell the story. Move the room.",services:[
    {name:"Stakeholder Presentation Design",price:"$750 – $2,000",tag:"Add-On",desc:"We take your Signal Report and turn it into a presentation your audience will actually understand and remember.",includes:["10–15 slide deck from your report findings","Data visualization of key signals (bar charts, call-out quotes, signal maps)","Speaker notes for each slide","Executive-friendly summary slide"],bestFor:"Board presentations, funder meetings, community town halls, staff briefings"},
  ]},
];

const BUNDLES=[
  {name:"Community Intelligence Starter",tagline:"Your first report + grant narrative",price:"$2,000 – $3,500",color:T.violet,includes:["Full eCLIPPS Signal Report","Grant Needs Narrative","Stakeholder Communication Package"],savings:"Save $500 vs. individual pricing"},
  {name:"Event Intelligence Bundle",tagline:"Session analysis + follow-up strategy",price:"$1,200 – $2,500",color:T.cyan,includes:["Zoom Session Signal Report","Post-Session Prompt Pack","Lexicon-Powered Content Strategy"],savings:"Save $400 vs. individual pricing"},
  {name:"Full Voice-to-Strategy Package",tagline:"End-to-end from signal to action",price:"$4,000 – $7,000",color:T.green,includes:["Full eCLIPPS Signal Report","Program Blueprint","Campaign Messaging Guide","Stakeholder Presentation Design","60-day content strategy"],savings:"Best value — save $1,500+ vs. individual pricing"},
];

// Services ServiceCard Component
function ServiceCard({service,color,index}){
  const [open,setOpen]=useState(false);
  return (
    <div className="fade-up" style={{background:T.surface,border:`1px solid ${open?color+"60":T.border}`,borderRadius:14,marginBottom:12,overflow:"hidden",transition:"border-color .2s",animationDelay:`${index*.06}s`}}>
      <div onClick={()=>setOpen(!open)} style={{padding:"18px 22px",cursor:"pointer",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
            <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:600,color:T.text}}>{service.name}</div>
            <Tag color={color}>{service.tag}</Tag>
          </div>
          <div style={{fontSize:13,color:T.muted,lineHeight:1.5}}>{service.desc.slice(0,110)}…</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:14,fontWeight:700,color,marginBottom:6,whiteSpace:"nowrap"}}>{service.price}</div>
          <div style={{fontSize:16,color:T.muted,display:"inline-block",transform:open?"rotate(180deg)":"none",transition:"transform .2s"}}>⌄</div>
        </div>
      </div>
      {open&&(
        <div style={{padding:"0 22px 22px",borderTop:`1px solid ${T.border}`}}>
          <p style={{fontSize:14,color:T.text,lineHeight:1.75,margin:"16px 0"}}>{service.desc}</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div>
              <div style={{fontSize:11,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>What's Included</div>
              {service.includes.map((item,i)=>(
                <div key={i} style={{display:"flex",gap:8,marginBottom:7,alignItems:"flex-start"}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:color,marginTop:5,flexShrink:0}}/>
                  <span style={{fontSize:13,color:T.text,lineHeight:1.55}}>{item}</span>
                </div>
              ))}
            </div>
            <div style={{background:T.bg,borderRadius:10,padding:14}}>
              <div style={{fontSize:11,color:T.muted,textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>Best For</div>
              <p style={{fontSize:13,color:T.muted,lineHeight:1.6}}>{service.bestFor}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Services Tab
function ServicesTab({tab,setTab,visibleTabs}){
  const [activeIdx,setActiveIdx]=useState(0);
  const [showBundles,setShowBundles]=useState(false);
  const cat=CATEGORIES[activeIdx];
  const total=CATEGORIES.length;
  const goNext=()=>{if(activeIdx<total-1)setActiveIdx(activeIdx+1);else setShowBundles(true);};
  const goBack=()=>{if(showBundles)setShowBundles(false);else if(activeIdx>0)setActiveIdx(activeIdx-1);};
  const isFirst=activeIdx===0&&!showBundles;
  const isLast=showBundles;
  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        <div style={{width:190,background:T.surface,borderRight:`1px solid ${T.border}`,padding:"20px 0",flexShrink:0,display:"flex",flexDirection:"column",overflowY:"auto"}}>
          {CATEGORIES.map((c,i)=>(
            <button key={c.id} onClick={()=>{setActiveIdx(i);setShowBundles(false);}}
              style={{width:"100%",textAlign:"left",padding:"10px 18px",background:!showBundles&&activeIdx===i?c.color+"10":"none",border:"none",borderLeft:`3px solid ${!showBundles&&activeIdx===i?c.color:"transparent"}`,color:!showBundles&&activeIdx===i?c.color:T.muted,fontSize:13,cursor:"pointer",fontFamily:"'Inter',sans-serif",transition:"all .2s",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:14}}>{c.icon}</span><span style={{lineHeight:1.3}}>{c.label}</span>
            </button>
          ))}
          <div style={{borderTop:`1px solid ${T.border}`,margin:"8px 0"}}/>
          <button onClick={()=>setShowBundles(true)} style={{width:"100%",textAlign:"left",padding:"10px 18px",background:showBundles?T.amber+"10":"none",border:"none",borderLeft:`3px solid ${showBundles?T.amber:"transparent"}`,color:showBundles?T.amber:T.muted,fontSize:13,cursor:"pointer",fontFamily:"'Inter',sans-serif",transition:"all .2s",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>📦</span><span>Bundles</span>
          </button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"32px 36px"}}>
          {!showBundles&&(
            <div>
              <div style={{marginBottom:28}}>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:700,color:T.text,marginBottom:6}}>{cat.icon} {cat.label}</div>
                <div style={{fontSize:15,color:cat.color,fontStyle:"italic"}}>{cat.tagline}</div>
              </div>
              {cat.services.map((svc,i)=><ServiceCard key={i} service={svc} color={cat.color} index={i}/>)}
            </div>
          )}
          {showBundles&&(
            <div>
              <div style={{marginBottom:28}}>
                <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:26,fontWeight:700,color:T.text,marginBottom:6}}>📦 Service Bundles</div>
                <div style={{fontSize:15,color:T.muted,fontStyle:"italic"}}>Pre-packaged combinations for the most common client needs.</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                {BUNDLES.map((bundle,i)=>(
                  <div key={i} className="fade-up" style={{background:T.surface,border:`1px solid ${bundle.color}30`,borderRadius:14,padding:22,borderTop:`3px solid ${bundle.color}`,animationDelay:`${i*.06}s`}}>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:16,fontWeight:700,color:T.text,marginBottom:4}}>{bundle.name}</div>
                    <div style={{fontSize:12,color:T.muted,marginBottom:12}}>{bundle.tagline}</div>
                    <div style={{fontFamily:"'Space Grotesk',sans-serif",fontSize:20,fontWeight:700,color:bundle.color,marginBottom:16}}>{bundle.price}</div>
                    {bundle.includes.map((item,j)=>(
                      <div key={j} style={{display:"flex",gap:8,marginBottom:6,alignItems:"flex-start"}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:bundle.color,marginTop:5,flexShrink:0}}/>
                        <span style={{fontSize:13,color:T.text,lineHeight:1.5}}>{item}</span>
                      </div>
                    ))}
                    <div style={{marginTop:14,padding:"8px 12px",background:bundle.color+"10",borderRadius:8,fontSize:12,color:bundle.color,fontWeight:500}}>{bundle.savings}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{borderTop:`1px solid ${T.border}`,padding:"10px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",background:T.surface2,flexShrink:0}}>
        <GhostBtn onClick={goBack} style={{opacity:isFirst?.3:1}}>← {!showBundles&&activeIdx>0?CATEGORIES[activeIdx-1].label:showBundles?"Back":"Back"}</GhostBtn>
        <WorkspaceNavBar tab={tab} setTab={setTab} visibleTabs={visibleTabs}/>
        <GhostBtn onClick={goNext} style={{opacity:isLast?.3:1}}>{!showBundles&&activeIdx<total-1?CATEGORIES[activeIdx+1].label:!showBundles?"Bundles":"Done"} →</GhostBtn>
      </div>
    </div>
  );
}

// ── Main ECLIPPSApp ───────────────────────────────────────────────────────────
export default function ECLIPPSApp() {
  // ── Auth state ──
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // ── App state ──
  const [screen, setScreen] = useState("workspace"); // workspace | processing | library
  const [tab, setTab] = useState("home");
  const [session, setSession] = useState(null);
  const [folders, setFolders] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [ag, setAg] = useState({});
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [err, setErr] = useState("");
  const [showNewAnalysis, setShowNewAnalysis] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState(null);
  const [longitudinalIds, setLongitudinalIds] = useState(null);

  // ── Init: restore Supabase session on load, and stay in sync with auth state ──
  useEffect(() => {
    let active = true;

    const restore = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && active) {
        const profile = await fetchProfile(session.user);
        if (profile && profile.status !== "suspended" && active) setUser(profile);
      }
      if (active) setAuthReady(true);
    };
    restore();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) { setUser(null); return; }
      const profile = await fetchProfile(session.user);
      if (profile && profile.status !== "suspended") setUser(profile);
    });

    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  // ── Load user data after login ──
  useEffect(() => {
    if (!user) return;
    const f = loadFolders(user.id);
    setFolders(f);
    setSessions(loadSessions(user.id));
    const savedAg = sGet(`eclipps_ag_${user.id}`, {});
    setAg(savedAg);
    setSession(newSession());
  }, [user]);

  // ── Persist ag ──
  useEffect(() => {
    if (user && Object.keys(ag).length > 0) sSet(`eclipps_ag_${user.id}`, ag);
  }, [ag, user]);

  // ── Copy protection for Free tier ──
  useEffect(() => {
    if (user?.tier === "free") {
      const noop = e => e.preventDefault();
      document.addEventListener("contextmenu", noop);
      document.addEventListener("copy", noop);
      document.body.classList.add("no-select");
      return () => {
        document.removeEventListener("contextmenu", noop);
        document.removeEventListener("copy", noop);
        document.body.classList.remove("no-select");
      };
    }
  }, [user?.tier]);

  // ── Persist session ──
  const saveSession = useCallback((sess) => {
    if (user && sess) persistSession(sess, user.id);
  }, [user]);

  const updateSession = useCallback((updater) => {
    setSession(prev => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      saveSession(next);
      return next;
    });
  }, [saveSession]);

  // ── Stripe webhook simulation endpoint ──
  // In production: POST /api/stripe-webhook
  // { event: "checkout.session.completed", username, email, tier, stripeCustomerId }
  // → creates/updates user in Vercel KV with correct tier and status:"active"
  // { event: "customer.subscription.deleted", username }
  // → sets status:"suspended" in Vercel KV

  // ── Auth handlers ──
  const handleLogin = (u) => { setUser(u); };
  const handleLogout = async () => { await supabase.auth.signOut(); setUser(null); setSession(null); setTab("home"); };
  const handlePasswordChange = async (newPw) => {
    const { error } = await supabase.auth.updateUser({ password: newPw });
    return error ? { error: error.message } : { error: null };
  };

  // ── Session handlers ──
  const handleRun = async () => {
    if (!session?.sourceItems?.length) return;
    setScreen("processing"); setPhaseIdx(0);
    const phaseTimer = setInterval(() => setPhaseIdx(i => i < PHASES.length - 1 ? i + 1 : i), 2800);
    const b = session.brief;
    const orgTone = TONE_NOTES[b.orgTypes?.[0]] || "";
    const industryCtx = b.industry ? `Industry context: ${INDUSTRIES.find(i => i.id === b.industry)?.label || b.industry}. ` : "";
    const mirrorCtx = b.useMirrorAudience && b.mirrorSource ? `Mirror audience included: ${b.mirrorSource} (${b.mirrorPlatform || "unspecified platform"}). Incorporate mirror audience signals where relevant. ` : "";
    const timingWording = TIMING_MODES.find(m => m.id === b.timingMode)?.wording || "";
    const sources = session.sourceItems.map(s => `[SOURCE: ${s.label}]\n${s.content}`).join("\n\n---\n\n");
    const systemPrompt = `You are eCLIPPS — a community intelligence analyst. ${industryCtx}${mirrorCtx}${orgTone} ${timingWording} Analyze the community data provided and return ONLY valid JSON.`;
    const briefLines = [
      b.clientName && `Client: ${b.clientName}`,
      b.clientOrg && `Organization: ${b.clientOrg}`,
      b.industry && `Industry: ${b.industry}`,
      b.audience && `Audience: ${b.audience}`,
      b.community && `Community: ${b.community}`,
      b.missionGoals && `Mission/Goals: ${b.missionGoals}`,
      b.listeningObjective && `Listening Objectives: ${b.listeningObjective}`,
      b.specificQuestions && `Specific Questions: ${b.specificQuestions}`,
      b.knownContext && `Known Context: ${b.knownContext}`,
      b.excavationSites && `Excavation Sites: ${b.excavationSites}`,
    ].filter(Boolean).join("\n");

    const userPrompt = `ENGAGEMENT BRIEF:\n${briefLines}\n\nCOMMUNITY DATA:\n${sources}\n\nReturn JSON with keys: summary, noise_note, community_fingerprint {who_they_are, dominant_mood, awareness_stage, sophistication, data_appears}, signal_map [{signal, signal_type, frequency, prioritization_score, what_it_reveals}], sentiment_layers {surface, underlying, trust_level, emotional_drivers[]}, problems {explicit[], implicit[], fears[]}, readiness {community_momentum, ready_for[], not_ready_for[]}, action_orientation {community_engagement[], leadership_options[], preferred_format}, risk_signals [{risk, severity, what_it_means}], opportunity_map {content[], program[], product[], advocacy[], partnership[], resource[]}, lexicon [{phrase, signals}], supporting_resources [{title, source, url, relevance}]`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] })
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      clearInterval(phaseTimer);
      updateSession(prev => ({ ...prev, report: parsed }));
      setScreen("workspace"); setTab("report");
    } catch (e) {
      clearInterval(phaseTimer);
      setErr("Report generation encountered an error. Please check your sources and try again.");
      setScreen("error");
    }
  };

  const handleNewAnalysisClick = () => {
    const s = session;
    const hasData = s && (s.report || s.sourceItems?.length || s.brief?.clientName || s.brief?.reportName);
    if (hasData) setShowNewAnalysis(true);
    else setSession(newSession());
  };

  const handleNewAnalysisConfirm = (newSess) => {
    setSession(newSess); setShowNewAnalysis(false); setTab("home");
  };

  const createNewFolder = () => {
    const f = { id: genId(), name: "New Folder", color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length], created: todayISO() };
    const updated = [...folders, f];
    setFolders(updated);
    saveFolders(user.id, updated);
  };

  const openSession = (sessId) => {
    const sess = loadSession(user.id, sessId);
    if (sess) { setSession(sess); setScreen("workspace"); setTab("report"); }
  };

  const handleDownloadFull = () => {
    if (user?.tier === "admin") dlRTF(session, { analystGlobal: ag }, `${session.brief.reportName || "eCLIPPS"}_full.rtf`, "internal");
    else setUpgradeModal({ feature: "Full Report Download", requiredTier: "analyst" });
  };

  const handleUpgrade = (feature, requiredTier) => setUpgradeModal({ feature, requiredTier });

  // ── Visible tabs for this user ──
  const visibleTabs = TABS.filter(t => {
    if (t.adminOnly && user?.tier !== "admin") return false;
    return true;
  });

  // ── Auth gate ──
  if (!authReady) return null;
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  // ── Processing screen ──
  if (screen === "processing") {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, color: T.text, fontFamily: "'Inter',sans-serif" }}>
        <style>{CSS}</style>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 30, fontWeight: 700, marginBottom: 48 }}><span style={{ color: T.cyan }}>e</span>CLIPPS</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 48, flexWrap: "wrap", justifyContent: "center" }}>
          {PHASES.map((p, i) => (
            <div key={p.id} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 500, padding: "7px 16px", borderRadius: 8, background: i === phaseIdx ? T.cyan + "18" : T.surface, border: `1.5px solid ${i === phaseIdx ? T.cyan : T.border}`, color: i === phaseIdx ? T.cyan : T.dim, transition: "all .5s ease" }}>{p.id}</div>
          ))}
        </div>
        <div className="phase-label" key={phaseIdx} style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 600, color: T.cyan, marginBottom: 8 }}>{PHASES[phaseIdx].full}</div>
          <div style={{ fontSize: 14, color: T.muted }}>{PHASES[phaseIdx].desc}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[0, .2, .4].map((d, i) => <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: T.cyan, animation: `blink 1.4s ease-in-out ${d}s infinite` }} />)}
        </div>
      </div>
    );
  }

  // ── Error screen ──
  if (screen === "error") {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, fontFamily: "'Inter',sans-serif" }}>
        <style>{CSS}</style>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, color: T.text, marginBottom: 32 }}><span style={{ color: T.cyan }}>e</span>CLIPPS</div>
        <div style={{ background: T.red + "15", border: `1px solid ${T.red}40`, borderRadius: 10, padding: "16px 24px", maxWidth: 480, marginBottom: 24, fontSize: 13, color: T.red }}>⚠ {err}</div>
        <Btn onClick={() => { setScreen("workspace"); setTab("brief"); }} color={T.cyan}>← Back to Brief</Btn>
      </div>
    );
  }

  // ── Workspace ──
  const client = [session?.brief?.clientName, session?.brief?.clientOrg].filter(Boolean).join(" — ");
  const rname = session?.brief?.reportName || "New Analysis";

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Inter',sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{CSS}</style>

      {/* Modals */}
      {upgradeModal && <UpgradeModal feature={upgradeModal.feature} requiredTier={upgradeModal.requiredTier} onClose={() => setUpgradeModal(null)} />}
      {showNewAnalysis && <NewAnalysisModal folders={folders} currentSession={session} onConfirm={handleNewAnalysisConfirm} onCancel={() => setShowNewAnalysis(false)} />}
      {longitudinalIds && (
        <LongitudinalModal
          sessionIds={longitudinalIds}
          userId={user.id}
          user={user}
          onClose={() => setLongitudinalIds(null)}
          onUpgrade={handleUpgrade}
        />
      )}

      {/* Header */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 20, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setTab("archive")} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "5px 12px", color: T.muted, cursor: "pointer", fontSize: 12, fontFamily: "'Inter',sans-serif" }}>🗂 Archive</button>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700 }}><span style={{ color: T.cyan }}>e</span>CLIPPS</span>
          <TierBadge tier={user?.tier} />
          <span style={{ fontSize: 12, color: T.muted, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rname}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={handleNewAnalysisClick} style={{ background: "none", border: `1px solid ${T.cyan}40`, borderRadius: 7, padding: "7px 14px", color: T.cyan, cursor: "pointer", fontSize: 12, fontFamily: "'Inter',sans-serif", fontWeight: 500 }}>＋ New Analysis</button>
          <button onClick={handleLogout} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 7, padding: "7px 14px", color: T.muted, cursor: "pointer", fontSize: 12, fontFamily: "'Inter',sans-serif" }}>Sign Out</button>
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 180, background: T.surface, borderRight: `1px solid ${T.border}`, padding: "20px 0", flexShrink: 0, position: "sticky", top: 57, height: "calc(100vh - 57px)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {visibleTabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ width: "100%", textAlign: "left", padding: "11px 20px", background: tab === t.id ? (t.adminOnly ? T.red + "10" : T.cyan + "10") : "none", border: "none", borderLeft: `3px solid ${tab === t.id ? (t.adminOnly ? T.red : T.cyan) : "transparent"}`, color: tab === t.id ? (t.adminOnly ? T.red : T.cyan) : T.muted, fontSize: 13, cursor: "pointer", fontFamily: "'Inter',sans-serif", transition: "all .2s", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
            </button>
          ))}
          <div style={{ flexGrow: 1 }} />
          {client && <div style={{ margin: "0 16px 16px", padding: 10, background: T.dim, borderRadius: 8, fontSize: 11, color: T.muted }}>
            <div style={{ color: T.text, fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{client}</div>
            {session?.sourceItems?.length > 0 && <div>{session.sourceItems.length} source{session.sourceItems.length > 1 ? "s" : ""}</div>}
          </div>}
          <div style={{ margin: "0 16px 16px", padding: "8px 10px", background: T.dim, borderRadius: 8, fontSize: 11, color: T.muted }}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.username}</div>
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", maxHeight: "calc(100vh - 57px)" }}>
          {tab === "services" ? (
            <ServicesTab tab={tab} setTab={setTab} visibleTabs={visibleTabs} />
          ) : (
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: tab === "admin" || tab === "archive" || tab === "consulting" ? "28px 36px" : "28px 36px" }}>
                {tab === "home"       && session && <HomeTab onGetStarted={() => setTab("brief")} user={user} />}
                {tab === "brief"      && session && <BriefTab session={session} onUpdate={updateSession} folders={folders} onRun={handleRun} user={user} />}
                {tab === "signals"    && <SignalsTab report={session?.report} user={user} onUpgrade={handleUpgrade} />}
                {tab === "report"     && session && <ReportTab session={session} ag={ag} user={user} onUpgrade={handleUpgrade} />}
                {tab === "companions" && session && <CompanionsTab session={session} onUpdate={updateSession} user={user} onUpgrade={handleUpgrade} />}
                {tab === "graphs"     && session && <GraphsTab session={session} onUpdate={updateSession} user={user} onUpgrade={handleUpgrade} />}
                {tab === "archive"    && <ArchiveTab userId={user.id} onOpenSession={openSession} onLongitudinal={(ids) => setLongitudinalIds(ids)} folders={folders} onFoldersChange={(updated) => { setFolders(updated); saveFolders(user.id, updated); }} />}
                {tab === "guide"      && <UserGuideTab user={user} />}
                {tab === "settings"   && <SettingsTab ag={ag} setAg={setAg} user={user} onPasswordChange={handlePasswordChange} />}
                {tab === "admin"      && user?.tier === "admin" && <AdminTab currentUser={user} />}
                {tab === "consulting" && session && <ConsultingTab user={user} onUpgrade={handleUpgrade} />}
              </div>
              <WorkspaceNavBar tab={tab} setTab={setTab} visibleTabs={visibleTabs} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
