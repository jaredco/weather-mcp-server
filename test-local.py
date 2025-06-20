 
import openai
import requests
import json

 
client = openai.OpenAI(api_key="sk-proj-uG1JGmLXlIlrv6dgESLkT3BlbkFJuyjcfPwub3NYtWjlDMUd")  # use client not module-level



# Define the tool (same as your manifest)
tool_definition = {
    "type": "function",
    "function": {
        "name": "weatherTool",
        "description": "Provides current weather, forecasts, and timing for rain/sun events based on location and date.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City or ZIP"},
                "date": {"type": "string", "description": "Date in YYYY-MM-DD format"},
                "query_type": {
                    "type": "string",
                    "enum": ["current", "forecast", "multi_day", "sunrise_sunset", "rain_check"]
                },
                "num_days": {
                    "type": "integer",
                    "description": "Number of days to forecast (only for multi_day)"
                }
            },
            "required": ["location", "query_type"]
        }
    }
}

def call_weather_tool_with_openai(question):
    print(f"👤 Asking GPT: {question}")

    # Step 1: Ask GPT with tool support
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": question}],
        tools=[tool_definition],
        tool_choice="auto"
    )

    # Step 2: Extract tool call
    tool_call = response.choices[0].message.tool_calls[0]
    tool_name = tool_call.function.name
    tool_args = json.loads(tool_call.function.arguments)

    print(f"🛠 GPT wants to call tool: {tool_name}")
    print(f"📦 Tool input: {tool_args}")

    # Step 3: Call your local MCP server
    result = requests.post("http://localhost:3000", json={
        "type": "call-tool",
        "tool_id": tool_name,
        "input": tool_args
    })

    print("🌦 MCP WeatherTool responded:")
    print(result.json())

# Example call
call_weather_tool_with_openai("Give me 1 day weather forecast (use multi-day and num_days=1) for Miami")