# AI Agent Orchestration Research -- arXiv Survey

Source: https://arxiv.org/search/?query=ai+agents+coding&searchtype=all
Date: 2026-03-19
Scope: Papers relevant to building a desktop app that orchestrates Claude Code, Codex, and Gemini CLI agents on local codebases.

---

## Multi-Agent Coordination for Software Development

### 1. Multi-Agent Reasoning for Software System Optimization
**arXiv:** 2603.14703 | Peng, Patil, Qiu, Thiruvathukal, Davis

**Key insight:** Specialized agent roles (summarizer, analyzer, optimizer, verifier) coordinating across a microservice codebase achieved 37% throughput improvement and 28% latency reduction -- far beyond what any single-pass optimization could do.

**Studio application:** Direct validation of Studio's multi-agent model. Instead of one agent doing everything, route tasks to the right agent: Claude Code for architecture reasoning, Codex for fast bulk edits, Gemini for cross-file analysis. The role decomposition pattern (summarize -> analyze -> optimize -> verify) maps cleanly to a task pipeline UI.

---

### 2. RelayCaching: Accelerating LLM Collaboration via Decoding KV Cache Reuse
**arXiv:** 2603.13289 | Geng, Gao, Wu, Liu, Liu

**Key insight:** Multi-agent pipelines waste massive compute re-encoding shared context. Reusing KV caches from one agent's output as another's input cuts time-to-first-token by 4.7x with negligible accuracy loss.

**Studio application:** When Agent A produces output that Agent B needs as context, Studio should pass structured artifacts (not raw conversation) between agents. Long-term: if we ever run local models or proxy through a shared inference layer, cache-sharing is the performance unlock. Short-term: minimize redundant context by passing diffs and summaries between agents, not full conversation histories.

---

### 3. Bootstrapping Coding Agents: The Specification Is the Program
**arXiv:** 2603.17399 | Monperrus (IEEE Software)

**Key insight:** A coding agent can re-implement itself from a 926-word specification. The spec is the stable artifact; the implementation is regenerable. This is the compiler bootstrap pattern applied to AI agents.

**Studio application:** Studio's agent configurations (system prompts, tool permissions, task templates) are the real product -- not the agent code itself. This validates investing heavily in the spec/config layer. Users should be able to version, share, and fork agent configurations. The agent runtime is commodity; the orchestration spec is the moat.

---

### 4. Describing Agentic AI Systems with C4
**arXiv:** 2603.15021 | Rausch, Wittek

**Key insight:** Agentic systems need their own documentation vocabulary: agents, artifacts, tools, coordination patterns, quality gates. Standard software architecture docs don't capture the agent interaction model. Proposes hierarchical C4-aligned views across abstraction levels.

**Studio application:** Studio needs a visual model for what's happening. Not just "agent is running" but: which agents are active, what artifacts they're producing, what tools they're invoking, where they are in the coordination pattern. The C4 hierarchy (System -> Container -> Component -> Code) maps to Studio's zoom levels: project -> workspace -> agent -> individual tool call.

---

## Agent Reliability and Safety

### 5. TDAD: Test-Driven Agentic Development
**arXiv:** 2603.17973 | Alonso

**Key insight:** AI agents reduce regressions 70% when given graph-based impact analysis showing *which tests to run*, not TDD instructions. Smaller models benefit more from contextual information than procedural instructions. An auto-improvement loop hit 60% resolution with 0% regression on a subset.

**Studio application:** Before dispatching an agent to edit code, Studio should run AST-based impact analysis and include affected tests in the agent's context. Don't tell agents "use TDD" -- tell them "these 4 tests cover the code you're changing." This is a concrete feature: pre-compute test impact graph, inject it into agent prompts automatically.

---

### 6. VeriGrey: Greybox Agent Validation
**arXiv:** 2603.17639 | Zhang, Kang, Meng, Bohme, Roychoudhury

**Key insight:** Grey-box testing using tool invocation sequences as feedback found 33% more prompt injection vulnerabilities than black-box approaches. Tested against Gemini CLI and achieved 90-100% success rate finding malicious skill variants across different LLM backends.

**Studio application:** Studio is giving agents OS-level access to local codebases. This paper is a direct threat model. We need: (1) tool invocation logging as a first-class feature, (2) anomaly detection on tool call sequences, (3) sandboxing that limits blast radius per agent. The tool-sequence-as-signal pattern should inform our audit log design.

---

### 7. Security Considerations for Artificial Intelligence Agents
**arXiv:** 2603.12230 | Li, Zhang, Polley, Ma (Perplexity)

**Key insight:** Agent architectures break traditional code-data separation and authority boundaries. Principal attack surfaces: tools, connectors, hosting boundaries, multi-agent coordination. Key threats: indirect prompt injection, confused-deputy, cascading failures. Recommends sandboxed execution + deterministic policy enforcement for high-stakes actions.

**Studio application:** Multi-agent orchestration multiplies the attack surface. Studio needs: deterministic policy gates (e.g., "no agent can delete files outside the project directory"), per-agent permission scoping, and circuit breakers that halt cascading failures across agents. The confused-deputy problem is real -- Agent A could trick Agent B into executing something Agent B has permissions for but A doesn't.

---

### 8. Uncovering Security Threats in Autonomous Agents (OpenClaw Case Study)
**arXiv:** 2603.12644 | Ying, Yang, Wu, Song, Qu, Li, Li, Wang, Liu, Liu

**Key insight:** Identifies prompt injection -> RCE chains, sequential tool attack chains, context amnesia exploits, and supply chain contamination in agents with OS-level permissions. Proposes tri-layered defense: AI Cognitive / Software Execution / Information System, with zero-trust execution and dynamic intent verification.

**Studio application:** Studio agents have filesystem access. The tri-layered risk framework is directly applicable: (1) Cognitive layer -- validate agent intent before execution, (2) Execution layer -- sandbox filesystem ops, (3) Information layer -- protect secrets and credentials from agent context. Zero-trust execution means every destructive action requires explicit approval, regardless of which agent requests it.

---

### 9. How Vulnerable Are AI Agents to Indirect Prompt Injections?
**arXiv:** 2603.15714 | Dziemian, Lin, Fu, et al. (large team)

**Key insight:** 8,648 successful attacks across 13 models in a public red-teaming competition. All models vulnerable (0.5-8.5% success rate). Universal attack strategies transfer across 21 of 41 behaviors and multiple model families. Attackers can execute harmful actions with no visible trace in user-facing output.

**Studio application:** Every agent Studio orchestrates is vulnerable to prompt injection from repository contents. A malicious file in a repo (README, config, comment) could hijack an agent. Studio needs: (1) content scanning before feeding repo files to agents, (2) output validation independent of the agent's self-report, (3) cross-agent verification where one agent checks another's work. The "no visible trace" finding means we can't rely on agent output alone for safety.

---

### 10. Malicious Or Not: Repository Context for Agent Skill Classification
**arXiv:** 2603.16572 | Holzbauer, Schmidt, Gegenhuber, Schrittwieser, Ullrich

**Key insight:** Agent skill marketplaces flagged 46.8% of skills as malicious, but cross-referencing with GitHub repo context reduced that to 0.52%. Also identified a new attack: hijacking skills hosted on abandoned GitHub repos.

**Studio application:** If Studio ever supports community-contributed agent configs or tool plugins, skill/plugin vetting needs repo-level context, not just description scanning. Also relevant for evaluating MCP servers and tools that agents connect to -- verify the source repo is maintained and not hijacked.

---

## Code Generation Agent Architectures

### 11. Your Code Agent Can Grow Alongside You with Structured Memory (MemCoder)
**arXiv:** 2603.13258 | Deng, Liu, Zhang, Yang, Yang

**Key insight:** Agents that learn from project commit history (intent-to-code patterns) and self-refine via verification feedback achieve 9.4% better resolution on SWE-bench. Three mechanisms: structured historical experience, real-time self-refinement, experience internalization.

**Studio application:** Studio should build per-project memory from git history. When an agent works on a repo, feed it patterns from past commits: "in this codebase, error handling looks like X, tests follow pattern Y." This is a differentiator -- agents that have project memory produce more consistent, style-matched code. Could be a hashmark scan output that gets injected as agent context.

---

### 12. Lore: Git Commit Messages as Structured Knowledge Protocol
**arXiv:** 2603.15566 | Stetsenko

**Key insight:** The "Decision Shadow" -- reasoning behind code changes is lost because commits record what changed, not why. Lore uses git trailers to capture constraints, rejected alternatives, agent directives, and verification metadata. No infrastructure beyond git. Queryable via CLI.

**Studio application:** When Studio agents make commits, capture their reasoning as structured git trailers: what they considered, what they rejected, what constraints they operated under. This creates a queryable decision log that persists in git history. Future agents working on the same codebase can query past decisions. Directly integrates with hashmark's existing git-aware scanning.

---

### 13. EvoClaw: Evaluating AI Agents on Continuous Software Evolution
**arXiv:** 2603.13428 | Deng, Chen, Yu, Fan, Liu, Yang, Parikh, Kannan, Cong, Wang, Zhang, Prasanna, Tang, Wang

**Key insight:** Agent performance drops from >80% on isolated tasks to at most 38% in continuous development settings. Agents struggle with long-term maintenance and error propagation across sequential changes.

**Studio application:** Single-shot code generation is solved-ish. The real problem is sustained development across multiple sessions and tasks. Studio needs to maintain continuity: project state, prior agent decisions, accumulated context. This validates building a persistent workspace model rather than treating each agent invocation as independent.

---

### 14. Intent Formalization: Grand Challenge for Reliable Coding
**arXiv:** 2603.17150 | Lahiri

**Key insight:** The "intent gap" between natural language requirements and program behavior is the fundamental reliability problem. Solution: translate intent into verifiable specs, ranging from lightweight tests to full formal specs. Validates specs through user interaction and proxy artifacts.

**Studio application:** Studio's task definition layer should push users toward verifiable intent: "write a function that passes these tests" > "write a function that does X." The UI should encourage attaching test cases, examples, or assertions to every task. This also motivates hashmark's analysis outputs as implicit specs -- complexity targets, pattern constraints, anti-pattern rules become verifiable intent.

---

### 15. GASP: Guided Asymmetric Self-Play for Coding LLMs
**arXiv:** 2603.15957

**Key insight:** A teacher model generates easier variants of hard problems to guide student model training. Asymmetric difficulty calibration improves learning efficiency.

**Studio application:** When a powerful agent (Claude Code/Opus) decomposes a hard task, it can generate simplified subtasks for faster/cheaper agents (Codex). Studio's task decomposition should be model-aware: hard subtasks go to capable agents, routine subtasks go to fast agents. This is the economic argument for multi-agent orchestration -- not just parallelism, but cost optimization.

---

## Agent-Human Collaboration UX

### 16. "I'm Not Reading All of That": Cognitive Engagement with ACAs
**arXiv:** 2603.14225 | Catalan, Dizon, Monderin, Kuang (CHI 2026)

**Key insight:** Engineers' cognitive engagement progressively weakens as they use agentic coding assistants. Current interfaces lack features for thoughtful review, validation, and comprehension. Engineers stop critically evaluating agent output over time.

**Studio application:** This is the core UX risk for Studio. If we just show agent output streams, users will rubber-stamp everything. Studio needs: (1) forced review checkpoints for destructive operations, (2) diff-first presentation (show what changed, not what was generated), (3) progressive disclosure so users engage with the important parts, (4) cognitive engagement signals -- maybe require a confirmation that demonstrates understanding, not just "approve."

---

### 17. Trust Over Fear: Motivation Framing in System Prompts
**arXiv:** 2603.14373 | Wu Ji

**Key insight:** Trust-framed system prompts produced 59% more hidden issue detection and 74% more investigative steps than fear-based or neutral prompts. Fear-based motivation was no better than baseline. Trust encourages exploration; fear causes satisficing.

**Studio application:** Studio's default agent system prompts should use trust-based framing: "You have full context and authority to investigate deeply" rather than "Be careful not to break anything." This is a free performance boost. Also relevant for the prompt templates Studio ships -- guide users toward trust framing in their custom prompts.

---

### 18. Nonstandard Errors in AI Agents
**arXiv:** 2603.16744 | Gao, Xiao

**Key insight:** 150 Claude Code agents analyzing the same dataset produced significantly different results -- "nonstandard errors" from agent-to-agent variation in methodology. Different model families have consistent "empirical styles." AI peer review didn't reduce dispersion; exemplar papers did.

**Studio application:** Running the same task on Claude Code vs. Codex vs. Gemini CLI will produce different results due to model-specific biases. Studio should: (1) make this visible -- show where agents disagree, (2) use disagreement as a signal for tasks that need human judgment, (3) provide exemplar outputs (golden examples) in prompts to reduce stylistic variance. Cross-agent consensus is a quality signal; divergence is a review signal.

---

### 19. How GenAI Mentor Configurations Shape Collaborative Dynamics
**arXiv:** 2603.12600 | Zha, Liu, Qin, Cao, Wang, Liu, Zhang, Gong, Xu

**Key insight:** Shared AI access promoted convergence and coordinated reasoning. Individual AI access produced more exploratory but fragmented patterns. AI configuration is a structural variable that reshapes collaboration patterns.

**Studio application:** When a team uses Studio, shared agent context (one agent per project, all team members see its work) produces more aligned outcomes. Per-developer agents produce more exploration but fragmentation. Studio should support both modes with clear tradeoffs: shared workspace for convergence on architecture decisions, individual agents for exploratory feature work.

---

## Orchestration Infrastructure

### 20. Agent Lifecycle Toolkit (ALTK)
**arXiv:** 2603.15473 | Wright, Tsay, Murthi, et al. (IBM Research)

**Key insight:** Six intervention points in the agent lifecycle: post-user-request, pre-LLM prompt, post-LLM output, pre-tool execution, post-tool result, pre-response assembly. Middleware at each point catches data corruption, reasoning errors, and policy violations.

**Studio application:** Studio's orchestration layer should have hooks at each of these six points. Concrete examples: (1) pre-tool: validate that file paths are within project scope, (2) post-tool: check that git operations succeeded, (3) post-LLM: scan output for hallucinated file paths, (4) pre-response: redact any leaked secrets before showing to user. This is the plugin architecture for Studio's safety layer.

---

### 21. Interpretable Context Methodology: Folder Structure as Agentic Architecture
**arXiv:** 2603.16021 | Van Clief, McDermott

**Key insight:** Replace framework-level orchestration with filesystem structure. Numbered folders represent pipeline stages; markdown files carry prompts and context. A single agent reads the right files at each step. Inspired by Unix pipelines and multi-pass compilation.

**Studio application:** Studio's workspace model could use a `.studio/` directory structure as the orchestration protocol: `.studio/1-analyze/`, `.studio/2-implement/`, `.studio/3-verify/` with markdown task files in each. Agents read/write to the filesystem rather than communicating through a custom protocol. This keeps orchestration transparent, git-trackable, and debuggable. Low-tech but effective.

---

### 22. An Alternative Trajectory for Generative AI (Domain-Specific Superintelligence)
**arXiv:** 2603.14147 | Belova, Kansal, Liang, Xiao, Jha

**Key insight:** Instead of monolithic models, build "societies of domain-specific superintelligence" -- orchestrated ecosystems routing tasks to specialized backends. Decouples capability from model size. Inference cost (not training) is the real scaling bottleneck.

**Studio application:** Studio IS this vision applied to coding. Instead of one giant model doing everything, route to Claude Code (architecture), Codex (fast edits), Gemini (cross-file reasoning). The orchestrator is the product, not the models. This paper validates the entire Studio thesis. Also reinforces that cost optimization via smart routing is a key feature -- don't send simple tasks to expensive models.

---

### 23. Do AI Agents Really Improve Code Readability?
**arXiv:** 2603.13723 | Horikawa, Horikawa, Kashiwa, Uwano, Iida

**Key insight:** AI agents' readability-focused refactoring actually decreased Maintainability Index in 56.1% of commits and increased Cyclomatic Complexity in 42.7%. Agents focused on logic complexity and docs, not style. Refactoring claims don't match metric outcomes.

**Studio application:** Studio should verify agent claims with metrics. If an agent says "I improved readability," run hashmark's complexity analysis before and after to validate. This is a natural integration point: hashmark scans as automated verification for agent-produced code. Don't trust agent self-assessment; measure.

---

### 24. Testing with AI Agents: Empirical Study
**arXiv:** 2603.13724

**Key insight:** AI authored 16.4% of test-adding commits with comparable coverage to human-written tests. AI agents are already competent at test generation in production codebases.

**Studio application:** Test generation is a safe, high-value first task for Studio agents. Low risk (tests don't modify production code), easy to verify (they either pass or fail), and directly measurable. Good onboarding flow: "Let an agent write tests for your codebase first" before trusting it with production code changes.

---

## Summary: Top Takeaways for Studio

1. **Route tasks by agent strength, not randomly.** Multi-agent coordination with specialized roles outperforms single-agent approaches (papers 1, 15, 22).

2. **Inject project context, not instructions.** Agents perform better with "here are the affected tests" than "use TDD" (paper 5). Feed hashmark analysis into agent prompts.

3. **Build persistent project memory.** Agent performance collapses in continuous development without accumulated context (papers 11, 12, 13).

4. **Security is non-negotiable.** Every agent is vulnerable to prompt injection from repo contents. Need sandboxing, permission scoping, tool-call auditing, and cross-agent verification (papers 6, 7, 8, 9).

5. **Fight cognitive disengagement.** Users will rubber-stamp agent output. Force review checkpoints, show diffs not outputs, use disagreement as a review signal (papers 16, 18).

6. **Trust-frame agent prompts.** Free 59% improvement in deep issue detection (paper 17).

7. **Verify agent claims with metrics.** Agents' self-reported improvements don't match measured outcomes (paper 23). Use hashmark scans as ground truth.

8. **Six middleware hooks for safety.** Post-request, pre-prompt, post-output, pre-tool, post-tool, pre-response (paper 20).

9. **Filesystem-based orchestration is underrated.** Numbered folders + markdown files as the coordination protocol keeps things transparent and git-trackable (paper 21).

10. **Start users with test generation.** Low risk, easy to verify, builds trust before production code changes (paper 24).
