FROM python:3.12-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1

COPY pyproject.toml ./
COPY src ./src

RUN pip install --no-cache-dir uv \
    && uv venv /app/.venv \
    && uv pip install --python /app/.venv/bin/python \
        "mistralai>=1.0.0" \
        "mistralai-workflows[mistralai]>=0.1.0" \
        "pydantic>=2.0.0"

ENV PATH="/app/.venv/bin:$PATH"

CMD ["python", "src/entrypoints/worker.py"]
