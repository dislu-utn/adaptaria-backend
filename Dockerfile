FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y curl

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm ci

# Bundle app source
COPY . .

# Build the TypeScript files
RUN npm run build

# Expose port 8080

ENV PORT=8080
EXPOSE 8080

# Start the app
CMD npm run start
