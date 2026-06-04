import Anthropic from '@anthropic-ai/sdk';
import { PageObservation, InferredFlow } from '../schema/inferred-flow.js';

export class FlowInferencer {
  private static client: Anthropic | null = null;

  private static getClient(): Anthropic {
    if (!FlowInferencer.client) {
      FlowInferencer.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
    return FlowInferencer.client;
  }

  async inferFlows(
    observations: PageObservation[],
    skillContent?: string
  ): Promise<InferredFlow[]> {
    console.log(`→ Sending ${observations.length} page observations to Claude...`);

    const systemPrompt = `You are an expert at analysing web application UI observations and identifying
distinct user flows. You will be given a list of page observations from a web
application crawl. Each observation contains a URL, page title, headings, and
a list of interactable elements.

Your task is to identify all distinct user flows visible in this application.
A user flow is a sequence of UI interactions that achieves a specific goal.

For each flow you identify, return:
- name: short descriptive name (e.g. "User Login", "Create New Record")
- description: one sentence describing what the user accomplishes
- category: one of [authentication, navigation, data-entry, data-management, search, checkout, settings, other]
- actor: the type of user performing the flow (e.g. "User", "Admin", "Guest")
- entryPoint: the URL or UI element where the flow begins
- steps: ordered array of steps, each with stepNumber, action, target, expectedOutcome
- exitPoint: the final state or URL after the flow completes
- confidence: float 0.0–1.0 based on evidence strength

Confidence guidance:
- 0.85+ : clear entry URL, clear exit URL, all steps have UI evidence
- 0.60–0.85 : steps inferred from element labels without URL confirmation
- below 0.60 : speculative — partial evidence only

Return ONLY a valid JSON array of flow objects. No markdown. No explanation.
No preamble. The response must start with [ and end with ].${
      skillContent
        ? `

## App-specific guidance
${skillContent}`
        : ''
    }`;

    const userPrompt = `Here are the page observations from the crawl:

${JSON.stringify(observations, null, 2)}

Identify all distinct user flows.`;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const client = FlowInferencer.getClient();
        const response = await client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const content = response.content[0];
        if (content.type !== 'text') {
          throw new Error('Unexpected response type');
        }

        let text = content.text.trim();
        if (text.startsWith('```')) {
          text = text.replace(/^```.*?\n/, '').replace(/\n```$/, '');
        }

        const flows: InferredFlow[] = JSON.parse(text);

        if (!Array.isArray(flows)) {
          throw new Error('Response is not an array');
        }

        console.log(`✓ Inferred ${flows.length} flows`);
        return flows;
      } catch (error) {
        lastError = error as Error;
        if (attempt < 3) {
          console.log(`⚠ Inference attempt ${attempt} failed, retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    console.error('✗ Inference failed after 3 attempts:', lastError);
    return [];
  }
}
