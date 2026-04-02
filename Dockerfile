FROM node:18

# Ferramentas para o SQLite
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Permissões totais no /tmp
RUN mkdir -p /tmp/.baileys_auth && chmod 777 /tmp/.baileys_auth

EXPOSE 3000

CMD [ "node", "src/server.js" ]
