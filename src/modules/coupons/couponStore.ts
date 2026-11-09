/**
 * ==============================================================================
 * SMART COUPON MODULE - COUPON STORE (Repositório / Persistência)
 * ==============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { Coupon, ICouponStore } from './types';

export class JsonFileCouponStore implements ICouponStore {
  private readonly filePath: string;
  private memoryCache: Map<string, Coupon> = new Map();
  private isLoaded = false;

  constructor(filePath?: string) {
    this.filePath = filePath || path.resolve(process.cwd(), 'data', 'coupons.json');
    this.ensureFileExists();
  }

  private ensureFileExists(): void {
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

  private async load(): Promise<void> {
    if (this.isLoaded) return;
    try {
      if (!fs.existsSync(this.filePath)) {
        this.ensureFileExists();
      }
      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      const items: Coupon[] = JSON.parse(raw);
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

  private async persist(): Promise<void> {
    const list = Array.from(this.memoryCache.values());
    const tempPath = `${this.filePath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(list, null, 2), 'utf-8');
    await fs.promises.rename(tempPath, this.filePath);
  }

  public async addCoupon(coupon: Coupon): Promise<void> {
    await this.load();
    const cleanCode = coupon.code.trim().toUpperCase();
    const normalizedCoupon: Coupon = {
      ...coupon,
      code: cleanCode,
      createdAt: coupon.createdAt || new Date().toISOString()
    };
    this.memoryCache.set(cleanCode, normalizedCoupon);
    await this.persist();
  }

  public async deactivateCoupon(code: string): Promise<boolean> {
    await this.load();
    const cleanCode = code.trim().toUpperCase();
    const existing = this.memoryCache.get(cleanCode);
    if (!existing) return false;

    this.memoryCache.set(cleanCode, { ...existing, active: false });
    await this.persist();
    return true;
  }

  public async activateCoupon(code: string): Promise<boolean> {
    await this.load();
    const cleanCode = code.trim().toUpperCase();
    const existing = this.memoryCache.get(cleanCode);
    if (!existing) return false;

    this.memoryCache.set(cleanCode, { ...existing, active: true });
    await this.persist();
    return true;
  }

  public async getCouponByCode(code: string): Promise<Coupon | null> {
    await this.load();
    return this.memoryCache.get(code.trim().toUpperCase()) || null;
  }

  public async listActiveCoupons(referenceDate: Date = new Date()): Promise<readonly Coupon[]> {
    await this.load();
    const now = referenceDate.getTime();
    return Array.from(this.memoryCache.values()).filter(coupon => {
      const expiresAt = new Date(coupon.expiresAt).getTime();
      return coupon.active && !isNaN(expiresAt) && expiresAt > now;
    });
  }

  public async listAllCoupons(): Promise<readonly Coupon[]> {
    await this.load();
    return Array.from(this.memoryCache.values());
  }

  public async purgeExpiredCoupons(referenceDate: Date = new Date()): Promise<number> {
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
