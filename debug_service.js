const mlService = require('./src/services/mercadoLivre.service');
const logger = require('./src/config/logger');

// Mock logger to see output if needed, or just let it use the real one
// If logger writes to files, we might not see it in console easily.

(async () => {
    try {
        console.log("Testing searchProducts('cadeira gamer')...");
        const products = await mlService.searchProducts('cadeira gamer');
        console.log(`Search result: ${products.length} products found.`);
        if (products.length > 0) {
            console.log("First product:", products[0]);
        } else {
            console.log("No products found.");
        }
    } catch (error) {
        console.error("Error during search test:", error);
    }
})();
