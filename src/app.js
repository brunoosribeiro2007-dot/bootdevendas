const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const env = require('./config/env');

const app = express();

app.set('env', env);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Healthcheck (CRITICAL for Render)
app.get('/health', (req, res) => res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() }));

// Redireciona a raiz para o qr code
app.get('/', (req, res) => res.redirect('/qr'));

// Rota de visualização do dashboard premium
app.get('/qr', (req, res) => {
    const whatsappPublisher = require('./publishers/whatsapp.publisher');
    
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ML Affiliate Bot | Dashboard</title>
            <meta http-equiv="refresh" content="30">
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
            <style>
                :root {
                    --bg: #030712;
                    --card-bg: rgba(30, 41, 59, 0.7);
                    --primary: #0ea5e9;
                    --primary-glow: rgba(14, 165, 233, 0.3);
                    --secondary: #6366f1;
                    --accent: #22c55e;
                    --text: #f8fafc;
                    --text-muted: #94a3b8;
                    --border: rgba(51, 65, 85, 0.5);
                }
                * { box-sizing: border-box; transition: all 0.2s ease; }
                body { 
                    font-family: 'Outfit', sans-serif; 
                    background: var(--bg); 
                    color: var(--text); 
                    margin: 0; 
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    min-height: 100vh;
                    background-image: 
                        radial-gradient(circle at 10% 20%, rgba(14, 165, 233, 0.05) 0%, transparent 40%),
                        radial-gradient(circle at 90% 80%, rgba(99, 102, 241, 0.05) 0%, transparent 40%);
                }
                .container { max-width: 1000px; margin: 40px auto; padding: 20px; width: 100%; }
                header { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    margin-bottom: 40px;
                    border-bottom: 1px solid var(--border);
                    padding-bottom: 20px;
                }
                h1 { margin: 0; font-weight: 800; font-size: 2rem; letter-spacing: -1px; }
                h1 span { color: var(--primary); }
                
                .status-container { display: flex; align-items: center; gap: 10px; }
                .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #334155; }
                .status-dot.online { background: var(--accent); box-shadow: 0 0 10px var(--accent); }
                .status-text { font-weight: 600; font-size: 0.9rem; }

                .grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; }
                @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
                
                .card { 
                    background: var(--card-bg); 
                    backdrop-filter: blur(12px);
                    border: 1px solid var(--border);
                    border-radius: 24px; 
                    padding: 24px; 
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                }
                .card h3 { margin-top: 0; font-size: 1.2rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
                
                .qr-box { 
                    background: white; 
                    padding: 16px; 
                    border-radius: 20px; 
                    width: 232px; 
                    margin: 20px auto;
                    box-shadow: 0 0 40px rgba(255, 255, 255, 0.1);
                }
                
                .pairing-section { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border); }
                .pairing-code { 
                    font-family: monospace; 
                    font-size: 2.5rem; 
                    color: var(--accent); 
                    background: rgba(0,0,0,0.3); 
                    padding: 10px 20px; 
                    border-radius: 12px; 
                    letter-spacing: 4px;
                }

                input { 
                    width: 100%; 
                    padding: 12px 16px; 
                    border-radius: 12px; 
                    border: 1px solid var(--border); 
                    background: rgba(15, 23, 42, 0.5); 
                    color: white; 
                    margin-bottom: 12px;
                    font-family: inherit;
                }
                input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-glow); }

                .btn { 
                    width: 100%; 
                    padding: 12px; 
                    border-radius: 12px; 
                    border: none; 
                    font-weight: 600; 
                    cursor: pointer; 
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    text-decoration: none;
                    font-family: inherit;
                }
                .btn-primary { background: var(--primary); color: white; }
                .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 12px var(--primary-glow); }
                .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); margin-bottom: 8px; }
                .btn-outline:hover { background: rgba(255,255,255,0.05); }
                .btn-danger { color: #ef4444; font-size: 0.8rem; margin-top: 20px; opacity: 0.7; }
                .btn-danger:hover { opacity: 1; }

                .logs { 
                    background: rgba(0, 0, 0, 0.4); 
                    border-radius: 16px; 
                    padding: 16px; 
                    height: 300px; 
                    overflow-y: auto; 
                    font-family: 'Consolas', monospace; 
                    font-size: 0.85rem;
                    border: 1px solid var(--border);
                }
                .log-entry { padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.03); color: #cbd5e1; }
                .log-entry span { color: var(--primary); font-weight: bold; }

                .badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; background: var(--primary); color: white; margin-left: auto; }
            </style>
        </head>
        <body>
            <div class="container">
                <header>
                    <h1>ML Affiliate <span>Bot</span></h1>
                    <div class="status-container">
                        <div class="status-dot ${whatsappPublisher.isReady ? 'online' : ''}"></div>
                        <div class="status-text">${whatsappPublisher.initStatus}</div>
                    </div>
                </header>

                <div class="grid">
                    <section>
                        <div class="card" style="height: 100%;">
                            <h3>📋 Logs de Atividade</h3>
                            <div class="logs">
                                ${whatsappPublisher.logs.map(log => {
                                    const parts = log.match(/\[(.*?)\] (.*)/);
                                    if (!parts) return `<div class="log-entry">${log}</div>`;
                                    return `<div class="log-entry"><span>[${parts[1]}]</span> ${parts[2]}</div>`;
                                }).join('')}
                                ${whatsappPublisher.logs.length === 0 ? '<div class="log-entry">Aguardando atividades...</div>' : ''}
                            </div>
                        </div>
                    </section>

                    <aside>
                        <div class="card" style="margin-bottom: 24px;">
                            <h3>📱 Conexão WhatsApp</h3>
                            ${whatsappPublisher.isReady ? `
                                <div style="text-align: center; padding: 20px 0;">
                                    <div style="font-size: 3rem; margin-bottom: 10px;">✅</div>
                                    <p style="font-weight: 600; color: var(--accent);">Bot Ativo e Conectado</p>
                                    <p style="font-size: 0.8rem; color: var(--text-muted);">Pronto para publicar ofertas.</p>
                                </div>
                            ` : (whatsappPublisher.latestPairingCode ? `
                                <div style="text-align: center;">
                                    <p style="font-size: 0.9rem; color: var(--text-muted);">Insira este código no WhatsApp:</p>
                                    <div class="pairing-code">${whatsappPublisher.latestPairingCode}</div>
                                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 15px;">Configurações > Dispositivos Conectados > Conectar com número</p>
                                </div>
                            ` : `
                                ${whatsappPublisher.latestQr ? `
                                    <div class="qr-box" id="qrcode"></div>
                                    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                                    <script>new QRCode(document.getElementById("qrcode"), { text: "${whatsappPublisher.latestQr}", width: 200, height: 200 });</script>
                                    <p style="text-align: center; font-size: 0.8rem; color: var(--text-muted);">Escaneie para conectar</p>
                                ` : '<p style="text-align:center;">Iniciando motor...</p>'}
                                
                                <div class="pairing-section">
                                    <form method="POST" action="/qr">
                                        <input type="text" name="phone" placeholder="5511999998888" required>
                                        <button type="submit" class="btn btn-primary">Gerar Código de Pareamento</button>
                                    </form>
                                </div>
                            `)}
                        </div>

                        <div class="card">
                            <h3>⚙️ Ações Rápidas</h3>
                            <a href="/api/capture/force" target="_blank" class="btn btn-outline">🔍 Forçar Captura</a>
                            <a href="/api/publish/force" target="_blank" class="btn btn-outline">📤 Forçar Publicação</a>
                            <a href="/api/queue?status=approved" target="_blank" class="btn btn-outline">📦 Ver Fila Aprovada</a>
                            <a href="/api/database/clear" class="btn btn-outline" style="color: #f59e0b; border-color: rgba(245, 158, 11, 0.3);" onclick="return confirm('Isso apagará TODA a fila e histórico de produtos. O bot começará do zero com o novo nicho. Continuar?')">🧹 Limpar Banco e Fila</a>
                            
                            <a href="/logout" class="btn btn-danger" onclick="return confirm('Isso irá desconectar o WhatsApp e limpar a sessão. Continuar?')">🛑 Logout e Reset de Sessão</a>
                        </div>
                    </aside>
                </div>
                
                <footer style="margin-top: 40px; text-align: center; font-size: 0.8rem; color: var(--text-muted);">
                    ML Affiliate Bot v2.0 &bull; Powered by Antigravity
                </footer>
            </div>
        </body>
        </html>
    `);
});

// Endpoint POST para processar o pedido do Pairing Code
app.post('/qr', async (req, res) => {
    const { phone } = req.body;
    const whatsappPublisher = require('./publishers/whatsapp.publisher');
    
    if (phone) {
        await whatsappPublisher.triggerPairing(phone);
    }
    res.redirect('/qr');
});

// Endpoint para forçar logout e limpeza de sessão
app.get('/logout', async (req, res) => {
    const whatsappPublisher = require('./publishers/whatsapp.publisher');
    const { db } = require('./database/init');
    const fs = require('fs');
    
    try {
        // Limpa banco (unificado)
        await db.run('DELETE FROM sessions', []);
        
        // Limpa pasta local
        if (fs.existsSync(whatsappPublisher.authPath)) {
            fs.rmSync(whatsappPublisher.authPath, { recursive: true, force: true });
        }
        
        // Reinicia o motor
        whatsappPublisher.isReady = false;
        whatsappPublisher.initialize();
        
        res.send(`
            <style>body { font-family: sans-serif; text-align: center; margin-top: 50px; background: #0f172a; color: #fff; }</style>
            <h2>🛑 Sessão Encerrada</h2>
            <p>O banco de dados de sessões foi limpo e o motor reiniciado.</p>
            <p><a href="/qr" style="color: #0ea5e9;">Voltar para o Dashboard</a></p>
        `);
    } catch (e) {
        res.status(500).send('Erro ao limpar sessão: ' + e.message);
    }
});


app.use('/api', routes);

module.exports = app;
