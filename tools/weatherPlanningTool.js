// weatherPlanningTool.js
// ChatGPT App-specific tool for planning/operational queries.
// Does NOT make decisions — returns authoritative weather data for ChatGPT to reason over.
// Delegates internally to weatherTool for all data fetching.

import { weatherTool } from './weatherTool.js';

class Tool {
  constructor({ name, description, inputSchema, outputSchema, run }) {
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;
    this.run = run;
  }
}

export const weatherPlanningTool = new Tool({
  name: 'weatherPlanningTool',
  description: 'Returns authoritative 7-day weather data for planning construction, outdoor work, or events. Does not make decisions—provides data for reasoning.',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name, ZIP/postal code, or place name (e.g. "Boca Raton")'
      },
      context: {
        type: 'string',
        description: 'Optional planning context (e.g. "construction", "outdoor event")'
      },
      timeframe: {
        type: 'string',
        description: 'Optional timeframe hint (e.g. "next week", "Thursday")'
      }
    },
    required: ['location']
  },
  // Reuse existing output schema exactly
  outputSchema: weatherTool.outputSchema,

  run: async (input) => {
    console.log('[WeatherPlanningTool] Input:', input);

    // Map planning-specific input to weatherTool parameters
    const weatherParams = {
      location: input.location,
      query_type: 'multi_day',
      num_days: 7
    };

    try {
      // Delegate to weatherTool
      const result = await weatherTool.run(weatherParams);

      // Add provenance metadata
      const enrichedResult = {
        ...result,
        source: 'World Weather Online',
        generated_at: new Date().toISOString()
      };

      console.log('[WeatherPlanningTool] Result:', enrichedResult);
      return enrichedResult;
    } catch (err) {
      console.error('[WeatherPlanningTool] Error:', err);
      throw err;
    }
  }
});
