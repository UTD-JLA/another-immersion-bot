FROM debian:bullseye-slim

RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y jq

# Install data file(s)
RUN mkdir -p /app/data
ADD https://raw.githubusercontent.com/manami-project/anime-offline-database/master/anime-offline-database-minified.json anime-offline-database-minified.json
RUN cat anime-offline-database-minified.json | jq -r '.data[] | .title' > /app/data/acdata.txt

# Install node lts/hydrogen
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - &&\
  apt-get install -y nodejs

# Copy app
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

# Set environment variables
ENV IB_MONGO_URL=mongodb://db:27017
ENV IB_AUTOCOMPLETION_DATA_FILE=/app/data/acdata.txt

# Start
CMD ["node", "./build/index.js"]
