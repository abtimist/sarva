FROM python:3.11-slim

# Install Node.js 22 and curl
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python requirements (if exists, or just install them directly)
COPY server/transcribe.py server/
RUN pip install flask requests

# Copy Node.js dependencies
COPY server/package*.json server/
RUN cd server && npm install --production

# Copy application files
COPY . .

# Create start script
RUN echo '#!/bin/bash\n\
cd /app\n\
python3 server/transcribe.py &\n\
cd /app/server && node index.js\n\
' > /start.sh && chmod +x /start.sh

ENV PORT=3000
ENV TRANSCRIBE_PORT=5001

EXPOSE 3000

CMD ["/start.sh"]
