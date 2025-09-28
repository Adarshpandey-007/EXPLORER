/* Gemini Client abstraction
 * Supports models: gemini-2.5-flash, gemini-2.5-pro
 * Provides ask(question, context, options) returning text answer.
 * Uses REST fetch (v1beta) compatible with public Generative Language API.
 * Automatically falls back flash<->pro on 404 errors.
 */
(function(global){
  class GeminiClient {
    constructor(apiKey){
      this.apiKey = apiKey || null;
      this.allowedModels = ['gemini-2.5-flash','gemini-2.5-pro'];
    }
    setApiKey(key){ this.apiKey = key; }
    normalizeModel(model){
      if(!model) return 'gemini-2.5-flash';
      const lower = model.toLowerCase();
      // Map legacy *-latest suffix
      if(lower.includes('flash')) return 'gemini-2.5-flash';
      if(lower.includes('pro')) return 'gemini-2.5-pro';
      return 'gemini-2.5-flash';
    }
    buildBody(model, question, context, opts){
      const prompt = `Model: ${model}\nContext (book/page excerpt):\n${context}\n---\nQuestion: ${question}\nAnswer concisely and helpfully.`;
      const config = {};
      if(opts){
        if(typeof opts.temperature==='number') config.temperature = opts.temperature;
        if(opts.disableThinking){
          config.thinkingConfig = { thinkingBudget: 0 };
        } else if(typeof opts.thinkingBudget==='number'){
          config.thinkingConfig = { thinkingBudget: opts.thinkingBudget };
        }
        if(opts.systemInstruction){
          config.systemInstruction = opts.systemInstruction;
        }
      }
      return { contents:[ { role:'user', parts:[ { text: prompt } ] } ], config: Object.keys(config).length?config:undefined };
    }
    async invoke(model, body){
      if(!this.apiKey) throw new Error('Missing API key');
      const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(this.apiKey);
      const res = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      if(!res.ok) throw new Error('HTTP '+res.status+' '+model);
      const data = await res.json();
      const txt = data?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('\n') || '';
      return txt.trim() || '(Empty response)';
    }
    async ask(question, context, options){
      const primary = this.normalizeModel(options?.model);
      const fallbacks = [primary, primary.includes('flash')?'gemini-2.5-pro':'gemini-2.5-flash'];
      let lastErr; let attempt=0;
      for(const model of fallbacks){
        attempt++;
        try {
          const body = this.buildBody(model, question, context, options);
            return await this.invoke(model, body);
        } catch(e){
          lastErr=e;
          if(!/404/.test(e.message||'')) break; // only continue on 404 to other model
        }
      }
      throw lastErr || new Error('Gemini request failed');
    }
  }
  global.GeminiClient = GeminiClient;
})(window);
