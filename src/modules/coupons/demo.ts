/**
 * ==============================================================================
 * SMART COUPON MODULE - DEMO EXECUTÁVEL COM MOCK DE PRODUTOS
 * ==============================================================================
 */

import * as path from 'path';
import { JsonFileCouponStore } from './couponStore';
import { CouponService } from './couponService';
import { Coupon, ProductData } from './types';

export async function runDemo(): Promise<void> {
  console.log('🚀 Inicializando Módulo Inteligente de Cupons do Mercado Livre...\n');

  // Inicializa o store
  const storePath = path.resolve(process.cwd(), 'data', 'demo_coupons.json');
  const store = new JsonFileCouponStore(storePath);
  const service = new CouponService(store);

  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1. Cadastra cupons de teste com regras distintas
  const mockCoupons: Coupon[] = [
    {
      code: 'CASA15',
      description: '15% OFF',
      discountType: 'percentage',
      discountValue: 15,
      minValue: 200,
      maxDiscount: 150,
      allowedCategories: ['MLB1574', 'MLB5726'], // Casa & Eletrodomésticos
      expiresAt: futureDate,
      active: true
    },
    {
      code: 'SUPER30',
      description: 'R$ 30 OFF',
      discountType: 'fixed',
      discountValue: 30,
      minValue: 150,
      allowedCategories: ['*'], // Geral
      expiresAt: futureDate,
      active: true
    },
    {
      code: 'TECH50',
      description: 'R$ 50 OFF',
      discountType: 'fixed',
      discountValue: 50,
      minValue: 500,
      allowedCategories: ['MLB1051', 'MLB1648'], // Informática & Celulares
      expiresAt: futureDate,
      active: true
    },
    {
      code: 'EXPIRADO100',
      description: 'R$ 100 OFF',
      discountType: 'fixed',
      discountValue: 100,
      minValue: 100,
      allowedCategories: ['*'],
      expiresAt: pastDate, // EXPIRADO (deve ser rejeitado)
      active: true
    }
  ];

  for (const c of mockCoupons) {
    await service.registerCoupon(c);
  }

  console.log(`✅ ${mockCoupons.length} cupons carregados no store.\n`);

  // 2. Mock de produtos cobrindo casos reais
  const mockProducts: ProductData[] = [
    {
      id: 'MLB001',
      title: 'Fritadeira Sem Óleo Air Fryer Mondial Family 4 Litros Inox',
      price: 289.90,
      oldPrice: 429.90,
      categoryId: 'MLB5726', // Eletrodomésticos -> Deve ganhar CASA15 (15% = R$ 43,49 > SUPER30 = R$ 30)
      link: 'https://meli.la/exemplo-airfryer'
    },
    {
      id: 'MLB002',
      title: 'Conjunto de Facas de Cozinha Inox 6 Peças',
      price: 89.90,
      oldPrice: 129.90,
      categoryId: 'MLB1574', // Casa -> Abaixo do minValue (R$ 200 e R$ 150) -> Sem cupom
      link: 'https://meli.la/exemplo-facas'
    },
    {
      id: 'MLB003',
      title: 'Monitor Gamer Curvo 27 Pol 165Hz 1ms Full HD',
      price: 999.00,
      oldPrice: 1399.00,
      categoryId: 'MLB1648', // Informática -> Categoria bate TECH50 (R$ 50 > R$ 30)
      link: 'https://meli.la/exemplo-monitor'
    }
  ];

  for (const product of mockProducts) {
    console.log(`======================================================================`);
    console.log(`🔍 AVALIANDO PRODUTO: "${product.title}"`);
    console.log(`   Preço: R$ ${product.price.toFixed(2)} | Categoria: ${product.categoryId || 'Geral'}`);

    const result = await service.prepareBroadcastMessage(product, 'whatsapp');

    if (result.selectedCoupon) {
      console.log(`🎯 Cupom Vencedor: [${result.selectedCoupon.code}] (${result.selectedCoupon.description})`);
    } else {
      console.log(`ℹ️ Nenhum cupom elegível (mensagem enviada sem cupom).`);
    }

    console.log(`\n📨 MENSAGEM FINAL FORMATADA:`);
    console.log(`----------------------------------------------------------------------`);
    console.log(result.formattedMessage);
    console.log(`----------------------------------------------------------------------\n`);
  }
}

if (require.main === module) {
  runDemo().catch(console.error);
}
