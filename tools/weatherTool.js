import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

export class WeatherError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.name = 'WeatherError';
    this.code = code;
    this.retryable = retryable;
  }
}

class Tool {
  constructor({ name, description, inputSchema, outputSchema, run }) {
    this.name = name;
    this.description = description;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;
    this.run = run;
  }
}

async function fetchWithRetry(url, retries = 1, delay = 500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        throw new WeatherError('UPSTREAM_UNAVAILABLE', 'Weather data is temporarily unavailable.', { retryable: response.status >= 500 });
      }
      const data = JSON.parse(text);
      return data;
    } catch (err) {
      const normalized = err instanceof WeatherError
        ? err
        : new WeatherError('UPSTREAM_UNAVAILABLE', 'Weather data is temporarily unavailable.', { retryable: true });
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw normalized;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function fetchWeatherData({ location, date, query_type, num_days = 3, tp = 24 }) {
  if (!location || !query_type) {
    throw new WeatherError('INVALID_INPUT', 'location and query_type are required.');
  }

  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) throw new WeatherError('CONFIGURATION_ERROR', 'WeatherTrax is temporarily unavailable.');

  const endpoint = 'https://api.worldweatheronline.com/premium/v1/weather.ashx';
  const params = new URLSearchParams({
    key: apiKey,
    q: location,
    format: 'json',
    num_of_days: query_type === 'multi_day' ? num_days.toString() : '1',
    tp: tp.toString() ,
    includeLocation: 'yes',
    fx: 'yes',
    showlocaltime: 'yes'
  });

  const url = `${endpoint}?${params.toString()}`;
  const data = await fetchWithRetry(url);

  if (!data || !data.data) {
    throw new WeatherError('MALFORMED_UPSTREAM_RESPONSE', 'Weather data is temporarily unavailable.', { retryable: true });
  }

  if (data.data.error) {
    const providerMessage = data.data.error[0]?.msg?.toLowerCase() || '';
    if (/(quota|limit|exceed|subscription)/.test(providerMessage)) {
      throw new WeatherError('QUOTA_EXHAUSTED', 'WeatherTrax has reached its current weather-data capacity. Please try again later.', { retryable: true });
    }
    if (/(invalid|not found|unable to find|no matching)/.test(providerMessage)) {
      throw new WeatherError('INVALID_LOCATION', 'WeatherTrax could not find that location. Try a city, postal code, or coordinates.');
    }
    throw new WeatherError('UPSTREAM_UNAVAILABLE', 'Weather data is temporarily unavailable.', { retryable: true });
  }

  const dayData = data.data.weather;
  const current = data.data.current_condition?.[0];

  switch (query_type) {
   case 'multi_day':
      return {
        forecast: dayData.map(d => ({
          date: d.date,
          high: parseFloat(d.maxtempF),
          low: parseFloat(d.mintempF),
          condition: d.hourly[0].weatherDesc[0].value,
          precip_chance: parseFloat(d.hourly[0].chanceofrain) / 100,
          wind: `${d.hourly[0].windspeedMiles} mph ${d.hourly[0].winddir16Point}`,
          sunrise: d.astronomy?.[0]?.sunrise,
          sunset: d.astronomy?.[0]?.sunset,
          hourly: tp < 24 ? d.hourly.map(h => ({
            time: h.time,
            temp: parseFloat(h.tempF),
            condition: h.weatherDesc[0].value,
            wind: `${h.windspeedMiles} mph ${h.winddir16Point}`,
            precip_chance: parseFloat(h.chanceofrain) / 100,
            visibility: parseInt(h.visibilityMiles),
            cloud_cover: parseInt(h.cloudcover),
            humidity: parseInt(h.humidity),
            chance_of_fog: parseInt(h.chanceoffog),
            chance_of_thunder: parseInt(h.chanceofthunder)
          })) : undefined
        }))
      };

    case 'forecast':
      const day = dayData.find(d => d.date === date);
      if (!date) throw new WeatherError('INVALID_INPUT', 'date is required when query_type is forecast.');
      if (!day) throw new WeatherError('INVALID_INPUT', `No forecast is available for ${date}.`);
      return {
        summary: `${day.date}: High of ${day.maxtempF}°F, Low of ${day.mintempF}°F, ${day.hourly[0].weatherDesc[0].value}`,
        temp_high: parseFloat(day.maxtempF),
        temp_low: parseFloat(day.mintempF),
        condition: day.hourly[0].weatherDesc[0].value,
        precip_chance: parseFloat(day.hourly[0].chanceofrain) / 100,
        wind: `${day.hourly[0].windspeedMiles} mph ${day.hourly[0].winddir16Point}`,
        sunrise: day.astronomy?.[0]?.sunrise,
        sunset: day.astronomy?.[0]?.sunset
      };

    case 'current':
      return {
        summary: `It is currently ${current.temp_F}°F and ${current.weatherDesc[0].value} in ${location}.`,
        temp_high: parseFloat(current.temp_F),
        temp_low: parseFloat(current.temp_F),
        condition: current.weatherDesc[0].value,
        wind: `${current.windspeedMiles} mph ${current.winddir16Point}`,
        feels_like: parseFloat(current.FeelsLikeF),
        humidity: parseInt(current.humidity),
        uv_index: parseInt(current.uvIndex),
        visibility: parseFloat(current.visibility),
        pressure: parseFloat(current.pressure),
        cloud_cover: parseInt(current.cloudcover),
        dew_point: current.DewPointF ? parseFloat(current.DewPointF) : null,
        units: {
          temperature: "°F",
          distance: "miles",
          speed: "mph",
          pressure: "mb"
        }
      };

    case 'sunrise_sunset':
      const astronomy = dayData?.[0]?.astronomy?.[0];
      if (!astronomy) throw new WeatherError('UPSTREAM_UNAVAILABLE', 'Astronomy data is temporarily unavailable.');
      return {
        sunrise: astronomy.sunrise,
        sunset: astronomy.sunset,
        moonrise: astronomy.moonrise,
        moonset: astronomy.moonset,
        moon_phase: astronomy.moon_phase
      };

    case 'rain_check':
      const rainWindow = dayData[0].hourly.find(h => parseInt(h.chanceofrain) > 50);
      return {
        will_rain: !!rainWindow,
        rain_start: rainWindow ? rainWindow.time : null,
        rain_end: rainWindow ? `${parseInt(rainWindow.time) + 100}` : null,
        precip_chance: rainWindow ? parseFloat(rainWindow.chanceofrain) / 100 : 0
      };

    default:
      throw new WeatherError('INVALID_INPUT', `Unsupported query_type: ${query_type}`);
  }
}

export const weatherTool = new Tool({
  name: 'weatherTool',
  description: 'Provides current weather, forecasts, and timing for rain or sun events based on location and date.',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name, ZIP/postal code, or place name (e.g. "Boca Raton")'
      },
      date: {
        type: 'string',
        format: 'date',
        description: 'Target date (YYYY-MM-DD). Required for some query types.'
      },
      query_type: {
        type: 'string',
        enum: ['current', 'forecast', 'multi_day', 'sunrise_sunset', 'rain_check'],
        description: 'Type of weather query.'
      },
      num_days: {
        type: 'integer',
        minimum: 1,
        maximum: 14,
        description: 'Number of days (only used with "multi_day")'
      },
       tp: {
        type: 'integer',
        enum: [1, 3, 6, 12, 24],
        description: 'Forecast time interval in hours. 3 = 3-hourly, 24 = daily average (default).'
      }
    },
    required: ['location', 'query_type']
  },
  outputSchema: {
    type: 'object',
    properties: {
      feels_like: { type: 'number' },
      humidity: { type: 'number' },
      uv_index: { type: 'number' },
      visibility: { type: 'number' },
      pressure: { type: 'number' },
      cloud_cover: { type: 'number' },
      dew_point: { type: ['number', 'null'] },
      moonrise: { type: 'string' },
      moonset: { type: 'string' },
      moon_phase: { type: 'string' },
      summary: { type: 'string' },
      temp_high: { type: 'number' },
      temp_low: { type: 'number' },
      precip_chance: { type: 'number' },
      condition: { type: 'string' },
      wind: { type: 'string' },
      sunrise: { type: 'string' },
      sunset: { type: 'string' },
      forecast: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string' },
            high: { type: 'number' },
            low: { type: 'number' },
            condition: { type: 'string' }
          }
        }
      },
      will_rain: { type: 'boolean' },
      rain_start: { type: 'string' },
      rain_end: { type: 'string' },
      units: {
        type: 'object',
        properties: {
          temperature: { type: 'string' },
          distance: { type: 'string' },
          speed: { type: 'string' },
          pressure: { type: 'string' }
        }
      }
    }
  },
  run: async (input) => {
    return fetchWeatherData(input);
  }
});
