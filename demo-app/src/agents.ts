/** 
 * Mock Agents implementing a fixed seed PRNG to simulate deterministic LLM outputs
 * for a reproducible evaluation of the Support Triage System.
 */

// Simple seeded random to fulfill "reproducible with fixed seed" constraint
function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export class CategorizerAgent {
  private prng: () => number;
  
  constructor(seed: number) {
    this.prng = mulberry32(seed);
  }

  async process(ticketText: string): Promise<any> {
    await new Promise(r => setTimeout(r, 1000 + this.prng() * 1000));
    
    // Simple mock logic
    let category = "General";
    if (ticketText.toLowerCase().includes("billing") || ticketText.toLowerCase().includes("charge")) {
      category = "Billing";
    } else if (ticketText.toLowerCase().includes("error") || ticketText.toLowerCase().includes("bug")) {
      category = "Technical";
    }

    const urgency = ticketText.toLowerCase().includes("urgent") ? "High" : "Normal";
    const confidence = 0.8 + (this.prng() * 0.19); // 0.80 to 0.99

    return {
      category,
      urgency,
      confidence: parseFloat(confidence.toFixed(2))
    };
  }
}

export class InvestigatorAgent {
  private prng: () => number;

  constructor(seed: number) {
    this.prng = mulberry32(seed + 1); // offset seed for variety
  }

  async process(_ticketText: string, categorizerOutput: any): Promise<any> {
    await new Promise(r => setTimeout(r, 1200 + this.prng() * 1000));

    let policies: string[] = [];
    let strategy = "";

    switch(categorizerOutput.category) {
      case "Billing":
        policies = ["Refund Policy 2.1", "Data Verification"];
        strategy = "Verify user identity and check latest invoice. Pre-approve refund if eligible.";
        break;
      case "Technical":
        policies = ["Tech Support SLA", "Bug Escalation Matrix"];
        strategy = "Acknowledge issue, ask for browser version, escalate to L2 support.";
        break;
      default:
        policies = ["General FAQ"];
        strategy = "Send standard greeting and ask for more clarification on their request.";
    }

    // Add urgency modifier
    if (categorizerOutput.urgency === "High") {
      strategy += " Expedite response within 2 hours.";
    }

    return {
      relevant_policies: policies,
      strategy
    };
  }
}

export class ResponderAgent {
  private prng: () => number;

  constructor(seed: number) {
    this.prng = mulberry32(seed + 2);
  }

  async process(_ticketText: string, investigatorOutput: any): Promise<any> {
    await new Promise(r => setTimeout(r, 1500 + this.prng() * 1000));

    const policyString = investigatorOutput.relevant_policies.join(", ");
    let draft = `Dear Customer,\n\nThank you for reaching out. Based on our ${policyString}, `;
    
    if (investigatorOutput.strategy.includes("Refund")) {
      draft += "we are currently reviewing your latest invoice. If eligible, your refund will be processed within 3-5 business days.";
    } else if (investigatorOutput.strategy.includes("L2 support")) {
      draft += "we have escalated your ticket to our technical team. Could you please reply with your current browser version?";
    } else {
      draft += "could you please provide more details so we can assist you better?";
    }

    draft += "\n\nBest regards,\nCustomer Support Team";

    return {
      response_draft: draft,
      tone: "Compassionate & Professional",
      word_count: draft.split(" ").length
    };
  }
}
