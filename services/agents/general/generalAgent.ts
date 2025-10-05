// /services/agents/general/generalAgent.ts

import { IAgent, AgentResponse, extractJsonFromResponse } from '../agentUtils';
import { ConversationContext } from '../router';
import { AGENT_REGISTRY } from '../registry';
import { geminiModel } from '../../geminiServices';

export default class GeneralAgent implements IAgent {
  public async execute(prompt: string, context: ConversationContext): Promise<AgentResponse> {
    console.log('[GeneralAgent] Executing...');

    if (context.collected_info.specialist_results) {
      console.log('[GeneralAgent] Detected specialist results. Entering synthesis mode.');
      return this.synthesize(prompt, context);
    } else {
      console.log('[GeneralAgent] No specialist results found. Entering planning mode.');
      return this.plan(prompt, context);
    }
  }

  /**
   * PHASE 1: PLANNING
   * The agent analyzes the user's prompt and its own context to create a plan.
   */
  private async plan(prompt: string, context: ConversationContext): Promise<AgentResponse> {
    try {
      const specialistAgents = Object.entries(AGENT_REGISTRY)
        .filter(([key]) => key !== 'general/generalAgent')
        .map(([key, value]) => `- ${key}: ${value.description}`)
        .join('\n');

      const llmPrompt = `
        You are "VeChain AI", a master AI orchestrator for the VeChainThor network. Your primary function is to understand a user's request, check your existing knowledge, and create a precise execution plan by delegating to specialist tools.

        **Your Current Knowledge (from context):**
        - User Name: ${context.collected_info.name || 'Not available'}
        - User Address (0x...): ${context.collected_info.address || 'Not available'}
        - Long-Term Memory: ${JSON.stringify(context.collected_info.long_term_memory) || '{}'}

        **Your Thought Process (Follow these steps strictly):**
        1.  **Analyze the User's Goal:** What does the user want to achieve with their latest prompt? (e.g., "check my balance", "create a new wallet", "what DAOs can I join?").
        2.  **Check Your Knowledge FIRST:** Do you already have the information needed? For example, if they ask for their address and you have it, you don't need a tool.
        3.  **Consult Your Tools:** Based on the goal, look at the "Available Specialist Agents" list. Decide which single tool is the best fit.
        4.  **Formulate a Plan:**
            -   **If a tool is needed**, your plan is to delegate. The action type will be 'DELEGATE'. The UI should be a 'LOADING' type.
            -   **If NO tool is needed** (e.g., for greetings, simple questions), your plan is to respond immediately. The action type will be 'COMPLETE_GOAL', and the UI can be a simple 'TEXT' component.

        **Your Response MUST be a valid UARP JSON object only.**

        **UARP Schema for Planning:**
        {
          "speech": "A brief, conversational message to the user indicating you've understood and are starting to work, OR the direct answer if no tool is needed.",
          "ui": { 
            "type": "'LOADING' | 'TEXT'", 
            "props": { "text": "..." } 
          },
          "action": {
            "type": "'COMPLETE_GOAL' | 'DELEGATE' | 'DELEGATE_PARALLEL'",
            "payload": "(Required for DELEGATE actions) An object or array of objects: { agent: string, prompt: string }"
          }
        }

        **Available Specialist Agents (Your VeChain Tools):**
        ${specialistAgents}
        
        ---
        **User's Request:** "${prompt}"
        ---

        Now, generate the UARP JSON plan.
      `;

      const result = await geminiModel.generateContent(llmPrompt);
      const rawResponseText = result.response.text();
      console.log("[GeneralAgent-Plan] Raw LLM Response:", rawResponseText);
      const responseJson = JSON.parse(extractJsonFromResponse(rawResponseText));

      return {
        status: responseJson.action.type === 'COMPLETE_GOAL' ? 'COMPLETE' : 'DELEGATING',
        speech: responseJson.speech,
        ui: responseJson.ui,
        action: responseJson.action,
        context: {
          ...context,
          status: 'delegating',
          history: [...context.history, `GeneralAgent created a plan: ${responseJson.action.type}`],
        },
      };

    } catch (error: any) {
      console.error('[GeneralAgent-Plan] Error:', error);
      return this.createErrorResponse(context, error.message);
    }
  }

  /**
   * PHASE 2: SYNTHESIS
   * The agent receives the results from specialists and designs a user-friendly response.
   */
  private async synthesize(prompt: string, context: ConversationContext): Promise<AgentResponse> {
    try {
        const specialistResults = context.collected_info.specialist_results;
  
        const llmPrompt = `
          You are "VeChain AI", a master AI synthesizer and UI designer. Your specialist agents have completed their tasks and returned raw data. Your job is to transform this data into a single, coherent, friendly, and visually rich response for the user.

          **Your UI Design Palette (The tools you MUST use to build the UI):**
          - **'LAYOUT_STACK'**: Use this as the main container for multiple UI components. 'props.children' is an array of other UI components.
          - **'TEXT'**: For paragraphs, explanations, or summaries. Use 'props.title' and 'props.text'.
          - **'KEY_VALUE_DISPLAY'**: PERFECT for structured data like account balances (VET, VTHO), transaction details, etc. 'props.items' is an array of {key: string, value: string}.
          - **'DATA_TABLE'**: Use this for lists of similar items, especially transaction history. 'props.headers' is an array of strings. 'props.rows' is an array of arrays.
          - **'BUTTON'**: To provide a clear call to action after a process is complete. 'props.text' and 'props.payload'.
          
          **Your Thought Process:**
          1.  **Review the Original Goal:** The user's initial request was: "${context.collected_info.originalPrompt}".
          2.  **Analyze the Data:** Examine the JSON data from the specialists. What information do you have?
          3.  **Select the Right UI Tools:** Choose the BEST components from your "UI Design Palette". A list of transactions needs a 'DATA_TABLE'. An account balance needs 'KEY_VALUE_DISPLAY'.
          4.  **Craft the Narrative:** Formulate a conversational "speech" that summarizes the findings.
          5.  **Construct the Final UI JSON:** Build the 'ui' object using your chosen components.

          **Your Response MUST be a valid UARP JSON object only.**

          ---
          **Data from Specialist Agents:**
          ${JSON.stringify(specialistResults, null, 2)}
          ---

          Now, analyze the data, select the best UI components from your palette, and generate the final UARP JSON response.
        `;
  
        const result = await geminiModel.generateContent(llmPrompt);
        const rawResponseText = result.response.text();
        console.log("[GeneralAgent-Synthesize] Raw LLM Response:", rawResponseText);
        const responseJson = JSON.parse(extractJsonFromResponse(rawResponseText));
  
        return {
          status: 'COMPLETE',
          speech: responseJson.speech,
          ui: responseJson.ui,
          action: { type: 'COMPLETE_GOAL' },
          context: {
            ...context,
            status: 'complete',
            history: [...context.history, 'GeneralAgent synthesized specialist results.'],
          },
        };
  
      } catch (error: any) {
        console.error('[GeneralAgent-Synthesize] Error:', error);
        return this.createErrorResponse(context, error.message);
      }
  }

  private createErrorResponse(context: ConversationContext, errorMessage: string): AgentResponse {
    return {
      status: 'COMPLETE',
      speech: "I seem to have hit a snag while processing that. Could you try rephrasing?",
      ui: { type: 'TEXT', props: { title: "Cognitive Error", text: `Details: ${errorMessage}` } },
      action: { type: 'COMPLETE_GOAL' },
      context: { ...context, status: 'failed', history: [...context.history, `GeneralAgent failed: ${errorMessage}`] },
    };
  }
}