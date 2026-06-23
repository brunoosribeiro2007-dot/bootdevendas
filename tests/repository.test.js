const repository = require('../src/database/repository');
const { db } = require('../src/database/init');

jest.mock('../src/database/init', () => {
    return {
        db: {
            all: jest.fn(),
            run: jest.fn(),
            get: jest.fn()
        },
        isPostgres: () => false
    };
});

describe('Repository Duplicate Prevention', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('saveProduct duplicate checks', () => {
        const mockProduct = {
            id: 'MLB999999',
            title: 'Colchão Emma Original Casal',
            price: 1900.00,
            link: 'https://produto.mercadolivre.com.br/MLB-999999-colchao-emma',
            imageUrl: 'https://image.com/emma.jpg',
            description: 'Nicho'
        };

        test('should save a completely new product', async () => {
            db.all.mockResolvedValue([]); // No existing products
            db.run.mockResolvedValue({ rowCount: 1 });

            const result = await repository.saveProduct(mockProduct);
            expect(result).toBe(1);
            expect(db.run).toHaveBeenCalled();
        });

        test('should reject product with the exact same ID', async () => {
            db.all.mockResolvedValue([
                { id: 'MLB999999', title: 'Colchão Emma Duo', link: 'https://produto.mercadolivre.com.br/MLB-999999-colchao-emma', original_link: 'https://produto.mercadolivre.com.br/MLB-999999-colchao-emma' }
            ]);

            const result = await repository.saveProduct(mockProduct);
            expect(result).toBe(0);
            expect(db.run).not.toHaveBeenCalled();
        });

        test('should reject product with the exact same image URL', async () => {
            db.all.mockResolvedValue([
                { id: 'MLB111111', title: 'Outro colchão com mesma imagem', link: 'https://link1.com', original_link: 'https://link1.com', image_url: 'https://image.com/emma.jpg' }
            ]);

            const result = await repository.saveProduct(mockProduct);
            expect(result).toBe(0);
            expect(db.run).not.toHaveBeenCalled();
        });

        test('should reject product with highly similar title', async () => {
            db.all.mockResolvedValue([
                { id: 'MLB222222', title: 'Colchão Emma Original Solteiro - Tecnologia Alemã', link: 'https://link2.com', original_link: 'https://link2.com' }
            ]);

            // "Colchão Emma Original Casal" vs "Colchão Emma Original Solteiro - Tecnologia Alemã"
            // Both share: colchao, emma, original, tecnologia, alema (5 words)
            // Minimum word count of the two is 4 or 5. Very high similarity score.
            const result = await repository.saveProduct(mockProduct);
            expect(result).toBe(0);
            expect(db.run).not.toHaveBeenCalled();
        });

        test('should NOT reject product with different title and different image', async () => {
            db.all.mockResolvedValue([
                { id: 'MLB333333', title: 'Jogo de Panelas Tramontina', link: 'https://link3.com', original_link: 'https://link3.com', image_url: 'https://image.com/panelas.jpg' }
            ]);

            db.run.mockResolvedValue({ rowCount: 1 });

            const result = await repository.saveProduct(mockProduct);
            expect(result).toBe(1);
            expect(db.run).toHaveBeenCalled();
        });

        test('should NOT reject products with 2-letter differentiating words (e.g. TV LG 32 vs TV Samsung 55)', async () => {
            db.all.mockResolvedValue([
                { id: 'MLB333333', title: 'Smart TV LG 32', link: 'https://link3.com', original_link: 'https://link3.com', image_url: 'https://image.com/lg.jpg' }
            ]);

            db.run.mockResolvedValue({ rowCount: 1 });

            const newProduct = {
                id: 'MLB444444',
                title: 'Smart TV Samsung 55',
                price: 2500.00,
                link: 'https://produto.mercadolivre.com.br/MLB-444444-tv-samsung',
                imageUrl: 'https://image.com/samsung.jpg',
                description: 'Nicho'
            };

            const result = await repository.saveProduct(newProduct);
            expect(result).toBe(1);
            expect(db.run).toHaveBeenCalled();
        });

        test('should reject products with the same Mercado Livre image ID but different suffixes', async () => {
            db.all.mockResolvedValue([
                { 
                    id: 'MLB333333', 
                    title: 'Panela de Pressão Tramontina', 
                    link: 'https://link3.com', 
                    original_link: 'https://link3.com', 
                    image_url: 'https://http2.mlstatic.com/D_NQ_NP_983637-MLB74786438234_032024-F.webp' 
                }
            ]);

            const newProduct = {
                id: 'MLB444444',
                title: 'Smart TV LG 32 polegadas',
                price: 2500.00,
                link: 'https://produto.mercadolivre.com.br/MLB-444444-tv-samsung',
                imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_983637-MLB74786438234_032024-O.webp',
                description: 'Nicho'
            };

            const result = await repository.saveProduct(newProduct);
            expect(result).toBe(0);
            expect(db.run).not.toHaveBeenCalled();
        });
    });

    describe('getNextApprovedItem retroactive checks', () => {
        test('should skip and delete retroactive duplicates in the queue', async () => {
            // Mock getNextApprovedItem database sequence:
            // 1. Get next approved item
            db.get.mockResolvedValueOnce({
                id: 1,
                product_id: 'MLB999999',
                title: 'Colchão Emma Original Casal',
                price: 1900.00,
                link: 'https://link1.com',
                original_link: 'https://link1.com',
                image_url: 'https://image.com/emma.jpg',
                status: 'approved'
            });

            // 2. Lock item
            db.run.mockResolvedValueOnce({ rowCount: 1 });

            // 3. Get published products
            // Return a published product that has a highly similar title or same image
            db.all.mockResolvedValueOnce([
                { id: 'MLB222222', title: 'Colchão Emma Original Solteiro', link: 'https://link2.com', original_link: 'https://link2.com', image_url: 'https://image.com/emma.jpg' }
            ]);

            // 4. Second iteration of while(true): db.get returns null (end of loop)
            db.get.mockResolvedValueOnce(null);

            const item = await repository.getNextApprovedItem();
            expect(item).toBeNull();

            // Should delete the duplicate item from queue
            expect(db.run).toHaveBeenCalledWith('DELETE FROM queue WHERE id = ?', [1]);
        });
    });
});
