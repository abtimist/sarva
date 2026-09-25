FROM node:22-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm install

COPY server/src ./server/src
COPY public ./public
COPY .env* ./

EXPOSE 3000

CMD ["node", "server/src/index.js"]
