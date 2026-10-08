"""Make the test suite hermetic.

`app.main` calls `load_dotenv(override=True)` at import time, which previously
let a developer's `.env` override `LLM_PROVIDER=mock` - the "mock LLM" contract
tests were silently making live calls to a real provider. pytest imports
conftest before any test module, so neutralising dotenv here is enough.
"""

import os

import dotenv

dotenv.load_dotenv = lambda *args, **kwargs: False

os.environ["LLM_PROVIDER"] = "mock"
os.environ["APP_ENV"] = "test"
os.environ.pop("SUPABASE_JWT_SECRET", None)
