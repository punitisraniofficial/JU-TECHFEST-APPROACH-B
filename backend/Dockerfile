FROM python:3.11-slim

# Install minimal system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source and public directory
COPY backend/ ./backend/
COPY public/ ./public/

ENV PORT=8000
EXPOSE 8000

CMD ["python3", "backend/prescription_server.py", "8000"]
