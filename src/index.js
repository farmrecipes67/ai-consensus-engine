/**
 * ai-consensus-engine
 * Multi-model consensus for reducing AI hallucinations.
 * @module ai-consensus-engine
 */

class AIConsensusEngine {
  constructor(options = {}) {
    this.providers = options.providers || [];
    this.threshold = options.threshold || 0.6;
    this.mergeAI = options.mergeAI || null;
    if (this.providers.length === 0) throw new Error('At least one provider required');
  }

  async query(prompt, options = {}) {
    const systemPrompt = options.systemPrompt || '';
    const responses = await Promise.allSettled(
      this.providers.map(p => p.call(prompt, systemPrompt))
    );

    const successful = [];
    const failures = [];
    responses.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        successful.push({ provider: this.providers[i].name || 'provider-' + i, response: r.value });
      } else {
        failures.push({ provider: this.providers[i].name || 'provider-' + i, error: r.reason.message });
      }
    });

    if (successful.length === 0) {
      return { success: false, consensus: null, responses: [], failures, agreement: 0 };
    }

    if (successful.length === 1) {
      return { success: true, consensus: successful[0].response, responses: successful, failures, agreement: 1 };
    }

    const consensus = await this._buildConsensus(successful, prompt);
    return { success: true, ...consensus, failures };
  }

  async _buildConsensus(responses, originalPrompt) {
    if (!this.mergeAI) {
      return { consensus: responses[0].response, responses, agreement: 1 / responses.length };
    }

    const mergePrompt = 'Multiple AI models answered the same question. Synthesize a consensus answer.\n\n' +
      'ORIGINAL QUESTION: ' + originalPrompt + '\n\n' +
      responses.map((r, i) => 'MODEL ' + (i + 1) + ' (' + r.provider + '):\n' + r.response).join('\n\n') +
      '\n\nProvide:\n1. The consensus answer\n2. Agreement level (0.0-1.0)\n3. Any disagreements\n' +
      'Format as JSON: {"consensus":"...","agreement":0.0,"disagreements":["..."]}';

    const raw = await this.mergeAI(mergePrompt, 'You synthesize multi-model outputs objectively.');
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end > start) {
        const parsed = JSON.parse(raw.substring(start, end + 1));
        return { consensus: parsed.consensus, agreement: parsed.agreement || 0.5, disagreements: parsed.disagreements || [], responses };
      }
    } catch (e) {}
    return { consensus: raw, agreement: 0.5, responses };
  }
}

module.exports = AIConsensusEngine;