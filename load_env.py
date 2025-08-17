import os
from dotenv import load_dotenv

def load_api_key():
    # Load from .env file into environment variables
    load_dotenv()
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found. Please add it to your .env file.")
    
    return api_key

if __name__ == "__main__":
    key = load_api_key()
    print("API Key loaded:", key[:6] + "..." + key[-4:])  # mask for safety
