const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// In-memory cache to prevent double-charging
const idempotencyCache = new Set();

app.post('/checkout', async (req, res) => {
    const { amount, currency, idempotency_key, customer_vpa } = req.body;

    // 1. Check if this payment request was already sent
    if (idempotencyCache.has(idempotency_key)) {
        return res.status(409).json({ 
            error: "Duplicate request. Payment already processing for this key." 
        });
    }
    
    // 2. Lock the key so it cannot be used again
    idempotencyCache.add(idempotency_key);

    // 3. Generate an internal transaction ID for our C++ engine
    const internal_txn_id = `txn_${uuidv4()}`;

    try {
        console.log(`[Gateway] Initiating transaction: ${internal_txn_id} for amount: ${amount}`);
        
        // Note: Tomorrow we will add the network request to the C++ Core here

        res.status(202).json({
            message: "Payment initiated",
            transaction_id: internal_txn_id,
            status: "PENDING"
        });

    } catch (error) {
        idempotencyCache.delete(idempotency_key); // Unlock on failure
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
});