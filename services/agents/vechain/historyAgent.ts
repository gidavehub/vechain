import { IAgent, AgentResponse, extractJsonFromResponse } from '../agentUtils';
import { ConversationContext } from '../router';
import { geminiModel } from '../../geminiServices';
import { SimplifiedTransaction } from '../../../pages/api/vechain/getHistory'; // Import the type
import { ethers } from 'ethers'; // For hex-to-decimal conversion

export default class VeChainHistoryAgent implements IAgent {
  public async execute(prompt: string, context: ConversationContext): Promise<AgentResponse> {
    console.log('[VeChainHistoryAgent] Executing as a specialist tool...');

    try {
      // 1. Get the user's address from context
      const vechainAddress = context.collected_info.vechainAddress;
      if (!vechainAddress) {
        throw new Error("vechainAddress is missing from the context. Please complete onboarding.");
      }

      // 2. Fetch transaction history from our internal API
      const historyData = await this.getTransactionHistory(vechainAddress);

      // 3. Pre-process the data before sending it to the LLM
      // This makes the LLM's job easier and more reliable
      const processedData = historyData.transactions.map(tx => {
        // Determine transaction type and details for a more readable display
        const mainClause = tx.clauses[0];
        let type = 'Interaction';
        let details = `To: ${mainClause.to ? `${mainClause.to.slice(0, 6)}...` : 'Contract Creation'}`;
        
        // Convert hex VET value to a readable decimal string
        const vetValue = parseFloat(ethers.utils.formatUnits(mainClause.value, 18)).toFixed(4);
        if (parseFloat(vetValue) > 0) {
            type = tx.origin.toLowerCase() === vechainAddress.toLowerCase() ? 'Send' : 'Receive';
        } else if (mainClause.data !== '0x') {
            type = 'Contract Call';
        }

        return {
            id: `${tx.id.slice(0, 6)}...${tx.id.slice(-4)}`,
            date: new Date(tx.timestamp * 1000).toLocaleDateString(),
            type: type,
            details: details,
            amount: `${vetValue} VET`
        };
      });

      // 4. Formulate a prompt for the LLM to generate the UI
      const llmPrompt = `
        You are a specialist AI agent function. Your task is to convert a pre-processed list of VeChain transactions into a standardized UARP JSON object. The master orchestrator (GeneralAgent) will display your response.

        **Your Task:**
        Use the provided "Processed Transaction Data" to generate a JSON object with "speech" and "ui" fields.
        The UI MUST be a 'DATA_TABLE'. The table headers and rows should be constructed from the data.
        Respond with ONLY the raw JSON object.

        **UARP JSON Structure to Generate:**
        {
          "speech": "A factual, one-sentence summary. E.g., 'Found the 10 most recent transactions.'",
          "ui": {
            "type": "DATA_TABLE",
            "props": {
              "title": "Recent VeChain Transactions",
              "headers": ["Tx ID", "Date", "Type", "Details", "Amount"],
              "rows": [
                ["...", "...", "...", "...", "..."],
                ["...", "...", "...", "...", "..."]
              ]
            }
          }
        }
        
        **Rules:**
        - If the transaction list is empty, the 'speech' should reflect that, and the 'rows' array should be empty.
        - The 'rows' array in the JSON should be an array of arrays, with the inner array values corresponding to the headers in order.

        **Processed Transaction Data:**
        ${JSON.stringify(processedData, null, 2)}

        Now, generate the JSON response.
      `;

      const result = await geminiModel.generateContent(llmPrompt);
      const rawResponseText = result.response.text();
      console.log("[VeChainHistoryAgent] Raw LLM Response:", rawResponseText);
      const responseJson = JSON.parse(extractJsonFromResponse(rawResponseText));

      return {
        status: 'COMPLETE',
        speech: responseJson.speech,
        ui: responseJson.ui,
        action: { type: 'COMPLETE_GOAL' },
        context: {
          ...context,
          status: 'complete',
          history: [...context.history, 'VeChainHistoryAgent successfully fetched and formatted transaction history.'],
        },
      };

    } catch (error: any) {
      console.error('[VeChainHistoryAgent] Error:', error);
      return this.createErrorResponse(context, error.message);
    }
  }

  private async getTransactionHistory(address: string): Promise<{ transactions: SimplifiedTransaction[] }> {
    const response = await fetch(`/api/vechain/getHistory?address=${address}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch history from API.');
    }
    return response.json();
  }

  private createErrorResponse(context: ConversationContext, errorMessage: string): AgentResponse {
    return {
      status: 'COMPLETE',
      speech: "Error fetching transaction history.",
      ui: {
        type: 'TEXT',
        props: {
          title: "History Check Failed",
          text: `Error: ${errorMessage}`,
        },
      },
      action: { type: 'COMPLETE_GOAL' },
      context: {
        ...context,
        status: 'failed',
        history: [...context.history, `VeChainHistoryAgent failed: ${errorMessage}`],
      },
    };
  }
}