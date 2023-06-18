FROM debian:bullseye-slim

RUN apt-get update
RUN apt-get install -y curl

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
RUN chmod a+rx /usr/local/bin/yt-dlp

# Install node lts/hydrogen
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - &&\
  apt-get install -y nodejs

# Copy app
COPY ./data /app/data
COPY ./src /app/src
COPY ./package.json /app/package.json
COPY ./package-lock.json /app/package-lock.json
COPY ./tsconfig.json /app/tsconfig.json

# Set working directory
WORKDIR /app

# Install dependencies
RUN npm install --save-dev --silent

# Compile
RUN npm run compile

# Start
CMD ["node", "./build/index.js"]
