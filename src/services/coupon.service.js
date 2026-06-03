const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

const COUPONS_PATH = path.resolve(process.cwd(), 'coupons.json');

class CouponService {
  constructor() {
    this._cache = null;
    this._lastRead = 0;
    this._cacheTTL = 60000; // Recarrega do disco a cada 60s
  }

  /**
   * Carrega cupons do arquivo JSON (com cache de 60s)
   */
  _loadCoupons() {
    const now = Date.now();
    if (this._cache && (now - this._lastRead) < this._cacheTTL) {
      return this._cache;
    }

    try {
      if (!fs.existsSync(COUPONS_PATH)) {
        logger.debug('Arquivo coupons.json não encontrado. Criando com lista vazia.');
        fs.writeFileSync(COUPONS_PATH, JSON.stringify({ coupons: [] }, null, 2));
        this._cache = [];
        this._lastRead = now;
        return [];
      }

      const data = JSON.parse(fs.readFileSync(COUPONS_PATH, 'utf8'));
      this._cache = data.coupons || [];
      this._lastRead = now;
      return this._cache;
    } catch (e) {
      logger.warn(`Erro ao ler coupons.json: ${e.message}`);
      return this._cache || [];
    }
  }

  /**
   * Salva cupons no arquivo JSON
   */
  _saveCoupons(coupons) {
    try {
      fs.writeFileSync(COUPONS_PATH, JSON.stringify({ coupons }, null, 2));
      this._cache = coupons;
      this._lastRead = Date.now();
      return true;
    } catch (e) {
      logger.error(`Erro ao salvar coupons.json: ${e.message}`);
      return false;
    }
  }

  /**
   * Retorna apenas cupons ativos e não expirados
   */
  getActiveCoupons() {
    const all = this._loadCoupons();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    return all.filter(c => {
      if (!c.active) return false;
      if (c.expiresAt && c.expiresAt < today) return false;
      return true;
    });
  }

  /**
   * Retorna todos os cupons (ativos e inativos)
   */
  getAllCoupons() {
    return this._loadCoupons();
  }

  /**
   * Adiciona um novo cupom
   */
  addCoupon(coupon) {
    const coupons = this._loadCoupons();
    
    // Verifica duplicata
    if (coupons.find(c => c.code === coupon.code)) {
      return { success: false, error: 'Cupom com este código já existe.' };
    }

    coupons.push({
      code: coupon.code || '',
      description: coupon.description || '',
      minPurchase: Number(coupon.minPurchase) || 0,
      discount: coupon.discount || '',
      active: coupon.active !== false,
      expiresAt: coupon.expiresAt || ''
    });

    this._saveCoupons(coupons);
    logger.info(`🎟️ Cupom adicionado: ${coupon.code}`);
    return { success: true };
  }

  /**
   * Remove um cupom pelo código
   */
  removeCoupon(code) {
    const coupons = this._loadCoupons();
    const filtered = coupons.filter(c => c.code !== code);

    if (filtered.length === coupons.length) {
      return { success: false, error: 'Cupom não encontrado.' };
    }

    this._saveCoupons(filtered);
    logger.info(`🗑️ Cupom removido: ${code}`);
    return { success: true };
  }

  /**
   * Alterna o estado ativo/inativo de um cupom
   */
  toggleCoupon(code) {
    const coupons = this._loadCoupons();
    const coupon = coupons.find(c => c.code === code);

    if (!coupon) {
      return { success: false, error: 'Cupom não encontrado.' };
    }

    coupon.active = !coupon.active;
    this._saveCoupons(coupons);
    logger.info(`🔄 Cupom ${code} agora está ${coupon.active ? 'ATIVO' : 'INATIVO'}`);
    return { success: true, active: coupon.active };
  }

  /**
   * Formata os cupons ativos para inclusão na mensagem do WhatsApp
   * Retorna string formatada ou string vazia se não houver cupons
   */
  formatCouponsForMessage() {
    const active = this.getActiveCoupons();
    if (active.length === 0) return '';

    const lines = [];
    lines.push(`🎟️ Cupons disponíveis:`);
    
    for (const c of active) {
      let line = `  ${c.code}`;
      if (c.description) {
        line += ` - ${c.description}`;
      }
      lines.push(line);
    }

    return '\n' + lines.join('\n');
  }
}

module.exports = new CouponService();
