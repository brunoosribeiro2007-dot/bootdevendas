const pino = require('pino');
const env = require('../config/env');
const logger = require('../config/logger');
const path = require('path');
const fs = require('fs');

const promiseTimeout = (promise, ms, errorMsg) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
    ]);
};

class WhatsappPublisher {
  constructor() {
    this.sock = null;
    this.latestQr = null;
    this.latestPairingCode = null;
    this.isReady = false;
    this.initStatus = 'Aguardando...';
    this.logs = [];
    this.authPath = path.resolve(process.cwd(), '.baileys_auth');
    this.sessionFilesMtime = new Map(); // Cache local dos tempos de modificação dos arquivos
    this.isInitializing = false; // Controle de concorrência na inicialização
    this.reconnectTimeout = null; // Referência para evitar agendamentos paralelos
    this._cachedDestination = null; // { id, name, type: 'channel' | 'group' | 'number' }
    
    if (!fs.existsSync(this.authPath)) {
        try { fs.mkdirSync(this.authPath, { recursive: true }); } catch (e) {}
    }
  }

  // 🔄 CARREGAR SESSÃO DO SUPABASE PARA O DISCO (Bundle atômico com fallback legado)
  async restoreSessionFromPostgres() {
      const { db } = require('../database/init');
      this.addLog('📥 Recuperando login salvo no Supabase...');
      try {
          const row = await db.get('SELECT data FROM sessions WHERE id = ?', ['session_bundle']);
          if (!row || !row.data) {
              this.addLog('ℹ️ Bundle de sessão não encontrado no banco. Tentando carregamento legado...');
              return await this.restoreSessionLegacy();
          }

          let buffer = row.data;
          if (!Buffer.isBuffer(buffer)) {
              buffer = Buffer.from(buffer);
          }

          const bundle = JSON.parse(buffer.toString('utf-8'));

          // Limpa a pasta local para evitar arquivos órfãos antigos
          if (fs.existsSync(this.authPath)) {
              const localFiles = fs.readdirSync(this.authPath);
              for (const localFile of localFiles) {
                  try { fs.unlinkSync(path.join(this.authPath, localFile)); } catch (e) {}
              }
          } else {
              fs.mkdirSync(this.authPath, { recursive: true });
          }

          // Escreve os arquivos do bundle
          for (const [file, base64Data] of Object.entries(bundle)) {
              const filePath = path.join(this.authPath, file);
              fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
          }

          this.addLog('✅ Login (Bundle) recuperado com sucesso do banco externo!');
          return true;
      } catch (e) {
          this.addLog(`⚠️ Falha ao carregar bundle de sessão: ${e.message}. Tentando carregamento legado...`);
          return await this.restoreSessionLegacy();
      }
  }

  // Fallback para ler sessões armazenadas no formato antigo
  async restoreSessionLegacy() {
      const { getAllSessionFiles } = require('../database/init');
      try {
          const files = await getAllSessionFiles();
          if (files.length === 0) {
              this.addLog('⚠️ Nenhuma sessão anterior encontrada no Supabase.');
              return false;
          }

          // Ignora o próprio id de bundle se ele aparecer
          const individualFiles = files.filter(f => f.id !== 'session_bundle');
          if (individualFiles.length === 0) return false;

          for (const file of individualFiles) {
              const filePath = path.join(this.authPath, file.id);
              fs.writeFileSync(filePath, file.data);
          }
          this.addLog('✅ Login legado (arquivos individuais) recuperado com sucesso!');
          return true;
      } catch (e) {
          this.addLog(`❌ Falha na restauração da sessão legada: ${e.message}`);
          return false;
      }
  }

  // 📤 SALVAR SESSÃO DO DISCO PARA O SUPABASE (Compacta tudo em 1 único bundle para evitar corrupção)
  async syncSessionToPostgres() {
      const { saveSessionFile, db } = require('../database/init');
      try {
          if (!fs.existsSync(this.authPath)) return;
          const files = fs.readdirSync(this.authPath);
          if (files.length === 0) return;

          const bundle = {};
          for (const file of files) {
              const filePath = path.join(this.authPath, file);
              if (fs.lstatSync(filePath).isFile()) {
                  const data = fs.readFileSync(filePath);
                  bundle[file] = data.toString('base64');
              }
          }

          const serialized = JSON.stringify(bundle);
          const compressed = Buffer.from(serialized, 'utf-8');

          await saveSessionFile('session_bundle', compressed);
          logger.info('📤 Sincronizado bundle de sessão completo e atômico para o Supabase.');

          // Limpa registros legados individuais para otimizar espaço no banco
          await db.run("DELETE FROM sessions WHERE id != 'session_bundle'", []);
      } catch (e) {
          logger.warn(`Erro na sincronização do bundle de sessão: ${e.message}`);
      }
  }

  addLog(msg) {
    const time = new Date().toLocaleTimeString();
    this.logs.unshift(`[${time}] ${msg}`);
    if (this.logs.length > 20) this.logs.pop(); // Aumentado para 20
    logger.info(msg);
  }

  async initialize() {
    if (this.isInitializing) {
        logger.warn('⚠️ [Initialize] Inicialização do WhatsApp já em andamento. Ignorando chamada duplicada.');
        return;
    }
    this.isInitializing = true;

    try {
        this.latestQr = null;
        this.latestPairingCode = null;
        this._cachedGroupId = null; // Reset cache do grupo no reconnect
        this._cachedDestination = null; // Reset cache de destino (canal/grupo)

        // Cancela qualquer agendamento de reconexão pendente
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // Evita múltiplas instâncias rodando juntas (Causa erro 405)
        if (this.sock) {
            try { 
                this.sock.ev.removeAllListeners(); 
                this.sock.end();
            } catch(e) {}
            this.sock = null;
        }

        // TENTA RESTAURAR ANTES DE LIGAR O MOTOR
        await this.restoreSessionFromPostgres();

        this.addLog('⚙️ Iniciando motor (Conexão Persistente)...');
        const baileys = await import('@whiskeysockets/baileys');
        const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys;
        const { Boom } = await import('@hapi/boom');

        const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
        const { version } = await fetchLatestBaileysVersion();

        this.sock = makeWASocket({
          version,
          auth: state,
          logger: pino({ level: 'silent' }),
          connectTimeoutMs: 60000,
          printQRInTerminal: true,
          syncFullHistory: false,
          shouldSyncHistoryMessage: () => false
        });

        // SALVA NO BANCO SEMPRE QUE O LOGIN MUDA
        this.sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                await this.syncSessionToPostgres(); // Sincroniza bundle atômico
            } catch (err) {
                logger.error('Erro ao sincronizar credenciais:', err);
            }
        });

        this.sock.ev.on('connection.update', (update) => {
          const { connection, lastDisconnect, qr } = update;
          
          if (qr) {
            this.latestQr = qr;
            this.initStatus = 'QR Code Pronto!';
            this.addLog('📱 QR Code gerado.');
          }

          if (connection === 'close') {
            // Extração segura do statusCode (previne crash se lastDisconnect/error for null)
            let statusCode = 0;
            try {
                if (lastDisconnect && lastDisconnect.error) {
                    statusCode = (lastDisconnect.error instanceof Boom) 
                        ? lastDisconnect.error.output?.statusCode 
                        : (lastDisconnect.error.output?.statusCode || 0);
                }
            } catch (e) {
                logger.warn('Erro ao extrair statusCode:', e.message);
            }
            
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            const shouldReconnect = !isLoggedOut;
            
            this.isReady = false;

            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
            }
            
            if (statusCode === 408) {
                this.addLog(`⏳ Timeout de conexão (408). Reconectando em 15s...`);
                this.initStatus = 'Reconectando (timeout)...';
                this.reconnectTimeout = setTimeout(() => this.initialize(), 15000);
            } else if (statusCode === 515 || statusCode === 503) {
                this.addLog(`⏳ Servidor WhatsApp indisponível/Restart (${statusCode}). Reconectando em 5s...`);
                this.initStatus = 'Reconectando (515)...';
                this.reconnectTimeout = setTimeout(() => this.initialize(), 5000);
            } else if (shouldReconnect) {
                this.addLog(`❌ Conexão fechada (Motivo: ${statusCode}). Reconectando em 20s...`);
                this.initStatus = 'Reconectando...';
                this.reconnectTimeout = setTimeout(() => this.initialize(), 20000);
            } else {
                this.initStatus = 'Sessão Inválida (Limpando...)';
                // Se foi deslogado, precisamos limpar tudo para gerar novo QR
                const { db } = require('../database/init');
                db.run('DELETE FROM sessions', []).catch(() => {});
                try {
                    if (fs.existsSync(this.authPath)) {
                        fs.rmSync(this.authPath, { recursive: true, force: true });
                    }
                } catch (e) {}
                this.addLog('⚠️ Sessão limpa devido a logout. Reiniciando para novo pareamento...');
                this.reconnectTimeout = setTimeout(() => this.initialize(), 5000);
            }
          } else if (connection === 'open') {
            this.initStatus = '✅ Conectado!';
            this.isReady = true;
            this.latestQr = null;
            this.latestPairingCode = null;
            this.addLog('✅ Conexão realizada com sucesso! Bot pronto para publicações.');
            
            // Sincroniza a sessão após conectar com sucesso
            this.syncSessionToPostgres().catch(err => logger.warn('Erro ao sincronizar sessão após conexão:', err.message));
          }
        });
    } catch (err) {
        this.addLog(`❌ Erro no boot: ${err.message}`);
    } finally {
        this.isInitializing = false;
    }
  }

  handleTimeoutOrConnectionIssue() {
      this.isReady = false;
      this._cachedGroupId = null;
      this._cachedDestination = null;
      this.addLog('⚠️ Instabilidade ou timeout detectado. Forçando reinicialização da conexão do WhatsApp...');
      if (this.sock) {
          try {
              this.sock.ev.removeAllListeners();
              this.sock.end();
          } catch (e) {}
          this.sock = null;
      }
      if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
      }
      this.reconnectTimeout = setTimeout(() => this.initialize(), 10000);
  }

  async triggerPairing(phoneNumber) {
    if (!this.sock) return null;
    try {
        const num = phoneNumber.replace(/\D/g, '');
        const code = await this.sock.requestPairingCode(num);
        this.latestPairingCode = code;
        this.addLog(`🔑 Código gerado para ${num}: ${code}`);
        return code;
    } catch (e) {
        this.addLog(`❌ Falha no código: ${e.message}`);
        return null;
    }
  }

  // ─── RESOLUÇÃO INTELIGENTE DE DESTINO (CANAIS, GRUPOS E NÚMEROS) ─────────────

  /**
   * Consulta canais (newsletters) aos quais a conta conectada tem acesso
   * utilizando a query GraphQL MEX interna do WhatsApp.
   */
  async getSubscribedChannels() {
    if (!this.sock) return [];
    try {
      const baileys = await import('@whiskeysockets/baileys');
      const getBinaryNodeChild = baileys.getBinaryNodeChild;

      const result = await promiseTimeout(
        this.sock.query({
          tag: 'iq',
          attrs: {
            id: this.sock.generateMessageTag(),
            type: 'get',
            to: 's.whatsapp.net',
            xmlns: 'w:mex'
          },
          content: [
            {
              tag: 'query',
              attrs: { query_id: '6388546374527196' },
              content: Buffer.from(JSON.stringify({ variables: {} }), 'utf-8')
            }
          ]
        }),
        15000,
        'Timeout ao consultar canais do WhatsApp'
      );

      const child = getBinaryNodeChild ? getBinaryNodeChild(result, 'result') : null;
      if (child?.content) {
        const parsed = JSON.parse(child.content.toString());
        const list = parsed?.data?.xwa2_newsletter_subscribed || [];
        return list.map(item => ({
          id: item.id,
          name: item.thread_metadata?.name?.text || item.name || 'Canal sem nome',
          subscribers: item.thread_metadata?.subscribers_count || 0,
          role: item.viewer_metadata?.role || 'SUBSCRIBER',
          invite: item.thread_metadata?.invite || null
        }));
      }
    } catch (e) {
      logger.warn(`⚠️ Não foi possível listar canais via MEX query: ${e.message}`);
    }
    return [];
  }

  /**
   * Resolve um alvo para Canal (Newsletter) do WhatsApp.
   * Suporta:
   * 1. JID direto (...@newsletter)
   * 2. Link de convite oficial (https://whatsapp.com/channel/0029Va... ou whatsapp.com/channel/...)
   * 3. Código de convite alfanumérico (ex: 0029Va...)
   * 4. Nome do canal (ex: "OfertaLar") via busca nos canais administrados/inscritos
   */
  async resolveChannel(target) {
    if (!target) return null;
    const clean = String(target).trim();

    // 1. Já é JID de canal direto
    if (clean.endsWith('@newsletter')) {
      return { id: clean, name: clean, type: 'channel' };
    }

    if (!this.sock) return null;

    // 2. Link de convite ou código de canal
    const linkMatch = clean.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
    const inviteCode = linkMatch ? linkMatch[1] : (clean.startsWith('0029') ? clean : null);

    if (inviteCode && typeof this.sock.newsletterMetadata === 'function') {
      try {
        this.addLog(`🔍 Resolvendo canal via link/código de convite: ${inviteCode}...`);
        const meta = await promiseTimeout(
          this.sock.newsletterMetadata('invite', inviteCode),
          15000,
          'Timeout ao consultar metadados do canal'
        );
        if (meta?.id) {
          const channelName = meta.thread_metadata?.name?.text || meta.name || clean;
          this.addLog(`✅ Canal identificado via link: "${channelName}" (${meta.id})`);
          return { id: meta.id, name: channelName, type: 'channel' };
        }
      } catch (err) {
        logger.warn(`Falha ao resolver canal por convite (${inviteCode}): ${err.message}`);
      }
    }

    // 3. Busca por nome na lista de canais da conta
    try {
      const channels = await this.getSubscribedChannels();
      if (channels && channels.length > 0) {
        const searchName = clean.toLowerCase();
        let found = channels.find(c => (c.name || '').toLowerCase().trim() === searchName);
        if (!found) {
          found = channels.find(c => (c.name || '').toLowerCase().includes(searchName) || searchName.includes((c.name || '').toLowerCase()));
        }
        if (found) {
          this.addLog(`✅ Canal encontrado por nome: "${found.name}" (${found.id})`);
          return { id: found.id, name: found.name, type: 'channel' };
        }
      }
    } catch (err) {
      logger.warn(`Erro ao buscar canal por nome na conta: ${err.message}`);
    }

    return null;
  }

  /**
   * Resolve um alvo para Grupo do WhatsApp (@g.us).
   */
  async resolveGroup(target) {
    if (!target || !this.sock) return null;
    const clean = String(target).trim();

    if (clean.endsWith('@g.us')) {
      return { id: clean, name: clean, type: 'group' };
    }

    try {
      const groups = await promiseTimeout(
        this.sock.groupFetchAllParticipating(),
        20000,
        'Timeout ao buscar lista de grupos'
      );
      const groupName = clean.toLowerCase();
      let group = Object.values(groups).find(g => (g.subject || '').toLowerCase().trim() === groupName);
      if (!group) {
        group = Object.values(groups).find(g => (g.subject || '').toLowerCase().includes(groupName) || groupName.includes((g.subject || '').toLowerCase()));
      }
      if (group) {
        this.addLog(`✅ Grupo encontrado: "${group.subject}" (${group.id})`);
        return { id: group.id, name: group.subject, type: 'group' };
      } else {
        const availableGroups = Object.values(groups).map(g => `"${g.subject}"`).join(', ');
        logger.warn(`❌ Grupo "${clean}" não encontrado. Grupos disponíveis: ${availableGroups}`);
      }
    } catch (gErr) {
      logger.error('Erro ao buscar grupos:', gErr.stack || gErr);
    }

    return null;
  }

  /**
   * Converte qualquer identificador ou alvo avulso em um JID de destino válido.
   */
  async resolveChatId(idOrTarget) {
    if (!idOrTarget) return await this.getChatId();
    const clean = String(idOrTarget).trim();
    if (clean.endsWith('@newsletter') || clean.endsWith('@g.us') || clean.endsWith('@s.whatsapp.net')) {
      return clean;
    }
    const resolved = (await this.resolveChannel(clean)) || (await this.resolveGroup(clean));
    if (resolved?.id) return resolved.id;
    if (/^\d{8,15}$/.test(clean.replace(/\D/g, ''))) {
      return `${clean.replace(/\D/g, '')}@s.whatsapp.net`;
    }
    return clean;
  }

  /**
   * Retorna informações do destino atual configurado (Canal, Grupo ou Número).
   */
  async getDestinationInfo() {
    if (this._cachedDestination) {
      return this._cachedDestination;
    }
    const chatId = await this.getChatId();
    return this._cachedDestination || (chatId ? { id: chatId, name: chatId, type: 'unknown' } : null);
  }

  /**
   * Determina o ID de destino prioritário para envio das mensagens.
   * Ordem de prioridade:
   * 1. Canal do WhatsApp (WHATSAPP_TARGET_CHANNEL)
   * 2. Grupo ou Canal configurado em WHATSAPP_TARGET_GROUP
   * 3. Número privado (WHATSAPP_TARGET_NUMBER)
   */
  async getChatId() {
    if (this._cachedDestination?.id) {
      return this._cachedDestination.id;
    }

    const targetChannel = env.whatsappTargetChannel;
    const targetGroup = env.whatsappTargetGroup;
    const targetNumber = env.whatsappTargetNumber;

    // 1. Tenta Canal explícito
    if (targetChannel) {
      const channel = await this.resolveChannel(targetChannel);
      if (channel) {
        this._cachedDestination = channel;
        this._cachedGroupId = channel.id;
        logger.info(`📢 Destino ativo: [CANAL] "${channel.name}" (${channel.id})`);
        return channel.id;
      }
    }

    // 2. Tenta Grupo ou Canal via targetGroup
    if (targetGroup) {
      // Se tiver formato característico de canal (@newsletter ou link de canal)
      if (targetGroup.endsWith('@newsletter') || targetGroup.includes('whatsapp.com/channel/') || targetGroup.startsWith('0029')) {
        const channel = await this.resolveChannel(targetGroup);
        if (channel) {
          this._cachedDestination = channel;
          this._cachedGroupId = channel.id;
          logger.info(`📢 Destino ativo: [CANAL] "${channel.name}" (${channel.id})`);
          return channel.id;
        }
      }

      // Se for JID de grupo explícito (@g.us)
      if (targetGroup.endsWith('@g.us')) {
        this._cachedDestination = { id: targetGroup, name: targetGroup, type: 'group' };
        this._cachedGroupId = targetGroup;
        return targetGroup;
      }

      // Tenta primeiro como canal (ex: usuário colocou "OfertaLar" que é canal)
      const maybeChannel = await this.resolveChannel(targetGroup);
      if (maybeChannel) {
        this._cachedDestination = maybeChannel;
        this._cachedGroupId = maybeChannel.id;
        logger.info(`📢 Destino ativo: [CANAL] "${maybeChannel.name}" (${maybeChannel.id})`);
        return maybeChannel.id;
      }

      // Tenta como grupo tradicional
      const group = await this.resolveGroup(targetGroup);
      if (group) {
        this._cachedDestination = group;
        this._cachedGroupId = group.id;
        logger.info(`👥 Destino ativo: [GRUPO] "${group.name}" (${group.id})`);
        return group.id;
      }
    }

    // 3. Fallback para número privado
    if (targetNumber) {
      const numId = `${String(targetNumber).replace(/\D/g, '')}@s.whatsapp.net`;
      this._cachedDestination = { id: numId, name: targetNumber, type: 'number' };
      logger.info(`📱 Destino ativo: [NÚMERO PRIVADO] ${targetNumber}`);
      return numId;
    }

    return null;
  }

  async sendTextMessage(text, customChatId = null) {
    if (!this.isReady || !this.sock) {
        logger.warn('⚠️ Envio de mensagem abortado: WhatsApp não está pronto');
        return false;
    }
    try {
      const chatId = customChatId ? await this.resolveChatId(customChatId) : await this.getChatId();
      if (!chatId) {
          logger.error('❌ Não foi possível determinar o destino para envio de texto.');
          return false;
      }
      await promiseTimeout(
          this.sock.sendMessage(chatId, { text }),
          25000,
          'Timeout ao enviar mensagem de texto no WhatsApp'
      );
      return true;
    } catch (error) {
      logger.error('❌ Erro ao enviar mensagem de texto no WhatsApp:', error.message || error);
      if (error.message?.includes('Timeout') || error.message?.includes('closed') || error.message?.includes('not open')) {
          this.handleTimeoutOrConnectionIssue();
      }
      return false;
    }
  }

  async sendImageMessage(imageBuffer, caption, customChatId = null) {
    if (!this.isReady || !this.sock) {
      logger.warn('⚠️ Envio de imagem abortado: WhatsApp não está conectado.');
      return false;
    }
    try {
      const chatId = customChatId ? await this.resolveChatId(customChatId) : await this.getChatId();
      if (!chatId) {
        logger.error('❌ Não foi possível determinar o destino para envio de imagem.');
        return false;
      }
      await promiseTimeout(
        this.sock.sendMessage(chatId, {
          image: imageBuffer,
          caption: caption || ''
        }),
        35000,
        'Timeout ao enviar imagem no WhatsApp'
      );
      return true;
    } catch (error) {
      logger.error('❌ Erro ao enviar imagem no WhatsApp:', error.message || error);
      if (error.message?.includes('Timeout') || error.message?.includes('closed') || error.message?.includes('not open')) {
        this.handleTimeoutOrConnectionIssue();
      }
      return false;
    }
  }

  async publish(item) {
    if (!this.isReady || !this.sock) {
        logger.warn(`⚠️ Publicação abortada: WhatsApp não está pronto (Ready: ${this.isReady})`);
        return false;
    }
    
    try {
      const chatId = await this.getChatId();
      if (!chatId) {
          logger.error('❌ Não foi possível determinar o destino (Canal, Grupo ou Número).');
          return false;
      }

      const displayTitle = item.title || 'Sem título';
      this.addLog(`📤 Publicando produto: ${displayTitle.substring(0, 40)}...`);
      
      // Tenta baixar a imagem previamente com timeout estrito de 8 segundos
      let imageBuffer = null;
      if (item.image_url && item.image_url.startsWith('http')) {
          try {
              const axios = require('axios');
              const imgRes = await axios.get(item.image_url, { 
                  responseType: 'arraybuffer', 
                  timeout: 8000 
              });
              if (imgRes.data) {
                  imageBuffer = Buffer.from(imgRes.data);
              }
          } catch (imgDownloadErr) {
              logger.warn(`⚠️ Falha ao baixar imagem do produto (${imgDownloadErr.message}). Prosseguindo com fallback de texto.`);
          }
      }

      if (imageBuffer) {
          try {
              await promiseTimeout(
                  this.sock.sendMessage(chatId, {
                      image: imageBuffer,
                      caption: item.formatted_message
                  }),
                  35000,
                  'Timeout ao enviar imagem no WhatsApp'
              );
              return true;
          } catch (sendImgErr) {
              logger.warn(`⚠️ Falha ao enviar mensagem com imagem (${sendImgErr.message}). Prosseguindo com fallback de texto.`);
              if (sendImgErr.message?.includes('Timeout')) {
                  this.handleTimeoutOrConnectionIssue();
                  return false;
              }
          }
      }

      // Envia somente texto como fallback
      try {
          await promiseTimeout(
              this.sock.sendMessage(chatId, {
                  text: item.formatted_message
              }),
              25000,
              'Timeout ao enviar mensagem de texto no WhatsApp'
          );
          return true;
      } catch (textErr) {
          logger.error('❌ Falha total ao enviar mensagem:', textErr.message);
          if (
              textErr.message?.includes('Connection Closed') || 
              textErr.message?.includes('not open') || 
              textErr.message?.includes('Timeout')
          ) {
              this.handleTimeoutOrConnectionIssue();
          }
          return false;
      }
    } catch (error) {
      logger.error('❌ Erro ao publicar mensagem no WhatsApp:', error.message || error);
      if (error.message?.includes('Timeout') || error.message?.includes('closed') || error.message?.includes('not open')) {
          this.handleTimeoutOrConnectionIssue();
      }
      return false;
    }
  }
}

module.exports = new WhatsappPublisher();
