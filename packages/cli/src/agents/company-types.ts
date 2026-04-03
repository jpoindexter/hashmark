/**
 * Company Type Presets
 *
 * Each preset defines which agent roles to generate for a given company type.
 * The wizard presents these options and the user picks one (or Custom).
 */

import type { Department } from "./role-templates.js";

export interface AgentRole {
  id: string;
  title: string;
  description: string;
  department: Department;
}

export interface CompanyPreset {
  id: string;
  label: string;
  hint: string;
  roles: AgentRole[];
}

// ---------------------------------------------------------------------------
// Role definitions (used across multiple presets)
// ---------------------------------------------------------------------------

const ROLES = {
  // Engineering
  frontendDev:         { id: "frontend-developer",       title: "Frontend Developer",         description: "React/Next.js components, UI, styling, client-side features",                    department: "engineering" as Department },
  backendArch:         { id: "backend-architect",        title: "Backend Architect",           description: "API routes, server-side logic, auth, data fetching, integrations",              department: "engineering" as Department },
  dbArch:              { id: "database-architect",       title: "Database Architect",          description: "Schema design, migrations, query optimization, indexing",                        department: "engineering" as Department },
  devops:              { id: "devops-automator",         title: "DevOps Automator",            description: "CI/CD, deployments, GitHub Actions, infrastructure, releases",                   department: "engineering" as Department },
  security:            { id: "security-engineer",        title: "Security Engineer",           description: "Auth review, API hardening, secrets, OWASP compliance",                         department: "engineering" as Department },
  aiEng:               { id: "ai-engineer",              title: "AI Engineer",                 description: "LLM integrations, prompt engineering, AI features, agent systems",               department: "engineering" as Department },
  sre:                 { id: "sre",                      title: "Site Reliability Engineer",   description: "Uptime, incident response, performance monitoring, on-call",                     department: "engineering" as Department },
  testEng:             { id: "test-results-analyzer",    title: "Test Engineer",               description: "Test coverage, failure analysis, flaky tests, QA strategy",                     department: "engineering" as Department },
  perfEng:             { id: "performance-benchmarker",  title: "Performance Engineer",        description: "Core Web Vitals, bundle size, load time, query performance",                     department: "engineering" as Department },
  prototyper:          { id: "rapid-prototyper",         title: "Rapid Prototyper",            description: "MVPs and proof-of-concepts fast — speed over perfection",                        department: "engineering" as Department },
  // Product
  pm:                  { id: "product-manager",          title: "Product Manager",             description: "Roadmap, feature scoping, requirements, success metrics",                        department: "product" as Department },
  sprintPrioritizer:   { id: "sprint-prioritizer",       title: "Sprint Prioritizer",          description: "Sprint planning, backlog grooming, effort estimation",                           department: "product" as Department },
  uxDesigner:          { id: "ux-designer",              title: "UX Designer",                 description: "User flows, wireframes, interaction design, usability reviews",                  department: "product" as Department },
  uxResearcher:        { id: "ux-researcher",            title: "UX Researcher",               description: "User interviews, usability testing, friction identification",                     department: "product" as Department },
  feedbackSynth:       { id: "feedback-synthesizer",     title: "Feedback Synthesizer",        description: "User feedback aggregation, support ticket patterns, churn signals",              department: "product" as Department },
  // Design
  uiDesigner:          { id: "ui-designer",              title: "UI Designer",                 description: "Visual design, component specs, design system, color, typography",               department: "design" as Department },
  brandGuardian:       { id: "brand-guardian",           title: "Brand Guardian",              description: "Brand consistency, voice and tone, visual identity enforcement",                  department: "design" as Department },
  visualStoryteller:   { id: "visual-storyteller",       title: "Visual Storyteller",          description: "Marketing visuals, presentations, demo screenshots, social graphics",            department: "design" as Department },
  assetExporter:       { id: "asset-exporter",           title: "Asset Exporter",              description: "Design-to-dev handoff, naming conventions, export formats",                      department: "design" as Department },
  // Marketing
  growthHacker:        { id: "growth-hacker",            title: "Growth Hacker",               description: "Acquisition experiments, conversion optimization, growth model",                 department: "marketing" as Department },
  contentCreator:      { id: "content-creator",          title: "Content Creator",             description: "Blog posts, tutorials, case studies, documentation, newsletters",                department: "marketing" as Department },
  seoOptimizer:        { id: "seo-optimizer",            title: "SEO Optimizer",               description: "Keyword research, on-page SEO, technical SEO, content gaps",                    department: "marketing" as Department },
  socialMedia:         { id: "social-media-manager",     title: "Social Media Manager",        description: "Twitter/X, LinkedIn, Reddit, Product Hunt, community building",                  department: "marketing" as Department },
  copywriter:          { id: "copywriter",               title: "Copywriter",                  description: "Landing page copy, emails, headlines, CTAs, microcopy",                          department: "marketing" as Department },
  adCreative:          { id: "ad-creative-designer",     title: "Ad Creative Designer",        description: "Paid ad concepts, creative briefs, video scripts, Meta/Google/LinkedIn",         department: "marketing" as Department },
  // Sales
  leadQualifier:       { id: "lead-qualifier",           title: "Lead Qualifier",              description: "BANT qualification, ICP scoring, pipeline health",                               department: "sales" as Department },
  proposalWriter:      { id: "proposal-writer",          title: "Proposal Writer",             description: "Sales proposals, SOWs, custom pitch decks",                                      department: "sales" as Department },
  pitchDeck:           { id: "pitch-deck-builder",       title: "Pitch Deck Builder",          description: "Investor decks, partnership proposals, sales presentations",                      department: "sales" as Department },
  pipelineTracker:     { id: "pipeline-tracker",         title: "Pipeline Tracker",            description: "Deal health, forecasting, stall identification, win/loss",                       department: "sales" as Department },
  followUp:            { id: "follow-up-agent",          title: "Follow-Up Agent",             description: "Post-demo sequences, ghosted lead re-engagement, nurture emails",                department: "sales" as Department },
  // Operations
  financeTracker:      { id: "finance-tracker",          title: "Finance Tracker",             description: "MRR/ARR, burn rate, runway, billing operations, forecasting",                    department: "operations" as Department },
  analyticsReporter:   { id: "analytics-reporter",       title: "Analytics Reporter",          description: "Product metrics, KPI dashboards, funnel analysis, A/B results",                  department: "operations" as Department },
  projectTracker:      { id: "project-tracker",          title: "Project Tracker",             description: "Milestones, deadlines, RACI, status reports, retros",                            department: "operations" as Department },
  legalCompliance:     { id: "legal-compliance-checker", title: "Legal Compliance Checker",    description: "Privacy policy, GDPR/CCPA, data handling, third-party compliance",               department: "operations" as Department },
  infraMaintainer:     { id: "infrastructure-maintainer",title: "Infrastructure Maintainer",   description: "Dependency updates, cost monitoring, database health, runbooks",                 department: "operations" as Department },
  supportResponder:    { id: "support-responder",        title: "Support Responder",           description: "User support, bug triage, refunds, proactive outreach",                          department: "operations" as Department },
  // PR
  pressRelease:        { id: "press-release-writer",     title: "Press Release Writer",        description: "Press releases, funding announcements, product launch media",                    department: "pr" as Department },
  crisisResponder:     { id: "crisis-responder",         title: "Crisis Responder",            description: "Incidents, bad press, social media crises, holding statements",                  department: "pr" as Department },
  journalistOutreach:  { id: "journalist-outreach",      title: "Journalist Outreach",         description: "Media pitches, beat reporter targeting, press relationships",                     department: "pr" as Department },
  mediaMonitor:        { id: "media-monitor",            title: "Media Monitor",               description: "Press mentions, competitive coverage, reputation tracking",                       department: "pr" as Department },
};

// ---------------------------------------------------------------------------
// Company presets
// ---------------------------------------------------------------------------

export const COMPANY_PRESETS: CompanyPreset[] = [
  {
    id: "saas",
    label: "SaaS / Tech Startup",
    hint: "software product, subscription revenue",
    roles: [
      ROLES.frontendDev, ROLES.backendArch, ROLES.dbArch, ROLES.devops,
      ROLES.security, ROLES.testEng, ROLES.sre,
      ROLES.pm, ROLES.sprintPrioritizer, ROLES.uxDesigner, ROLES.feedbackSynth,
      ROLES.uiDesigner, ROLES.brandGuardian,
      ROLES.growthHacker, ROLES.contentCreator, ROLES.seoOptimizer, ROLES.copywriter,
      ROLES.leadQualifier, ROLES.proposalWriter, ROLES.pipelineTracker,
      ROLES.financeTracker, ROLES.analyticsReporter, ROLES.supportResponder, ROLES.legalCompliance,
    ],
  },
  {
    id: "agency",
    label: "Agency",
    hint: "client services, project-based work",
    roles: [
      ROLES.pm, ROLES.projectTracker, ROLES.sprintPrioritizer,
      ROLES.uiDesigner, ROLES.uxDesigner, ROLES.visualStoryteller, ROLES.brandGuardian, ROLES.assetExporter,
      ROLES.copywriter, ROLES.contentCreator, ROLES.adCreative,
      ROLES.proposalWriter, ROLES.pitchDeck, ROLES.followUp, ROLES.pipelineTracker,
      ROLES.analyticsReporter, ROLES.financeTracker, ROLES.supportResponder,
    ],
  },
  {
    id: "social-media-agency",
    label: "Social Media Agency",
    hint: "content, influencer, paid social",
    roles: [
      ROLES.socialMedia, ROLES.contentCreator, ROLES.copywriter, ROLES.adCreative, ROLES.seoOptimizer,
      ROLES.visualStoryteller, ROLES.brandGuardian, ROLES.uiDesigner, ROLES.assetExporter,
      ROLES.analyticsReporter, ROLES.projectTracker,
      ROLES.proposalWriter, ROLES.pitchDeck, ROLES.pipelineTracker, ROLES.followUp,
      ROLES.pressRelease, ROLES.crisisResponder,
    ],
  },
  {
    id: "design-studio",
    label: "Design Studio",
    hint: "brand identity, product design, visual work",
    roles: [
      ROLES.uiDesigner, ROLES.uxDesigner, ROLES.uxResearcher, ROLES.brandGuardian,
      ROLES.visualStoryteller, ROLES.assetExporter,
      ROLES.pm, ROLES.projectTracker, ROLES.feedbackSynth,
      ROLES.copywriter, ROLES.contentCreator,
      ROLES.proposalWriter, ROLES.pitchDeck, ROLES.pipelineTracker, ROLES.followUp,
      ROLES.financeTracker, ROLES.supportResponder,
    ],
  },
  {
    id: "sales-org",
    label: "Sales Organization",
    hint: "outbound, account management, revenue focus",
    roles: [
      ROLES.leadQualifier, ROLES.proposalWriter, ROLES.pitchDeck,
      ROLES.pipelineTracker, ROLES.followUp,
      ROLES.copywriter, ROLES.adCreative, ROLES.contentCreator,
      ROLES.analyticsReporter, ROLES.financeTracker, ROLES.projectTracker,
      ROLES.pressRelease, ROLES.crisisResponder,
    ],
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    hint: "online store, DTC, marketplace",
    roles: [
      ROLES.growthHacker, ROLES.contentCreator, ROLES.seoOptimizer,
      ROLES.socialMedia, ROLES.copywriter, ROLES.adCreative,
      ROLES.analyticsReporter, ROLES.financeTracker,
      ROLES.supportResponder, ROLES.legalCompliance,
      ROLES.uiDesigner, ROLES.visualStoryteller, ROLES.assetExporter,
      ROLES.pressRelease, ROLES.crisisResponder,
    ],
  },
  {
    id: "ai-product",
    label: "AI Product",
    hint: "LLM-powered product, AI-first features",
    roles: [
      ROLES.frontendDev, ROLES.backendArch, ROLES.dbArch, ROLES.aiEng,
      ROLES.devops, ROLES.security, ROLES.sre, ROLES.perfEng, ROLES.prototyper,
      ROLES.pm, ROLES.sprintPrioritizer, ROLES.uxDesigner, ROLES.uxResearcher, ROLES.feedbackSynth,
      ROLES.uiDesigner, ROLES.brandGuardian,
      ROLES.growthHacker, ROLES.contentCreator, ROLES.copywriter,
      ROLES.analyticsReporter, ROLES.financeTracker, ROLES.supportResponder,
    ],
  },
  {
    id: "custom",
    label: "Custom",
    hint: "pick your own roles",
    roles: [], // populated by wizard
  },
];

export function getPresetById(id: string): CompanyPreset | undefined {
  return COMPANY_PRESETS.find(p => p.id === id);
}
