FROM node:20

# Instalando ferramentas essenciais de rede e criptografia
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Permissões totais para o armazenamento temporário
RUN mkdir -p /tmp/.baileys_auth && chmod 777 /tmp/.baileys_auth

EXPOSE 3000

CMD [ "node", "src/server.js" ]
