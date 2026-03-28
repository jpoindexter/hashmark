# Privacy Policy

**Last updated: March 28, 2026**

Hashmark ("we", "us") operates the hashmark CLI tool and hashmark studio desktop application. This policy explains what data we collect and how we handle it.

## What hashmark collects

### Local-only data (never leaves your machine)
- Project file names, directory structure, and dependency graphs (used to generate context files)
- Session messages and chat history (stored in `.hashmark/studio.db`)
- Agent definitions and governance policies
- Git metadata (branch names, commit hashes, diff stats)

### Data sent to AI providers
When you use hashmark studio's chat, run, or swarm features, your prompts and selected project context are sent to the AI provider you configured (e.g., Anthropic Claude, OpenAI, Google Gemini). Hashmark does not store, log, or proxy these requests -- they go directly from your machine to the provider. Each provider's own privacy policy governs how they handle your data.

### Data sent to hashmark (Pro tier only)
If you use hashmark's hosted AI backend (Pro subscription), we process your prompts through our API proxy to route them to AI providers. We log token usage for billing purposes. We do not store prompt content or AI responses beyond the duration of the request.

### Account data
If you create a hashmark account, we store your email address, display name, and subscription status. We use Stripe for payment processing -- we never see or store your full card number.

## What hashmark does NOT collect
- Source code content (we read file names and structure, not file contents, unless you explicitly include them in a prompt)
- Keystrokes or screen recordings
- Browsing history
- Data from other applications

## Data storage
- All local data is stored on your machine in the `.hashmark/` directory inside your project
- Account data is stored in our database hosted on [provider TBD]
- We use TLS encryption for all network communications

## Your rights
- **Access**: You can export all your local data from `.hashmark/studio.db` at any time
- **Deletion**: Run `hashmark logout --delete-cloud-data` to request deletion of all cloud-stored data. We process deletion requests within 30 days
- **Portability**: Generated context files (CLAUDE.md, AGENTS.md, etc.) are plain text files you own completely

## Third-party services
- **AI providers**: Anthropic, OpenAI, Google, and others as configured by you
- **Stripe**: Payment processing (Pro tier)
- **GitHub**: Optional integration for repository scanning

## Changes to this policy
We will update this page when the policy changes. Material changes will be announced via the CLI on next run.

## Contact
Privacy questions: privacy@hashmark.md
