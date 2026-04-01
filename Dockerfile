FROM ghcr.io/puppeteer/puppeteer:21.9.0

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production

WORKDIR /usr/src/app

COPY package*.json ./
USER root
RUN npm install

COPY . .

# Criar a pasta de autenticação do whatsapp
RUN mkdir -p .baileys_auth
RUN chown -R pptruser:pptruser /usr/src/app

USER pptruser

EXPOSE 3000

CMD [ "npm", "start" ]
