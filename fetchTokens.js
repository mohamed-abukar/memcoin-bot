const axios = require('axios');
async function fetchTrendingTokens() {
    const MIN_LIQUIDITY = parseFloat(process.env.MIN_LIQUIDITY) || 100;
    const MIN_MARKET_CAP = parseFloat(process.env.MIN_MARKET_CAP) || 100000;
    const MAX_PRICE_CHANGE = parseFloat(process.env.MAX_PRICE_CHANGE) || 50;
    const MIN_BUYS = parseInt(process.env.MIN_BUYS) || 50;
    const MIN_SELLS = parseInt(process.env.MIN_SELLS) || 50;
    const DEX_SCREENER_API = process.env.DEX_SCREENER_API || "https://api.dexscreener.com/token-profiles/latest/v1"
    const CHAIN_ID = process.env.CHAIN_ID || "solana"
    const TOKEN_ADDRESS_API = process.env.TOKEN_ADDRESS_API || "https://api.dexscreener.com/latest/dex/tokens/"
    try {
        // Step 1: Fetch the list of token profiles from the token-profiles endpoint
        const tokenProfilesResponse = await axios.get(DEX_SCREENER_API);

        if (!tokenProfilesResponse.data) {
            throw new Error("Unexpected API response structure");
        }

        // Step 2: Filter tokens by chainId, e.g. "solana"
        const filteredTokens = tokenProfilesResponse.data.filter(token => token.chainId === CHAIN_ID);

        // Step 3: Loop through each token and fetch pair information from the second API
        const trendingTokens = [];

        for (let token of filteredTokens) {
            // Fetch additional data (liquidity, price change, transactions, etc.) from the second API
            const pairResponse = await axios.get(TOKEN_ADDRESS_API+token.tokenAddress);

            if (!pairResponse.data || !pairResponse.data.pairs || pairResponse.data.pairs.length === 0) {
                console.log(`No pair data found for token: ${token.tokenAddress}`);
                continue; // Skip if no pair data is found
            }

            const pair = pairResponse.data.pairs[0]; // Assuming the first pair is the relevant one

            // Step 4: Filter pairs by chainId: "solana"
            if (pair.chainId !== CHAIN_ID) {
                console.log(`Skipping pair with different chainId: ${pair.chainId}`);
                continue;
            }

            // Extract necessary details from the pair data
            const liquidity = pair.liquidity ? pair.liquidity.usd : 0;
            const priceChange = pair.priceChange ? pair.priceChange.h24 : 0;
            const marketCap = pair.marketCap || 0;
            const buys = pair.txns ? pair.txns.h24 ? pair.txns.h24.buys : 0 : 0;
            const sells = pair.txns ? pair.txns.h24 ? pair.txns.h24.sells : 0 : 0;
            const socials = pair.info && pair.info.socials ? pair.info.socials : [];

            // Step 5: Apply the verification checks
            if (
                liquidity >= MIN_LIQUIDITY &&
                marketCap >= MIN_MARKET_CAP &&
                Math.abs(priceChange) <= MAX_PRICE_CHANGE &&
                buys >= MIN_BUYS &&
                sells >= MIN_SELLS &&
                socials.length > 0
            ) {
                // Add the token to the final list if it passes all checks
                trendingTokens.push({
                    url: token.url,
                    chainId: token.chainId,
                    tokenAddress: token.tokenAddress,
                    icon: token.icon,
                    header: token.header,
                    description: token.description,
                    links: token.links || null,  // Only include links if they exist
                    liquidity: liquidity,
                    priceChange: priceChange,
                    marketCap: marketCap,
                    buys: buys,
                    sells: sells,
                    socials: socials
                });
            }
        }

        console.log(`Fetched ${trendingTokens.length} trending tokens.`);
        return trendingTokens;
    } catch (error) {
        console.error("Error fetching tokens:", error.message);
        return [];
    }
}



module.exports = { fetchTrendingTokens };


const RATE_LIMIT = parseInt(process.env.RATE_LIMIT, 10) || 5;

const rateLimiter = (() => {
    let lastRequestTime = 0;
    return async function limitRequests(customRateLimit = RATE_LIMIT) {
        const now = Date.now();
        const minInterval = 1000 / customRateLimit; // Convert rate to ms interval
        const timeSinceLastRequest = now - lastRequestTime;

        if (timeSinceLastRequest < minInterval) {
            console.log(`Rate limiting: Pausing for ${minInterval - timeSinceLastRequest} ms`);
            await new Promise((resolve) => setTimeout(resolve, minInterval - timeSinceLastRequest));
        }
        lastRequestTime = Date.now();
    };
})();


async function limitedApiCall(apiCall, customRateLimit) {
    await rateLimiter(customRateLimit); // Throttle requests
    try {
        return await apiCall();
    } catch (error) {
        console.error(`API call failed: ${error.message}`);
        throw error; // Re-throw to propagate the error if needed
    }
}

module.exports = { fetchTrendingTokens, limitedApiCall };
