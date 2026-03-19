# Warp Terminal -- Exhaustive UX/Feature Audit

**App version**: v0.2026.03.04.08.20.stable_04
**Bundle ID**: dev.warp.Warp-Stable
**Binary**: Native Rust (single binary: `stable`, arm64 Mach-O)
**Company**: Denver Technologies, Inc (2025)
**Category**: Developer Tools (public.app-category.developer-tools)
**URL scheme**: `warp://`
**Frameworks**: Sentry (crash reporting)
**Supports**: ChatGPT "Work With Apps" integration (`SUPPORTS_CHAT_GPT_WORK_WITH_APPS: true`)

---

## 1. APP ARCHITECTURE

### Binary structure
- Single native Rust binary (`Contents/MacOS/stable`), no Electron/web views
- Sentry.framework bundled for crash reporting
- DockTilePlugin for custom dock icons (WarpDockTilePlugin.docktileplugin)
- `oz` CLI binary bundled at `Contents/Resources/bin/oz`
- Skills system at `Contents/Resources/skills/`

### Supported document types (registered in Info.plist)
- Folders (`public.folder`) -- role: Editor
- Shell scripts (`com.apple.terminal.shell-script`) -- role: Shell
- Unix executables (`public.unix-executable`) -- role: Shell
- Markdown files (`net.daringfireball.markdown`, `public.markdown`, etc.) -- role: Editor

### macOS system services
- "New Warp Tab Here" -- opens a terminal tab at selected file path
- "New Warp Window Here" -- opens a terminal window at selected file path
- Both accept filenames/plain-text from Finder or other apps

### System permissions declared
- AppleScript, Calendar, Camera, Contacts, Location, Microphone, Photo Library
- All phrased as "A program in Warp wants to use..."

### Data storage
- Preferences: `~/Library/Preferences/dev.warp.Warp-Stable.plist` (binary plist)
- App support: `~/Library/Application Support/dev.warp.Warp-Stable/` (network log)
- Cache: `~/Library/Caches/dev.warp.Warp-Stable/` (async log)
- No `~/.warp/` directory (despite being a common expectation)

---

## 2. AI / AGENT ARCHITECTURE

### Multi-Model AI System

Warp's `GetFeatureModelChoices` GraphQL query reveals 5 distinct AI feature categories, each with independent model selection:

| Feature Category | Purpose |
|---|---|
| `agentMode` | Full agentic coding within the terminal |
| `planning` | Planning/reasoning before execution |
| `coding` | Code generation and editing |
| `cliAgent` | CLI-based agent mode (headless) |
| `computerUseAgent` | Computer use / browser automation agent |

Each model choice exposes:
- `displayName`, `baseModelName`, `id`
- `reasoningLevel` (thinking depth)
- `usageMetadata` with `creditMultiplier` and `requestMultiplier`
- `description`, `disableReason`
- `visionSupported` (boolean)
- `spec` with `cost`, `quality`, `speed` ratings
- `provider` (which AI company)
- `hostConfigs` with `enabled` and `modelRoutingHost`
- `onboardingInfo` with `title` and `description`
- `preferredCodexModelId` per category

### AI Request Quotas and Limits

From `GetRequestLimitInfo`:
- `requestLimit` / `requestsUsedSinceLastRefresh` / `requestLimitRefreshDuration`
- `isUnlimited` flag
- Separate limits for:
  - **Autosuggestions**: `isUnlimitedAutosuggestions`, `acceptedAutosuggestionsLimit`
  - **Voice**: `isUnlimitedVoice`, `voiceRequestLimit`, `voiceTokenLimit`
  - **Codebase indices**: `isUnlimitedCodebaseIndices`, `maxCodebaseIndices`, `maxFilesPerRepo`
  - `embeddingGenerationBatchSize`
  - `requestLimitPooling` (team pooling)
- Bonus grants system with `costCents`, `expiration`, `grantType`, `reason`, credits tracking
- Monthly spending tracking: `currentMonthCreditsPurchased`, `currentMonthSpendCents`
- Cycle history with `was_quota_exceeded` and `banner_state.dismissed`

### Input Modes (UDI -- Unified Developer Input)

The telemetry reveals a "Unified Developer Input" system with mode switching:
- **Shell mode**: Standard terminal input
- **AI mode**: Natural language input
- `AgentMode.ChangedInputType` event tracks switches
- `is_udi_enabled` flag
- `Input.AtMenuInteracted` -- an "@" menu for context/file references
- Default input prompt in AI mode: "Run a command..."

### Agent Mode

- `EnteredAgentModeNumTimes` tracked (user had entered 54 times)
- `AgentView.Entered` event with `origin: "ambient_agent"` and `did_auto_trigger_request`
- `AmbientAgent.CloudMode.Entered` with entry points: `oz_launch_modal`, `new_tab`
- `ShouldShowAgentModeCodingReadPermissionsNudge` -- permissions model for file access
- `HasShownAgentModeProfileCommandAutoexecutionSpeedbump` -- confirmation before auto-running
- `ShouldAddAgentModeChip` -- UI chip/badge for agent mode

### Codebase Indexing

- `Active Indexed Repos Changed` event
- `hit_max_indices` and `updated_number_of_codebase_indices` tracked
- Per-repo file limits (`maxFilesPerRepo`)
- Embedding generation with configurable batch size

---

## 3. TERMINAL FEATURES

### Block-Based Terminal

Every command execution creates a discrete "block" (evidenced by `active_block_id: "precmd-17739083282254-1"` in telemetry). Blocks are identified by terminal session ID + sequence number.

### Shell Support

From bootstrap telemetry:
- Shells: zsh (version 5.9 observed), supports bash
- `is_ssh`, `is_wsl`, `is_msys2`, `is_subshell` detection
- `was_triggered_by_rc_file` tracking
- Bootstrap timing: ~1.2s total, ~0.2s Warp-attributed, ~1.0s rcfiles
- Imports settings from iTerm (`terminal_type: "ITerm"`)

### Tab System

- `Tab Creation` event tracked
- Tabs as primary navigation unit
- Each tab can contain its own terminal session or agent view
- Supports multiple PTY sessions per window (evidenced by multiple `Pty Spawned` events in `TerminalServer` mode)

### Command Search / Command Palette

- `Command Search Async Query Completed` event
- Filters include `Repos` (searching across connected repositories)
- Async query architecture (non-blocking search)

---

## 4. CLOUD FEATURES (OZ PLATFORM)

### Cloud Agents

Warp runs a cloud agent platform called "Oz":
- REST API at `app.warp.dev/api/v1/agent/`
- CLI binary bundled as `oz` (at `Contents/Resources/bin/oz`)
- Cloud agent tasks: `GET /api/v1/agent/tasks?limit=100&creator={userId}`
- Spawn agents: `POST /api/v1/agent/run`
- Agent runs: `GET /api/v1/agent/runs/{runId}`

### Cloud Environments

From `GetCloudEnvironmentsQuery`:
- Docker-based environments with `setupCommands`, `name`, `githubRepos`, `dockerImage`
- Creator/editor tracking with `uid`, `photoUrl`, `email`, `displayName`
- Scoped to User or Team
- Pre-built images: `warpdotdev/dev-base`, `dev-go`, `dev-rust`, `dev-java`, `dev-dotnet`, `dev-ruby`, `dev-web`, `dev-full`
- `-agents` tagged variants include pre-installed coding CLIs

### Third-Party CLI Integration

Cloud agents can delegate to:
| CLI | Auth | Non-Interactive |
|---|---|---|
| Claude Code | `ANTHROPIC_API_KEY` | `claude -p` |
| Codex | `OPENAI_API_KEY` | `codex exec` |
| Gemini CLI | `GEMINI_API_KEY` | `gemini -p` |
| Amp | `AMP_API_KEY` | `amp -x` |
| Copilot CLI | `GH_TOKEN` | `copilot -p` |
| OpenCode | Provider-specific | `opencode run` |
| Droid (Factory) | Interactive only | `droid exec` |

Artifact reporting: `report_pr` tool registers PRs/branches back to Warp UI.

### Secrets Management

- `secret create` / per-team secrets
- Pre-built regex patterns for secret detection:
  - AWS Access ID, Google API Key, GitHub PATs (classic, fine-grained, OAuth, user-to-server, server-to-server)
  - Stripe keys, Firebase Auth Domain, JWT, OpenAI API Key, Anthropic API Key
  - Generic SK API Key, Fireworks API Key, Warp API Key
  - IPv4/IPv6 addresses, MAC addresses, phone numbers, Slack App Tokens

### Scheduling

- Cron-based scheduling: `schedule create --cron "0 8 * * *"`
- `schedule list` / `schedule get`

### GitHub Integration

From `UserGithubInfo` query:
- GitHub account connection with OAuth flow
- `installedRepos` with `owner`, `repo`, `isPublic`
- GitHub App installation link
- Auth URL and transaction ID for OAuth
- GitHub Actions integration via `warpdotdev/oz-agent-action@main`

### SDKs

- TypeScript SDK: `oz-agent-sdk` on npm (github.com/warpdotdev/oz-sdk-typescript)
- Python SDK: `oz-agent-sdk` on PyPI (github.com/warpdotdev/oz-sdk-python)

---

## 5. WARP DRIVE (Cloud Sync)

### Object System

From `BulkCreateObjects` and `UpdateGenericStringObject` mutations:
- Objects stored as `GenericStringObject` with:
  - `format`: "JsonPreference" for settings
  - `serializedModel`: JSON string with `storage_key`, `value`, `platform`
  - `uniquenessKey` with `key` (e.g., "Global_CloudConversationStorageEnabled") and `uniquePer` ("User")
  - Full permissions model: `guests` (UserGuest, PendingUserGuest, TeamGuest), `anyoneLinkSharing`, `space`
  - Access levels on sharing
  - Metadata: `creatorUid`, `lastEditorUid`, `revisionTs`, `trashedTs`, `isWelcomeObject`
  - Folder structure: `FolderContainer` or `Space` parents

### Workspace System

From `GetWorkspacesMetadataForUser`:
- Workspaces with per-workspace model choices
- Team-level bonus grants and spending tracking
- `WarpDriveSortingChoice` preference

### Conversation Storage

- `CloudConversationStorageEnabled` setting
- `ListAIConversationMetadata` query for conversation history
- `HasAutoOpenedConversationList` -- auto-opens conversation sidebar

### Conflict Resolution

- Optimistic concurrency via `revisionTs`
- `GenericStringObjectUpdateRejected` with `conflictingGenericStringObject` for merge conflicts

---

## 6. SETTINGS / CONFIGURATION

### All Discovered Configuration Keys

From the binary plist and network log:

| Key | Type | Description |
|---|---|---|
| `HasInitializedDefaultSecretRegexes` | bool | Secret detection bootstrap |
| `ShouldShowAgentModeCodingReadPermissionsNudge` | bool | File access permission prompt |
| `EnteredAgentModeNumTimes` | int | Usage counter (was 54) |
| `AIRequestQuotaInfoSetting` | json | Quota cycle history |
| `NLDInTerminalEnabled` | bool | Natural language detection in terminal |
| `CloudConversationStorageEnabled` | bool | Cloud conversation sync |
| `MCPExecutionPath` | string | PATH for MCP tool execution |
| `IsSettingsSyncEnabled` | bool | Cross-device settings sync |
| `DidNonAnonymousUserLogIn` | bool | Auth state |
| `AIAssistantRequestLimitInfo` | json | AI request limits |
| `CustomSecretRegexList` | json | User-defined secret patterns |
| `AvailableLLMs` | json | Available language models |
| `ExperimentId` | string | A/B test experiment ID |
| `AIRequestLimitInfo` | json | Request limit details |
| `HasShownAgentModeProfileCommandAutoexecutionSpeedbump` | bool | Auto-execute confirmation |
| `DidShowUpgradeToProModal` | bool | Upgrade prompt state |
| `DidShowOzLaunchModal` | bool | Oz cloud launch prompt |
| `AppAddedAsLoginItem` | bool | Launch at login |
| `HasAutoOpenedConversationList` | bool | Auto-open conversation sidebar |
| `ReceivedReferralTheme` | bool | Referral theme received |
| `DidShowAgents3LaunchModal` | bool | Agents v3 launch modal |
| `ShouldAddAgentModeChip` | bool | Agent mode UI chip |
| `InputBoxTypeSetting` | string | Default input mode |
| `HasAutoOpenedWelcomeFolder` | bool | Welcome folder state |
| `Theme` | string | Active theme |
| `TelemetryEnabled` | bool | Telemetry toggle |
| `Notifications` | json | Notification settings |
| `DismissedCodeToolbeltNewFeaturePopup` | bool | Feature popup state |
| `ChangelogVersions` | json | Seen changelog versions |
| `WarpDriveSortingChoice` | string | Drive sort order |
| `CrashReportingEnabled` | bool | Crash reporting toggle |

### Settings Sync

- `UpdateUserSettings` mutation syncs to cloud:
  - `cloudConversationStorageEnabled`
  - `crashReportingEnabled`
  - `telemetryEnabled`

### Settings Import

- Detects and imports from iTerm (`terminal_type: "ITerm"`)
- `Parsed Config in Settings Import` event with timing data

---

## 7. SKILLS SYSTEM

### Architecture

Skills are modular packages at `Contents/Resources/skills/`. Structure:

```
skill-name/
  SKILL.md          (required: YAML frontmatter + markdown body)
  scripts/          (executable code)
  references/       (documentation loaded into context)
  assets/           (output templates, not loaded into context)
```

### Frontmatter schema
- `name` (required): hyphen-case, max 64 chars
- `description` (required): max 1024 chars, no angle brackets
- `license`, `allowed-tools`, `metadata` (optional)

### Progressive disclosure (3 levels)
1. Metadata (name + description) -- always in context (~100 words)
2. SKILL.md body -- loaded when skill triggers (<5k words)
3. Bundled resources -- loaded on demand

### Bundled skills

**create-skill**: Meta-skill for creating new skills
- Scripts: `init_skill.py`, `package_skill.py`, `quick_validate.py`
- References: `workflows.md` (sequential/conditional patterns), `output-patterns.md` (template/examples)
- License: Apache 2.0

**figma/pull-figma-content**: Retrieve designs from Figma via MCP
- Uses `get_design_context`, `get_variable_defs`, `get_metadata`, `get_screenshot`
- Requires `fileKey` and `nodeId` from Figma URLs

**figma/generate-figma-design**: Capture web pages to Figma
- Local capture via script injection + browser open
- External capture via Playwright MCP
- Multi-page capture support
- Polling for completion (5s intervals)

**oz-platform**: Cloud agent management
- CLI commands, REST API, SDKs
- GitHub Actions integration
- Third-party CLI delegation
- Environment management
- Secrets and scheduling

### Packaging

Skills are packaged as `.skill` files (renamed zip archives) via `package_skill.py` with validation.

---

## 8. DOCK TILE / THEMING

### Custom Dock Icons

DockTilePlugin with 16 icon variants:
- `original`, `blue`, `cow`, `dev`, `mono`, `local`, `sticker`, `neon`
- `aurora`, `glass_sky`, `glow`, `holographic`
- `glitch`, `comets`, `starburst`, `preview`
- `classic_1`, `classic_2`, `classic_3`
- `warp_2`

---

## 9. BACKEND / API ARCHITECTURE

### GraphQL API

All state management goes through `app.warp.dev/graphql/v2`. Observed operations:

**Queries:**
- `GetFeatureModelChoices` -- AI model configuration
- `GetRequestLimitInfo` -- usage quotas
- `GetWorkspacesMetadataForUser` -- workspace metadata
- `GetUpdatedCloudObjects` -- sync changed objects
- `GetCloudEnvironmentsQuery` -- cloud environments
- `UserGithubInfo` -- GitHub connection state
- `ListAIConversationMetadata` -- conversation history

**Mutations:**
- `UpdateUserSettings` -- sync user preferences
- `BulkCreateObjects` -- batch create cloud objects
- `UpdateGenericStringObject` -- update individual objects

### REST API
- `POST /client/login` -- client authentication
- `GET /api/v1/agent/tasks` -- list agent tasks
- Agent API at `/api/v1/agent/run`, `/api/v1/agent/runs/{id}`

### Client Headers
- `x-warp-client-id: warp-app`
- `x-warp-client-version: v0.2026.03.04.08.20.stable_04`
- `x-warp-os-category: macOS`
- `x-warp-os-name: macOS`
- `x-warp-os-version: 26.4`
- `x-oz-api-source: CLOUD_MODE`
- Firebase auth (Bearer token)

### Telemetry

RudderStack-based telemetry to `warpianwzlfqdq.dataplane.rudderstack.com/v1/batch`:
- Amplitude session tracking
- Batched events with `userId`, `anonymousId`, `event`, `properties`
- Experiment bucketing: `x-warp-experiment-id`, `x-warp-experiment-bucket`

---

## 10. OBSERVED TELEMETRY EVENTS

Complete list of unique events captured in a single session:

| Event | Key Properties |
|---|---|
| `Command Search Async Query Completed` | `filter: ["Repos"]`, error state |
| `Pty Spawned` | `mode: "TerminalServer"` |
| `Parsed Config in Settings Import` | `terminal_type`, timing data |
| `Input.AtMenuInteracted` | `action`, `current_input_mode`, `is_udi_enabled`, `item_count`, `query_length` |
| `Tab Creation` | (no payload) |
| `Bootstrapping Succeeded` | `shell`, `shell_version`, `is_ssh`, `is_wsl`, `rcfiles_duration_seconds` |
| `AmbientAgent.CloudMode.Entered` | `entry_point: "oz_launch_modal" / "new_tab"` |
| `onboarding_callout_displayed` | `callout: "meet_terminal_input"` |
| `AgentView.Entered` | `origin: "ambient_agent"`, `did_auto_trigger_request` |
| `Active Indexed Repos Changed` | `hit_max_indices`, `updated_number_of_codebase_indices` |
| `AgentMode.ChangedInputType` | `active_block_id`, `new_input_type: "AI"`, `is_udi_enabled` |

---

## 11. UX PATTERNS RELEVANT FOR IDE/TERMINAL HYBRID

### Key Design Decisions

1. **Unified Developer Input (UDI)**: Single input box that switches between shell and AI modes. The "@" menu provides context injection (files, repos). This is the core interaction pattern -- one place to type, intelligent mode switching.

2. **Block-based output**: Each command creates a discrete, addressable block with its own ID. Blocks can be individually selected, copied, shared. This is fundamental to making terminal output navigable.

3. **Ambient Agent**: Agent mode that lives alongside the terminal, not in a separate window. Entry points include new tab creation and explicit modal launch. The agent has access to terminal context.

4. **Progressive permissions**: Agent mode has a permissions model for file reads, with nudges and speedbumps before auto-execution. This is a trust-building pattern.

5. **Cloud-first sync**: All settings stored as `GenericStringObject` with a `storage_key` + `value` + `platform` pattern. Optimistic concurrency with revision timestamps. Every preference is cloud-synced.

6. **Multi-model routing**: Different AI tasks (agent, planning, coding, CLI, computer use) can use different models. Each has cost/quality/speed ratings. The model selection is per-workspace, not global.

7. **Skills as progressive disclosure**: Skills use 3 tiers of context loading to stay within token budgets. Only metadata is always loaded. This is a pattern for any AI-powered tool with extensibility.

8. **Secret detection**: Built-in regex patterns for 20+ secret types, with custom regex support. Applied to terminal output to prevent accidental exposure.

9. **Settings import**: Auto-detects and imports from iTerm on first run. Reduces switching friction.

10. **Dock icon personalization**: 16+ dock icon variants for self-expression. Small touch, high engagement.

### Onboarding Flow

- First-run modal sequence: `DidShowUpgradeToProModal`, `DidShowOzLaunchModal`, `DidShowAgents3LaunchModal`
- Referral theme system (`ReceivedReferralTheme`)
- Welcome folder auto-open
- Conversation list auto-open
- Onboarding callouts (e.g., "meet_terminal_input")
- Settings import from other terminals

### Navigation Hierarchy

```
Window
  Tab Bar (tabs for terminal sessions and agent views)
    Tab
      Terminal View (block-based)
        Block (per command)
          Input (UDI: shell or AI mode)
          Output
      OR Agent View (ambient agent, cloud mode)
        Conversation (with cloud storage)
        @ Menu (context injection)
  Sidebar (conversation list, Warp Drive)
```

### Error Model

GraphQL errors use a typed union:
- `SharedObjectsLimitExceeded` -- team object limits
- `PersonalObjectsLimitExceeded` -- personal object limits
- `AccountDelinquencyError` -- payment issues
- `GenericStringObjectUniqueKeyConflict` -- sync conflicts
- `BudgetExceededError` -- spending caps
- `PaymentMethodDeclinedError` -- payment failures
- `InvalidAttachmentError` -- file upload issues

Each error type has a `message` field. This enables precise, actionable error handling in the UI.
