FROM node:20

WORKDIR /app

# Install native build tools
RUN apt-get update && apt-get install -y python3 make g++ gcc

# Copy entire project
COPY . .

# Install backend dependencies using npm (not pnpm)
WORKDIR /app/backend
RUN npm install

# Build backend
RUN npm run build

EXPOSE 4000

CMD ["node", "dist/server.js"]

