'use strict';

const fs = require('fs');
const path = require('path');

class JsonFileCouponStore {
  constructor(filePath) {
    this.filePath = filePath || path.resolve(process.cwd(), 'data', 'coupons.json');
    this.memoryCache = new Map();
    this.isLoaded = false;
    this.ensureFileExists();
  }

  ensureFileExists() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    if (!fs.existsSync(this.filePath)) {
      try {
        fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf-8');
      } catch {}
    }
  }

  async load() {
    if (this.isLoaded) return;
    try {
      if (!fs.existsSync(this.filePath)) {
        this.ensureFileExists();
      }
      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      const items = JSON.parse(raw);
      this.memoryCache.clear();
      for (const item of items) {
        this.memoryCache.set(item.code.toUpperCase(), item);
      }
      this.isLoaded = true;
    } catch {
      this.memoryCache.clear();
      this.isLoaded = true;
    }
  }

  async persist() {
    const list = Array.from(this.memoryCache.values());
    const tempPath = `${this.filePath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(list, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, this.filePath);
  }

  async addCoupon(coupon) {
    await this.load();
    const cleanCode = coupon.code.trim().toUpperCase();
    const normalizedCoupon = {
      ...coupon,
      code: cleanCode,
      createdAt: coupon.createdAt || new Date().toISOString()
    };
    this.memoryCache.set(cleanCode, normalizedCoupon);
    await this.persist();
  }

  async deactivateCoupon(code) {
    await this.load();
    const cleanCode = code.trim().toUpperCase();
    const existing = this.memoryCache.get(cleanCode);
    if (!existing) return false;

    this.memoryCache.set(cleanCode, { ...existing, active: false });
    await this.persist();
    return true;
  }

  async activateCoupon(code) {
    await this.load();
    const cleanCode = code.trim().toUpperCase();
    const existing = this.memoryCache.get(cleanCode);
    if (!existing) return false;

    this.memoryCache.set(cleanCode, { ...existing, active: true });
    await this.persist();
    return true;
  }

  async getCouponByCode(code) {
    await this.load();
    return this.memoryCache.get(code.trim().toUpperCase()) || null;
  }

  async listActiveCoupons(referenceDate = new Date()) {
    await this.load();
    const now = referenceDate.getTime();
    return Array.from(this.memoryCache.values()).filter(coupon => {
      const expiresAt = new Date(coupon.expiresAt).getTime();
      return coupon.active && !isNaN(expiresAt) && expiresAt > now;
    });
  }

  async listAllCoupons() {
    await this.load();
    return Array.from(this.memoryCache.values());
  }

  async purgeExpiredCoupons(referenceDate = new Date()) {
    await this.load();
    const now = referenceDate.getTime();
    let purgedCount = 0;

    for (const [code, coupon] of this.memoryCache.entries()) {
      const expiresAt = new Date(coupon.expiresAt).getTime();
      if (!isNaN(expiresAt) && expiresAt <= now) {
        this.memoryCache.delete(code);
        purgedCount++;
      }
    }

    if (purgedCount > 0) {
      await this.persist();
    }
    return purgedCount;
  }
}

module.exports = {
  JsonFileCouponStore
};
