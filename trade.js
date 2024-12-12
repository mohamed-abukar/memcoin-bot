const { Connection, PublicKey, LAMPORTS_PER_SOL, TransactionMessage,
    VersionedTransaction,
    SystemProgram,sendAndConfirmTransaction,Keypair } = require("@solana/web3.js");
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
// const { getSwapQuote, executeSwap } = require("raydium-sdk"); // Assuming Raydium SDK
const bs58 = require('bs58');  // Import the base58 decoding library
const connection = new Connection(process.env.RPC_URL, "confirmed");

// const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.PRIVATE_KEY)));
const privateKeyString = process.env.PRIVATE_KEY;

// Decode the private key from base58 to Uint8Array
const privateKeyBytes = bs58.decode(privateKeyString);

// Check if the decoded private key has 64 bytes
if (privateKeyBytes.length === 64) {
    // Create the wallet from the secret key
    const wallet = Keypair.fromSecretKey(privateKeyBytes);

    console.log('Public key:', wallet.publicKey.toString());
} else {
    throw new Error('Invalid private key size, should be 64 bytes.');
}
const SLIPPAGE = parseFloat(process.env.SLIPPAGE) || 0.5;  // Slippage tolerance (0.5%)

// Placeholder for buy token logic (integrate with Serum/Raydium)
// async function buyToken(tokenMintAddress, amountInSol) {
//     console.log(`Buying token: ${tokenMintAddress} for ${amountInSol} SOL`);
//     // Implement Raydium buy logic
//     try {
//         const connection = new Connection(process.env.RPC_URL, "confirmed");

//         // Fetch the Raydium pool for the SOL -> Token pair
//         const tokenMint = new PublicKey(tokenMintAddress); // Token you want to buy
//         const solMint = new PublicKey("So11111111111111111111111111111111111111112"); // SOL mint address

//         // Get swap quote (expected output) for the given amount of SOL
//         const quote = await getSwapQuote(connection, solMint, tokenMint, amountInSol * 1e9); // Convert SOL to lamports

//         const expectedAmount = quote.expectedAmount; // How many tokens you'll receive for your SOL
//         const slippageThresholdLow = expectedAmount * (1 - SLIPPAGE / 100);
//         const slippageThresholdHigh = expectedAmount * (1 + SLIPPAGE / 100);

//         console.log(`Expected tokens: ${expectedAmount}, Slippage range: [${slippageThresholdLow}, ${slippageThresholdHigh}]`);

//         // If the slippage is too high, abort
//         if (quote.actualAmount < slippageThresholdLow || quote.actualAmount > slippageThresholdHigh) {
//             console.log(`Slippage exceeded. Expected: ${expectedAmount}, Actual: ${quote.actualAmount}`);
//             return false;
//         }

//         // Execute the swap
//         console.log("Executing swap...");
//         const transaction = await executeSwap(connection, solMint, tokenMint, amountInSol * 1e9);
//         console.log(`Swap executed successfully: ${transaction}`);

//         return true;
//     } catch (error) {
//         console.error(`Error performing buy token swap: ${error.message}`);
//         return false;
//     }
// }
/**
 * Buy SPL token using VersionedTransaction
 * @param {string} tokenMintAddress - The mint address of the token to buy
 * @param {number} amountInSol - The amount of SOL to spend on the buy
 */
async function buyToken(tokenMintAddress, amountInSol) {
    const tokenMint = new PublicKey(tokenMintAddress);

    try {
        // Step 1: Fetch the associated token account for the wallet
        const tokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            wallet.publicKey
        );

        // Step 2: Check if the associated token account exists
        const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);

        if (!tokenAccountInfo) {
            console.log(`Creating associated token account for: ${tokenMintAddress}`);
            const createATAInstruction = createAssociatedTokenAccountInstruction(
                wallet.publicKey,  // Payer
                tokenAccount,      // Associated Token Account
                wallet.publicKey,  // Owner
                tokenMint          // Mint
            );

            const blockhash = await connection.getLatestBlockhash("confirmed");
            const messageV0 = new TransactionMessage({
                payerKey: wallet.publicKey,
                recentBlockhash: blockhash.blockhash,
                instructions: [createATAInstruction],
            }).compileToV0Message();

            const createTransaction = new VersionedTransaction(messageV0);
            createTransaction.sign([wallet]);
            await sendAndConfirmTransaction(connection, createTransaction, [wallet], {
                commitment: "confirmed",
                preflightCommitment: "processed",
            });

            console.log(`Associated token account created: ${tokenAccount.toString()}`);
        }

        // Step 3: Prepare transaction to send SOL for token
        console.log(`Buying token: ${tokenMintAddress} for ${amountInSol} SOL`);

        const instructions = [
            SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: tokenMint, // Replace with the actual swap pool target address
                lamports: amountInSol * LAMPORTS_PER_SOL, // Adjust as necessary for token conversion
            }),
        ];

        // Step 4: Create VersionedTransaction
        const blockhash = await connection.getLatestBlockhash("confirmed");
        const messageV0 = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: blockhash.blockhash,
            instructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);

        // Step 5: Sign, send, and confirm the transaction
        await estimateTransactionCost(transaction); // Check before sending
        transaction.sign([wallet]);
        const signature = await sendAndConfirmTransaction(connection, transaction, [wallet], {
            commitment: "confirmed",
            preflightCommitment: "processed",
        });
        console.log(`Transaction confirmed with signature: ${signature}`);
    } catch (error) {
        console.error(`Error buying token: ${error.message}`);
    }
}

// Placeholder for sell token logic
/**
 * Sell SPL token for SOL using VersionedTransaction
 * @param {string} tokenMintAddress - The mint address of the token to sell
 */
async function sellToken(tokenMintAddress) {
    const tokenMint = new PublicKey(tokenMintAddress);

    try {
        // Step 1: Fetch associated token account for the wallet
        const tokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            wallet.publicKey
        );

        // Step 2: Check token balance
        // const tokenBalance = await connection.getTokenAccountBalance(tokenAccount);
        const tokenBalance = await withTimeout(
            connection.getTokenAccountBalance(tokenAccount),
            API_TIMEOUT
        );
        const balanceAmount = parseFloat(tokenBalance.value.uiAmount);

        if (balanceAmount <= 0) {
            console.log(`No balance to sell for token: ${tokenMintAddress}`);
            return;
        }
        console.log(`Selling ${balanceAmount} of token: ${tokenMintAddress}`);

        // Step 3: Create a message and transaction for the swap
        const instructions = [
            SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: tokenMint, // Replace with actual swap pool target address
                lamports: balanceAmount * LAMPORTS_PER_SOL, // Adjust as necessary for token conversion
            }),
        ];

        // Create a Versioned Transaction
        const blockhash = await connection.getLatestBlockhash("confirmed");
        const messageV0 = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: blockhash.blockhash,
            instructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);

        // Step 4: Sign, send, and confirm the transaction
        await estimateTransactionCost(transaction); // Check before sending
        transaction.sign([wallet]);
        const signature = await sendAndConfirmTransaction(connection, transaction, [wallet], {
            commitment: "confirmed",
            preflightCommitment: "processed",
        });
        console.log(`Transaction confirmed with signature: ${signature}`);
    } catch (error) {
        console.error(`Error selling token: ${error.message}`);
    }
}


const RAYDIUM_PROGRAM_ID = new PublicKey("RVKd61ztZW9wrJ2e7aJMgDo8m8FZPq8TVDajdKD4zjv"); // Raydium AMM Program ID

/**
 * Swap tokens using Raydium AMM
 * @param {string} inputMintAddress - The mint address of the token to sell
 * @param {string} outputMintAddress - The mint address of the token to buy
 * @param {number} amountIn - The amount of input tokens to swap
 */
async function swapTokens(inputMintAddress, outputMintAddress, amountIn) {
    const inputMint = new PublicKey(inputMintAddress);
    const outputMint = new PublicKey(outputMintAddress);

    try {
        // Fetch associated token accounts
        const inputTokenAccount = await getAssociatedTokenAddress(inputMint, wallet.publicKey);
        const outputTokenAccount = await getAssociatedTokenAddress(outputMint, wallet.publicKey);

        // Ensure associated token accounts exist
        const inputAccountBalance = await connection.getTokenAccountBalance(inputTokenAccount);
        if (parseFloat(inputAccountBalance.value.uiAmount) < amountIn) {
            console.log(`Insufficient balance in input token account: ${inputMintAddress}`);
            return;
        }

        console.log(`Swapping ${amountIn} ${inputMintAddress} for ${outputMintAddress}`);

        // Fetch Raydium Pool Information (mocked here, replace with real fetch logic)
        const poolAddress = "REPLACE_WITH_POOL_ADDRESS"; // Raydium pool address for the swap
        const poolKeys = {
            ammId: new PublicKey("REPLACE_AMM_ID"),
            ammAuthority: new PublicKey("REPLACE_AMM_AUTHORITY"),
            ammOpenOrders: new PublicKey("REPLACE_OPEN_ORDERS"),
            serumMarket: new PublicKey("REPLACE_SERUM_MARKET"),
            tokenProgram: TOKEN_PROGRAM_ID,
        };

        // Construct instructions for Raydium AMM Swap
        const instructions = [
            {
                // Replace with actual Raydium AMM instructions
                programId: RAYDIUM_PROGRAM_ID,
                keys: [
                    { pubkey: poolKeys.ammId, isSigner: false, isWritable: true },
                    { pubkey: poolKeys.ammAuthority, isSigner: false, isWritable: false },
                    { pubkey: poolKeys.ammOpenOrders, isSigner: false, isWritable: false },
                    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
                    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
                ],
                data: Buffer.from([amountIn]), // Encode the swap data (amount, etc.)
            },
        ];

        // Create a Versioned Transaction
        const blockhash = await connection.getLatestBlockhash("confirmed");
        const messageV0 = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: blockhash.blockhash,
            instructions,
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);

        // Sign and send the transaction
        await estimateTransactionCost(transaction); // Check before sending
        transaction.sign([wallet]);
        const signature = await sendAndConfirmTransaction(connection, transaction, [wallet], {
            commitment: "confirmed",
            preflightCommitment: "processed",
        });
        console.log(`Swap transaction confirmed: ${signature}`);
    } catch (error) {
        console.error(`Error during token swap: ${error.message}`);
    }
}


const MAX_TX_COST = parseFloat(process.env.MAX_TX_COST) || 0.01;

async function estimateTransactionCost(transaction) {
    try {
        // Step 1: Fetch the latest blockhash
        const blockhash = await connection.getLatestBlockhash("confirmed");
        transaction.recentBlockhash = blockhash.blockhash;
        transaction.feePayer = wallet.publicKey;

        // Step 2: Compile the transaction into a message
        const message = transaction.compileMessage();

        // Step 3: Get the fee for the transaction message
        const feeInfo = await connection.getFeeForMessage(message, "confirmed");
        if (!feeInfo || feeInfo.value === null) {
            throw new Error("Unable to fetch fee information");
        }

        // Step 4: Convert fee from lamports to SOL
        const feeInSOL = feeInfo.value / LAMPORTS_PER_SOL;
        console.log(`Estimated transaction fee: ${feeInSOL} SOL`);

        // Step 5: Compare with max allowed cost
        if (feeInSOL > MAX_TX_COST) {
            throw new Error(`Transaction fee ${feeInSOL} exceeds max allowed cost of ${MAX_TX_COST} SOL`);
        }

        return feeInSOL;
    } catch (error) {
        console.error(`Error estimating transaction cost: ${error.message}`);
        throw error; // Re-throw to ensure calling function handles the error
    }
}


const API_TIMEOUT = parseInt(process.env.API_TIMEOUT, 10) || 3000;

async function withTimeout(promise, timeout) {
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`API request timed out after ${timeout} ms`)), timeout)
    );
    return Promise.race([promise, timeoutPromise]);
}



module.exports = { buyToken, sellToken };
