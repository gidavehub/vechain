/**
 * Defines the structure for an agent's manifest entry.
 * This provides metadata for the GeneralAgent to understand what each specialist can do.
 */
export interface AgentManifest {
  description: string;
  // We can add more metadata here in the future, like example prompts or required context fields.
}

/**
 * The AGENT_REGISTRY is the central directory for all specialist agents in the system.
 * The GeneralAgent uses the 'description' of each agent to decide which tool to delegate tasks to.
 */
export const AGENT_REGISTRY: Record<string, AgentManifest> = {
  // === The Master Orchestrator ===
  "general/generalAgent": {
    description: "The primary conversational agent and master orchestrator. It handles complex queries, maintains conversation, decomposes tasks, and synthesizes responses from specialist agents. It is the 'personality' of the AI."
  },

  // === VeChain Specialist Agents (Tools) ===
  "vechain/balanceAgent": {
    description: "A specialist tool that, when called, fetches and returns the VET and VTHO balances for the user's saved VeChain wallet address. It performs a single, focused task."
  },
  "vechain/createAccountAgent": {
    description: "A specialist tool that creates a new VeChain wallet, displays the credentials (address, private key, mnemonic), and waits for user confirmation. This is primarily used during onboarding."
  },
  "vechain/historyAgent": {
    description: "A specialist tool that, when called, retrieves a list of recent transactions for the user's saved VeChain wallet address from an explorer API."
  },
  "vechain/sendAgent": {
    description: "A specialist tool that manages the multi-turn process of sending VET to a recipient. It collects the recipient's address and the amount, gets security authorization, and executes the transfer."
  },

  // === Utility Specialist Agents (Tools) ===
  "utility/memoryAgent": {
    description: "A specialist tool for managing the user's long-term memory. Use it when the user explicitly asks to 'remember', 'remind', 'forget', or 'update' a piece of information."
  },
  "utility/onboardingAgent": {
    description: "A specialist tool that manages the multi-step user onboarding conversation to collect name, VeChain wallet credentials, and a password."
  },
  "utility/securityAgent": {
    description: "A specialist tool for transaction authorization. It prompts the user for their password before any sensitive transaction (like sending VET) is executed. It is called by other agents, not directly by the GeneralAgent."
  },

  // === Research Specialist Agents (Can be adapted for VeChain) ===
  "research/googleSearchAgent": {
    description: "An advanced research tool that performs comprehensive analysis of VeChain-related topics by searching multiple sources, extracting relevant content, and synthesizing information using AI. Provides detailed summaries with citations."
  },

  // === Other Agents (These would be the next ones to build for VeChain) ===
  // "vechain/tokenInfoAgent": { ... }
  // "vechain/sendTokenAgent": { ... }
  // "vechain/nftInfoAgent": { ... }
  // "vechain/mintNftAgent": { ... }
};