const fs = require('fs');
const path = require('path');
const { initializeDB } = require('../src/database/init');
const whatsappPublisher = require('../src/publishers/whatsapp.publisher');

async function runTest() {
    try {
        console.log('Inicializando Banco de Dados...');
        await initializeDB();

        // Limpa a pasta e o banco para o teste iniciar do zero
        console.log('Limpando pasta auth e tabela sessions...');
        const authPath = whatsappPublisher.authPath;
        if (fs.existsSync(authPath)) {
            const files = fs.readdirSync(authPath);
            for (const file of files) {
                fs.unlinkSync(path.join(authPath, file));
            }
        } else {
            fs.mkdirSync(authPath, { recursive: true });
        }
        
        const { db } = require('../src/database/init');
        await db.run('DELETE FROM sessions', []);

        // 1. Criar arquivos mock na pasta auth
        console.log('Criando arquivos de sessão fictícios...');
        const mockFile1 = 'creds.json';
        const mockContent1 = JSON.stringify({ noiseKey: 'abc', pairingEphemeralKeyPair: 'def' });
        const mockFile2 = 'app-state-sync-key-123';
        const mockContent2 = JSON.stringify({ key: 'xyz' });

        fs.writeFileSync(path.join(authPath, mockFile1), mockContent1);
        fs.writeFileSync(path.join(authPath, mockFile2), mockContent2);

        // 2. Sincronizar para o banco (deve compilar tudo no bundle)
        console.log('\n--- Testando syncSessionToNeon (Criando bundle) ---');
        await whatsappPublisher.syncSessionToNeon();

        // Verificar no banco se a linha 'session_bundle' existe e as individuais não
        const rows = await db.all('SELECT id FROM sessions');
        console.log('Linhas gravadas na tabela sessions:', rows);
        
        // 3. Deletar arquivos locais
        console.log('\nDeletando arquivos locais de sessão para testar a restauração...');
        fs.unlinkSync(path.join(authPath, mockFile1));
        fs.unlinkSync(path.join(authPath, mockFile2));
        console.log('Pasta local contém:', fs.readdirSync(authPath));

        // 4. Restaurar do banco
        console.log('\n--- Testando restoreSessionFromNeon ---');
        const restored = await whatsappPublisher.restoreSessionFromNeon();
        console.log('Restauração concluída? ' + restored);

        // Verificar se os arquivos e seus conteúdos foram restaurados perfeitamente
        const finalFiles = fs.readdirSync(authPath);
        console.log('Arquivos na pasta local após restauração:', finalFiles);

        const content1 = fs.readFileSync(path.join(authPath, mockFile1), 'utf8');
        const content2 = fs.readFileSync(path.join(authPath, mockFile2), 'utf8');

        console.log(`Conteúdo do arquivo 1 restaurado idêntico? ${content1 === mockContent1}`);
        console.log(`Conteúdo do arquivo 2 restaurado idêntico? ${content2 === mockContent2}`);

        if (content1 === mockContent1 && content2 === mockContent2) {
            console.log('\n✅ SUCESSO: Sincronização atômica de bundle e restauração funcionaram perfeitamente!');
        } else {
            console.log('\n❌ FALHA: Conteúdo restaurado difere do original.');
        }

    } catch (err) {
        console.error('ERRO NO TESTE:', err);
    }
}

runTest();
