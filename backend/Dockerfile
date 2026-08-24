FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Runtime shared libraries required by the eclipse-sumo wheel (headless).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libx11-6 libxext6 libxrender1 libgl1 libgomp1 fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
