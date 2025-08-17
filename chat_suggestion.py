from openai import OpenAI
from load_env import load_api_key
import re

def _generate_model_prompt(chat_history: list[str]) -> list:
    messages = [
        {"role": "system", "content": "You are a family communication facilitator. Your role is to help family members talk clearly, respectfully, and empathetically. Based on the chat history, generate example chat replies that a family member could realistically send. Provide exactly three variations, and format them clearly as:\n\nOption 1: <suggestion>\nOption 2: <suggestion>\nOption 3: <suggestion>\n\nEach option should be concise, supportive, and constructive."},
        {"role": "user", "content": "\n".join(chat_history)}

    ]
    return messages

def _parse_suggestions(text: str):
    PATTERN = re.compile(
        r'^\s*Option\s*(\d+)\s*:\s*(.+?)(?=\n\s*Option\s*\d+\s*:|\Z)',
        flags=re.IGNORECASE | re.MULTILINE | re.DOTALL
    )
    matches = PATTERN.findall(text)
    # Return as a dict keyed by option number (int), with trimmed suggestion text
    return [s.strip() for _, s in matches]



_client = None

def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=load_api_key())
    return _client

def get_facilitator_suggestions(chat_history: list[str]):

    client = _get_client()

    messages = _generate_model_prompt(chat_history)

    response = client.chat.completions.create(
        model="gpt-5-mini",
        messages=messages
    )
    
    text = response.choices[0].message.content
    suggestions = _parse_suggestions(text)

    return suggestions

if __name__ == "__main__":
    # Example chat history
    chat_history = [
        "Hi Mom",
        "I felt upset about yesterday at dinner",
        "Can we talk later?"
    ]
    
    suggestions = get_facilitator_suggestions(chat_history)
    print(suggestions)
