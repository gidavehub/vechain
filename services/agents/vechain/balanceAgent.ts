import { IAgent, AgentResponse, extractJsonFromResponse } from '../agentUtils';
import { ConversationContext } from '../router';
import { geminiModel } from '../../geminiServices';

// The structure of the data this agent fetches from our API
type VeChainBalanceData = {
  vet: string;
  vtho: string;
};

export default class VeChainBalanceAgent implements IAgent {
  public async execute(prompt: string, context: ConversationContext): Promise<AgentResponse> {
    console.log('[VeChainBalanceAgent] Executing as a specialist tool...');

    try {
      // 1. Get Required Info from Context (the user's address)
      const vechainAddress = context.collected_info.vechainAddress;
      if (!vechainAddress) {
        throw new Error("vechainAddress is missing from the context. Please complete onboarding.");
      }

      // 2. Execute Primary Function: Fetching balance from our API endpoint
      const balanceData = await this.getAccountBalance(vechainAddress);

      // 3. Formulate Response using LLM for UI generation
      const llmPrompt = `
        You are a specialist AI agent function. Your sole purpose is to convert raw VeChain wallet balance data into a standardized UARP JSON object. You will be called by a master orchestrator (the GeneralAgent). Your response should be self-contained and ready to be displayed to a user.

        **Your Task:**
        Convert the provided "Balance Data" into a valid JSON object with "speech" and "ui" fields.
        The UI MUST use the 'KEY_VALUE_DISPLAY' component.
        Respond with ONLY the raw JSON object, without any markdown formatting or other text.

        **UARP JSON Structure to Generate:**
        {
          "speech": "A factual, one-sentence summary for the orchestrator. E.g., 'Balance found: X VET and Y VTHO.'",
          "ui": {
            "type": "KEY_VALUE_DISPLAY",
            "props": {
              "title": "VeChain Wallet Balance",
              "items": [
                { "key": "VET Balance", "value": "The formatted VET balance with the ticker 'VET'" },
                { "key": "VTHO Balance", "value": "The formatted VTHO balance with the ticker 'VTHO'" }
              ]
            }
          }
        }
        
        **Rules:**
        - The 'speech' is for the master agent's context, not the end-user. Keep it factual.
        - Format the balances to a reasonable number of decimal places (e.g., 4) and append the ticker symbol (VET or VTHO).

        **Balance Data:**
        ${JSON.stringify(balanceData)}

        Now, generate the JSON response.
      `;

      const result = await geminiModel.generateContent(llmPrompt);
      const rawResponseText = result.response.text();

      console.log("[VeChainBalanceAgent] Raw LLM Response:", rawResponseText);
      const responseJson = JSON.parse(extractJsonFromResponse(rawResponseText));

      // 4. Construct the Final UARP Object
      return {
        status: 'COMPLETE', // This agent's turn is always complete.
        speech: responseJson.speech,
        ui: responseJson.ui,
        action: { type: 'COMPLETE_GOAL' },
        context: {
          ...context,
          status: 'complete',
          history: [...context.history, 'VeChainBalanceAgent successfully fetched and formatted balance.'],
        },
      };

    } catch (error: any) {
      console.error('[VeChainBalanceAgent] Error:', error);
      return this.createErrorResponse(context, error.message);
    }
  }

  /**
   * Fetches the account balance from our internal API endpoint.
   */
  private async getAccountBalance(address: string): Promise<VeChainBalanceData> {
    const response = await fetch(`/api/vechain/getBalance?address=${address}`, {
        method: 'GET',
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch balance from API.');
    }

    return await response.json();
  }

  /**
   * Creates a standardized error response.
   */
  private createErrorResponse(context: ConversationContext, errorMessage: string): AgentResponse {
    return {
      status: 'COMPLETE', // The agent's attempt is complete, even though it failed.
      speech: "Error fetching VeChain balance.",
      ui: {
        type: 'TEXT',
        props: {
          title: "Balance Check Failed",
          text: `Error: ${errorMessage}`,
        },
      },
      action: { type: 'COMPLETE_GOAL' },
      context: {
        ...context,
        status: 'failed',
        history: [...context.history, `VeChainBalanceAgent failed: ${errorMessage}`],
      },
    };
  }
}