const mlService = require('../src/services/mercadoLivre.service');
const axios = require('axios');

jest.mock('axios');

describe('Mercado Livre Service - Deals Category Scraper', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('searchDealsByCategory should scrape items successfully', async () => {
        const mockHtml = `
            <div class="poly-card">
                <a href="https://produto.mercadolivre.com.br/MLB-123456-teste" class="poly-component__title">Panela Antiaderente</a>
                <div class="poly-reviews__rating">4.5</div>
                <div class="poly-reviews__total">(150)</div>
                <div class="poly-price__current">
                    <span class="andes-money-amount">
                        <span class="andes-money-amount__fraction">100</span>
                        <span class="andes-money-amount__cents">00</span>
                    </span>
                </div>
                <div class="andes-money-amount--previous">
                    <span class="andes-money-amount__fraction">150</span>
                </div>
                <img src="https://http2.mlstatic.com/D_NQ_NP_983637-MLB74786438234_032024-F.webp" />
            </div>
        `;

        axios.get.mockResolvedValue({
            status: 200,
            data: mockHtml
        });

        const results = await mlService.searchDealsByCategory('MLB1574', 1);
        
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].title).toBe('Panela Antiaderente');
        expect(results[0].price).toBe(100.00);
        expect(results[0].oldPrice).toBe(150.00);
        expect(results[0].discountPercent).toBe(33); // (150-100)/150 = 33%
    });

    test('searchDealsByCategory should filter blacklisted items', async () => {
        const mockHtml = `
            <div class="poly-card">
                <a href="https://produto.mercadolivre.com.br/MLB-123457-teste" class="poly-component__title">Martelete Perfurador Profissional</a>
                <div class="poly-reviews__rating">4.8</div>
                <div class="poly-reviews__total">(120)</div>
                <div class="poly-price__current">
                    <span class="andes-money-amount">
                        <span class="andes-money-amount__fraction">500</span>
                    </span>
                </div>
            </div>
        `;

        axios.get.mockResolvedValue({
            status: 200,
            data: mockHtml
        });

        const results = await mlService.searchDealsByCategory('MLB1574', 1);
        
        // Should be empty because "martelete" is in blacklisted keywords
        expect(results.length).toBe(0);
    });
});
