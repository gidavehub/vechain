import { AgentResponse, IAgent, extractJsonFromResponse } from '../agentUtils';
import { ConversationContext } from '../router';
import { geminiModel } from '../../geminiServices';

// --- MODIFICATION: Updated the required info keys for clarity (accountId -> vechainAddress) ---
const REQUIRED_INFO = ["name", "password", "vechainAddress", "privateKey"];

export default class OnboardingAgent implements IAgent {
  public async execute(prompt: string, context: ConversationContext): Promise<AgentResponse> {
    console.log('[OnboardingAgent V4-VeChain] Executing with branching logic...');
    let updatedContext = { ...context };

    // --- State Logic: Handle user responses from previous turns ---
    const currentStepKey = context.collected_info.onboarding_step;

    if (currentStepKey && currentStepKey !== 'account_choice') {
      updatedContext.collected_info[currentStepKey] = prompt;
    }

    // --- State Logic: Handle the choice between creating/providing an account ---
    if (currentStepKey === 'account_choice') {
      if (prompt === 'create_new_vechain_account') {
        // User wants a new account. Delegate to the createVeChainAccountAgent.
        return this.delegateToCreateAccount(updatedContext);
      }
      if (prompt === 'provide_existing_vechain_account') {
        // User has an account. We'll proceed to ask for the vechainAddress.
        // We clear the step so the main logic can find the next required info.
        updatedContext.collected_info.onboarding_step = null;
      }
    }
    
    // --- State Logic: Handle resuming after account creation ---
    const createAccountResult = context.collected_info.specialist_results?.[0];
    if (createAccountResult && createAccountResult.context?.goal === 'createVeChainAccount') {
        console.log('[OnboardingAgent V4-VeChain] Resuming from CreateVeChainAccountAgent result.');
        // --- MODIFICATION: Use the VeChain-specific keys from our new agent's context ---
        const { lastCreatedVechainAddress, lastCreatedVechainPrivateKey } = createAccountResult.context.collected_info;
        if (lastCreatedVechainAddress && lastCreatedVechainPrivateKey) {
            updatedContext.collected_info.vechainAddress = lastCreatedVechainAddress;
            updatedContext.collected_info.privateKey = lastCreatedVechainPrivateKey;
            // Clean up the specialist results so we don't process them again.
            delete updatedContext.collected_info.specialist_results;
        }
    }


    // --- Main Logic: Find the next piece of info to collect ---
    const nextInfoToCollect = REQUIRED_INFO.find(info => !updatedContext.collected_info[info]);

    if (nextInfoToCollect) {
      // Special branching logic for account address.
      if (nextInfoToCollect === 'vechainAddress') {
        return this.generateAccountChoiceResponse(updatedContext);
      }
      // For all other info, use the standard question generator.
      return this.generateQuestionResponse(nextInfoToCollect, updatedContext);
    } else {
      // If we have everything, generate the final success response.
      return this.generateCompletionResponse(updatedContext);
    }
  }

  /**
   * Generates a UI to ask the user if they have an account or need a new one.
   */
  private generateAccountChoiceResponse(context: ConversationContext): AgentResponse {
    const currentStep = REQUIRED_INFO.indexOf('vechainAddress') + 1;
    const totalSteps = REQUIRED_INFO.length;

    return {
      status: 'AWAITING_INPUT',
      // --- MODIFICATION: Updated speech for VeChain ---
      speech: "Great. Now, do you already have a VeChain wallet address and private key, or would you like me to create a new one for you?",
      ui: {
        type: 'LAYOUT_STACK',
        props: {
          children: [
            {
              type: 'STEPPER',
              props: {
                currentStep: currentStep,
                totalSteps: totalSteps,
                title: "Account Setup"
              }
            },
            {
              type: 'TEXT',
              props: {
                // --- MODIFICATION: Updated text for VeChain ---
                title: "VeChain Wallet",
                text: "To interact with the VeChainThor network, you need a wallet. You can provide your existing credentials or create a new, free testnet wallet."
              }
            },
            {
              type: 'BUTTON_GROUP',
              props: {
                buttons: [
                  // --- MODIFICATION: Updated button text and payloads for VeChain ---
                  { text: "I have a wallet", payload: "provide_existing_vechain_account" },
                  { text: "Create a new wallet", payload: "create_new_vechain_account" },
                ]
              }
            }
          ]
        }
      },
      action: { type: 'REQUEST_USER_INPUT' },
      context: {
        ...context,
        collected_info: {
          ...context.collected_info,
          // --- MODIFICATION: Use a generic step name for clarity ---
          onboarding_step: 'account_choice',
        },
        status: 'awaiting_user_input',
        history: [...context.history, `OnboardingAgent is asking for account choice.`],
      },
    };
  }

  /**
   * Generates a DELEGATE response to trigger the CreateVeChainAccountAgent.
   */
  private delegateToCreateAccount(context: ConversationContext): AgentResponse {
    return {
      status: 'DELEGATING',
      speech: "Excellent! I'll create a new secure VeChain testnet wallet for you now. One moment.",
      ui: {
        type: 'LOADING',
        props: {
          text: "Generating new VeChain wallet..."
        }
      },
      action: {
        type: 'DELEGATE',
        payload: {
          // --- MODIFICATION: Delegate to the new VeChain agent ---
          agent: 'vechain/createAccountAgent',
          prompt: 'The user wants to create a new VeChain account during onboarding.'
        }
      },
      context: {
        ...context,
        status: 'delegating',
        history: [...context.history, 'OnboardingAgent is delegating to CreateVeChainAccountAgent.'],
      }
    };
  }

  /**
   * Generates a UARP response with the UI for the next question.
   */
  private async generateQuestionResponse(infoNeeded: string, context: ConversationContext): Promise<AgentResponse> {
    const currentStep = REQUIRED_INFO.indexOf(infoNeeded) + 1;
    const totalSteps = REQUIRED_INFO.length;
    let ui, speech;
    
    const emojiMap: Record<string, string> = {
      name: '🧑',
      vechainAddress: '🆔',
      privateKey: '🔑',
      password: '🔢',
    };
    
    const placeholderMap: Record<string, string> = {
      name: 'Enter your name...',
      vechainAddress: 'Enter your VeChain Wallet Address (0x...)...',
      privateKey: 'Paste your private key...',
      password: 'Enter a numeric password...',
    };

    const speechMap: Record<string, string> = {
      name: "Let's get started! What's your name?",
      vechainAddress: "What's your VeChain wallet address?",
      privateKey: "Please provide your private key. Don't worry, it's encrypted!",
      password: "Set a numeric password (numbers only) for signing transactions. Make it memorable!",
    };
    
    const titleMap: Record<string, string> = {
        name: 'Your Name',
        vechainAddress: 'VeChain Address',
        privateKey: 'Private Key',
        password: 'Set Your Password'
    };

    if (infoNeeded === 'password') {
      ui = {
        type: 'LAYOUT_STACK',
        props: {
          children: [
            {
              type: 'STEPPER',
              props: { currentStep, totalSteps, title: 'Onboarding Progress' }
            },
            {
              type: 'NUMERIC_KEYPAD_INPUT',
              props: {
                title: titleMap[infoNeeded],
                buttonText: 'Save Password',
                emoji: emojiMap[infoNeeded],
                onSubmit: undefined
              }
            }
          ]
        }
      };
      speech = speechMap[infoNeeded];
    } else {
      ui = {
        type: 'LAYOUT_STACK',
        props: {
          children: [
            {
              type: 'STEPPER',
              props: { currentStep, totalSteps, title: 'Onboarding Progress' }
            },
            {
              type: 'TEXT_INPUT',
              props: {
                title: titleMap[infoNeeded],
                placeholder: placeholderMap[infoNeeded],
                buttonText: 'Submit',
                inputType: infoNeeded === 'privateKey' ? 'password' : 'text',
                emoji: emojiMap[infoNeeded],
                onSubmit: undefined
              }
            }
          ]
        }
      };
      speech = speechMap[infoNeeded];
    }

    return {
      status: 'AWAITING_INPUT',
      speech,
      ui,
      action: { type: 'REQUEST_USER_INPUT' },
      context: {
        ...context,
        collected_info: {
          ...context.collected_info,
          onboarding_step: infoNeeded,
        },
        status: 'awaiting_user_input',
        history: [...context.history, `OnboardingAgent is requesting '${infoNeeded}'.`],
      },
    };
  }

  /**
   * Generates the final UARP response when onboarding is complete.
   */
  private generateCompletionResponse(context: ConversationContext): AgentResponse {
    // --- MODIFICATION: Destructure the VeChain-specific keys ---
    const { name, vechainAddress, privateKey, password } = context.collected_info;
    
    return {
      status: 'COMPLETE',
      speech: `All set, ${name}! I've securely encrypted and saved your credentials for this session. You can now use the Nexus Bar to command the VeChain network.`,
      ui: {
        type: 'KEY_VALUE_DISPLAY',
        props: {
          title: 'Setup Complete!',
          items: [
            { key: "Name", value: name },
            // --- MODIFICATION: Update UI to show VeChain address ---
            { key: "VeChain Address", value: vechainAddress },
            { key: "Status", value: "Credentials saved and encrypted locally." }
          ]
        },
      },
      action: {
        type: 'SAVE_CREDENTIALS',
        // --- MODIFICATION: Pass VeChain-specific data in the payload ---
        payload: { name, vechainAddress, privateKey, password },
      },
      context: {
        ...context,
        collected_info: {
          ...context.collected_info,
        },
        status: 'complete',
        goal: 'onboarding_complete',
        history: [...context.history, 'OnboardingAgent completed successfully.'],
      },
    };
  }
}