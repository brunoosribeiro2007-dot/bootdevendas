const couponService = require('../src/services/coupon.service');
const fs = require('fs');
const path = require('path');

const COUPONS_PATH = path.resolve(process.cwd(), 'coupons.json');

// Backup original coupons
let originalCoupons = null;
if (fs.existsSync(COUPONS_PATH)) {
  originalCoupons = fs.readFileSync(COUPONS_PATH, 'utf8');
}

// Helper to set mock coupons
function setMockCoupons(coupons) {
  fs.writeFileSync(COUPONS_PATH, JSON.stringify({ coupons }, null, 2));
  // Clear couponService cache
  couponService._cache = null;
  couponService._lastRead = 0;
}

// Restore original coupons
function restore() {
  if (originalCoupons) {
    fs.writeFileSync(COUPONS_PATH, originalCoupons);
  } else {
    fs.unlinkSync(COUPONS_PATH);
  }
  console.log('Original coupons restored.');
}

async function runTests() {
  console.log('🧪 Iniciando testes de cupons...');
  
  const today = new Date();
  const currentDay = today.getDay();
  const nextDay = (currentDay + 1) % 7;
  
  // 1. Configurar cupons de teste
  const testCoupons = [
    {
      code: 'ALWAYS_FREE',
      description: 'Cupom geral sem restrição de dia ou nicho',
      minPurchase: 10,
      discount: 'R$10',
      active: true,
      expiresAt: '2026-12-31',
      applicableDays: [],
      categories: []
    },
    {
      code: 'TODAY_ONLY',
      description: 'Cupom apenas para hoje',
      minPurchase: 20,
      discount: 'R$15',
      active: true,
      expiresAt: '2026-12-31',
      applicableDays: [currentDay],
      categories: []
    },
    {
      code: 'TOMORROW_ONLY',
      description: 'Cupom apenas para amanhã',
      minPurchase: 10,
      discount: 'R$20',
      active: true,
      expiresAt: '2026-12-31',
      applicableDays: [nextDay],
      categories: []
    },
    {
      code: 'CASA_SPECIAL',
      description: 'Apenas para itens de Casa',
      minPurchase: 50,
      discount: 'R$25',
      active: true,
      expiresAt: '2026-12-31',
      applicableDays: [],
      categories: ['casa', 'decoração']
    },
    {
      code: 'HIGH_VALUE',
      description: 'Compra mínima alta',
      minPurchase: 200,
      discount: '50%',
      active: true,
      expiresAt: '2026-12-31',
      applicableDays: [],
      categories: []
    }
  ];

  setMockCoupons(testCoupons);

  // Test Case 1: Produto barato (R$ 5) - Nenhum cupom aplicável (mínimo é 10)
  const p1 = { title: 'Lápis simples', price: 5, description: '' };
  const c1 = couponService.getBestCouponForProduct(p1);
  console.log('Caso 1 (R$ 5):', c1 === null ? '✅ Sucesso (Nenhum cupom)' : `❌ Falhou (Retornou: ${c1.code})`);

  // Test Case 2: Produto R$ 15 Geral - Deve pegar ALWAYS_FREE (TODAY_ONLY precisa de R$20, TOMORROW_ONLY não é hoje)
  const p2 = { title: 'Garrafa de água', price: 15, description: '' };
  const c2 = couponService.getBestCouponForProduct(p2);
  console.log('Caso 2 (R$ 15 Geral):', c2 && c2.code === 'ALWAYS_FREE' ? '✅ Sucesso (ALWAYS_FREE)' : `❌ Falhou (Retornou: ${c2 ? c2.code : 'null'})`);

  // Test Case 3: Produto R$ 25 Geral - Deve pegar TODAY_ONLY (pois tem desconto maior R$15 vs R$10 e está ativo hoje)
  const p3 = { title: 'Fone de Ouvido', price: 25, description: '' };
  const c3 = couponService.getBestCouponForProduct(p3);
  console.log('Caso 3 (R$ 25 Geral):', c3 && c3.code === 'TODAY_ONLY' ? '✅ Sucesso (TODAY_ONLY)' : `❌ Falhou (Retornou: ${c3 ? c3.code : 'null'})`);

  // Test Case 4: Produto R$ 60 de Casa - Deve pegar CASA_SPECIAL (tem prioridade por ser nicho específico e desconto R$25 maior que R$15)
  const p4 = { title: 'Abajur para Quarto', price: 60, description: 'Oferta: Decoração Casa' };
  const c4 = couponService.getBestCouponForProduct(p4);
  console.log('Caso 4 (R$ 60 Casa):', c4 && c4.code === 'CASA_SPECIAL' ? '✅ Sucesso (CASA_SPECIAL)' : `❌ Falhou (Retornou: ${c4 ? c4.code : 'null'})`);

  // Test Case 5: Produto R$ 250 Geral - Deve pegar HIGH_VALUE (desconto 50% = R$50 estimado, maior que todos)
  const p5 = { title: 'Micro-ondas 20L', price: 250, description: '' };
  const c5 = couponService.getBestCouponForProduct(p5);
  console.log('Caso 5 (R$ 250 Geral):', c5 && c5.code === 'HIGH_VALUE' ? '✅ Sucesso (HIGH_VALUE)' : `❌ Falhou (Retornou: ${c5 ? c5.code : 'null'})`);

  // Test Case 6: Formatação de mensagem
  const msg1 = couponService.formatCouponsForMessage(p4);
  console.log('Caso 6 (Formatado):', msg1 === '🏷️Use o cupom: CASA_SPECIAL' ? '✅ Sucesso (Formatado)' : `❌ Falhou (Formatado: "${msg1}")`);

  const msg2 = couponService.formatCouponsForMessage(p1);
  console.log('Caso 7 (Sem cupom):', msg2 === '' ? '✅ Sucesso (Vazio)' : `❌ Falhou (Retornou: "${msg2}")`);
}

runTests()
  .catch(err => console.error('Erro nos testes:', err))
  .finally(restore);
