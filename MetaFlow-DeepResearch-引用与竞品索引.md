# MetaFlow Deep Research 引用与竞品索引

## Aha Moment 主线

- MetaFlow 不是又一个 Agent demo，而是 runtime/adapter layer：把脚本、浏览器、CLI、外部 Agent、个人应用和长期上下文统一到可组合、可验证、可跨端运行的系统中。
- 标准边界：MCP/ACP/A2A 说明行业从单点 Agent 走向协议化互操作。
- View memory：把上下文物化为可检查、可复用的 ViewGraph，而不是把历史简单塞进向量库。
- 可验证运行：tracing、tool call lifecycle、权限、状态更新和人工接管是一等公民。
- 可进化工作流：脚本提供确定性，Agent 提供探索性，ViewGraph 提供记忆，feedback 提供演化方向。


## 报告叙事主线建议

一句话：MetaFlow 不是又一个会聊天或会点网页的 Agent，而是把长期工作痕迹转化为可检查、可复用、可验证 Views 的本地优先上下文运行时。

推荐故事顺序：

1. 行业变化：Agent 已经从回答问题走向使用浏览器、桌面和工具，但 benchmark 与商业产品都暴露出可靠性、状态和权限问题。
2. 真实痛点：知识工作上下文散落在网页、文档、项目、日志、截图、对话和反馈里，每次 Agent 任务都像重新开局。
3. 核心洞察：memory 不是历史仓库，而是能降低未来搜索成本的 ViewGraph；message 是发生过的事，View 是下一次工作能站上去的状态。
4. 系统解法：Observation -> Processor -> ViewGraph -> 应用/Agent 行动 -> Feedback -> Evolution。
5. 差异化：应用是 ViewGraph 的投影，Agent 是能力/worker，不是事实源；输出必须带 provenance、policy、trace 和 feedback。
6. 赛题价值：端侧负责事实、权限、低延迟和本地证据；无问芯穹平台负责长上下文、多模态、智能代理探索和批量压缩。
7. 评估逻辑：不是只看生成文本，而是看 View 是否让下一次任务更便宜：搜索步骤、token、时间、失败率、人工编辑和复用率是否下降。

可反复使用的金句：

- 让上下文可检查，让记忆可行动，让反馈推动系统变聪明。
- Agent 是 transient，View 和 workflow 才是可复用资产。
- 不可验证的 Agent 只能演示，可验证的 Agent 才能成为运行时。
- 应用不是 memory 孤岛，而是同一个 ViewGraph 的不同投影。
- 一个好的 View 的价值，不是保存了很多东西，而是减少下一次工作的搜索成本。

## 参考文献清单

- [1] 无问芯穹. 无问芯穹平台与大模型基础设施相关资料[EB/OL].
- [2] Vaswani A, Shazeer N, Parmar N, et al. Attention Is All You Need[C]. NeurIPS, 2017. https://arxiv.org/abs/1706.03762
- [3] Yao S, Zhao J, Yu D, et al. ReAct: Synergizing Reasoning and Acting in Language Models[C]. ICLR, 2023. https://arxiv.org/abs/2210.03629
- [4] Lewis P, Perez E, Piktus A, et al. Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks[C]. NeurIPS, 2020. https://arxiv.org/abs/2005.11401
- [5] Model Context Protocol. Introduction[EB/OL]. https://modelcontextprotocol.io/docs/getting-started/intro
- [6] Agent Client Protocol. Introduction and Architecture[EB/OL]. https://agentclientprotocol.com/get-started/introduction
- [7] A2A Project. Agent2Agent Protocol[EB/OL]. https://github.com/a2aproject/A2A
- [8] LangChain. LangGraph Overview and Persistence[EB/OL]. https://docs.langchain.com/oss/python/langgraph/overview
- [9] Anthropic. Effective context engineering for AI agents[EB/OL]. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- [10] OpenAI. Agents SDK tracing[EB/OL]. https://openai.github.io/openai-agents-python/tracing/
- [11] OpenTelemetry. GenAI semantic conventions[EB/OL]. https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/
- [12] Agent Client Protocol. Tool calls and session updates[EB/OL]. https://agentclientprotocol.com/protocol/tool-calls
- [13] Anthropic. Building effective agents[EB/OL]. https://www.anthropic.com/engineering/building-effective-agents
- [14] OpenClaw. OpenClaw GitHub repository[EB/OL]. https://github.com/openclaw/openclaw
- [15] browser-use. browser-use GitHub repository[EB/OL]. https://github.com/browser-use/browser-use
- [16] Skyvern-AI. Skyvern GitHub repository[EB/OL]. https://github.com/Skyvern-AI/skyvern
- [17] Browserbase. Stagehand GitHub repository[EB/OL]. https://github.com/browserbase/stagehand
- [18] trycua. CUA GitHub repository[EB/OL]. https://github.com/trycua/cua
- [19] XLang Lab. OpenCUA[EB/OL]. https://github.com/xlang-ai/OpenCUA
- [20] CrewAI. CrewAI GitHub repository[EB/OL]. https://github.com/crewAIInc/crewAI
- [21] Wu Q, Bansal G, Zhang J, et al. AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation Framework[EB/OL]. https://arxiv.org/abs/2308.08155
- [22] OpenHands. OpenHands GitHub repository[EB/OL]. https://github.com/OpenHands/openhands
- [23] Significant Gravitas. AutoGPT Classic README[EB/OL]. https://github.com/Significant-Gravitas/AutoGPT
- [24] Zhou S, Xu F F, Zhu H, et al. WebArena: A Realistic Web Environment for Building Autonomous Agents[EB/OL]. https://arxiv.org/abs/2307.13854
- [25] Deng X, Gu Y, Zheng B, et al. Mind2Web: Towards a Generalist Agent for the Web[EB/OL]. https://arxiv.org/abs/2306.06070
- [26] Online-Mind2Web. An Illusion of Progress? Assessing the Current State of Web Agents[EB/OL]. https://arxiv.org/html/2504.01382v4
- [27] Mialon G, Fourrier C, Swift C, et al. GAIA: A Benchmark for General AI Assistants[EB/OL]. https://arxiv.org/abs/2311.12983
- [28] XLang Lab. OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments[EB/OL]. https://arxiv.org/abs/2404.07972
- [29] Google Research. AndroidWorld: A Dynamic Benchmarking Environment for Autonomous Agents[EB/OL]. https://arxiv.org/abs/2405.14573
- [30] Liu X, Yu H, Zhang H, et al. AgentBench: Evaluating LLMs as Agents[EB/OL]. https://arxiv.org/abs/2308.03688
- [31] OpenAI. Computer-Using Agent and Operator[EB/OL]. https://openai.com/index/computer-using-agent/
- [32] Anthropic. Claude computer use tool documentation[EB/OL]. https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- [33] Google DeepMind. Project Mariner and Gemini 2.0 update[EB/OL]. https://blog.google/innovation-and-ai/models-and-research/google-deepmind/google-gemini-ai-update-december-2024/
- [34] Browserbase. Browserbase official website[EB/OL]. https://www.browserbase.com/
- [35] browserless. browserless official website[EB/OL]. https://www.browserless.io/
- [36] Firecrawl. Firecrawl official website and GitHub repository[EB/OL]. https://www.firecrawl.dev/
- [37] MultiOn. MultiOn documentation[EB/OL]. https://docs.multion.ai/welcome
- [38] Manus. Manus documentation and API[EB/OL]. https://manus.im/docs/introduction/welcome
- [39] Cognition. Introducing Devin[EB/OL]. https://www.cognition.ai/blog/introducing-devin
- [40] Replit. Replit Agent[EB/OL]. https://replit.com/ai
- [41] Google. Jules official website[EB/OL]. https://jules.google/
- [42] Jimenez C E, Yang J, Wettig A, et al. SWE-bench: Can Language Models Resolve Real-World GitHub Issues?[EB/OL]. https://arxiv.org/abs/2310.06770
- [43] ServiceNow Research. WorkArena and WorkArena++[EB/OL]. https://github.com/ServiceNow/workarena
- [44] Apple. ToolSandbox: A Stateful, Conversational, Interactive Evaluation Benchmark for LLM Tool Use Capabilities[EB/OL]. https://arxiv.org/abs/2408.04682
- [45] Sierra. tau-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains[EB/OL]. https://arxiv.org/abs/2406.12045
