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
    this._cachedDestination = null; // Legado: { id, name, type }
    this._cachedDestinations = null; // Multi-destino: Array<{ id, name, type: 'channel' | 'group' | 'number' }>
    this._cachedChannels = null; // Cache dos canais aos quais a conta está inscrita
    this._cachedGroupId = null;
    
    if (!fs.existsSync(this.authPath)) {
        try { fs.mkdirSync(this.authPath, { recursive: true }); } catch (e) {}
    }
  }

  // 🔄 CARREGAR SESSÃO DO BANCO DE DADOS (Bundle atômico com fallback legado)
  async restoreSessionFromPostgres() {
      const { db } = require('../database/init');
      this.addLog('📥 Recuperando login salvo no banco...');
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
              this.addLog('⚠️ Nenhuma sessão anterior encontrada no banco.');
              return false;
          }

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

  // 📤 SALVAR SESSÃO DO DISCO PARA O BANCO DE DADOS
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
          logger.info('📤 Sincronizado bundle de sessão completo e atômico para o banco.');

          await db.run("DELETE FROM sessions WHERE id != 'session_bundle'", []);
      } catch (e) {
          logger.warn(`Erro na sincronização do bundle de sessão: ${e.message}`);
      }
  }

  addLog(msg) {
    const time = new Date().toLocaleTimeString();
    this.logs.unshift(`[${time}] ${msg}`);
    if (this.logs.length > 25) this.logs.pop();
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
        this._cachedGroupId = null;
        this._cachedDestination = null;
        this._cachedDestinations = null;
        this._cachedChannels = null;

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.sock) {
            try { 
                this.sock.ev.removeAllListeners(); 
                this.sock.end();
            } catch(e) {}
            this.sock = null;
        }

        await this.restoreSessionFromPostgres();

        this.addLog('⚙️ Iniciando motor WhatsApp (Conexão Persistente)...');
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
          syncFullHistory: false,
          shouldSyncHistoryMessage: () => false,
          getMessage: async (key) => {
            return undefined;
          }
        });

        this.sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                await this.syncSessionToPostgres();
            } catch (err) {
                logger.error('Erro ao sincronizar credenciais:', err);
            }
        });

        // 🛡️ DETECÇÃO AUTOMÁTICA DE BAD MAC ERROR — sessão corrompida/desincronizada
        this.sock.ev.on('messages.upsert', () => {}); // keep listener alive
        this.sock.ws.on('error', (err) => {
            const msg = (err && err.message) ? err.message : String(err);
            if (msg.includes('Bad MAC') || msg.includes('bad mac') || msg.includes('decrypt')) {
                logger.error(`🔐 Bad MAC Error detectado — sessão desincronizada. Resetando sessão em 3s...`);
                this.addLog('🔐 Bad MAC Error: sessão corrompida. Limpando e gerando novo QR Code...');
                setTimeout(() => this.disconnectAndResetSession(), 3000);
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
            // 🔐 Bad MAC Error — Baileys lança error com mensagem 'Bad MAC' ou código 500/440
            const isBadMac = lastDisconnect?.error?.message?.includes('Bad MAC') ||
                             lastDisconnect?.error?.message?.includes('bad mac') ||
                             lastDisconnect?.error?.message?.includes('decrypt');
            if (isBadMac) {
                this.addLog('🔐 Bad MAC Error detectado na conexão — sessão corrompida. Resetando...');
                setTimeout(() => this.disconnectAndResetSession(), 2000);
                return;
            }
            const shouldReconnect = !isLoggedOut;
            
            this.isReady = false;
            this._cachedDestinations = null;
            this._cachedDestination = null;
            this._cachedChannels = null;

            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
            }
            
            if (statusCode === 408) {
                this.addLog(`⏳ Timeout de conexão (408). Reconectando em 15s...`);
                this.initStatus = 'Reconectando (timeout)...';
                this.reconnectTimeout = setTimeout(() => this.initialize(), 15000);
            } else if (statusCode === 515 || statusCode === 503) {
                this.addLog(`⏳ Servidor WhatsApp reiniciando (${statusCode}). Reconectando em 5s...`);
                this.initStatus = 'Reconectando (515)...';
                this.reconnectTimeout = setTimeout(() => this.initialize(), 5000);
            } else if (shouldReconnect) {
                this.addLog(`❌ Conexão fechada (${statusCode}). Reconectando em 15s...`);
                this.initStatus = 'Reconectando...';
                this.reconnectTimeout = setTimeout(() => this.initialize(), 15000);
            } else {
                this.initStatus = 'Sessão Inválida (Limpando...)';
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
            
            this.syncSessionToPostgres().catch(err => logger.warn('Erro ao sincronizar sessão após conexão:', err.message));

            // Pré-resolve destinos em background para prontidão imediata
            setTimeout(() => {
              this.getDestinations().catch(e => logger.debug('Pré-resolução de destinos:', e.message));
            }, 3000);
          }
        });
    } catch (err) {
        this.addLog(`❌ Erro no boot: ${err.message}`);
    } finally {
        this.isInitializing = false;
    }
  }

  async disconnectAndResetSession() {
      this.isReady = false;
      this.latestQr = null;
      this.latestPairingCode = null;
      this._cachedGroupId = null;
      this._cachedDestination = null;
      this._cachedDestinations = null;
      this._cachedChannels = null;
      this.initStatus = 'Sessão resetada. Gerando novo QR Code...';
      this.addLog('🔄 Desconectando e limpando sessão corrompida do WhatsApp...');

      if (this.sock) {
          try {
              this.sock.end(undefined);
          } catch (e) {}
          this.sock = null;
      }

      // Limpa pasta local
      try {
          if (fs.existsSync(this.authPath)) {
              fs.rmSync(this.authPath, { recursive: true, force: true });
              fs.mkdirSync(this.authPath, { recursive: true });
          }
      } catch (e) {
          logger.warn('Erro ao limpar pasta auth:', e.message);
      }

      // Limpa sessão no banco
      try {
          const { db } = require('../database/init');
          await db.run('DELETE FROM sessions WHERE id = ?', ['session_bundle']);
          await db.run('DELETE FROM sessions WHERE id LIKE ?', ['session_%']);
      } catch (e) {
          logger.warn('Erro ao limpar sessão no banco:', e.message);
      }

      // Reinicia após 1.5s para gerar QR code limpo
      setTimeout(() => {
          this.initialize().catch(err => logger.error('Erro ao reiniciar WhatsApp pós-reset:', err));
      }, 1500);

      return true;
  }

  handleTimeoutOrConnectionIssue() {
      this.isReady = false;
      this._cachedGroupId = null;
      this._cachedDestination = null;
      this._cachedDestinations = null;
      this._cachedChannels = null;
      this.addLog('⚠️ Instabilidade ou timeout detectado. Agendando reinicialização da conexão...');
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

  // ─── RESOLUÇÃO INTELIGENTE DE DESTINOS (CANAIS, GRUPOS E NÚMEROS) ─────────────

  /**
   * Consulta canais (newsletters) aos quais a conta conectada tem acesso
   * utilizando a query GraphQL MEX interna do WhatsApp.
   */
  async getSubscribedChannels() {
    if (!this.sock) return [];
    if (this._cachedChannels && this._cachedChannels.length > 0) {
      return this._cachedChannels;
    }
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
        8000,
        'Timeout ao consultar canais do WhatsApp'
      );

      const child = getBinaryNodeChild ? getBinaryNodeChild(result, 'result') : null;
      if (child?.content) {
        const parsed = JSON.parse(child.content.toString());
        const list = parsed?.data?.xwa2_newsletter_subscribed || [];
        const mapped = list.map(item => ({
          id: item.id,
          name: item.thread_metadata?.name?.text || item.name || 'Canal sem nome',
          subscribers: item.thread_metadata?.subscribers_count || 0,
          role: item.viewer_metadata?.role || 'SUBSCRIBER',
          invite: item.thread_metadata?.invite || null
        }));
        this._cachedChannels = mapped;
        return mapped;
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
   * 4. Nome do canal (ex: "OfertaLar") via busca nos canais inscritos/administrados
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
          12000,
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
   * Suporta:
   * 1. JID direto (...@g.us)
   * 2. Link de convite (https://chat.whatsapp.com/...)
   * 3. Nome exato ou parcial do grupo na conta
   */
  async resolveGroup(target) {
    if (!target || !this.sock) return null;
    const clean = String(target).trim();

    // 1. Já é JID de grupo direto
    if (clean.endsWith('@g.us')) {
      return { id: clean, name: clean, type: 'group' };
    }

    // 2. Link de convite de grupo (chat.whatsapp.com/...)
    const groupLinkMatch = clean.match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
    if (groupLinkMatch && typeof this.sock.groupGetInviteInfo === 'function') {
      try {
        const inviteCode = groupLinkMatch[1];
        this.addLog(`🔍 Resolvendo grupo via link de convite: ${inviteCode}...`);
        const info = await promiseTimeout(
          this.sock.groupGetInviteInfo(inviteCode),
          12000,
          'Timeout ao consultar convite do grupo'
        );
        if (info?.id) {
          const groupJid = info.id.endsWith('@g.us') ? info.id : `${info.id}@g.us`;
          const groupSubject = info.subject || clean;
          this.addLog(`✅ Grupo identificado via link: "${groupSubject}" (${groupJid})`);
          return { id: groupJid, name: groupSubject, type: 'group' };
        }
      } catch (err) {
        logger.warn(`Falha ao resolver grupo por link de convite: ${err.message}`);
      }
    }

    // 3. Busca por nome nos grupos em que a conta participa
    try {
      const groups = await promiseTimeout(
        this.sock.groupFetchAllParticipating(),
        15000,
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
   * Resolve TODOS os destinos ativos configurados:
   * Se Canal E Grupo estiverem configurados, envia para AMBOS juntos!
   * @returns {Promise<Array<{ id: string, name: string, type: 'channel'|'group'|'number' }>>}
   */
  async getDestinations() {
    if (this._cachedDestinations && this._cachedDestinations.length > 0) {
      return this._cachedDestinations;
    }

    const destinations = [];
    const targetChannel = env.whatsappTargetChannel;
    const targetGroup = env.whatsappTargetGroup;
    const targetNumber = env.whatsappTargetNumber;

    // 1. Tenta resolver Canal do WhatsApp
    if (targetChannel) {
      try {
        const channel = await this.resolveChannel(targetChannel);
        if (channel && channel.id) {
          destinations.push(channel);
          logger.info(`📢 Destino ativo adicionado: [CANAL] "${channel.name}" (${channel.id})`);
        } else {
          logger.warn(`⚠️ Canal do WhatsApp "${targetChannel}" configurado mas não localizado.`);
        }
      } catch (err) {
        logger.warn(`Erro ao resolver canal "${targetChannel}": ${err.message}`);
      }
    }

    // 2. Tenta resolver Grupo do WhatsApp
    if (targetGroup) {
      try {
        const group = await this.resolveGroup(targetGroup);
        if (group && group.id) {
          if (!destinations.some(d => d.id === group.id)) {
            destinations.push(group);
            logger.info(`👥 Destino ativo adicionado: [GRUPO] "${group.name}" (${group.id})`);
          }
        } else {
          logger.warn(`⚠️ Grupo do WhatsApp "${targetGroup}" configurado mas não localizado.`);
        }
      } catch (err) {
        logger.warn(`Erro ao resolver grupo "${targetGroup}": ${err.message}`);
      }
    }

    // 3. Fallback: Caso nenhum canal ou grupo tenha sido encontrado, utiliza número privado
    if (destinations.length === 0 && targetNumber) {
      const numId = `${String(targetNumber).replace(/\D/g, '')}@s.whatsapp.net`;
      destinations.push({ id: numId, name: targetNumber, type: 'number' });
      logger.info(`📱 Destino ativo (Fallback): [NÚMERO PRIVADO] ${targetNumber}`);
    }

    if (destinations.length > 0) {
      this._cachedDestinations = destinations;
      this._cachedDestination = destinations[0];
      this._cachedGroupId = destinations[0].id;
    }

    return destinations;
  }

  /**
   * Retorna resumo estruturado de todos os destinos ativos (para o Dashboard e APIs).
   */
  async getDestinationInfo() {
    const destinations = await this.getDestinations();
    if (!destinations || destinations.length === 0) {
      return {
        id: null,
        name: env.whatsappTargetChannel || env.whatsappTargetGroup || env.whatsappTargetNumber || 'Não definido',
        type: 'unknown',
        summary: 'Nenhum destino ativo',
        destinations: [],
        count: 0
      };
    }

    const summaryParts = destinations.map(d => `${d.type === 'channel' ? '📢 Canal' : (d.type === 'group' ? '👥 Grupo' : '📱 Número')}: "${d.name}"`);
    const summary = summaryParts.join(' + ');
    const combinedType = destinations.length > 1 ? 'multi' : destinations[0].type;

    return {
      id: destinations.map(d => d.id).join(', '),
      name: summary,
      type: combinedType,
      summary: summary,
      destinations: destinations,
      count: destinations.length
    };
  }

  /**
   * Retorna o ID do primeiro destino ativo (compatibilidade com métodos legados).
   */
  async getChatId() {
    const destinations = await this.getDestinations();
    return destinations.length > 0 ? destinations[0].id : null;
  }

  /**
   * Dispara mensagem de texto para todos os destinos configurados (Canal e Grupo juntos).
   */
  async sendTextMessage(text, customChatId = null) {
    if (!this.isReady || !this.sock) {
        logger.warn('⚠️ Envio de mensagem abortado: WhatsApp não está pronto');
        return false;
    }
    try {
      let targets = [];
      if (customChatId) {
        const resolvedId = await this.resolveChatId(customChatId);
        targets = [{ id: resolvedId, name: customChatId, type: 'custom' }];
      } else {
        targets = await this.getDestinations();
      }

      if (!targets || targets.length === 0) {
        logger.error('❌ Não foi possível determinar o destino para envio de texto.');
        return false;
      }

      let successCount = 0;
      for (const dest of targets) {
        try {
          await promiseTimeout(
            this.sock.sendMessage(dest.id, { text }),
            25000,
            `Timeout ao enviar mensagem de texto para ${dest.name}`
          );
          successCount++;
          this.addLog(`✅ Texto enviado com sucesso para [${dest.type.toUpperCase()}] "${dest.name}"`);
        } catch (destErr) {
          logger.error(`❌ Erro ao enviar texto para [${dest.type}] "${dest.name}":`, destErr.message || destErr);
          this.addLog(`❌ Falha envio texto para "${dest.name}": ${destErr.message}`);
          if (destErr.message?.includes('Timeout') || destErr.message?.includes('closed') || destErr.message?.includes('not open')) {
            this.handleTimeoutOrConnectionIssue();
          }
        }
      }
      return successCount > 0;
    } catch (error) {
      logger.error('❌ Erro geral ao enviar mensagem de texto no WhatsApp:', error.message || error);
      return false;
    }
  }

  /**
   * Dispara imagem com legenda para todos os destinos configurados (Canal e Grupo juntos).
   */
  async sendImageMessage(imageBuffer, caption, customChatId = null) {
    if (!this.isReady || !this.sock) {
      logger.warn('⚠️ Envio de imagem abortado: WhatsApp não está conectado.');
      return false;
    }
    try {
      let targets = [];
      if (customChatId) {
        const resolvedId = await this.resolveChatId(customChatId);
        targets = [{ id: resolvedId, name: customChatId, type: 'custom' }];
      } else {
        targets = await this.getDestinations();
      }

      if (!targets || targets.length === 0) {
        logger.error('❌ Não foi possível determinar o destino para envio de imagem.');
        return false;
      }

      let successCount = 0;
      for (const dest of targets) {
        try {
          let sent = false;
          if (imageBuffer && imageBuffer.length > 0) {
            try {
              await promiseTimeout(
                this.sock.sendMessage(dest.id, {
                  image: imageBuffer,
                  caption: caption || ''
                }),
                35000,
                `Timeout ao enviar imagem para ${dest.name}`
              );
              sent = true;
            } catch (imgErr) {
              logger.warn(`⚠️ Falha ao enviar imagem para [${dest.type}] "${dest.name}": ${imgErr.message}. Tentando texto...`);
            }
          }

          if (!sent) {
            await promiseTimeout(
              this.sock.sendMessage(dest.id, {
                text: caption || ''
              }),
              25000,
              `Timeout ao enviar texto para ${dest.name}`
            );
            sent = true;
          }

          if (sent) {
            successCount++;
            this.addLog(`✅ Imagem/mensagem enviada para [${dest.type.toUpperCase()}] "${dest.name}"`);
          }
        } catch (destErr) {
          logger.error(`❌ Falha ao enviar imagem/mensagem para [${dest.type}] "${dest.name}":`, destErr.message || destErr);
          this.addLog(`❌ Falha envio para "${dest.name}": ${destErr.message}`);
          if (destErr.message?.includes('Timeout') || destErr.message?.includes('closed') || destErr.message?.includes('not open')) {
            this.handleTimeoutOrConnectionIssue();
          }
        }
      }
      return successCount > 0;
    } catch (error) {
      logger.error('❌ Erro ao enviar imagem no WhatsApp:', error.message || error);
      return false;
    }
  }

  /**
   * Publica a oferta em TODOS os destinos ativos simultaneamente (Canal + Grupo).
   */
  async publish(item) {
    if (!this.isReady || !this.sock) {
        logger.warn(`⚠️ Publicação abortada: WhatsApp não está pronto (Ready: ${this.isReady})`);
        return false;
    }
    
    try {
      const destinations = await this.getDestinations();
      if (!destinations || destinations.length === 0) {
          logger.error('❌ Não foi possível determinar nenhum destino ativo (Canal, Grupo ou Número).');
          return false;
      }

      const displayTitle = item.title || 'Sem título';
      const destSummary = destinations.map(d => `[${d.type.toUpperCase()}] "${d.name}"`).join(' e ');
      this.addLog(`📤 Publicando produto: "${displayTitle.substring(0, 35)}..." para ${destSummary}`);
      
      // Baixa a imagem uma única vez se disponível
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

      let successCount = 0;
      for (const dest of destinations) {
        try {
          let sent = false;
          if (imageBuffer) {
              try {
                  await promiseTimeout(
                      this.sock.sendMessage(dest.id, {
                          image: imageBuffer,
                          caption: item.formatted_message
                      }),
                      35000,
                      `Timeout ao enviar imagem para [${dest.type}] "${dest.name}"`
                  );
                  sent = true;
              } catch (sendImgErr) {
                  logger.warn(`⚠️ Falha ao enviar imagem para [${dest.type}] "${dest.name}" (${sendImgErr.message}). Prosseguindo com fallback de texto.`);
              }
          }

          if (!sent) {
              await promiseTimeout(
                  this.sock.sendMessage(dest.id, {
                      text: item.formatted_message
                  }),
                  25000,
                  `Timeout ao enviar texto para [${dest.type}] "${dest.name}"`
              );
              sent = true;
          }

          if (sent) {
              successCount++;
              this.addLog(`✅ Publicado com sucesso em [${dest.type.toUpperCase()}] "${dest.name}"`);
          }
        } catch (destErr) {
          logger.error(`❌ Erro ao publicar item ${item.id} para [${dest.type}] "${dest.name}":`, destErr.message || destErr);
          this.addLog(`❌ Falha no envio para [${dest.type}] "${dest.name}": ${destErr.message}`);
          if (
              destErr.message?.includes('Connection Closed') || 
              destErr.message?.includes('not open') || 
              destErr.message?.includes('Timeout')
          ) {
              this.handleTimeoutOrConnectionIssue();
          }
        }
      }

      return successCount > 0;
    } catch (error) {
      logger.error('❌ Erro geral ao publicar mensagem no WhatsApp:', error.message || error);
      if (error.message?.includes('Timeout') || error.message?.includes('closed') || error.message?.includes('not open')) {
          this.handleTimeoutOrConnectionIssue();
      }
      return false;
    }
  }
}

module.exports = new WhatsappPublisher();
